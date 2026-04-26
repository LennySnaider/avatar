'use client'

import { useEffect } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Drawer from '@/components/ui/Drawer'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Switcher from '@/components/ui/Switcher'
import { HiOutlineCheck, HiOutlinePhotograph, HiOutlineVideoCamera } from 'react-icons/hi'
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
        id: 'kling-kolors-v2-1',
        name: 'Kling KOLORS v2.1',
        type: 'KLING' as ProviderType,
        model: 'kling-v2-1',
        endpoint: 'https://api-singapore.klingai.com',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KLING_ACCESS_KEY',
        created_at: null,
    },
    {
        id: 'kling-v3-omni',
        name: 'Kling v3 Omni (4K)',
        type: 'KLING' as ProviderType,
        model: 'kling-v3-omni',
        endpoint: 'https://api-singapore.klingai.com',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KLING_ACCESS_KEY',
        created_at: null,
    },
    {
        id: 'kie-flux-kontext',
        name: 'Flux.1 Kontext (KIE)',
        type: 'KIE' as ProviderType,
        model: 'flux-kontext/text-to-image',
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
        name: 'GPT Image 2 (KIE)',
        type: 'KIE' as ProviderType,
        model: 'gpt-image-2/text-to-image',
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
        id: 'gemini-veo3',
        name: 'Gemini Veo 3',
        type: 'GOOGLE' as ProviderType,
        model: 'veo-3.0-generate-preview',
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
        id: 'kie-veo-3-1',
        name: 'Google Veo 3.1 (KIE)',
        type: 'KIE' as ProviderType,
        model: 'veo-3.1/text-to-video',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
]

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

        // Set default provider based on mode if not set
        if (!activeProviderId) {
            const defaultProvider = DEFAULT_PROVIDERS.find(p =>
                generationMode === 'IMAGE' ? p.supports_image : p.supports_video
            )
            if (defaultProvider) {
                setActiveProviderId(defaultProvider.id)
            }
        }
    }, [providers, setProviders, generationMode, activeProviderId, setActiveProviderId])

    // Filter providers based on current mode
    const availableProviders = providers.filter(p =>
        generationMode === 'IMAGE' ? p.supports_image : p.supports_video
    )

    const handleSelectProvider = (providerId: string) => {
        setActiveProviderId(providerId)
        setShowProviderManager(false)
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
            case 'gemini-veo3':
                return 'Video HD con audio generado, efectos cinematicos'
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
            case 'kling-kolors-v2-1':
                return 'KOLORS v2.1, reference image fidelity, face/subject/restyle'
            case 'kie-flux-kontext':
                return 'Flux.1 Kontext - context-aware editing v\u00eda KIE aggregator'
            case 'kie-gpt-image-2':
                return 'OpenAI flagship image model v\u00eda KIE aggregator'
            case 'kie-veo-3-1':
                return 'Google Veo 3.1 - sucesor de Veo 3 v\u00eda KIE aggregator'
            case 'kling-v3-omni':
                return 'Omni multi-reference hasta 4K, series generation, element control'
            default:
                return provider.model
        }
    }

    return (
        <Drawer
            isOpen={showProviderManager}
            onClose={() => setShowProviderManager(false)}
            width={400}
            title={
                <div className="flex items-center gap-2">
                    {generationMode === 'IMAGE' ? (
                        <HiOutlinePhotograph className="w-5 h-5 text-purple-400" />
                    ) : (
                        <HiOutlineVideoCamera className="w-5 h-5 text-blue-400" />
                    )}
                    <span>
                        {generationMode === 'IMAGE' ? 'Image' : 'Video'} Provider
                    </span>
                </div>
            }
            footer={
                <div className="flex justify-end gap-2">
                    <Button
                        variant="plain"
                        onClick={() => setShowProviderManager(false)}
                    >
                        Cerrar
                    </Button>
                </div>
            }
        >
            <div className="space-y-4 p-4">
                {/* Mode indicator */}
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Mostrando proveedores para modo{' '}
                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                            {generationMode === 'IMAGE' ? 'Imagen' : 'Video'}
                        </span>
                    </p>
                </div>

                {/* Gemini auto-fallback toggle (IMAGE mode only) */}
                {generationMode === 'IMAGE' && (
                    <div className="p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                    Auto-fallback a MiniMax
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Si Gemini bloquea por safety, reintenta automáticamente con MiniMax image-01.
                                </p>
                            </div>
                            <Switcher
                                checked={geminiAutoFallback}
                                onChange={(checked) => setGeminiAutoFallback(checked)}
                            />
                        </div>
                    </div>
                )}

                {/* Provider List */}
                <div className="space-y-3">
                    {availableProviders.length === 0 ? (
                        <p className="text-center text-gray-500 py-8">
                            No hay proveedores disponibles para este modo
                        </p>
                    ) : (
                        availableProviders.map((provider) => {
                            const isSelected = activeProviderId === provider.id
                            return (
                                <Card
                                    key={provider.id}
                                    className={`p-4 cursor-pointer transition-all ${
                                        isSelected
                                            ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                                    onClick={() => handleSelectProvider(provider.id)}
                                >
                                    <div className="flex items-start gap-3">
                                        {getProviderIcon(provider.type)}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium text-gray-900 dark:text-white">
                                                    {provider.name}
                                                </h3>
                                                {isSelected && (
                                                    <HiOutlineCheck className="w-4 h-4 text-blue-500" />
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {getProviderDescription(provider)}
                                            </p>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                                                    {provider.model}
                                                </span>
                                                {provider.type === 'KLING' && (provider.model === 'kling-v2-6' || provider.model === 'kling-v3') && (
                                                    <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded">
                                                        Voice
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            )
                        })
                    )}
                </div>

                {/* Info about Kling features */}
                {generationMode === 'VIDEO' && (
                    <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                        <p className="text-xs text-orange-700 dark:text-orange-300">
                            <strong>Kling:</strong> V3 es la versión más reciente con mejor calidad.
                            V2.6 sigue disponible para casos legacy. V1.6 para motion brush y camera control avanzado.
                        </p>
                    </div>
                )}
            </div>
        </Drawer>
    )
}

export default ProviderManagerDrawer
