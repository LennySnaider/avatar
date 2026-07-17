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
import {
    readFavoriteIds,
    writeFavoriteIds,
    readHiddenIds,
    sortByUserOrder,
} from '../../_shared/providerPrefs'
import {
    DEFAULT_PROVIDERS,
    PROVIDER_COST,
    PROVIDER_TRAITS,
    getProviderDescription,
} from '../../_shared/providerCatalog'

// Re-export: el catálogo vivió aquí siempre y varios módulos lo importan
// de este archivo; la fuente de verdad ahora es _shared/providerCatalog.
export { DEFAULT_PROVIDERS, PROVIDER_COST, PROVIDER_TRAITS, getProviderDescription }

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

// Favoritos / ocultos / orden manual: módulo compartido con la página AI
// Providers (misma key de ⭐ que se usaba aquí — un solo favorito en la app).




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
    // Ocultos desde la página AI Providers — no se muestran en este selector.
    const [hiddenIds, setHiddenIds] = useState<string[]>([])
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<'all' | 'favorites' | 'face' | 'permissive'>('all')
    useEffect(() => {
        setDefaultProviderId(readDefaultProviderId(generationMode))
        setFavoriteIds(readFavoriteIds())
        setHiddenIds(readHiddenIds())
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
    // Orden manual del usuario (página AI Providers) como orden BASE; el sort
    // estable por rank (favoritos/traits) lo respeta entre empates. Los
    // ocultados desde esa página no aparecen aquí.
    const availableProviders = sortByUserOrder(
        providers.filter((p) =>
            generationMode === 'IMAGE' ? p.supports_image : p.supports_video,
        ),
    )
        .filter((p) => !hiddenIds.includes(p.id))
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
