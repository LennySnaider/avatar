/**
 * Typed Supabase access for the trending-sounds chart. `src/@types/supabase.ts`
 * is hand-maintained and omits this table; extend locally (pattern: agent/db.ts,
 * tokenStore.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Database as BaseDatabase } from '@/@types/supabase'

interface TrendingSoundsTable {
    Row: {
        id: string
        source: string
        country_code: string
        period: number
        rank: number
        sound_id: string | null
        name: string
        author: string | null
        cover_url: string | null
        play_url: string | null
        link_url: string | null
        video_count: number | null
        trend: string | null
        is_original: boolean | null
        fetched_at: string
    }
    Insert: Partial<TrendingSoundsTable['Row']> & { rank: number; name: string }
    Update: Partial<TrendingSoundsTable['Row']>
    Relationships: []
}

export type TrendingSoundRow = TrendingSoundsTable['Row']

export type TrendsDatabase = BaseDatabase & {
    public: BaseDatabase['public'] & {
        Tables: BaseDatabase['public']['Tables'] & {
            trending_sounds: TrendingSoundsTable
        }
    }
}

export function trendsSupabase(): SupabaseClient<TrendsDatabase> {
    return createServerSupabaseClient() as unknown as SupabaseClient<TrendsDatabase>
}
