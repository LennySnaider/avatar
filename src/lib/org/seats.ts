/**
 * Asientos de una organización: cuántos hay, cuántos se usan y si cabe uno más.
 *
 * PURO a propósito, como `src/lib/billing/period.ts`: los números entran por
 * parámetro y no hay ni un import de base de datos, así que la regla se prueba
 * en memoria. Quien lee `organization_members`, `organization_invitations` y
 * `plan_configurations` es `membersDb.ts`; quien decide es esto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ OCUPA UN ASIENTO
 * ─────────────────────────────────────────────────────────────────────────
 * Los miembros MÁS las invitaciones vivas. Sin contar las pendientes, invitar
 * a 20 personas de golpe en un plan de 5 mete a las 20 en cuanto acepten, y el
 * tope duro es decorativo. Una invitación caducada NO ocupa asiento: si
 * ocupara, cada invitación abandonada se comería un asiento para siempre hasta
 * que alguien la revocase a mano — una fuga silenciosa.
 *
 * SIN PLAN → SIN LÍMITE, CON AVISO. `organizations.plan_slug` es NULL hasta que
 * exista el checkout y se asignen planes. Bloquear por falta de plan
 * convertiría esto en "nadie puede invitar a nadie". Así que sin plan (o con
 * un plan que ya no existe en el catálogo) no se limita, pero `planUnknown`
 * queda en true para que la pantalla lo diga y el cargador lo registre.
 *
 * El punto de aplicación REAL del tope es la función SQL
 * `accept_organization_invitation`, que cuenta bajo `for update`. Lo de aquí
 * es lo que apaga el botón y explica por qué; si un día discrepan, manda la
 * base.
 */

export interface SeatUsageInput {
    members: number
    /** Invitaciones VIVAS: sin aceptar, sin revocar y SIN caducar. */
    pendingInvitations: number
    /** `plan_configurations.max_seats`. NULL = el plan no limita. */
    maxSeats: number | null
    /** `organizations.plan_slug`. NULL = la organización no tiene plan. */
    planSlug: string | null
    /** false cuando `plan_slug` apunta a un plan que ya no está en el catálogo. */
    planFound: boolean
}

export interface SeatUsage {
    members: number
    pendingInvitations: number
    /** members + pendingInvitations. */
    used: number
    /** null cuando no hay tope. */
    max: number | null
    /** null cuando no hay tope. Nunca negativo. */
    remaining: number | null
    isFull: boolean
    unlimited: boolean
    /** true si no hay plan o no resuelve: sin límite, pero hay que avisar. */
    planUnknown: boolean
    planSlug: string | null
}

export function computeSeatUsage(input: SeatUsageInput): SeatUsage {
    const members = Math.max(0, input.members)
    const pendingInvitations = Math.max(0, input.pendingInvitations)
    const used = members + pendingInvitations

    const planUnknown = input.planSlug === null || !input.planFound
    const unlimited = planUnknown || input.maxSeats === null
    const max = unlimited ? null : (input.maxSeats as number)

    return {
        members,
        pendingInvitations,
        used,
        max,
        remaining: max === null ? null : Math.max(0, max - used),
        // `>=` y no `===`: si un cambio de plan a la baja deja `used > max`,
        // sigue estando lleno.
        isFull: max !== null && used >= max,
        unlimited,
        planUnknown,
        planSlug: input.planSlug,
    }
}

/**
 * ¿Cabe una invitación más? El mensaje del rechazo se produce AQUÍ, una sola
 * vez: lo consume el servicio (para rechazar) y la pantalla (para explicar el
 * botón apagado), y así los dos dicen lo mismo.
 */
export function canInviteMore(
    usage: SeatUsage,
): { ok: true } | { ok: false; reason: string } {
    if (!usage.isFull) return { ok: true }
    const miembros =
        usage.members === 1 ? '1 miembro' : `${usage.members} miembros`
    const pendientes =
        usage.pendingInvitations === 1
            ? '1 invitación pendiente'
            : `${usage.pendingInvitations} invitaciones pendientes`
    return {
        ok: false,
        reason: `Has ocupado los ${usage.max} asientos de tu plan (${miembros} y ${pendientes}). Amplía tu paquete para invitar a más gente.`,
    }
}

/** "3 de 5 asientos" | "3 asientos (plan sin límite)" | "3 asientos (sin plan asignado)". */
export function formatSeatUsage(usage: SeatUsage): string {
    const n = usage.used === 1 ? '1 asiento' : `${usage.used} asientos`
    if (usage.planUnknown) return `${n} (sin plan asignado)`
    if (usage.unlimited) return `${n} (plan sin límite)`
    return `${usage.used} de ${usage.max} asientos`
}
