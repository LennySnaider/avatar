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
