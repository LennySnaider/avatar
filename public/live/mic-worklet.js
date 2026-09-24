/**
 * Worklet del micrófono del modo en vivo (useLiveCall). Agrupa las muestras
 * en bloques de ~20 ms y los manda al hilo principal, que calcula la energía
 * (detector de voz), remuestrea a 16 kHz y arma el WAV de cada frase.
 * Sin lógica aquí: todo lo que se puede probar vive en TypeScript puro.
 */
class LiveMicProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.blockSize = Math.max(128, Math.round(sampleRate * 0.02))
        this.buffer = new Float32Array(this.blockSize)
        this.filled = 0
    }

    process(inputs) {
        const channel = inputs[0] && inputs[0][0]
        if (!channel) return true
        let offset = 0
        while (offset < channel.length) {
            const take = Math.min(this.blockSize - this.filled, channel.length - offset)
            this.buffer.set(channel.subarray(offset, offset + take), this.filled)
            this.filled += take
            offset += take
            if (this.filled === this.blockSize) {
                this.port.postMessage(this.buffer.slice(0))
                this.filled = 0
            }
        }
        return true
    }
}

registerProcessor('live-mic', LiveMicProcessor)
