/**
 * ¿Lleva sonido un MP4? Lectura de cajas ISO-BMFF, sin ffmpeg.
 *
 * Para el aviso "¿publicar sin audio?" del Post: cargar ffmpeg.wasm (~30 MB)
 * solo para mirar la cabecera sería absurdo, y el <video> del navegador no
 * expone de forma fiable si hay pista de audio. Aquí basta el `moov`: pista con
 * handler `soun` y, de su tabla de muestras, cuántos bytes de audio lleva — una
 * pista que existe pero va en silencio (AAC de silencio) pesa casi nada.
 *
 * Puro (sin I/O) para poder testearlo con vídeos reales.
 */

export interface Mp4AudioInfo {
    hasAudioTrack: boolean
    /** Bitrate medio de la pista de audio; null si no se puede medir (MP4
     * fragmentado, duración 0) — en ese caso se asume que suena. */
    audioKbps: number | null
}

/** Por debajo de esto la pista es silencio: un AAC real va a 64-320 kbps, uno
 * que solo codifica silencio se queda en 1-2 kbps. */
export const SILENT_AUDIO_KBPS = 8

interface Box {
    type: string
    start: number
    headerSize: number
    end: number
}

function readBoxes(buf: Uint8Array, dv: DataView, start: number, end: number): Box[] {
    const out: Box[] = []
    let p = start
    while (p + 8 <= end) {
        let size = dv.getUint32(p)
        const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7])
        let headerSize = 8
        if (size === 1) {
            if (p + 16 > end) break
            size = Number(dv.getBigUint64(p + 8))
            headerSize = 16
        } else if (size === 0) {
            size = end - p
        }
        // Caja truncada o corrupta: se para aquí, lo leído hasta ahora vale.
        if (size < headerSize || p + size > end) break
        out.push({ type, start: p, headerSize, end: p + size })
        p += size
    }
    return out
}

export function inspectMp4Audio(bytes: Uint8Array): Mp4AudioInfo | null {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const children = (box: Box) => readBoxes(bytes, dv, box.start + box.headerSize, box.end)
    const find = (box: Box | undefined, type: string) =>
        box ? children(box).find((b) => b.type === type) : undefined

    const moov = readBoxes(bytes, dv, 0, bytes.byteLength).find((b) => b.type === 'moov')
    // Sin moov no es un MP4 que sepamos leer (WebM, truncado…): "no sé".
    if (!moov) return null
    const fragmented = !!find(moov, 'mvex')

    let hasAudioTrack = false
    let bestKbps: number | null = null
    let unmeasurable = false
    for (const trak of children(moov).filter((b) => b.type === 'trak')) {
        const mdia = find(trak, 'mdia')
        const hdlr = find(mdia, 'hdlr')
        // hdlr: version/flags (4) + pre_defined (4) + handler_type (4).
        const handlerAt = hdlr ? hdlr.start + hdlr.headerSize + 8 : -1
        if (!hdlr || handlerAt + 4 > hdlr.end) continue
        const handler = String.fromCharCode(...bytes.subarray(handlerAt, handlerAt + 4))
        if (handler !== 'soun') continue
        hasAudioTrack = true

        const kbps = fragmented ? null : trackKbps(bytes, dv, mdia, find)
        if (kbps === null) unmeasurable = true
        else bestKbps = Math.max(bestKbps ?? 0, kbps)
    }

    return {
        hasAudioTrack,
        // Una pista que no se puede medir manda: ante la duda, suena.
        audioKbps: unmeasurable ? null : bestKbps,
    }
}

function trackKbps(
    bytes: Uint8Array,
    dv: DataView,
    mdia: Box | undefined,
    find: (box: Box | undefined, type: string) => Box | undefined,
): number | null {
    const mdhd = find(mdia, 'mdhd')
    const stsz = find(find(find(mdia, 'minf'), 'stbl'), 'stsz')
    if (!mdhd || !stsz) return null

    // mdhd v0: 4+4 de fechas, timescale (4), duration (4); v1: 8+8, 4, 8.
    const m = mdhd.start + mdhd.headerSize
    const v1 = bytes[m] === 1
    const timescale = dv.getUint32(m + (v1 ? 20 : 12))
    const duration = v1 ? Number(dv.getBigUint64(m + 24)) : dv.getUint32(m + 16)
    if (!timescale || !duration) return null
    const seconds = duration / timescale

    // stsz: version/flags (4), sample_size (4), sample_count (4), [entries].
    const s = stsz.start + stsz.headerSize
    const sampleSize = dv.getUint32(s + 4)
    const sampleCount = dv.getUint32(s + 8)
    let total = 0
    if (sampleSize > 0) {
        total = sampleSize * sampleCount
    } else {
        const entriesEnd = Math.min(stsz.end, s + 12 + sampleCount * 4)
        for (let p = s + 12; p + 4 <= entriesEnd; p += 4) total += dv.getUint32(p)
    }
    return (total * 8) / 1000 / seconds
}

/** ¿Hay que preguntar "¿publicar sin audio?"? Ante la duda (null), no. */
export function isSilentVideo(info: Mp4AudioInfo | null): boolean {
    if (!info) return false
    if (!info.hasAudioTrack) return true
    return info.audioKbps !== null && info.audioKbps < SILENT_AUDIO_KBPS
}
