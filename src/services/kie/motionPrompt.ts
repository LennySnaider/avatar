/**
 * Guardia COMPARTIDO del arnés de prompt para las rutas de VÍDEO de KIE.
 *
 * Puro, determinista, sin red — testeable en aislamiento.
 *
 * POR QUÉ EXISTE COMPARTIDO (y no copiado en cada ruta):
 * Wan 2.2 turbo y Kling 3.0 motion-control rechazan el arnés estructurado del
 * Studio (`[BODY …]`, `[FACE: …]`) con `failCode 500 / "Internal Error"` en
 * ~15 ms — ni siquiera llega a la GPU, así que no es longitud ni la imagen: es
 * el CONTENIDO estructurado. Cada ruta llevaba su propia copia de la regex, y
 * ahí estuvo el fallo: en julio-2026 ambas nacieron casando `[BODY: …]` (dos
 * puntos); cuando el store pasó a emitir `[BODY — … ]` (RAYA), SOLO se arregló
 * Kling. La copia de Wan 2.2 quedó ciega y dejó de limpiar EN SILENCIO —
 * ninguna prueba, ningún log, solo 500s (ledger 18/19-sep: hold→refund en
 * todas, cero settles). Una sola definición no puede volver a divergir.
 *
 * En i2v esto es doblemente caro: la identidad viaja en la IMAGEN, así que el
 * único texto que el motor necesita es el MOVIMIENTO — y era justo el que se
 * perdía, porque la cabecera fija de `[BODY — …]` son ~340 chars y el recorte
 * se los comía enteros antes de llegar a la escena del usuario.
 */

/**
 * `[ETIQUETA <sep> …]` con etiqueta en MAYÚSCULAS y separador `:`, raya (—),
 * semirraya (–) o guion. Los cuatro separadores están en uso hoy: `[FACE:`,
 * `[BODY —`, `[AUDIO CONSTRAINT -`.
 */
const HARNESS_BLOCK = /\[[A-Z][A-Z_ ]*\s*[:–—-][^\]]*\]/g

/**
 * Quita el arnés estructurado de un prompt y lo recorta al presupuesto del
 * modelo, dejando SOLO el texto de movimiento.
 *
 * Devuelve '' si el arnés era todo el prompt: el caller decide el reemplazo
 * (cada motor tiene su propio default de movimiento).
 */
export function stripPromptHarness(prompt: string, maxChars: number): string {
    const sinArnes = (prompt ?? '')
        .replace(HARNESS_BLOCK, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, maxChars)

    // RED DE SEGURIDAD — lo que de verdad mata a Wan 2.2 es un `[` SIN CERRAR:
    // o porque el recorte partió un bloque por la mitad, o porque apareció una
    // etiqueta con un separador que la regex de arriba aún no contempla. En
    // ambos casos el resto es basura estructural, no movimiento: se tira. Así
    // el modo de fallo no puede reaparecer en silencio aunque el formato del
    // arnés vuelva a cambiar.
    const abierto = sinArnes.lastIndexOf('[')
    if (abierto !== -1 && sinArnes.indexOf(']', abierto) === -1) {
        return sinArnes
            .slice(0, abierto)
            .replace(/\s{2,}/g, ' ')
            .trim()
    }
    return sinArnes
}
