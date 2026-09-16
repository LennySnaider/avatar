/**
 * Decisiones puras del sondeo de comentarios (`poll.ts`): qué cuenta es
 * "propia", de dónde sale el id del comentarista, cuándo dejar de paginar y
 * cuándo el rate-limit obliga a frenar. Fichero PURO, sin imports (mismo
 * estilo que `ids.ts`/`gate.ts`) — toda la IO (HTTP, Supabase) vive en
 * `poll.ts`, que arma estos inputs.
 *
 * @see docs/superpowers/specs — task-5-brief.md / global-constraints.md (comentarios-ia-social)
 */

/** Lo mínimo de una cuenta propia (`SocialCommentOwnAccount` de settings.ts)
 *  que este fichero necesita — sin importar ese tipo para seguir sin imports. */
export interface OwnAccountLike {
    platform: string
    accountId: string
    accountName: string
}

/** Lo mínimo de un `SocialComment` (`@/@types/social.ts`) que este fichero necesita. */
export interface CommentAuthorLike {
    authorId: string | null
    authorUsername: string | null
}

/**
 * ¿Este comentario lo dejó el propio avatar/creador? Compara contra las
 * cuentas propias DE LA MISMA RED (`platform`, comparado sin distinguir
 * mayúsculas — igual que el resto del código social, que ya normaliza en
 * minúsculas, pero una comparación defensiva no cuesta nada): por id (si
 * ambos lo traen) o por username (si ambos lo traen), sin distinguir
 * mayúsculas — Instagram/X no garantizan la misma capitalización en cada
 * respuesta.
 */
export function isOwnComment(comment: CommentAuthorLike, ownAccounts: OwnAccountLike[], platform: string): boolean {
    const platformLower = platform.toLowerCase()
    for (const account of ownAccounts) {
        if (account.platform.toLowerCase() !== platformLower) continue
        if (comment.authorId && account.accountId && comment.authorId === account.accountId) return true
        if (
            comment.authorUsername &&
            account.accountName &&
            comment.authorUsername.toLowerCase() === account.accountName.toLowerCase()
        ) {
            return true
        }
    }
    return false
}

/** `authorId` si lo trae; si no, `authorUsername`; si ninguno, `null` (no hay
 *  a quién asociar el hilo — el llamador lo salta con un warning). */
export function pickCommenterId(comment: CommentAuthorLike): string | null {
    return comment.authorId ?? comment.authorUsername ?? null
}

export interface ShouldStopPagingInput {
    /** Página que se acaba de procesar (1-indexado). */
    page: number
    /** `hasNext` de la página que se acaba de procesar. */
    hasNext: boolean
    /** true si la página trajo un `nextCursor` utilizable. `hasNext:true`
     *  con esto en `false` es una página que DICE que hay más pero no da
     *  con qué pedirlas — sin esto, el llamador reintentaría la MISMA
     *  página (sin `after`) en vez de parar, contando los mismos
     *  comentarios dos veces. */
    hasCursor: boolean
    /** true si esa página trajo al menos un comentario que ya teníamos
     *  ingerido (`ingestMessage(...).inserted === false`). */
    sawKnown: boolean
}

const MAX_PAGES = 3

/**
 * ¿Hay que dejar de paginar este target? Cuatro motivos, cualquiera basta:
 * no hay más páginas, hay más páginas pero sin cursor real con el que
 * pedirlas, la página trajo un comentario ya conocido (llegamos al punto
 * donde el sondeo anterior se quedó), o se llegó al tope de 3 páginas por
 * target (cap duro, X puede devolver páginas vacías con `has_next:true`
 * para siempre).
 */
export function shouldStopPaging(input: ShouldStopPagingInput): boolean {
    if (!input.hasNext) return true
    if (!input.hasCursor) return true
    if (input.sawKnown) return true
    if (input.page >= MAX_PAGES) return true
    return false
}

export interface RateLimitLike {
    remaining: number | null
}

/** `remaining < 5` → hay que frenar el barrido de este perfil. Sin dato
 *  todavía (primera llamada del proceso, o proveedor que no lo reportó) no
 *  se frena — no hay señal de la que desconfiar. */
export function rateLimitLow(rl: RateLimitLike | null | undefined): boolean {
    if (!rl || rl.remaining === null) return false
    return rl.remaining < 5
}

const SINCE_DAYS_DEFAULT = 7
const SINCE_DAYS_MIN = 1
const SINCE_DAYS_MAX = 30

/**
 * Query param `sinceDays` del cron (override manual para probar el sondeo
 * contra datos reales sin esperar la ventana de 7 días por defecto —
 * Vercel Scheduled Functions llama sin query string, así que en producción
 * esto siempre cae al default) → entero acotado a `[1, 30]`. Puro: cualquier
 * entrada rara (`null`, vacía, no numérica, fuera de rango) cae a un valor
 * seguro en vez de tirar o dejar pasar una ventana absurda (0 días, o miles).
 */
export function clampSinceDays(raw: string | null): number {
    if (raw === null) return SINCE_DAYS_DEFAULT
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return SINCE_DAYS_DEFAULT
    return Math.min(SINCE_DAYS_MAX, Math.max(SINCE_DAYS_MIN, n))
}

/**
 * Parte `arr` en trozos de a lo sumo `size` elementos, en orden. Usado por
 * `targets.ts` para leer `social_post_targets` con `.in('social_post_id',
 * ids)` en tandas de 100 en vez de mandar hasta `CANDIDATE_POSTS_CAP` (500)
 * UUIDs en un solo GET — un query string así de largo (~18KB) puede pegarle
 * al límite de URL de PostgREST/Kong. `size <= 0` no rompe: devuelve `[arr]`
 * tal cual (no hay forma sensata de "trozos de tamaño 0").
 */
export function chunk<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return arr.length ? [arr] : []
    const out: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size))
    }
    return out
}

export interface PostNeedsSyncInput {
    /** `social_posts.published_at` de ESTE post. */
    publishedAt: string | null
    /** Cuántas filas de `social_post_targets` tiene ya este post (una por
     *  plataforma que sí logró un `platform_post_id`). */
    targetCount: number
    now: Date
}

const SYNC_GRACE_MS = 2 * 60 * 60 * 1000 // 2 horas

/**
 * ¿Hay que volver a pedirle `listHistory` a este post? Medido en vivo
 * (2026-09-16 con Emily, `?sinceDays=30`): un post con una plataforma que
 * FALLÓ (p.ej. Instagram con `account_reauth_required`) nunca iba a tener
 * `platform_post_id` — sin este corte, cada corrida del cron (cada 15 min,
 * para siempre) lo volvía a mandar a `listHistory` porque "le falta
 * Instagram", gastando una llamada al proveedor por nada: la falla ya
 * quedó logueada la primera vez que se vio.
 *
 * Regla: sin NINGÚN target todavía, sí (puede que Upload-Post aún no haya
 * terminado de publicar, o que el sondeo anterior no llegara a este post).
 * Con al menos un target, sólo si se publicó hace menos de 2 horas — una
 * plataforma que tarda más que eso en resolver (éxito o fallo) es rara,
 * pero le da margen a publicaciones que terminan tarde en unas pocas
 * plataformas. Pasadas esas 2 horas, un post con ≥1 target se considera
 * asentado aunque le falte alguna plataforma: esa falta ya se vio y logueó
 * la primera vez, no hace falta seguir preguntando.
 */
export function postNeedsSync(input: PostNeedsSyncInput): boolean {
    if (input.targetCount === 0) return true
    if (!input.publishedAt) return false
    const publishedTime = new Date(input.publishedAt).getTime()
    if (!Number.isFinite(publishedTime)) return false
    return input.now.getTime() - publishedTime < SYNC_GRACE_MS
}
