/**
 * Re-trocea PCM16 para los marcos de audio. MiniMax entrega trozos de tamaño
 * arbitrario (y en teoría podría partir una muestra de 2 bytes entre dos
 * trozos); los proveedores de cara esperan bloques con un número PAR de
 * bytes. Este framer guarda el byte suelto para el siguiente trozo y corta
 * en bloques de como mucho `maxBytes` (≈190 ms a 16 kHz con el default),
 * para que el navegador empiece a reproducir sin esperar a trozos enormes.
 *
 * PURO, sin imports, con test.
 */
export class PcmFramer {
    private carry: Uint8Array | null = null

    constructor(private readonly maxBytes = 6000) {
        if (maxBytes < 2 || maxBytes % 2 !== 0) throw new Error('maxBytes debe ser par y >= 2')
    }

    push(chunk: Uint8Array): Uint8Array[] {
        let data = chunk
        if (this.carry) {
            data = new Uint8Array(this.carry.length + chunk.length)
            data.set(this.carry, 0)
            data.set(chunk, this.carry.length)
            this.carry = null
        }
        const even = data.length - (data.length % 2)
        if (even < data.length) this.carry = data.slice(even)
        const out: Uint8Array[] = []
        for (let i = 0; i < even; i += this.maxBytes) {
            out.push(data.slice(i, Math.min(i + this.maxBytes, even)))
        }
        return out
    }

    /** Fin de la frase: un byte suelto al final no es una muestra, se descarta. */
    flush(): void {
        this.carry = null
    }
}
