/**
 * Constructores de URL de Storage — PUROS (solo string building, sin cliente
 * Supabase). Módulo client-safe: los componentes pueden importarlo sin tocar
 * `@/lib/supabase` (restringido por el candado multitenant F4.2.a).
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

/** Get the public URL for a file in Supabase Storage */
export function getStoragePublicUrl(bucket: string, path: string): string {
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}

/** Prefijo de los paths con scope de tenant. Fuera de una constante nadie más
 *  debería escribir la palabra: el dual-read de abajo depende de que sea UNA. */
const ORG_PREFIX = 'org'

/**
 * Path de Storage con scope de ORGANIZACIÓN — entregable de F4.2.c.
 *
 * POR QUÉ EXISTE: la *fila* de `generations` ya va org-scoped (4.2.b) pero los
 * BYTES seguían cayendo en `{userId}/...`, que no es frontera de tenant: el
 * `user_id` de las tablas quedó como "creado por" (auditoría), y un mismo
 * usuario puede pertenecer a varias orgs. Sin este prefijo, mover un avatar de
 * org o auditar "qué archivos son de este tenant" no tiene respuesta.
 *
 * POR QUÉ AHORA (2026-07-29): `scripts/backfill-r2.mjs` mueve los objetos a R2
 * **sin renombrar** y su último paso BORRA los de Supabase. Si ese backfill
 * corre con los paths viejos, la deuda se reescribe en R2 y ya no hay otra
 * migración gratis. El helper tiene que existir antes del día D.
 *
 * Los archivos VIEJOS no se mueven: la lectura es dual (ver
 * `orgOwnsStoragePath`). Client-safe a propósito — es solo string building.
 */
export function orgStoragePath(
    organizationId: string,
    ...segments: string[]
): string {
    const clean = segments
        .join('/')
        .split('/')
        .filter(Boolean)
        .join('/')
    return `${ORG_PREFIX}/${organizationId}/${clean}`
}

/** ¿Este path ya nació con scope de org? (los legacy empiezan por `{userId}/`
 *  o por una carpeta genérica tipo `kie-images/`). */
export function isOrgScopedPath(path: string): boolean {
    return path.startsWith(`${ORG_PREFIX}/`)
}

/**
 * ¿Este path pertenece a quien lo pide? **Dual-read** durante la transición:
 *
 *  - path nuevo (`org/{orgId}/…`) → tiene que ser la org del contexto.
 *  - path legacy (`{userId}/…`)   → tiene que ser el usuario del contexto.
 *
 * El caso legacy es más ESTRECHO que el nuevo (rechaza media de un compañero de
 * la misma org), pero es exactamente la regla que ya aplicaba antes; ampliarla
 * aquí sería un cambio de permisos disfrazado de refactor. Los paths de carpeta
 * genérica (`kie-images/…`) no pertenecen a nadie y devuelven false: ninguna
 * ruta que valide ownership debe aceptarlos.
 */
export function orgOwnsStoragePath(
    path: string,
    ctx: { organizationId: string; userId: string },
): boolean {
    if (isOrgScopedPath(path)) {
        // Comparación literal, NO `orgStoragePath(orgId) + '/'`: sin segmentos
        // ese helper ya devuelve la barra final y el prefijo saldría con '//'.
        return path.startsWith(`${ORG_PREFIX}/${ctx.organizationId}/`)
    }
    return path.startsWith(`${ctx.userId}/`)
}

/**
 * URL pública de la media de una generación, según DÓNDE viva el objeto.
 *
 * Durante la migración a R2 conviven filas viejas (Supabase) y nuevas (R2):
 * `generations.storage_provider` dice cuál es cuál y esta función es el ÚNICO
 * sitio que traduce eso a URL. Mismo path lógico en ambos lados — solo cambia
 * la base — así el backfill voltea el provider sin renombrar nada.
 *
 * Client-safe a propósito (solo strings): la base de R2 viaja en
 * NEXT_PUBLIC_R2_PUBLIC_BASE_URL para que los componentes de galería puedan
 * construirla sin tocar código de servidor.
 */
export function getGenerationMediaUrl(
    path: string,
    provider?: string | null,
): string {
    if (provider === 'r2') {
        const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL
        if (base) {
            const encoded = path.split('/').map(encodeURIComponent).join('/')
            return `${base.replace(/\/$/, '')}/${encoded}`
        }
        // Fila marcada r2 sin base configurada: mejor una URL de Supabase que
        // quizá ya no exista, que reventar el render — y el console.warn deja
        // rastro del misconfig.
        console.warn('[storagePaths] fila r2 sin NEXT_PUBLIC_R2_PUBLIC_BASE_URL')
    }
    return getStoragePublicUrl('generations', path)
}

/**
 * Fila de generación vista por el lector de media. Las columnas de la era R2
 * son OPCIONALES a propósito: la migración 20260728010000 se aplica al
 * desbloqueo del proyecto, así que hoy pueden no venir — y el tipo generado de
 * `generations` todavía no las declara. Al ser opcionales, una `Generation`
 * cruda satisface este tipo sin un solo cast, y en runtime el campo llega
 * cuando existe.
 */
export type GenerationMediaRow = {
    storage_path: string
    storage_provider?: string | null
    thumbnail_path?: string | null
}

/**
 * URL de la media de una FILA de `generations` — la forma que deberían usar
 * TODOS los consumidores.
 *
 * POR QUÉ (2026-07-29): `getGenerationMediaUrl` nació como "el ÚNICO sitio que
 * traduce provider+path a URL", pero solo se cableó a la galería del Studio:
 * ocho sitios más seguían construyendo la URL de Supabase a pelo y con media
 * nueva —que vive en R2— daban 404. El caso peor no eran las miniaturas roas
 * sino SocialService, que le pasa esas URLs a Upload-Post: publicar en redes
 * fallaba por una URL que apunta a donde el objeto ya no está.
 *
 * Recibir la FILA en vez de (path, provider) hace imposible volver a olvidar el
 * provider en el sitio de la llamada, que es exactamente cómo pasó.
 */
export function getRowMediaUrl(row: GenerationMediaRow): string {
    return getGenerationMediaUrl(row.storage_path, row.storage_provider)
}

/** Igual pero para la MINIATURA, con caída al original si la fila no la tiene
 * (filas anteriores al thumbnail_path de la migración R2). */
export function getRowThumbnailUrl(row: GenerationMediaRow): string {
    return row.thumbnail_path
        ? getGenerationMediaUrl(row.thumbnail_path, row.storage_provider)
        : getRowMediaUrl(row)
}

/**
 * Get an optimized/transformed image URL from Supabase Storage.
 * Uses Supabase's image transformation API for on-the-fly resizing.
 */
export function getStorageThumbnailUrl(
    bucket: string,
    path: string,
    options: {
        width?: number
        height?: number
        quality?: number
        resize?: 'cover' | 'contain' | 'fill'
    } = {},
): string {
    const { width = 200, height = 200, quality = 75, resize = 'cover' } = options

    const params = new URLSearchParams({
        width: width.toString(),
        height: height.toString(),
        quality: quality.toString(),
        resize,
    })

    return `${supabaseUrl}/storage/v1/render/image/public/${bucket}/${path}?${params.toString()}`
}
