/**
 * GET /api/cron/module-fees
 *
 * Cobra la cuota mensual de cada módulo instalado (ver vercel.json). Corre a
 * diario, pero el asiento es idempotente por mes: sólo el primer pase del mes
 * con unidades activas cobra. Los días restantes son tolerancia a fallos.
 *
 * Protegido por CRON_SECRET (Bearer), igual que los otros crons.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { chargeModuleFees } from '@/lib/billing/moduleFees'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    try {
        const result = await chargeModuleFees()
        if (result.charged > 0 || result.failed > 0) {
            console.log(
                `[module-fees] ${result.period}: ${result.charged} cobradas · ${result.tokens} tokens · ${result.replayed} repetidas · ${result.failed} fallidas`,
            )
        }
        return NextResponse.json(result)
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[module-fees] abortado:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
