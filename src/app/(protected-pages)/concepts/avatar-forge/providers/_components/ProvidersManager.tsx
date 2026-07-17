'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Card from '@/components/ui/Card'
import Tooltip from '@/components/ui/Tooltip'
import {
    HiOutlinePhotograph,
    HiOutlineVideoCamera,
    HiOutlineMicrophone,
    HiStar,
    HiOutlineStar,
    HiOutlineEye,
    HiOutlineEyeOff,
    HiOutlineUserCircle,
    HiOutlineLockOpen,
} from 'react-icons/hi'
import type { AIProvider, ProviderType } from '@/@types/supabase'
import {
    DEFAULT_PROVIDERS,
    PROVIDER_COST,
    PROVIDER_TRAITS,
    getProviderDescription,
} from '../../_shared/providerCatalog'
import {
    readFavoriteIds,
    writeFavoriteIds,
    readHiddenIds,
    writeHiddenIds,
    writeProviderOrder,
    sortByUserOrder,
} from '../../_shared/providerPrefs'

interface ProvidersManagerProps {
    /** Presencia REAL de cada API key en el entorno del servidor. */
    envStatus: Record<string, boolean>
}

/**
 * Providers de AUDIO reales. Hoy el único motor de audio cableado es MiniMax
 * (voice_clone + t2a_v2): clona la voz de cada avatar y genera el TTS del modo
 * Speak. Los motores de lipsync (InfiniteTalk/OmniHuman/Kling) consumen ese
 * audio pero producen VIDEO — viven en el modo Speak.
 */
const AUDIO_PROVIDERS: AIProvider[] = [
    {
        id: 'minimax-voice',
        name: 'MiniMax Voice (Clone + TTS)',
        type: 'MINIMAX',
        model: 'voice_clone + t2a_v2 (speech-02)',
        endpoint: 'https://api.minimax.io/v1',
        is_active: true,
        supports_image: false,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'MINIMAX_API_KEY',
        created_at: null,
    },
]

const AUDIO_DESCRIPTIONS: Record<string, string> = {
    'minimax-voice':
        'Clona la voz de cada avatar (Voice Studio) y genera el audio TTS del modo Speak, con tts_settings por voz. Único motor de AUDIO real del pipeline.',
}

type SectionKey = 'image' | 'video' | 'audio'

const SECTIONS: Array<{
    key: SectionKey
    title: string
    icon: React.ReactNode
    accent: string
}> = [
    { key: 'image', title: 'Imagen', icon: <HiOutlinePhotograph className="w-5 h-5" />, accent: 'text-purple-400' },
    { key: 'video', title: 'Video', icon: <HiOutlineVideoCamera className="w-5 h-5" />, accent: 'text-blue-400' },
    { key: 'audio', title: 'Audio', icon: <HiOutlineMicrophone className="w-5 h-5" />, accent: 'text-pink-400' },
]

const sectionOf = (p: AIProvider): SectionKey =>
    p.supports_image ? 'image' : p.supports_video ? 'video' : 'audio'

/** Mismo avatar circular por tipo que usan las cards del selector del Studio. */
const TypeBadge = ({ type }: { type: ProviderType }) => {
    const styles: Record<string, { bg: string; letter: string }> = {
        GOOGLE: { bg: 'from-blue-500 to-green-500', letter: 'G' },
        KLING: { bg: 'from-orange-500 to-red-500', letter: 'K' },
        MINIMAX: { bg: 'from-pink-500 to-purple-500', letter: 'M' },
        KIE: { bg: 'from-sky-500 to-blue-600', letter: 'K' },
        GATEWAY: { bg: 'from-gray-700 to-gray-900', letter: '▲' },
        OPENAI: { bg: 'from-emerald-500 to-teal-600', letter: 'O' },
    }
    const s = styles[type] ?? { bg: 'from-gray-500 to-gray-600', letter: '?' }
    return (
        <div
            className={`w-8 h-8 rounded-full bg-linear-to-br ${s.bg} flex items-center justify-center text-white font-bold text-sm shrink-0`}
        >
            {s.letter}
        </div>
    )
}

const ProvidersManager = ({ envStatus }: ProvidersManagerProps) => {
    // Prefs desde localStorage — leídas en efecto para no romper la hidratación.
    const [favorites, setFavorites] = useState<string[]>([])
    const [hidden, setHidden] = useState<string[]>([])
    // Cada sección mantiene su lista ya ordenada; el orden global persistido es
    // la concatenación (orden BASE de los selectores del Studio).
    const [sections, setSections] = useState<Record<SectionKey, AIProvider[]>>({
        image: [],
        video: [],
        audio: [],
    })
    const [mounted, setMounted] = useState(false)
    // Drag nativo HTML5 (la lib de dnd no soporta grids multi-línea): id en
    // vuelo + reorden en vivo al pasar sobre otra card de la misma sección.
    const [draggingId, setDraggingId] = useState<string | null>(null)
    const dragSection = useRef<SectionKey | null>(null)

    useEffect(() => {
        const all = [...DEFAULT_PROVIDERS, ...AUDIO_PROVIDERS]
        const ordered = sortByUserOrder(all)
        setSections({
            image: ordered.filter((p) => sectionOf(p) === 'image'),
            video: ordered.filter((p) => sectionOf(p) === 'video'),
            audio: ordered.filter((p) => sectionOf(p) === 'audio'),
        })
        setFavorites(readFavoriteIds())
        setHidden(readHiddenIds())
        setMounted(true)
    }, [])

    const persistOrder = (next: Record<SectionKey, AIProvider[]>) => {
        writeProviderOrder(
            [...next.image, ...next.video, ...next.audio].map((p) => p.id),
        )
    }

    const handleDragStart = (key: SectionKey, id: string) => {
        dragSection.current = key
        setDraggingId(id)
    }

    // Reorden EN VIVO: al arrastrar sobre otra card de la misma sección, la
    // card en vuelo se recoloca en esa posición (patrón swap-on-hover).
    const handleDragOver = (key: SectionKey, overId: string, e: React.DragEvent) => {
        e.preventDefault()
        if (!draggingId || draggingId === overId || dragSection.current !== key) return
        setSections((prev) => {
            const list = prev[key]
            const from = list.findIndex((p) => p.id === draggingId)
            const to = list.findIndex((p) => p.id === overId)
            if (from < 0 || to < 0 || from === to) return prev
            const next = list.slice()
            const [moved] = next.splice(from, 1)
            next.splice(to, 0, moved)
            return { ...prev, [key]: next }
        })
    }

    const handleDragEnd = () => {
        setDraggingId(null)
        dragSection.current = null
        setSections((prev) => {
            persistOrder(prev)
            return prev
        })
    }

    const toggleFavorite = (id: string) => {
        const next = favorites.includes(id)
            ? favorites.filter((f) => f !== id)
            : [...favorites, id]
        setFavorites(next)
        writeFavoriteIds(next)
    }

    const toggleHidden = (id: string) => {
        const next = hidden.includes(id)
            ? hidden.filter((h) => h !== id)
            : [...hidden, id]
        setHidden(next)
        writeHiddenIds(next)
    }

    const hiddenCount = useMemo(() => hidden.length, [hidden])

    const describe = (p: AIProvider): string =>
        AUDIO_DESCRIPTIONS[p.id] ?? getProviderDescription(p)

    if (!mounted) {
        return (
            <div className="py-16 text-center text-sm text-gray-400">
                Cargando providers…
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h3 className="text-xl font-semibold mb-1">AI Providers</h3>
                    <p className="text-sm text-gray-500">
                        El catálogo REAL cableado al Avatar Studio. Arrastra las
                        cards para ordenar, ⭐ marca favoritos y el ojo los oculta
                        de los selectores — todo se refleja al instante en el
                        Studio.
                    </p>
                </div>
                {hiddenCount > 0 && (
                    <span className="text-xs text-gray-400">
                        {hiddenCount} oculto{hiddenCount === 1 ? '' : 's'}
                    </span>
                )}
            </div>

            {SECTIONS.map((section) => (
                <div key={section.key}>
                    <div className={`flex items-center gap-2 mb-3 ${section.accent}`}>
                        {section.icon}
                        <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {section.title}
                        </h4>
                        <span className="text-xs text-gray-400">
                            {sections[section.key].length} providers
                        </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {sections[section.key].map((p) => {
                            const isHidden = hidden.includes(p.id)
                            const isFav = favorites.includes(p.id)
                            const traits = PROVIDER_TRAITS[p.id]
                            const cost = PROVIDER_COST[p.id]
                            const envVar = p.api_key_env_var
                            const keyOk = envVar
                                ? (envStatus[envVar] ?? false)
                                : true
                            const isDragging = draggingId === p.id
                            return (
                                <div
                                    key={p.id}
                                    draggable
                                    onDragStart={() => handleDragStart(section.key, p.id)}
                                    onDragOver={(e) => handleDragOver(section.key, p.id, e)}
                                    onDragEnd={handleDragEnd}
                                    onDrop={(e) => e.preventDefault()}
                                    className={isDragging ? 'opacity-40' : ''}
                                >
                                    <Card
                                        className={`p-3 h-full cursor-grab active:cursor-grabbing transition-all select-none ${
                                            isHidden ? 'opacity-45' : ''
                                        } ${isDragging ? 'ring-2 ring-primary' : 'hover:border-primary'}`}
                                    >
                                        {/* Fila superior: icono tipo + acciones */}
                                        <div className="flex items-start justify-between mb-2">
                                            <TypeBadge type={p.type} />
                                            <div className="flex items-center gap-0.5">
                                                <Tooltip title={isFav ? 'Quitar de favoritos' : 'Marcar favorito'}>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleFavorite(p.id)}
                                                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                                                    >
                                                        {isFav ? (
                                                            <HiStar className="w-4.5 h-4.5 text-amber-400" />
                                                        ) : (
                                                            <HiOutlineStar className="w-4.5 h-4.5 text-gray-400" />
                                                        )}
                                                    </button>
                                                </Tooltip>
                                                <Tooltip title={isHidden ? 'Mostrar en los selectores' : 'Ocultar de los selectores'}>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleHidden(p.id)}
                                                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                                                    >
                                                        {isHidden ? (
                                                            <HiOutlineEyeOff className="w-4.5 h-4.5 text-gray-400" />
                                                        ) : (
                                                            <HiOutlineEye className="w-4.5 h-4.5 text-gray-500 dark:text-gray-300" />
                                                        )}
                                                    </button>
                                                </Tooltip>
                                            </div>
                                        </div>

                                        {/* Nombre + descripción */}
                                        <div className="font-medium text-sm mb-1">{p.name}</div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mb-2">
                                            {describe(p)}
                                        </p>

                                        {/* Badges (mismo lenguaje visual que el selector) */}
                                        <div className="flex flex-wrap items-center gap-1">
                                            {traits?.face && (
                                                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                                    <HiOutlineUserCircle className="w-3 h-3" />
                                                    Cara
                                                </span>
                                            )}
                                            {traits?.permissive && (
                                                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">
                                                    <HiOutlineLockOpen className="w-3 h-3" />
                                                    Permisivo
                                                </span>
                                            )}
                                            <span
                                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 max-w-28 truncate"
                                                title={p.model}
                                            >
                                                {p.model}
                                            </span>
                                            {cost && (
                                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                                                    {cost}
                                                </span>
                                            )}
                                            <span
                                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                    keyOk
                                                        ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                                        : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                                }`}
                                                title={
                                                    envVar
                                                        ? `${envVar} ${keyOk ? 'configurada' : 'FALTA en el entorno'}`
                                                        : 'No requiere API key'
                                                }
                                            >
                                                {keyOk ? 'Activo' : `Falta ${envVar}`}
                                            </span>
                                        </div>
                                    </Card>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}

export default ProvidersManager
