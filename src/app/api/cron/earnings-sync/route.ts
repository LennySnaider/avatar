/**
 * GET /api/cron/earnings-sync
 *
 * Trae de Fanvue los ingresos diarios por creator de cada organización con
 * conexión de agencia y los deja en `fanvue_daily_earnings` (ver vercel.json:
 * cada hora, minuto 41). Telegram NO pasa por aquí: sus ventas ya están en la
 * base y los dashboards las agregan en vivo (RPC `earnings_series`).
 *
 * Ventana por defecto: los últimos 3 días (Fanvue exporta al almacén una vez
 * al día y consulta en vivo los días parciales; volver a pedir 3 días recoge
 * facturas tardías). Parámetros opcionales, todos protegidos por CRON_SECRET:
 *   - `days=N`        1..365, ventana que termina hoy (UTC).
 *   - `from=&to=`     'YYYY-MM-DD', ≤ 366 días, `to` ≤ hoy: el BACKFILL. Se
 *                     hace por rebanadas de ~90 días para no rozar maxDuration.
 *   - `org=<uuid>`    sólo esa organización.
 *   - `dryRun=1`      lee la primera página y la devuelve en `sample`, sin
 *                     escribir. Es el spike de verificación del endpoint.
 *   - `path=/ruta`    sólo con dryRun: probar otra ruta del endpoint sin
 *                     redeploy (Fanvue documenta el mismo endpoint con dos
 *                     nombres; ver AGENCY_EARNINGS_PATH en FanvueClient.ts).
 *
 * Continue-on-error POR ORG, como el resto de crons: una org con el token
 * caducado no bloquea a las demás.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
    listFanvueConnectionsForSync,
    syncOrgFanvueEarnings,
    type FanvueSyncResult,
} from '@/lib/earnings/fanvueSync'
import { addDaysIso, daysBetween, utcToday } from '@/lib/earnings/period'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f-]{36}$/i

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const params = request.nextUrl.searchParams
    const dryRun = params.get('dryRun') === '1'
    const path = dryRun ? (params.get('path') ?? undefined) : undefined
    const org = params.get('org') ?? undefined
    if (org && !UUID_RE.test(org)) {
        return NextResponse.json({ error: 'org inválido' }, { status: 400 })
    }

    const today = utcToday()
    let from: string
    let to: string
    const fromParam = params.get('from')
    const toParam = params.get('to')
    if (fromParam || toParam) {
        if (
            !fromParam ||
            !toParam ||
            !DAY_RE.test(fromParam) ||
            !DAY_RE.test(toParam)
        ) {
            return NextResponse.json(
                { error: 'from y to deben ir juntos en formato YYYY-MM-DD' },
                { status: 400 },
            )
        }
        from = fromParam
        to = toParam > today ? today : toParam
        const span = daysBetween(from, to)
        if (span < 1 || span > 366) {
            return NextResponse.json(
                { error: 'la ventana debe tener entre 1 y 366 días' },
                { status: 400 },
            )
        }
    } else {
        const days = Math.min(
            365,
            Math.max(1, Number(params.get('days') ?? 3) || 3),
        )
        to = today
        from = addDaysIso(today, -(days - 1))
    }

    const results: FanvueSyncResult[] = []
    const errors: { organizationId: string; message: string }[] = []
    let synced = 0
    let skipped = 0
    let rowsUpserted = 0
    let truncated = 0

    try {
        const connections = await listFanvueConnectionsForSync(org)
        for (const connection of connections) {
            try {
                const result = await syncOrgFanvueEarnings({
                    ...connection,
                    from,
                    to,
                    dryRun,
                    path,
                })
                results.push(result)
                if (result.skipped) skipped += 1
                else synced += 1
                rowsUpserted += result.rowsUpserted
                if (result.truncated) truncated += 1
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e)
                errors.push({
                    organizationId: connection.organizationId,
                    message,
                })
                console.error(
                    `[earnings-sync] org ${connection.organizationId} falló:`,
                    message,
                )
            }
        }
        if (synced > 0 || errors.length > 0 || truncated > 0) {
            console.log(
                `[earnings-sync] ${from}..${to}: ${synced} orgs sincronizadas · ${skipped} saltadas · ${errors.length} fallidas · ${rowsUpserted} filas · ${truncated} truncadas${dryRun ? ' · dryRun' : ''}`,
            )
        }
        return NextResponse.json({
            window: { from, to },
            dryRun,
            orgs: connections.length,
            synced,
            skipped,
            failed: errors.length,
            rowsUpserted,
            truncated,
            results,
            errors,
        })
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[earnings-sync] abortado:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
