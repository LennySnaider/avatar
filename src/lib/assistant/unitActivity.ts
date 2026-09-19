/**
 * F5.2 (Estratega) — Informe de actividad facturable del módulo `strategist`,
 * que es lo que `chargeModuleFees` (`@/lib/billing/moduleFees`) necesita para
 * prorratear su cuota mensual por días.
 *
 * SIN ESTE FICHERO LA CUOTA NO SE COBRA: `chargeModuleFees` salta cualquier
 * módulo con precio > 0 que no tenga informador registrado y sólo deja un
 * `console.warn` cada día. Hasta ahora únicamente Telegram registraba el
 * suyo, así que el Estratega se instalaba y no facturaba nada.
 *
 * SIN SESIÓN a propósito, igual que `src/lib/telegram/bots.ts`: lo dispara el
 * cron de cuotas (`src/app/api/cron/module-fees/route.ts`), que recorre TODAS
 * las organizaciones y resuelve la org fila a fila — no hay cookie de la que
 * sacar un `OrgContext`. Por eso se usa `orgSupabase()` (cliente service-role)
 * filtrando A MANO por `organization_id`, que llega por parámetro. Ver
 * exención en `scripts/check-tenant-access.mjs` y en el bloque
 * `no-restricted-syntax` de `eslint.config.mjs` (mismo patrón que `bots.ts`).
 *
 * LA UNIDAD ES LA ORGANIZACIÓN (`module_catalog.unit = 'org'`): no se cuentan
 * avatares ni usuarios, sólo hay una unidad y está activa mientras el módulo
 * lo esté. La regla fila → periodo es pura y vive (con su test) en
 * `./unitActivityRow.ts`; la cabecera de ese fichero explica por qué está
 * separada.
 */
import { orgSupabase } from '@/lib/org/orgTable'
import { registerUnitActivity } from '@/lib/billing/moduleFees'
import { rowToUnitActivity, type StrategistModuleRow } from './unitActivityRow'
import type { UnitActivity } from '@/lib/billing/period'

/** Slug tal cual vive en `module_catalog`/`org_modules` — ver `requireModule(ctx, 'strategist')`. */
const MODULE_SLUG = 'strategist'

/**
 * Cuándo estuvo facturable el Estratega en esta organización.
 *
 * Devuelve como mucho una entrada (la unidad es la organización), pero la
 * firma es una lista porque es el contrato de `UnitActivity[]` que comparten
 * todos los informadores — y porque nada impide que una organización tenga
 * dos filas del mismo slug si alguna vez se pierde el índice único.
 */
export async function strategistUnitActivity(
    organizationId: string,
): Promise<UnitActivity[]> {
    const { data, error } = await orgSupabase()
        .from('org_modules')
        .select('installed_at, uninstalled_at, status')
        .eq('organization_id', organizationId)
        .eq('module_slug', MODULE_SLUG)
    if (error) throw new Error(error.message)

    const activity: UnitActivity[] = []
    for (const row of (data ?? []) as StrategistModuleRow[]) {
        const periodo = rowToUnitActivity(row)
        if (periodo) activity.push(periodo)
    }
    return activity
}

// Efecto lateral DELIBERADO: registra este informador en el mapa que lee
// `chargeModuleFees`. Si nadie importa este fichero, el mapa nunca se llena
// y el cron sigue saltando la cuota de `strategist` PARA SIEMPRE, sin ningún
// error ni aviso — `chargeModuleFees` sólo avisa con un `console.warn` cuando
// un módulo con precio > 0 no tiene informador registrado (ver
// moduleFees.ts), y ese aviso tampoco suena si este import ni siquiera
// ocurre. Por eso `src/app/api/cron/module-fees/route.ts` importa este
// módulo SÓLO por su efecto lateral. Si vas a "limpiar imports sin usar":
// este no lo está — bórralo y la cuota del Estratega vuelve a cobrar cero en
// silencio.
registerUnitActivity(MODULE_SLUG, strategistUnitActivity)
