'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineRefresh } from 'react-icons/hi'
import {
    getAgentChatThread,
    listAgentChats,
    type AgentChatListItem,
    type InboxAvatarOption,
} from '@/services/AgentInboxService'
import AskStrategistButton from '@/components/shared/StrategistWidget/AskStrategistButton'
import ThreadPane from './ThreadPane'

interface InboxViewProps {
    /** Avatares de la org para el selector de bandeja. */
    avatars: InboxAvatarOption[]
    /** Bandeja abierta (`?avatar=`), o null = todos los avatares. */
    avatarId: string | null
    initialChats: AgentChatListItem[]
    loadError: string | null
}

type AvatarOption = { value: string; label: string }

const ALL_AVATARS: AvatarOption = { value: '', label: 'All avatars' }

type ThreadData = Awaited<ReturnType<typeof getAgentChatThread>>['data']

const MODE_STYLES: Record<string, string> = {
    off: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-100 border-0',
    draft: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-100 border-0',
    auto: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 border-0',
}

/**
 * Etiqueta + estilo del canal de cada chat. Antes sólo Telegram tenía tag
 * (Fanvue era el fallback mudo); con comentarios sociales ya son tres
 * familias de canal y un fan de Fanvue mirando la lista no tenía forma de
 * distinguir un chat privado de un comentario público sin abrir el hilo.
 */
function channelTag(c: AgentChatListItem): { label: string; className: string } {
    if (c.channel === 'telegram') {
        return {
            label: 'Telegram',
            className: 'bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-100 border-0',
        }
    }
    if (c.channel === 'social_comment') {
        const red = c.socialPlatform ?? 'social'
        const label = `${red.charAt(0).toUpperCase()}${red.slice(1)} comment`
        return {
            label,
            className: 'bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-100 border-0',
        }
    }
    return {
        label: 'Fanvue',
        className: 'bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-100 border-0',
    }
}

const InboxView = ({
    avatars,
    avatarId,
    initialChats,
    loadError,
}: InboxViewProps) => {
    const router = useRouter()
    const pathname = usePathname()
    const [isSwitching, startSwitch] = useTransition()
    const avatarOptions: AvatarOption[] = [
        ALL_AVATARS,
        ...avatars.map((a) => ({ value: a.id, label: a.name })),
    ]
    const [chats, setChats] = useState<AgentChatListItem[]>(initialChats)
    const [error, setError] = useState<string | null>(loadError)
    const [search, setSearch] = useState('')
    const [showCreators, setShowCreators] = useState(false)
    const [selectedId, setSelectedId] = useState<string | null>(initialChats[0]?.id ?? null)
    const [thread, setThread] = useState<ThreadData | null>(null)
    const [isLoadingThread, setIsLoadingThread] = useState(false)

    const refreshChats = async (includeCreators = showCreators) => {
        const result = await listAgentChats({
            includeCreators,
            avatarId: avatarId ?? undefined,
        })
        if (result.success) {
            setChats(result.data ?? [])
            setError(null)
        } else {
            setError(result.error ?? 'Failed to load chats')
        }
    }

    // Poll the chat list every 15s so new fan messages / drafts surface.
    useEffect(() => {
        const t = setInterval(() => refreshChats(), 15000)
        return () => clearInterval(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showCreators])

    // Re-fetch when the creator filter flips.
    useEffect(() => {
        refreshChats(showCreators)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showCreators])

    const loadThread = async (chatId: string) => {
        setSelectedId(chatId)
        setIsLoadingThread(true)
        const result = await getAgentChatThread(chatId)
        setThread(result.success ? (result.data ?? null) : null)
        setIsLoadingThread(false)
    }

    useEffect(() => {
        if (selectedId) loadThread(selectedId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const filtered = chats.filter((c) => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return (
            (c.fanDisplayName ?? '').toLowerCase().includes(q) ||
            (c.fanHandle ?? '').toLowerCase().includes(q) ||
            (c.avatarName ?? '').toLowerCase().includes(q)
        )
    })

    const onThreadChanged = () => {
        if (selectedId) loadThread(selectedId)
        refreshChats()
    }

    // Cambiar de bandeja va por la URL (`?avatar=`), no por estado local: el
    // servidor vuelve a pedir chats Y métricas de ese avatar, y el enlace se
    // puede guardar. La página remonta esta vista con `key` por avatar.
    const switchAvatar = (next: string) => {
        if (next === (avatarId ?? '')) return
        startSwitch(() => {
            router.replace(
                next
                    ? `${pathname}?avatar=${encodeURIComponent(next)}`
                    : pathname,
                { scroll: false },
            )
        })
    }

    return (
        <div className="flex flex-col gap-4">
            {/* F5.2 — atajo al Estratega con la pregunta escrita, sin enviar. */}
            <div className="flex justify-end">
                <AskStrategistButton
                    screen="inbox"
                    label="Summarize what needs attention"
                    prompt="Summarize what needs my attention in the inbox right now."
                />
            </div>

            {error && (
                <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {/*
                En pantalla ancha la bandeja ocupa el alto de la ventana (menos
                la cabecera de la app: título y métricas quedan encima, a un
                scroll) y cada panel hace scroll por dentro. Antes el hilo
                tenía un tope de 45vh y quedaba un hueco vacío debajo. En móvil
                sigue apilado con sus topes.
            */}
            <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 lg:h-[calc(100dvh-8rem)] lg:min-h-140">
                {/* Chat list */}
                <Card
                    className={`p-0! overflow-hidden transition-opacity lg:h-full ${isSwitching ? 'opacity-60' : ''}`}
                    bodyClass="lg:h-full lg:flex lg:flex-col lg:min-h-0"
                >
                    {avatars.length > 1 && (
                        <div className="p-3 pb-0">
                            <Select<AvatarOption>
                                instanceId="inbox-avatar"
                                size="sm"
                                options={avatarOptions}
                                value={
                                    avatarOptions.find(
                                        (o) => o.value === (avatarId ?? ''),
                                    ) ?? ALL_AVATARS
                                }
                                isSearchable={avatarOptions.length > 6}
                                isDisabled={isSwitching}
                                onChange={(opt) =>
                                    switchAvatar(opt?.value ?? '')
                                }
                            />
                        </div>
                    )}
                    <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                        <Input
                            size="sm"
                            placeholder="Search fan or avatar…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <Button
                            size="sm"
                            icon={<HiOutlineRefresh />}
                            onClick={() => {
                                refreshChats()
                                toast.push(
                                    <Notification type="info" title="Refreshed">
                                        Chat list updated
                                    </Notification>,
                                )
                            }}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowCreators((s) => !s)}
                        className="w-full px-3 py-1.5 text-[11px] text-left text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 border-b border-gray-100 dark:border-gray-700"
                    >
                        {showCreators
                            ? '← Hide other-creator / spam chats'
                            : 'Show other-creator / spam chats (hidden)'}
                    </button>
                    <div className="max-h-[65vh] overflow-y-auto lg:max-h-none lg:flex-1 lg:min-h-0">
                        {filtered.length === 0 ? (
                            <p className="text-sm text-gray-500 p-4">
                                {avatarId
                                    ? 'No chats for this avatar yet.'
                                    : 'No chats yet. Connect Fanvue or Telegram, or turn on AI comment replies for an avatar in Social Accounts.'}
                            </p>
                        ) : (
                            filtered.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => loadThread(c.id)}
                                    className={`w-full text-left p-3 border-b border-gray-50 dark:border-gray-800 transition-colors ${
                                        selectedId === c.id
                                            ? 'bg-primary/10'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2 mb-0.5">
                                        <span className="text-sm font-semibold truncate">
                                            {c.fanDisplayName ?? c.fanHandle ?? 'Fan'}
                                        </span>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Tag className={`${channelTag(c).className} text-[10px]`}>
                                                {channelTag(c).label}
                                            </Tag>
                                            {c.needsAttention && (
                                                <span title={c.attentionReason ?? 'Needs your attention'}>
                                                    <Tag className="bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-100 border-0 text-[10px]">
                                                        ⚠ Attention
                                                    </Tag>
                                                </span>
                                            )}
                                            {c.hasDraft && (
                                                <Tag className="bg-primary/15 text-primary border-0 text-[10px]">
                                                    Draft
                                                </Tag>
                                            )}
                                            <Tag className={`${MODE_STYLES[c.mode]} text-[10px]`}>
                                                {c.mode}
                                            </Tag>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {c.avatarName && (
                                            <span className="text-[10px] text-primary font-medium shrink-0">
                                                {c.avatarName}
                                            </span>
                                        )}
                                        <span className="text-xs text-gray-400 truncate">
                                            {c.lastMessagePreview ?? '—'}
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </Card>

                {/* Thread */}
                <Card
                    className="p-0! overflow-hidden min-h-[65vh] lg:min-h-0 lg:h-full"
                    bodyClass="lg:h-full lg:flex lg:flex-col lg:min-h-0"
                >
                    {isLoadingThread ? (
                        <p className="text-sm text-gray-500 p-4">Loading conversation…</p>
                    ) : thread ? (
                        <ThreadPane thread={thread} onChanged={onThreadChanged} />
                    ) : (
                        <p className="text-sm text-gray-500 p-4">
                            Select a chat to see the conversation and the agent&apos;s draft.
                        </p>
                    )}
                </Card>
            </div>
        </div>
    )
}

export default InboxView
