/**
 * Constantes de UI de los dashboards de ingresos (Inicio y por avatar).
 *
 * Colores: Fanvue va en el azul primario de la paleta de gráficas (COLOR_1,
 * pasa contraste en ambos modos); Telegram Stars en naranja — COLOR_7 en
 * claro y orange-600 en oscuro, porque COLOR_7 sobre gray-800 no llega al
 * contraste mínimo. El período anterior es gris punteado (de-énfasis). Los
 * rankings y desgloses van en UN solo tono con barras proporcionales: la
 * paleta `COLORS` de la plantilla no pasa la comprobación de daltonismo para
 * categorías adyacentes, así que no hay donuts multicolor aquí.
 */
import { COLOR_1, COLOR_7 } from '@/constants/chart.constant'
import type { EarningsPreset } from '@/lib/earnings/period'

export const DEFAULT_PRESET: EarningsPreset = '30d'

export const PRESET_OPTIONS: { value: EarningsPreset; label: string }[] = [
    { value: '7d', label: '7 días' },
    { value: '30d', label: '30 días' },
    { value: '90d', label: '90 días' },
    { value: 'thisMonth', label: 'Este mes' },
    { value: 'lastMonth', label: 'Mes pasado' },
    { value: '12m', label: '12 meses' },
]

/** Con qué se compara cada preset (pie de los deltas y de la gráfica). */
export const COMPARISON_LABEL: Record<EarningsPreset, string> = {
    '7d': 'vs. 7 días anteriores',
    '30d': 'vs. 30 días anteriores',
    '90d': 'vs. 90 días anteriores',
    thisMonth: 'vs. mismo tramo del mes anterior',
    lastMonth: 'vs. mes anterior',
    '12m': 'vs. 12 meses anteriores',
}

export const EARNINGS_COLORS = {
    fanvue: { light: COLOR_1, dark: COLOR_1 },
    stars: { light: COLOR_7, dark: '#ea580c' },
    previous: { light: '#a3a3a3', dark: '#737373' },
} as const

/** Qué métrica pinta la gráfica principal. Cada una tiene UNA unidad. */
export type ChartMetric =
    | 'fanvueNet'
    | 'fanvueGross'
    | 'stars'
    | 'telegramSales'

export const METRIC_LABEL: Record<ChartMetric, string> = {
    fanvueNet: 'Fanvue neto',
    fanvueGross: 'Fanvue bruto',
    stars: 'Telegram Stars',
    telegramSales: 'Ventas Telegram',
}

export const ROUTES = {
    home: '/dashboards/home',
    avatarList: '/concepts/avatar-forge/avatar-list',
    avatarDashboard: (avatarId: string, preset?: EarningsPreset) =>
        `/concepts/avatar-forge/avatar-list/${avatarId}${preset ? `?period=${preset}` : ''}`,
    studio: (avatarId: string) =>
        `/concepts/avatar-forge/avatar-studio/${avatarId}`,
    agent: (avatarId: string) => `/concepts/avatar-forge/agent/${avatarId}`,
    telegram: '/concepts/avatar-forge/telegram',
    telegramAvatar: (avatarId: string) =>
        `/concepts/avatar-forge/telegram/${avatarId}`,
    fanvueAccounts: '/concepts/avatar-forge/fanvue/accounts',
    fanvuePosts: '/concepts/avatar-forge/fanvue/posts',
    modules: '/concepts/account/modules',
} as const
