/**
 * Utilidades PURAS de audio para el navegador: pasar el micrófono a PCM16 a
 * 16 kHz y envolverlo en un WAV que el speech-to-text acepte tal cual
 * (MiniMax no admite PCM crudo ni webm; WAV sí, y no hay que transcodificar
 * nada en el servidor). Sin imports, con test.
 */

/** Float32 [-1, 1] → Int16 little-endian con saturación. */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]))
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return out
}

/**
 * Remuestreo por promedio de bloques: suficiente para voz que va a un ASR
 * (no hace falta un filtro anti-alias de verdad para bajar de 48 k a 16 k).
 */
export function downsampleBuffer(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
    if (outputRate >= inputRate) return input
    const ratio = inputRate / outputRate
    const length = Math.floor(input.length / ratio)
    const out = new Float32Array(length)
    let offset = 0
    for (let i = 0; i < length; i++) {
        const next = Math.floor((i + 1) * ratio)
        let sum = 0
        let count = 0
        for (let j = offset; j < next && j < input.length; j++) {
            sum += input[j]
            count++
        }
        out[i] = count ? sum / count : 0
        offset = next
    }
    return out
}

export function concatInt16(chunks: Int16Array[]): Int16Array {
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const out = new Int16Array(total)
    let offset = 0
    for (const c of chunks) {
        out.set(c, offset)
        offset += c.length
    }
    return out
}

/** Cabecera RIFF/WAVE de 44 bytes + datos PCM16 mono. */
export function encodeWav(pcm: Int16Array, sampleRate: number): Uint8Array {
    const dataBytes = pcm.length * 2
    const buffer = new ArrayBuffer(44 + dataBytes)
    const view = new DataView(buffer)
    const ascii = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
    }
    ascii(0, 'RIFF')
    view.setUint32(4, 36 + dataBytes, true)
    ascii(8, 'WAVE')
    ascii(12, 'fmt ')
    view.setUint32(16, 16, true) // tamaño del bloque fmt
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, 1, true) // mono
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true) // byte rate
    view.setUint16(32, 2, true) // block align
    view.setUint16(34, 16, true) // bits por muestra
    ascii(36, 'data')
    view.setUint32(40, dataBytes, true)
    let offset = 44
    for (let i = 0; i < pcm.length; i++, offset += 2) view.setInt16(offset, pcm[i], true)
    return new Uint8Array(buffer)
}

/** Energía RMS de un bloque, para el detector de voz. */
export function rms(samples: Float32Array): number {
    if (!samples.length) return 0
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    return Math.sqrt(sum / samples.length)
}
