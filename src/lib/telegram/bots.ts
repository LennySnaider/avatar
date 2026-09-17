/**
 * Informe de actividad facturable de los bots de Telegram — lo consume
 * `chargeModuleFees` (`@/lib/billing/moduleFees`) para prorratear la cuota
 * mensual del módulo `telegram` por días.
 *
 * SIN SESIÓN a propósito: lo dispara el cron de cuotas
 * (`src/app/api/cron/module-fees/route.ts`), que recorre TODAS las
 * organizaciones y resuelve la org fila a fila — no hay cookie de la que
 * sacar un `OrgContext`. Por eso se usa `orgSupabase()` (cliente
 * service-role) filtrando A MANO por `organization_id`, que llega por
 * parámetro. Ver exención en `scripts/check-tenant-access.mjs` y en el
 * bloque `no-restricted-syntax` de `eslint.config.mjs` (mismo patrón que
 * `./settings.ts`, `./sales.ts` y `./paidMedia.ts`).
 *
 * TRES reglas de mapeo fila → `UnitActivity`, en este orden de prioridad:
 *
 *  1. `connected_at` NULO → SE SALTA LA FILA ENTERA; no se emite ningún
 *     `UnitActivity` para ella. `null` significa que el bot NUNCA completó
 *     su primera activación (se escribió la fila en FASE 1 de
 *     `connectTelegramBot`, pero `setWebhook` nunca llegó a confirmar, o el
 *     intento sigue a medias). Es "nunca facturable", no "cero días":
 *     tratar el nulo como "activo desde siempre" cobraría meses en los que
 *     el bot jamás funcionó. Ver CANDADO 1 en `AgentTelegramService.ts` y la
 *     migración `avatar_telegram_connected_at_nullable`.
 *  2. `disconnected_at` presente → es el fin EXACTO del periodo activo, sea
 *     cual sea el valor de `enabled` (una fila con `disconnected_at` puesta
 *     y `enabled: true` a la vez sería un dato inconsistente, pero si
 *     ocurriera, esta regla gana igual: una fecha de baja explícita siempre
 *     manda sobre el flag).
 *  3. `enabled = false` SIN `disconnected_at` → se usa `updated_at` como
 *     APROXIMACIÓN de cuándo se apagó (NO es un dato exacto: es sólo la
 *     última vez que la fila cambió). Este estado SÍ es alcanzable hoy, no
 *     es sólo teórico: `connectTelegramBot` escribe `enabled: false` en su
 *     FASE 1 de forma incondicional —incluso al reconectar un bot que ya
 *     estaba activo, sin comprobar antes su estado—, y si la FASE 2
 *     (`setWebhook`) falla después (red, Telegram caído, token rechazado),
 *     la fila queda parada exactamente ahí: `enabled: false`,
 *     `disconnected_at` intacto en `null` (porque el bot estaba activo
 *     antes del intento) y `connected_at` ya poblado de una activación
 *     legítima anterior. `updated_at` (estampado en esa misma FASE 1) es lo
 *     más cercano que hay al instante en que dejó de contar como
 *     facturable.
 *
 * Si ninguna de las reglas 2 o 3 aplica (`disconnected_at` nulo y
 * `enabled: true`), el bot sigue activo: `activeUntil: null`.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { registerUnitActivity } from '@/lib/billing/moduleFees'
import type { UnitActivity } from '@/lib/billing/period'
import type { Database } from '@/@types/database.generated'

/** Slug tal cual vive en `module_catalog`/`org_modules` — ver
 *  `requireModule(ctx, 'telegram')` en `AgentTelegramService.ts`. */
const MODULE_SLUG = 'telegram'

type BotActivityRow = Pick<
    Database['public']['Tables']['avatar_telegram_settings']['Row'],
    'connected_at' | 'disconnected_at' | 'enabled' | 'updated_at'
>

/**
 * Cuándo estuvo facturable cada bot de la organización. La cuota se
 * prorratea por días, así que no basta con contar: hace falta desde cuándo
 * y hasta cuándo. `disconnected_at` nulo con `enabled: true` significa que
 * sigue activo. Ver las tres reglas de mapeo en la cabecera del fichero.
 */
export async function telegramUnitActivity(
    organizationId: string,
): Promise<UnitActivity[]> {
    const { data, error } = await orgSupabase()
        .from('avatar_telegram_settings')
        .select('connected_at, disconnected_at, enabled, updated_at')
        .eq('organization_id', organizationId)
    if (error) throw new Error(error.message)

    const activity: UnitActivity[] = []
    for (const row of (data ?? []) as BotActivityRow[]) {
        // Regla 1 — sin activación real no hay periodo que facturar.
        if (!row.connected_at) continue

        // Regla 2 (disconnected_at manda si está) → regla 3 (aproximación
        // por updated_at si está deshabilitado sin fecha de baja) → sigue
        // activo (null).
        const activeUntil =
            row.disconnected_at ?? (row.enabled ? null : row.updated_at)

        activity.push({ activeFrom: row.connected_at, activeUntil })
    }
    return activity
}

// Efecto lateral DELIBERADO: registra este informador en el mapa que lee
// `chargeModuleFees`. Si nadie importa este fichero, el mapa nunca se llena
// y el cron sigue saltando la cuota de `telegram` PARA SIEMPRE, sin ningún
// error ni aviso — `chargeModuleFees` sólo avisa con un `console.warn` cuando
// un módulo con precio > 0 no tiene informador registrado (ver
// moduleFees.ts), y ese aviso tampoco suena si este import ni siquiera
// ocurre. Por eso `src/app/api/cron/module-fees/route.ts` importa este
// módulo SÓLO por su efecto lateral. Si vas a "limpiar imports sin usar":
// este no lo está — bórralo y la cuota de telegram vuelve a cobrar cero en
// silencio.
registerUnitActivity(MODULE_SLUG, telegramUnitActivity)
