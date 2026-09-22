/**
 * ¿Sigue sirviendo el audio de un sonido del chart?
 *
 * Las play_url que devuelve TikTok (vía Apify) van FIRMADAS con `expire=<unix>`
 * a ~1 h del fetch — medido el 2026-09-22: las 20 del board MX/7 caducaron a la
 * hora de refrescarlo. Guardadas tal cual, el editor ofrecía sonidos muertos y
 * el mux fallaba con un 404/403 opaco. Desde entonces el refresh guarda una
 * copia propia (ver persistSoundAudio), que no lleva `expire` y nunca caduca.
 *
 * Puro (sin I/O) para poder usarlo en el DTO, en el proxy y en tests.
 */
export function isPlayableSoundUrl(
    url: string | null | undefined,
    nowMs: number = Date.now(),
): url is string {
    if (!url) return false
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return false
    }
    const expire = parsed.searchParams.get('expire')
    if (!expire) return true
    const expireSec = Number(expire)
    // Un `expire` ilegible se trata como vivo: mejor intentar la descarga que
    // esconder un sonido por un formato que no conocemos.
    if (!Number.isFinite(expireSec)) return true
    return expireSec * 1000 > nowMs
}
