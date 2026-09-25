/**
 * Crear la cara de Anam a partir de la foto del propio avatar (su referencia
 * `face`, generada con la calidad del estudio). Anam la procesa en segundo
 * plano (<2 min); `videoUrl` aparece cuando está lista.
 *
 * SÓLO SERVIDOR (ANAM_API_KEY). La imagen se pasa por URL pública: las
 * referencias ya viven en R2/Supabase con URL pública (`getReferenceMediaUrl`).
 */
const ANAM_API_BASE = 'https://api.anam.ai/v1'

interface AnamAvatar {
    id?: string
    displayName?: string
    videoUrl?: string | null
}

function apiKey(): string {
    const key = process.env.ANAM_API_KEY
    if (!key) throw new Error('ANAM_API_KEY is not defined')
    return key
}

async function readJson(res: Response, what: string): Promise<AnamAvatar> {
    const raw = await res.text()
    if (!res.ok) {
        if (res.status === 403) {
            throw new Error('Anam rechazó crear la cara: el plan no permite avatares por API o no quedan huecos.')
        }
        throw new Error(`Anam ${what} failed (${res.status}): ${raw.slice(0, 300)}`)
    }
    try {
        return JSON.parse(raw) as AnamAvatar
    } catch {
        throw new Error(`Anam ${what}: respuesta no es JSON`)
    }
}

export async function createAnamAvatarFromImage(input: {
    displayName: string
    imageUrl: string
}): Promise<{ id: string; ready: boolean }> {
    const avatarModel = process.env.ANAM_AVATAR_MODEL?.trim() || undefined
    const res = await fetch(`${ANAM_API_BASE}/avatars`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            // Anam exige 3-50 caracteres.
            displayName: input.displayName.trim().padEnd(3, ' ').slice(0, 50),
            imageUrl: input.imageUrl,
            ...(avatarModel ? { avatarModel } : {}),
        }),
    })
    const json = await readJson(res, 'create avatar')
    if (!json.id) throw new Error('Anam create avatar: respuesta sin id')
    return { id: json.id, ready: Boolean(json.videoUrl) }
}

export async function isAnamAvatarReady(id: string): Promise<boolean> {
    const res = await fetch(`${ANAM_API_BASE}/avatars/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${apiKey()}` },
    })
    const json = await readJson(res, 'get avatar')
    return Boolean(json.videoUrl)
}
