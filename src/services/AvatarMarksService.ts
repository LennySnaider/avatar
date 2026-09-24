'use server'

/**
 * Marcas permanentes del avatar (tatuajes, cicatrices, lunares).
 *
 * Scopeado por ORGANIZACIÓN como el resto: identidad de la sesión vía
 * `getOrgContext()`, autorización por `requirePermission` + filtro manual de
 * `orgTable`. La zona se valida contra `MARK_ZONES` ANTES de llegar a la base:
 * el CHECK de la migración diría lo mismo, pero con un 23514 que la UI no
 * sabe traducir.
 *
 * El avatar se comprueba aparte (`assertOwnedAvatar`): sin eso, una marca
 * podría colgarse del avatar de otra organización aunque la fila naciera con
 * el `organization_id` correcto.
 */
import { getOrgContext, type OrgContext } from '@/lib/tenant/getOrgContext'
import { requirePermission } from '@/lib/org/guards'
import { orgInsert, orgTable } from '@/lib/org/orgTable'
import { MARK_ZONE_IDS, type MarkSide } from '@/lib/avatar/marks'
import { putMediaObject } from '@/lib/mediaStore'
import { getReferenceMediaUrl } from '@/lib/storagePaths'
import { analyzeMarkFromImage } from './GeminiService'
import type { Database } from '@/@types/supabase'

export type AvatarMarkRow = Database['public']['Tables']['avatar_marks']['Row']

export interface AvatarMarkPayload {
    avatarId: string
    zone: string
    side?: MarkSide | null
    content: string
    inkStyle?: string | null
    coverage?: string | null
    orientation?: string | null
    storagePath?: string | null
    storageProvider?: string | null
}

async function assertOwnedAvatar(ctx: OrgContext, avatarId: string) {
    const { data, error } = await orgTable(ctx, 'avatars')
        .select('id')
        .eq('id', avatarId)
        .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Not your avatar')
}

async function assertOwnedMark(ctx: OrgContext, markId: string) {
    const { data, error } = await orgTable(ctx, 'avatar_marks')
        .select('id')
        .eq('id', markId)
        .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Not your mark')
}

/** Normaliza y valida lo que llega del formulario. Lanza con mensaje legible. */
function cleanPayload(payload: AvatarMarkPayload) {
    const zone = (payload.zone ?? '').trim()
    if (!MARK_ZONE_IDS.includes(zone)) {
        throw new Error(`Zona desconocida: ${zone || '(vacía)'}`)
    }
    const content = (payload.content ?? '').trim()
    if (!content) {
        throw new Error('Describe qué es la marca: es lo único que reciben los motores de solo texto')
    }
    // Un lado que no sea right/left se guarda como null: la frase del prompt
    // sale sin lado antes que con uno inventado.
    const side: MarkSide | null =
        payload.side === 'right' || payload.side === 'left' ? payload.side : null
    const text = (value: string | null | undefined) => {
        const trimmed = (value ?? '').trim()
        return trimmed ? trimmed : null
    }
    return {
        zone,
        side,
        content,
        ink_style: text(payload.inkStyle),
        coverage: text(payload.coverage),
        orientation: text(payload.orientation),
        storage_path: text(payload.storagePath),
        storage_provider: text(payload.storageProvider),
    }
}

/** Las marcas de un avatar, las más antiguas primero (el orden en que se escriben en el tag). */
export async function listAvatarMarks(avatarId: string): Promise<AvatarMarkRow[]> {
    const ctx = await getOrgContext()
    requirePermission(ctx, 'content:read')
    const { data, error } = await orgTable(ctx, 'avatar_marks')
        .select('*')
        .eq('avatar_id', avatarId)
        .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as AvatarMarkRow[]
}

export async function createAvatarMark(
    payload: AvatarMarkPayload,
): Promise<AvatarMarkRow> {
    const ctx = await getOrgContext()
    requirePermission(ctx, 'content:write')
    await assertOwnedAvatar(ctx, payload.avatarId)

    const { data, error } = await orgInsert(ctx, 'avatar_marks', {
        avatar_id: payload.avatarId,
        ...cleanPayload(payload),
    })
        .select('*')
        .single()
    if (error) throw error
    return data as AvatarMarkRow
}

export async function updateAvatarMark(
    markId: string,
    payload: AvatarMarkPayload,
): Promise<AvatarMarkRow> {
    const ctx = await getOrgContext()
    requirePermission(ctx, 'content:write')
    await assertOwnedMark(ctx, markId)
    await assertOwnedAvatar(ctx, payload.avatarId)

    const { data, error } = await orgTable(ctx, 'avatar_marks')
        .update({
            ...cleanPayload(payload),
            // Editar la marca invalida lo horneado: la hoja lleva el diseño
            // viejo y hay que volver a hornearla.
            baked_at: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', markId)
        .select('*')
        .single()
    if (error) throw error
    return data as AvatarMarkRow
}

export async function deleteAvatarMark(markId: string): Promise<boolean> {
    const ctx = await getOrgContext()
    requirePermission(ctx, 'content:delete')
    await assertOwnedMark(ctx, markId)
    const { error } = await orgTable(ctx, 'avatar_marks').delete().eq('id', markId)
    if (error) throw error
    return true
}

/**
 * Sube la foto de una marca y devuelve dónde quedó.
 *
 * Va por `putMediaObject` (el mismo almacén que las generaciones) y NO por
 * `avatar_references`: la foto es un campo de la marca, no una referencia de
 * identidad — no debe viajar como FACE_ANCHOR ni contar como foto del avatar.
 *
 * El cliente manda la imagen YA redimensionada: un server action de Vercel
 * corta a 4,5 MB y una foto de móvil se pasa sola.
 */
export async function uploadMarkPhoto(
    avatarId: string,
    base64: string,
    mimeType: string,
): Promise<{ storagePath: string; storageProvider: string; url: string }> {
    const ctx = await getOrgContext()
    requirePermission(ctx, 'content:write')
    await assertOwnedAvatar(ctx, avatarId)

    const limpio = base64.includes(',') ? base64.split(',')[1] : base64
    const body = Buffer.from(limpio, 'base64')
    if (body.byteLength === 0) throw new Error('La imagen llegó vacía')
    if (body.byteLength > 8 * 1024 * 1024) {
        throw new Error('La imagen pesa demasiado: redimensiónala antes de subirla')
    }

    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg'
    const storagePath = `avatar-marks/${avatarId}/${Date.now()}.${ext}`
    const { url, provider } = await putMediaObject({
        path: storagePath,
        body,
        contentType: mimeType || 'image/jpeg',
        upsert: true,
    })
    return { storagePath, storageProvider: provider, url }
}

/**
 * Propone los campos de la marca leyendo su foto. La ZONA vuelve solo si es
 * una del catálogo; el LADO no se propone nunca (ver analyzeMarkFromImage).
 */
export async function analyzeMarkPhoto(
    base64: string,
    mimeType: string,
): Promise<{
    zone: string
    content: string
    inkStyle: string
    coverage: string
    orientation: string
}> {
    const ctx = await getOrgContext()
    requirePermission(ctx, 'content:write')
    return analyzeMarkFromImage({ base64, mimeType }, MARK_ZONE_IDS)
}


// =============================================
// HORNEADO EN LAS HOJAS CANÓNICAS
// =============================================
//
// Por qué existe: el tag [MARKS: ...] describe la marca con PALABRAS en cada
// generación, así que el modelo la dibuja de nuevo cada vez — otra peonía,
// otro tamaño, otro sitio del antebrazo. Pintándola DENTRO de la hoja de
// ángulos y de las del Body Lab, que viajan como imagen de referencia, el
// modelo la COPIA en vez de inventarla. Eso es lo que la vuelve parte del
// cuerpo y no una instrucción más del prompt.

export type SheetType = 'angle' | 'body' | 'body_nsfw'

export interface SheetToBake {
    referenceId: string
    type: SheetType
    url: string
}

/** Las hojas canónicas del avatar, la más reciente de cada tipo. */
export async function getSheetsForBaking(
    avatarId: string,
): Promise<SheetToBake[]> {
    const ctx = await getOrgContext()
    requirePermission(ctx, 'content:read')
    await assertOwnedAvatar(ctx, avatarId)

    const { data, error } = await orgTable(ctx, 'avatar_references')
        .select('id, type, storage_path, storage_provider, created_at')
        .eq('avatar_id', avatarId)
        .in('type', ['angle', 'body', 'body_nsfw'])
        .order('created_at', { ascending: false })
    if (error) throw error

    const filas = (data ?? []) as unknown as {
        id: string
        type: SheetType
        storage_path: string
        storage_provider: string | null
    }[]

    // Una por tipo: la primera de cada uno, que con el orden de arriba es la
    // más nueva. Refrescar el Body Lab deja filas viejas y hornear la
    // equivocada dejaría el avatar con dos cuerpos distintos.
    const vistas = new Set<string>()
    const hojas: SheetToBake[] = []
    for (const fila of filas) {
        if (vistas.has(fila.type)) continue
        vistas.add(fila.type)
        hojas.push({
            referenceId: fila.id,
            type: fila.type,
            url: getReferenceMediaUrl(fila.storage_path, fila.storage_provider),
        })
    }
    return hojas
}

/**
 * Guarda la hoja ya horneada y REPUNTA la referencia a ella.
 *
 * La hoja anterior NO se borra del almacén a propósito: si el horneado sale
 * mal, sus bytes siguen ahí para volver atrás. Cuesta céntimos y evita perder
 * la identidad del avatar por una edición fallida.
 */
export async function persistBakedSheet(
    avatarId: string,
    referenceId: string,
    type: SheetType,
    imageUrl: string,
): Promise<void> {
    const ctx = await getOrgContext()
    requirePermission(ctx, 'content:write')
    await assertOwnedAvatar(ctx, avatarId)

    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`No se pudo descargar la hoja horneada (${res.status})`)
    const body = Buffer.from(await res.arrayBuffer())
    if (body.byteLength === 0) throw new Error('La hoja horneada llegó vacía')

    const path = `${ctx.userId}/references/${avatarId}/${type}/${Date.now()}.jpg`
    const { provider } = await putMediaObject({
        path,
        body,
        contentType: 'image/jpeg',
        // Las referencias viven en `avatars`, no en `generations`: con R2
        // apagado, el default mandaría los bytes al bucket equivocado.
        supabaseBucket: 'avatars',
    })

    const { error } = await orgTable(ctx, 'avatar_references')
        .update({ storage_path: path, storage_provider: provider })
        .eq('id', referenceId)
    if (error) throw error
}

/** Sella las marcas del avatar como ya pintadas en las hojas. */
export async function markMarksAsBaked(
    avatarId: string,
): Promise<AvatarMarkRow[]> {
    const ctx = await getOrgContext()
    requirePermission(ctx, 'content:write')
    await assertOwnedAvatar(ctx, avatarId)

    const { error } = await orgTable(ctx, 'avatar_marks')
        .update({ baked_at: new Date().toISOString() })
        .eq('avatar_id', avatarId)
    if (error) throw error
    return listAvatarMarks(avatarId)
}
