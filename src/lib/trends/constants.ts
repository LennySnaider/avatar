/** Client-safe constants for the trending-sounds boards (a 'use server' file
 * may only export async functions, so these live outside TrendService). */
export const TREND_COUNTRIES = ['GLOBAL', 'US', 'MX', 'ES', 'GB', 'BR'] as const
export const TREND_PERIODS = [7, 30, 120] as const

export interface TrendingSoundDTO {
    id: string
    rank: number
    soundId: string | null
    name: string
    author: string | null
    coverUrl: string | null
    playUrl: string | null
    linkUrl: string | null
    videoCount: number | null
    trend: string | null
    isOriginal: boolean | null
}
