import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/@types/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Helpers de URL puros movidos a '@/lib/storagePaths' (client-safe, F4.2.b);
// se re-exportan aquí por compatibilidad con el código server existente.
export { getStoragePublicUrl, getStorageThumbnailUrl } from '@/lib/storagePaths'

// Cliente para uso en el navegador (client-side)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Cliente para uso en el servidor con service role (server-side only)
export const createServerSupabaseClient = () => {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined')
    }
    return createClient<Database>(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
}

export default supabase
