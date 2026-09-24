/**
 * Corta el chorro de tokens del LLM en frases listas para el TTS.
 *
 * PURO, sin imports. El TTS por streaming de MiniMax cobra y tarda por
 * petición: mandar cada token sería carísimo y sonaría a metralleta; esperar
 * al párrafo entero añade segundos de silencio. Una frase es el punto medio:
 * la primera sale en cuanto el modelo cierra la primera oración.
 *
 * Reglas:
 *  - Se emite al ver un cierre de oración (`.`, `!`, `?`, `…`, con o sin
 *    comilla/paréntesis de cierre) SEGUIDO de un espacio, o al
 *    ver un salto de línea.
 *  - Si el buffer llega a `maxChars` sin cierre, se corta en la última
 *    coma/punto y coma/dos puntos a partir de `softMinChars`, o en el último
 *    espacio: una frase kilométrica no puede retrasar el primer audio.
 *  - Un fragmento menor que `minChars` no se emite solo (se pega a la
 *    siguiente frase), salvo en `flush()`.
 *  - Todo lo emitido pasa por `sanitizeForSpeech`: markdown, emojis, URLs y
 *    acotaciones entre asteriscos/corchetes no se leen en voz alta.
 */

export interface SentenceChunkerOptions {
    maxChars?: number
    minChars?: number
    softMinChars?: number
}

const DEFAULTS: Required<SentenceChunkerOptions> = {
    maxChars: 160,
    minChars: 12,
    softMinChars: 60,
}

/** Cierre de oración seguido de espacio. El fin del buffer NO cuenta: a
 *  mitad del stream un "3." puede seguir con "5"; eso lo resuelve `flush()`. */
const SENTENCE_END = /[.!?…]+["'»)\]]?(?=\s)/g

export class SentenceChunker {
    private buffer = ''
    private readonly opts: Required<SentenceChunkerOptions>

    constructor(options: SentenceChunkerOptions = {}) {
        this.opts = { ...DEFAULTS, ...options }
    }

    /** Añade un delta y devuelve las frases que ya se pueden sintetizar. */
    push(delta: string): string[] {
        this.buffer += delta
        const out: string[] = []
        for (;;) {
            const cut = this.findCut()
            if (cut === null) break
            const head = this.buffer.slice(0, cut)
            this.buffer = this.buffer.slice(cut)
            const clean = sanitizeForSpeech(head)
            if (clean) out.push(clean)
        }
        return out
    }

    /** Lo que quede, aunque sea corto. `null` si no hay nada que decir. */
    flush(): string | null {
        const clean = sanitizeForSpeech(this.buffer)
        this.buffer = ''
        return clean || null
    }

    /** Índice (exclusivo) donde cortar, o null si hay que seguir acumulando. */
    private findCut(): number | null {
        const text = this.buffer
        // 1. Salto de línea o cierre de oración, el primero que deje un
        //    fragmento de al menos minChars.
        SENTENCE_END.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = SENTENCE_END.exec(text)) !== null) {
            const end = match.index + match[0].length
            if (end >= this.opts.minChars) return end
        }
        const nl = text.indexOf('\n')
        if (nl !== -1 && nl >= this.opts.minChars) return nl + 1
        // 2. Demasiado largo sin cierre: cortar en pausa o en espacio.
        if (text.length >= this.opts.maxChars) {
            const window = text.slice(0, this.opts.maxChars)
            const pause = Math.max(window.lastIndexOf(','), window.lastIndexOf(';'), window.lastIndexOf(':'))
            if (pause >= this.opts.softMinChars) return pause + 1
            const space = window.lastIndexOf(' ')
            if (space >= this.opts.softMinChars) return space + 1
            return this.opts.maxChars
        }
        return null
    }
}

/**
 * Deja sólo lo que se puede leer en voz alta. No toca los números: MiniMax
 * los lee bien, y el prompt del canal ya pide escribirlos en palabras.
 */
export function sanitizeForSpeech(text: string): string {
    return (
        text
            // énfasis markdown: se conserva el texto
            .replace(/\*\*([^*\n]+)\*\*/g, '$1')
            .replace(/__([^_\n]+)__/g, '$1')
            // acotaciones: *ríe*, [suspira], (se sonroja)
            .replace(/\*[^*\n]{1,80}\*/g, ' ')
            .replace(/\[[^\]\n]{1,80}\]/g, ' ')
            .replace(/\([^)\n]{1,80}\)/g, ' ')
            // URLs y hashtags
            .replace(/https?:\/\/\S+/gi, ' ')
            .replace(/(^|\s)#\w+/g, ' ')
            // markdown residual
            .replace(/[*_`#>~]+/g, '')
            // emojis y pictogramas
            .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
            .replace(/\s+/g, ' ')
            .trim()
    )
}
