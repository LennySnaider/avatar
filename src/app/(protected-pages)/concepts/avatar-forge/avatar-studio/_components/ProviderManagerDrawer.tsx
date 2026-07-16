'use client'

import { useEffect, useState } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Switcher from '@/components/ui/Switcher'
import {
    HiOutlineCheck,
    HiOutlinePhotograph,
    HiOutlineVideoCamera,
    HiStar,
    HiOutlineStar,
    HiOutlineUserCircle,
    HiOutlineLockOpen,
    HiOutlineSearch,
} from 'react-icons/hi'
import type { AIProvider, ProviderType } from '@/@types/supabase'

// Predefined providers - exported for use in initialization
export const DEFAULT_PROVIDERS: AIProvider[] = [
    // Image Providers
    {
        id: 'gemini-nano-banana',
        name: 'Gemini 3 Pro Image',
        type: 'GOOGLE' as ProviderType,
        model: 'gemini-3-pro-image-preview',
        endpoint: null,
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'GEMINI_API_KEY',
        created_at: null,
    },
    {
        id: 'gemini-flash-lite-image',
        name: 'Gemini 3.1 Flash Lite Image',
        type: 'GOOGLE' as ProviderType,
        model: 'gemini-3.1-flash-lite-image',
        endpoint: null,
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'GEMINI_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-nano-banana-pro',
        name: 'Nano Banana Pro · KIE',
        type: 'KIE' as ProviderType,
        model: 'nano-banana-pro',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'minimax-image-01',
        name: 'MiniMax image-01',
        type: 'MINIMAX' as ProviderType,
        model: 'image-01',
        endpoint: 'https://api.minimaxi.com/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'MINIMAX_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-flux-kontext',
        name: 'Flux.1 Kontext Pro (KIE)',
        type: 'KIE' as ProviderType,
        model: 'flux-kontext-pro',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-flux-kontext-max',
        name: 'Flux.1 Kontext Max (KIE)',
        type: 'KIE' as ProviderType,
        model: 'flux-kontext-max',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-gpt-4o-image',
        name: 'GPT 4o Image (KIE)',
        type: 'KIE' as ProviderType,
        model: 'gpt-4o-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-gpt-image-2',
        name: 'GPT Image 2 · KIE',
        type: 'KIE' as ProviderType,
        model: 'gpt-image-2-text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    // ─── Permissive image models (nsfw_checker off) — text→image ───────────
    {
        id: 'kie-seedream-4-5',
        name: 'Seedream 4.5 · KIE',
        type: 'KIE' as ProviderType,
        model: 'seedream/4.5-text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-flux-2-pro',
        name: 'FLUX.2 Pro · KIE',
        type: 'KIE' as ProviderType,
        model: 'flux-2/pro-text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    // Z-Image removed (2026-07-13): no image-to-image variant exists on KIE
    // (verified — 4 candidate ids all 422), so it can never lock the avatar's
    // face. KieService still supports the model if it's ever re-added.
    {
        id: 'kie-seedream-5-lite',
        name: 'Seedream 5.0 Lite · KIE',
        type: 'KIE' as ProviderType,
        model: 'seedream/5-lite-text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-seedream-5-pro',
        name: 'Seedream 5.0 Pro · KIE',
        type: 'KIE' as ProviderType,
        model: 'seedream/5-pro-image-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-qwen-image',
        name: 'Qwen Image 2.0 · KIE',
        type: 'KIE' as ProviderType,
        model: 'qwen/text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-ideogram-v3',
        name: 'Ideogram V3 · KIE',
        type: 'KIE' as ProviderType,
        model: 'ideogram/v3-text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-nano-banana-2',
        name: 'Nano Banana 2 · KIE',
        type: 'KIE' as ProviderType,
        model: 'nano-banana-2',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-nano-banana-2-lite',
        name: 'Nano Banana 2 Lite · KIE',
        type: 'KIE' as ProviderType,
        model: 'nano-banana-2-lite',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-grok-imagine',
        name: 'Grok Imagine · KIE',
        type: 'KIE' as ProviderType,
        model: 'grok-imagine/image-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    // Video Providers
    {
        id: 'gemini-veo-3-1',
        name: 'Gemini Veo 3.1',
        type: 'GOOGLE' as ProviderType,
        model: 'veo-3.1-fast-generate-preview',
        endpoint: null,
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'GEMINI_API_KEY',
        created_at: null,
    },
    {
        id: 'kling-v1-5',
        name: 'Kling v1.5',
        type: 'KLING' as ProviderType,
        model: 'kling-v1-5',
        endpoint: 'https://api-singapore.klingai.com',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KLING_ACCESS_KEY',
        created_at: null,
    },
    {
        id: 'kling-v1-6',
        name: 'Kling v1.6',
        type: 'KLING' as ProviderType,
        model: 'kling-v1-6',
        endpoint: 'https://api-singapore.klingai.com',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KLING_ACCESS_KEY',
        created_at: null,
    },
    {
        id: 'kling-v2-6',
        name: 'Kling v2.6 (Voice)',
        type: 'KLING' as ProviderType,
        model: 'kling-v2-6',
        endpoint: 'https://api-singapore.klingai.com',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KLING_ACCESS_KEY',
        created_at: null,
    },
    {
        id: 'kling-v3',
        name: 'Kling v3 (Latest)',
        type: 'KLING' as ProviderType,
        model: 'kling-v3',
        endpoint: 'https://api-singapore.klingai.com',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KLING_ACCESS_KEY',
        created_at: null,
    },
    {
        id: 'minimax-hailuo-2-3',
        name: 'MiniMax Hailuo 2.3',
        type: 'MINIMAX' as ProviderType,
        model: 'MiniMax-Hailuo-2.3',
        endpoint: 'https://api.minimax.io/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'MINIMAX_API_KEY',
        created_at: null,
    },
    {
        id: 'minimax-hailuo-2-3-fast',
        name: 'MiniMax Hailuo 2.3 Fast',
        type: 'MINIMAX' as ProviderType,
        model: 'MiniMax-Hailuo-2.3-Fast',
        endpoint: 'https://api.minimax.io/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'MINIMAX_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-seedance-2',
        name: 'Seedance 2.0 (KIE)',
        type: 'KIE' as ProviderType,
        model: 'bytedance/seedance-2',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-wan-2-7',
        name: 'Wan 2.7 i2v (KIE)',
        type: 'KIE' as ProviderType,
        model: 'wan/2-7-image-to-video',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-kling-3-0',
        name: 'Kling 3.0 · KIE',
        type: 'KIE' as ProviderType,
        model: 'kling-3.0/video',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
]

// Default provider PER MODE, persisted in localStorage so it survives across
// sessions — the store's activeProviderId only lives in sessionStorage, so it
// resets when the tab closes. On a fresh session the studio starts on this one.
const defaultProviderKey = (mode: string) => `avatar-studio:default-provider:${mode}`
function readDefaultProviderId(mode: string): string | null {
    if (typeof window === 'undefined') return null
    try {
        return window.localStorage.getItem(defaultProviderKey(mode))
    } catch {
        return null
    }
}
function writeDefaultProviderId(mode: string, id: string) {
    try {
        window.localStorage.setItem(defaultProviderKey(mode), id)
    } catch {
        /* ignore (private mode / disabled storage) */
    }
}

// Favoritos (multi, cross-mode), persistidos en localStorage. La ⭐ de cada
// card marca/desmarca; el chip "⭐ Favoritos" filtra la grilla. (El DEFAULT por
// modo es aparte: ahora es simplemente el último provider seleccionado.)
const FAVORITES_KEY = 'avatar-studio:favorite-providers'
function readFavoriteIds(): string[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = window.localStorage.getItem(FAVORITES_KEY)
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
    } catch {
        return []
    }
}
function writeFavoriteIds(ids: string[]) {
    try {
        window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids))
    } catch {
        /* ignore (private mode / disabled storage) */
    }
}

// Approx USD cost PER IMAGE, shown on each card so the pick weighs price too.
// KIE models: measured live from `creditsConsumed × $0.005/credit` (KIE's rate,
// e.g. Veo3 Fast $0.40 = 80 cr). z-image 0.8cr=$0.004 · grok 4cr=$0.02 · seedream
// 5-lite 5.5cr=$0.028 · seedream 4.5 6.5cr=$0.033 · flux-2 7cr=$0.035 · nano-2
// 12cr=$0.06. Non-KIE + kontext/gpt from docs/cost-routing.md. qwen/ideogram/
// gemini/minimax are estimates (KIE errored on the probe / no live meter) → keep
// the ~ prefix honest. Re-measure from kie.ai/logs if a price drifts.
const PROVIDER_COST: Record<string, string> = {
    'gemini-nano-banana': '~$0.13',
    'gemini-flash-lite-image': '~$0.02',
    'kie-nano-banana-pro': '~$0.09',
    'minimax-image-01': '~$0.01',
    'kie-flux-kontext': '~$0.04',
    'kie-flux-kontext-max': '~$0.08',
    'kie-gpt-4o-image': '~$0.03',
    'kie-gpt-image-2': '~$0.03',
    'kie-seedream-4-5': '~$0.033',
    'kie-flux-2-pro': '~$0.035',
    'kie-seedream-5-lite': '~$0.028',
    'kie-seedream-5-pro': '~$0.035',
    'kie-qwen-image': '~$0.02',
    'kie-ideogram-v3': '~$0.05',
    'kie-nano-banana-2': '~$0.06',
    'kie-nano-banana-2-lite': '~$0.034',
    'kie-grok-imagine': '~$0.02',
}

// Verified against the generation dispatch (AvatarStudioMain.handleGenerate):
//  face = sends the avatar's FACE image → identity consistency.
//  permissive = disables the content filter (nsfw off / less restrictive).
// The sweet spot is BOTH (MiniMax). Drives the badges on each card so the pick
// is obvious instead of trial-and-error.
const PROVIDER_TRAITS: Record<string, { face?: boolean; permissive?: boolean }> = {
    'gemini-nano-banana': { face: true },
    'gemini-flash-lite-image': { face: true },
    'kie-nano-banana-pro': { face: true },
    'minimax-image-01': { face: true, permissive: true },
    'kie-gpt-4o-image': { face: true },
    'kie-gpt-image-2': { face: true },
    'kie-flux-kontext': { face: true },
    'kie-flux-kontext-max': { face: true },
    'kie-seedream-4-5': { face: true, permissive: true },
    'kie-seedream-5-lite': { face: true, permissive: true },
    'kie-seedream-5-pro': { face: true, permissive: true },
    'kie-flux-2-pro': { permissive: true },
    'kie-qwen-image': { permissive: true },
    'kie-grok-imagine': { face: true },
    // Ambos reciben la cara vía image_input[] (mismo patrón que nano-banana-pro)
    'kie-nano-banana-2': { face: true },
    'kie-nano-banana-2-lite': { face: true },
}

const ProviderManagerDrawer = () => {
    const {
        showProviderManager,
        setShowProviderManager,
        providers,
        setProviders,
        activeProviderId,
        setActiveProviderId,
        generationMode,
        geminiAutoFallback,
        setGeminiAutoFallback,
    } = useAvatarStudioStore()

    // Default por modo (badge "Default") = último provider seleccionado.
    const [defaultProviderId, setDefaultProviderId] = useState<string | null>(null)
    // Favoritos multi (drive la ★ de cada card y el chip "⭐ Favoritos").
    const [favoriteIds, setFavoriteIds] = useState<string[]>([])
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<'all' | 'favorites' | 'face' | 'permissive'>('all')
    useEffect(() => {
        setDefaultProviderId(readDefaultProviderId(generationMode))
        setFavoriteIds(readFavoriteIds())
    }, [generationMode, showProviderManager])

    // Initialize providers on mount - always sync with DEFAULT_PROVIDERS
    useEffect(() => {
        // Always update providers to ensure we have the latest list
        // This handles cases where new providers are added to DEFAULT_PROVIDERS
        const currentProviderIds = providers.map(p => p.id)
        const defaultProviderIds = DEFAULT_PROVIDERS.map(p => p.id)

        // Check if providers need updating (missing providers or different count)
        const needsUpdate =
            providers.length === 0 ||
            !defaultProviderIds.every(id => currentProviderIds.includes(id)) ||
            providers.length !== DEFAULT_PROVIDERS.length

        if (needsUpdate) {
            setProviders(DEFAULT_PROVIDERS)
        }

        // Set the active provider if not set — prefer the user's persisted
        // default for this mode, else the first that supports it.
        if (!activeProviderId) {
            const isForMode = (p: AIProvider) =>
                generationMode === 'IMAGE' ? p.supports_image : p.supports_video
            const stored = readDefaultProviderId(generationMode)
            const defaultProvider =
                (stored ? DEFAULT_PROVIDERS.find((p) => p.id === stored && isForMode(p)) : null) ||
                DEFAULT_PROVIDERS.find(isForMode)
            if (defaultProvider) {
                setActiveProviderId(defaultProvider.id)
            }
        }
    }, [providers, setProviders, generationMode, activeProviderId, setActiveProviderId])

    // Filter by mode, then surface favoritos first, then the useful ones
    // (Cara+Permisivo → Cara → Permisivo → resto) so the best picks aren't
    // buried in a 19-item scroll.
    const traitScore = (id: string) => {
        const t = PROVIDER_TRAITS[id]
        return (t?.face ? 2 : 0) + (t?.permissive ? 1 : 0)
    }
    const rankScore = (id: string) =>
        (favoriteIds.includes(id) ? 4 : 0) + traitScore(id)
    const availableProviders = providers
        .filter((p) => (generationMode === 'IMAGE' ? p.supports_image : p.supports_video))
        .slice()
        .sort((a, b) => rankScore(b.id) - rankScore(a.id))

    const filteredProviders = availableProviders.filter((p) => {
        const t = PROVIDER_TRAITS[p.id]
        if (filter === 'favorites' && !favoriteIds.includes(p.id)) return false
        if (filter === 'face' && !t?.face) return false
        if (filter === 'permissive' && !t?.permissive) return false
        if (search.trim()) {
            const q = search.toLowerCase()
            if (!p.name.toLowerCase().includes(q) && !p.model.toLowerCase().includes(q)) return false
        }
        return true
    })

    const handleSelectProvider = (providerId: string) => {
        setActiveProviderId(providerId)
        // El último usado se vuelve el default del modo (con el que arranca
        // una sesión fresca) — antes esto requería marcarlo con la ★.
        writeDefaultProviderId(generationMode, providerId)
        setDefaultProviderId(providerId)
        setShowProviderManager(false)
    }

    const handleToggleFavorite = (e: React.MouseEvent, providerId: string) => {
        e.stopPropagation() // don't trigger the card's select
        const next = favoriteIds.includes(providerId)
            ? favoriteIds.filter((id) => id !== providerId)
            : [...favoriteIds, providerId]
        writeFavoriteIds(next)
        setFavoriteIds(next)
    }

    const getProviderIcon = (type: ProviderType) => {
        switch (type) {
            case 'GOOGLE':
                return (
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-green-500 flex items-center justify-center text-white font-bold text-sm">
                        G
                    </div>
                )
            case 'KLING':
                return (
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-sm">
                        K
                    </div>
                )
            case 'MINIMAX':
                return (
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                        M
                    </div>
                )
            case 'KIE':
                return (
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                        K
                    </div>
                )
            case 'GATEWAY':
                return (
                    <div className="w-8 h-8 rounded-full bg-linear-to-br from-slate-700 to-black flex items-center justify-center text-white font-bold text-sm">
                        ▲
                    </div>
                )
            default:
                return (
                    <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-white font-bold text-sm">
                        ?
                    </div>
                )
        }
    }

    const getProviderDescription = (provider: AIProvider) => {
        switch (provider.id) {
            case 'gemini-nano-banana':
                return 'Studio-quality images, text rendering, multi-image blending'
            case 'gemini-flash-lite-image':
                return 'Rápido y barato (~3s), 9:16 nativo — ideal para volumen'
            case 'gemini-veo-3-1':
                return 'Veo 3.1 - audio nativo, hasta 3 ref images + first frame, 9:16 vertical'
            case 'kling-v1-6':
                return 'Video estable, motion brush, camera control'
            case 'kling-v2-6':
                return 'Voice synthesis, lip-sync, talking avatars'
            case 'kling-v3':
                return 'Video generation, motion control, voice synthesis, mejor calidad'
            case 'minimax-image-01':
                return 'Menos restrictivo, subject reference, fashion-friendly'
            case 'minimax-hailuo-2-3':
                return 'Video Hailuo 2.3, subject reference (avatar lock), 1080P'
            case 'minimax-hailuo-2-3-fast':
                return 'Hailuo 2.3 Fast - m\u00e1s r\u00e1pido y econ\u00f3mico'
            case 'kie-flux-kontext':
                return 'Flux.1 Kontext Pro - context-aware editing, 8 unidades por imagen'
            case 'kie-flux-kontext-max':
                return 'Flux.1 Kontext Max - mejor calidad para escenas complejas'
            case 'kie-gpt-4o-image':
                return 'OpenAI GPT 4o - photorealistic, mejor con texto en imagen'
            case 'kie-gpt-image-2':
                return 'OpenAI GPT Image 2 vía KIE - usa refs (image-to-image, hasta 16), 9:16 nativo, 2K'
            case 'kie-seedream-4-5':
                return 'Seedream 4.5 (ByteDance) — PERMISIVO (filtro NSFW off) + usa la CARA del avatar (i2i 4.5-edit, verificado). Calidad 2K, ideal fashion/sensual'
            case 'kie-flux-2-pro':
                return 'FLUX.2 Pro (Black Forest Labs) — PERMISIVO (filtro off), 2K. Solo texto→imagen'
            case 'kie-seedream-5-lite':
                return 'Seedream 5.0 Lite (ByteDance) — PERMISIVO (filtro off) + usa la CARA del avatar (i2i verificado: misma cara, mismo precio). 2K'
            case 'kie-seedream-5-pro':
                return 'Seedream 5.0 Pro (ByteDance) — PERMISIVO + CARA del avatar (image-to-image nativo, verificado). Más calidad que Lite. Requiere avatar con cara'
            case 'kie-qwen-image':
                return 'Qwen Image 2.0 (Alibaba) — PERMISIVO (safety + nsfw off). Solo texto→imagen'
            case 'kie-ideogram-v3':
                return 'Ideogram V3 — el mejor para TEXTO dentro de la imagen (carteles/logos). Filtro estándar. Solo texto→imagen'
            case 'kie-nano-banana-2':
                return 'Nano Banana 2 (Google) — calidad top hasta 4K, usa la cara del avatar (image_input). OJO: Google = filtro estricto (no ayuda con bloqueos)'
            case 'kie-nano-banana-2-lite':
                return 'Nano Banana 2 Lite (Gemini 3.1 Flash-Lite) — el más RÁPIDO (~4s) y barato de Google, 1K, usa la cara del avatar (image_input). Filtro estricto de Google — para SFW con identidad y volumen'
            case 'kie-grok-imagine':
                return 'Grok Imagine (xAI) · image-to-image — usa la cara del avatar (la ref se recorta al aspect ratio pedido: su salida copia el ratio del input). OJO: su PROPIO filtro bloquea bikini/sensual aun con nsfw off — para sensual usa Seedream / FLUX.2. Para SFW con identidad'
            case 'kie-kling-3-0':
                return 'Kling 3.0 vía KIE — video i2v/t2v + motion-control v2v, audio nativo opcional, ~20% más barato que el directo'
            case 'kie-nano-banana-pro':
                return 'Gemini 3 Pro Image vía KIE - mismo modelo que el directo, ~30% más barato, 9:16 nativo, 2K'
            default:
                return provider.model
        }
    }

    return (
        <Dialog
            isOpen={showProviderManager}
            onClose={() => setShowProviderManager(false)}
            width={920}
            className="bg-white! dark:bg-gray-900!"
        >
            <div className="flex items-center gap-2 mb-3">
                {generationMode === 'IMAGE' ? (
                    <HiOutlinePhotograph className="w-5 h-5 text-purple-400" />
                ) : (
                    <HiOutlineVideoCamera className="w-5 h-5 text-blue-400" />
                )}
                <h5 className="mb-0">{generationMode === 'IMAGE' ? 'Image' : 'Video'} Provider</h5>
            </div>

            {/* Gemini auto-fallback (IMAGE mode only) */}
            {generationMode === 'IMAGE' && (
                <div className="flex items-center justify-between gap-3 p-2.5 mb-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                        <span className="font-medium">Auto-fallback a MiniMax</span> — si Gemini
                        bloquea por safety, reintenta automáticamente.
                    </p>
                    <Switcher
                        checked={geminiAutoFallback}
                        onChange={(checked) => setGeminiAutoFallback(checked)}
                    />
                </div>
            )}

            {/* Search + filter chips */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <Input
                    size="sm"
                    prefix={<HiOutlineSearch className="text-lg" />}
                    placeholder="Buscar modelo..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 min-w-[10rem]"
                />
                <div className="flex items-center gap-1">
                    {(
                        [
                            ['all', 'Todos'],
                            ['favorites', '⭐ Favoritos'],
                            // Cara/Permisivo traits solo aplican a modelos de imagen
                            ...(generationMode === 'IMAGE'
                                ? ([
                                      ['face', '👤 Cara'],
                                      ['permissive', '🔓 Permisivo'],
                                  ] as const)
                                : []),
                        ] as ReadonlyArray<readonly [typeof filter, string]>
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setFilter(key)}
                            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                                filter === key
                                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200 font-medium'
                                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid of providers */}
            {filteredProviders.length === 0 ? (
                <p className="text-center text-gray-500 py-10">
                    {filter === 'favorites'
                        ? 'No tienes favoritos aún — márcalos con la ⭐ de cada modelo.'
                        : 'No hay proveedores para este filtro.'}
                </p>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[58vh] overflow-y-auto pr-1">
                    {filteredProviders.map((provider) => {
                        const isSelected = activeProviderId === provider.id
                        const isDefault = defaultProviderId === provider.id
                        const isFavorite = favoriteIds.includes(provider.id)
                        const tr = PROVIDER_TRAITS[provider.id]
                        return (
                            <Card
                                key={provider.id}
                                className={`relative p-3! cursor-pointer transition-all ${
                                    isSelected
                                        ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                                onClick={() => handleSelectProvider(provider.id)}
                            >
                                <button
                                    type="button"
                                    onClick={(e) => handleToggleFavorite(e, provider.id)}
                                    title={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                                    aria-label={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                                    className="absolute top-1.5 right-1.5 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                    {isFavorite ? (
                                        <HiStar className="w-4 h-4 text-amber-400" />
                                    ) : (
                                        <HiOutlineStar className="w-4 h-4 text-gray-400" />
                                    )}
                                </button>
                                <div className="flex items-center gap-2 mb-1.5">
                                    {getProviderIcon(provider.type)}
                                    {isSelected && (
                                        <HiOutlineCheck className="w-4 h-4 text-blue-500" />
                                    )}
                                </div>
                                <h3 className="font-medium text-sm text-gray-900 dark:text-white leading-tight pr-5">
                                    {provider.name}
                                </h3>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-3">
                                    {getProviderDescription(provider)}
                                </p>
                                {(tr?.face || tr?.permissive || isDefault) && (
                                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                        {tr?.face && (
                                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 inline-flex items-center gap-0.5">
                                                <HiOutlineUserCircle className="w-2.5 h-2.5" />
                                                Cara
                                            </span>
                                        )}
                                        {tr?.permissive && (
                                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-0.5">
                                                <HiOutlineLockOpen className="w-2.5 h-2.5" />
                                                Permisivo
                                            </span>
                                        )}
                                        {isDefault && (
                                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                )}
                                <div className="mt-1.5 flex items-center gap-1">
                                    <span className="inline-block text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded truncate min-w-0 flex-1">
                                        {provider.model}
                                    </span>
                                    {PROVIDER_COST[provider.id] && (
                                        <span
                                            title="Costo aprox. por imagen"
                                            className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                                        >
                                            {PROVIDER_COST[provider.id]}
                                        </span>
                                    )}
                                </div>
                            </Card>
                        )
                    })}
                </div>
            )}

            <div className="flex justify-end mt-4">
                <Button variant="plain" onClick={() => setShowProviderManager(false)}>
                    Cerrar
                </Button>
            </div>
        </Dialog>
    )
}

export default ProviderManagerDrawer
