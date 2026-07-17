'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    DragDropContext,
    Droppable,
    Draggable,
    type DropResult,
} from '@hello-pangea/dnd'
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
    HiOutlineMenuAlt4,
    HiOutlineUserCircle,
    HiOutlineLockOpen,
} from 'react-icons/hi'
import type { AIProvider } from '@/@types/supabase'
import {
    DEFAULT_PROVIDERS,
    PROVIDER_COST,
    PROVIDER_TRAITS,
    getProviderDescription,
} from '../../avatar-studio/_components/ProviderManagerDrawer'
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

const ProvidersManager = ({ envStatus }: ProvidersManagerProps) => {
    // Prefs desde localStorage — leídas en efecto para no romper la hidratación.
    const [favorites, setFavorites] = useState<string[]>([])
    const [hidden, setHidden] = useState<string[]>([])
    // El orden vive como lista de secciones ya ordenadas (ids). Se persiste
    // concatenado en providerPrefs para que el Studio lo use como orden base.
    const [sections, setSections] = useState<Record<SectionKey, AIProvider[]>>({
        image: [],
        video: [],
        audio: [],
    })
    const [mounted, setMounted] = useState(false)

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

    const onDragEnd = (result: DropResult) => {
        const { source, destination } = result
        if (!destination) return
        // Solo reorden dentro de la misma sección (un provider no cambia de tipo).
        if (source.droppableId !== destination.droppableId) return
        const key = source.droppableId as SectionKey
        const list = sections[key].slice()
        const [moved] = list.splice(source.index, 1)
        list.splice(destination.index, 0, moved)
        const next = { ...sections, [key]: list }
        setSections(next)
        persistOrder(next)
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
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h3 className="text-xl font-semibold mb-1">AI Providers</h3>
                    <p className="text-sm text-gray-500">
                        El catálogo REAL cableado al Avatar Studio. Arrastra para
                        ordenar, ⭐ marca favoritos y el ojo los oculta de los
                        selectores — todo se refleja al instante en el Studio.
                    </p>
                </div>
                {hiddenCount > 0 && (
                    <span className="text-xs text-gray-400">
                        {hiddenCount} oculto{hiddenCount === 1 ? '' : 's'}
                    </span>
                )}
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
                {SECTIONS.map((section) => (
                    <div key={section.key}>
                        <div className={`flex items-center gap-2 mb-2 ${section.accent}`}>
                            {section.icon}
                            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                {section.title}
                            </h4>
                            <span className="text-xs text-gray-400">
                                {sections[section.key].length} providers
                            </span>
                        </div>
                        <Droppable droppableId={section.key}>
                            {(dropProvided) => (
                                <div
                                    ref={dropProvided.innerRef}
                                    {...dropProvided.droppableProps}
                                    className="space-y-2"
                                >
                                    {sections[section.key].map((p, index) => {
                                        const isHidden = hidden.includes(p.id)
                                        const isFav = favorites.includes(p.id)
                                        const traits = PROVIDER_TRAITS[p.id]
                                        const cost = PROVIDER_COST[p.id]
                                        const envVar = p.api_key_env_var
                                        const keyOk = envVar
                                            ? (envStatus[envVar] ?? false)
                                            : true
                                        return (
                                            <Draggable
                                                key={p.id}
                                                draggableId={p.id}
                                                index={index}
                                            >
                                                {(dragProvided, snapshot) => (
                                                    <div
                                                        ref={dragProvided.innerRef}
                                                        {...dragProvided.draggableProps}
                                                    >
                                                        <Card
                                                            className={`p-3 transition-opacity ${
                                                                isHidden ? 'opacity-45' : ''
                                                            } ${snapshot.isDragging ? 'ring-2 ring-primary shadow-xl' : ''}`}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                {/* Drag handle */}
                                                                <span
                                                                    {...dragProvided.dragHandleProps}
                                                                    className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing"
                                                                    title="Arrastra para ordenar"
                                                                >
                                                                    <HiOutlineMenuAlt4 className="w-4 h-4" />
                                                                </span>

                                                                {/* Nombre + modelo + badges */}
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                        <span className="font-medium text-sm truncate">
                                                                            {p.name}
                                                                        </span>
                                                                        {cost && (
                                                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                                                                                {cost}
                                                                            </span>
                                                                        )}
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
                                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                                                        <span className="font-mono text-[10px] text-gray-400">
                                                                            {p.model}
                                                                        </span>
                                                                        {' — '}
                                                                        {describe(p)}
                                                                    </p>
                                                                </div>

                                                                {/* Acciones */}
                                                                <div className="shrink-0 flex items-center gap-1">
                                                                    <Tooltip title={isFav ? 'Quitar de favoritos' : 'Marcar favorito'}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleFavorite(p.id)}
                                                                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                                                                        >
                                                                            {isFav ? (
                                                                                <HiStar className="w-5 h-5 text-amber-400" />
                                                                            ) : (
                                                                                <HiOutlineStar className="w-5 h-5 text-gray-400" />
                                                                            )}
                                                                        </button>
                                                                    </Tooltip>
                                                                    <Tooltip title={isHidden ? 'Mostrar en los selectores' : 'Ocultar de los selectores'}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleHidden(p.id)}
                                                                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                                                                        >
                                                                            {isHidden ? (
                                                                                <HiOutlineEyeOff className="w-5 h-5 text-gray-400" />
                                                                            ) : (
                                                                                <HiOutlineEye className="w-5 h-5 text-gray-500 dark:text-gray-300" />
                                                                            )}
                                                                        </button>
                                                                    </Tooltip>
                                                                </div>
                                                            </div>
                                                        </Card>
                                                    </div>
                                                )}
                                            </Draggable>
                                        )
                                    })}
                                    {dropProvided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </div>
                ))}
            </DragDropContext>
        </div>
    )
}

export default ProvidersManager
