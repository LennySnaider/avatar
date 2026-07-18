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
