/**
 * GET /api/cron/billing-holds-sweep
 *
 * Libera cada hora los holds que quedaron colgados (ver vercel.json). La
 * lógica y el porqué viven en `sweepStaleHolds` — esto es solo la cáscara HTTP.
 *
 * Es requisito PREVIO a encender `ENFORCE_LIMITS`: con el enforcement apagado
 * el saldo retenido no bloquea a nadie y por eso nadie notaba que se acumulaba;
 * al encenderlo pasa a ser saldo fantasma que sí bloquea.
 *
 * Protegido por CRON_SECRET (Bearer), igual que los otros crons.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { sweepStaleHolds } from '@/lib/billing/wallet'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    try {
        const result = await sweepStaleHolds()
        if (result.swept > 0) {
            console.log(
                `[holds-sweep] ${result.swept} holds liberados · ${result.tokens} tokens devueltos · ${result.failed} fallidos`,
            )
        }
        return NextResponse.json(result)
    } catch (e) {
        // Se responde 500 a propósito: un barrido que no pudo leer el ledger no
        // hizo nada, y hay que verlo en los logs del cron en vez de un 200 que
        // finge éxito.
        const message = e instanceof Error ? e.message : String(e)
        console.error('[holds-sweep] abortado:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
