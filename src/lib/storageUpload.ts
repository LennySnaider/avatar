/**
 * Subida directa navegador→Storage con URL FIRMADA (excepción sancionada del
 * candado multitenant): el server action emite el ticket (path+token) tras
 * validar sesión/org, y el browser sube el binario directo — pasarlo por un
 * server action revienta el cap de ~4.5MB de Vercel (413).
 *
 * Este es el ÚNICO módulo client-side que toca el cliente anon de Supabase;
 * los componentes importan este helper, nunca `@/lib/supabase`.
 */
import { supabase } from '@/lib/supabase'

export async function uploadToSignedStorageUrl(
    bucket: string,
    path: string,
    token: string,
    file: Blob,
    contentType?: string,
): Promise<void> {
    const { error } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(path, token, file, contentType ? { contentType } : undefined)
    if (error) throw new Error(error.message)
}

/**
 * Ticket de subida de una generación — la forma depende de quién almacena.
 * Lo emite `apiCreateGenerationUploadUrl` (server, tras validar sesión/org) y
 * lo consume `uploadGenerationTicket` en el navegador.
 */
export type GenerationUploadTicket = {
    path: string
    provider: 'r2' | 'supabase'
    /** supabase: token de uploadToSignedUrl. */
    token?: string
    /** r2: URL prefirmada para un PUT directo. */
    uploadUrl?: string
}

/**
 * Sube el binario según el ticket. Una sola puerta para las DOS rutas, así
 * los componentes no saben (ni les importa) quién almacena.
 */
export async function uploadGenerationTicket(
    ticket: GenerationUploadTicket,
    file: Blob,
    contentType?: string,
): Promise<void> {
    if (ticket.provider === 'r2') {
        if (!ticket.uploadUrl) throw new Error('Ticket r2 sin uploadUrl')
        const res = await fetch(ticket.uploadUrl, {
            method: 'PUT',
            headers: {
                ...(contentType ? { 'Content-Type': contentType } : {}),
                // La firma solo cubre `host`, así que estas cabeceras viajan
                // libres y R2 las guarda como httpMetadata del objeto — la
                // caché eterna también para lo subido desde el navegador.
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
            body: file,
        })
        if (!res.ok) {
            throw new Error(`R2 upload failed (${res.status})`)
        }
        return
    }
    if (!ticket.token) throw new Error('Ticket supabase sin token')
    await uploadToSignedStorageUrl(
        'generations',
        ticket.path,
        ticket.token,
        file,
        contentType,
    )
}
