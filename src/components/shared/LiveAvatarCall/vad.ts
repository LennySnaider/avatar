/**
 * Detector de voz por energía, con histéresis y suelo de ruido adaptativo.
 * PURO (sin imports), alimentado con el RMS de cada bloque de micrófono.
 *
 *  - Empieza a hablar tras `onsetMs` seguidos por encima del umbral.
 *  - Deja de hablar tras `hangoverMs` seguidos por debajo.
 *  - El umbral es max(`minThreshold`, suelo de ruido × `noiseFactor`), y el
 *    suelo se aprende despacio SÓLO en silencio.
 *  - `sensitivity` > 1 endurece el umbral: se usa mientras el avatar habla,
 *    para que el eco de su propia voz no cuente como interrupción.
 */
export type VadEvent = 'speech_start' | 'speech_end' | null

export interface VadOptions {
    onsetMs?: number
    hangoverMs?: number
    minThreshold?: number
    noiseFactor?: number
}

export class VoiceActivityDetector {
    private speaking = false
    private aboveMs = 0
    private belowMs = 0
    private noiseFloor = 0.004
    private readonly o: Required<VadOptions>

    constructor(options: VadOptions = {}) {
        this.o = { onsetMs: 200, hangoverMs: 700, minThreshold: 0.012, noiseFactor: 3, ...options }
    }

    get isSpeaking(): boolean {
        return this.speaking
    }

    threshold(sensitivity = 1): number {
        return Math.max(this.o.minThreshold, this.noiseFloor * this.o.noiseFactor) * sensitivity
    }

    /** Procesa un bloque de `frameMs` con energía `level`. */
    process(level: number, frameMs: number, sensitivity = 1): VadEvent {
        const loud = level >= this.threshold(sensitivity)
        if (!this.speaking) {
            if (loud) {
                this.aboveMs += frameMs
                if (this.aboveMs >= this.o.onsetMs * Math.max(1, sensitivity)) {
                    this.speaking = true
                    this.belowMs = 0
                    return 'speech_start'
                }
            } else {
                this.aboveMs = 0
                // Suelo de ruido: media exponencial lenta, sólo en silencio.
                this.noiseFloor = this.noiseFloor * 0.98 + level * 0.02
            }
            return null
        }
        if (loud) {
            this.belowMs = 0
            return null
        }
        this.belowMs += frameMs
        if (this.belowMs >= this.o.hangoverMs) {
            this.speaking = false
            this.aboveMs = 0
            return 'speech_end'
        }
        return null
    }

    reset(): void {
        this.speaking = false
        this.aboveMs = 0
        this.belowMs = 0
    }
}
