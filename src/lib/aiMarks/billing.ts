/**
 * ¿Se cobra esta limpieza, y cuánto?
 *
 * La parte PURA (`debeCobrar`, `cotizar`) no importa nada de Supabase, para que
 * la regla de "sólo se cobra si de verdad se quitó algo" se pueda probar sola.
 * El cobro contra el monedero vive en `billing.server.ts`.
 */
import { quote, type Quote } from '@/lib/billing/catalog'

import type { InformeLimpieza } from './types'

/**
 * Sólo se cobra cuando el archivo salió distinto de como entró.
 *
 * POR QUÉ NO UNA TARIFA DE ESCANEO: mirar un archivo cuesta milisegundos, y
 * cobrar por "no había nada" produce exactamente la factura que el tenant no
 * entiende. Un `failed` tampoco se cobra: ahí el tenant se queda con el archivo
 * sucio, así que cobrarle sería cobrar por una promesa incumplida.
 *
 * `partial` SÍ se cobra si se quitó algo: el archivo mejoró de verdad, y la
 * interfaz ya avisa de lo que sobrevivió.
 */
export function debeCobrar(informe: InformeLimpieza): boolean {
    if (!informe.escribioSalida) return false
    if (informe.estado === 'no_marks' || informe.estado === 'rejected') return false
    const quitoLogo = informe.visibles.some((m) => m.estado === 'removida')
    const quitoMetadatos = informe.metadatos.removidos.length > 0
    return quitoLogo || quitoMetadatos
}

/**
 * Cotiza la limpieza YA HECHA.
 *
 * Se cotiza después y no antes a propósito: hasta que el motor no mira el
 * archivo no se sabe si había un logo que rellenar —el caso caro, hasta 115 s
 * en un vídeo— o sólo metadatos que borrar. Un hold previo tendría que reservar
 * siempre el peor caso.
 */
export function cotizar(informe: InformeLimpieza, mediaType: 'IMAGE' | 'VIDEO'): Quote {
    const rellenoDeFotogramas =
        mediaType === 'VIDEO' && informe.visibles.some((m) => m.estado === 'removida')
    return quote({ kind: 'ai_mark_clean', mediaType, rellenoDeFotogramas })
}

/**
 * Clave de idempotencia del asiento. Una generación se cobra UNA vez, aunque
 * el barrido la retome o el usuario pulse "reintentar": un intento fallido
 * nunca llegó a cobrar, así que reusar la clave no pierde ningún cobro
 * legítimo y sí impide el doble cargo.
 */
export function claveDeCobro(generationId: string): string {
    return `ai_mark_clean:${generationId}`
}
