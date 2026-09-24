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
