/**
 * GET /api/cron/ai-marks-sweep
 *
 * Recoge cada minuto las limpiezas que quedaron a medias y purga los originales
 * que ya fueron sustituidos (ver vercel.json). La lógica y el porqué viven en
 * `barrerMarcas` — esto es sólo la cáscara HTTP.
 *
 * POR QUÉ CADA MINUTO: un vídeo tarda decenas de segundos y no se espera dentro
 * del guardado, así que la fila nace `pending` y alguien tiene que recogerla.
 * Un minuto es lo que el tenant tarda en mirar la galería.
 *
 * Protegido por CRON_SECRET (Bearer), igual que los otros crons.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { barrerMarcas } from '@/lib/aiMarks/sweep.server'

export const dynamic = 'force-dynamic'
// Un vídeo con relleno llegó a 115 s medidos y el barrido toma hasta 3 por
// pasada. 800 s es el máximo del plan Pro y deja margen de sobra.
export const maxDuration = 800

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (secret && authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    try {
        const resumen = await barrerMarcas()
        // Silencio cuando no hubo nada: un cron por minuto que loguea siempre
        // ahoga el resto de los logs.
        if (resumen.tomadas > 0 || resumen.purgadas > 0 || resumen.omitidoPorServicioCaido) {
            console.log(
                `[ai-marks-sweep] ${resumen.tomadas} tomadas · ${resumen.limpiadas} limpiadas · ` +
                    `${resumen.sinMarcas} sin marcas · ${resumen.reintentos} reintentos · ` +
                    `${resumen.fallidas} fallidas · ${resumen.purgadas} originales purgados` +
                    (resumen.omitidoPorServicioCaido ? ' · LIMPIADOR CAÍDO' : ''),
            )
        }
        return NextResponse.json(resumen)
    } catch (e) {
        // 500 a propósito: un barrido que no pudo leer la tabla no hizo nada, y
        // eso tiene que verse en los logs del cron en vez de un 200 que finge.
        const message = e instanceof Error ? e.message : String(e)
        console.error('[ai-marks-sweep] abortado:', message)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
