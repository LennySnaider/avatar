import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Container from '@/components/shared/Container'
import Card from '@/components/ui/Card'
import InboxView from './_components/InboxView'
import {
    getAgentMetrics,
    listAgentChats,
    listInboxAvatars,
} from '@/services/AgentInboxService'

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')

    // `?avatar=<id>`: la bandeja de un avatar. Se valida contra los avatares
    // de la org — un id ajeno o viejo cae a "todos" en vez de pintar vacío.
    const avatarsRes = await listInboxAvatars()
    const avatars = avatarsRes.success ? (avatarsRes.data ?? []) : []
    const requested = (await searchParams).avatar
    const avatarId = avatars.some((a) => a.id === requested)
        ? (requested as string)
        : undefined

    const [result, metricsRes] = await Promise.all([
        listAgentChats({ avatarId }),
        getAgentMetrics({ avatarId }),
    ])
    const m = metricsRes.success ? metricsRes.data : null

    const stats: { label: string; value: string | number; accent?: string }[] =
        m
            ? [
                  { label: 'Fan chats', value: m.fanChats },
                  { label: 'Pending drafts', value: m.drafts },
                  { label: 'Replies sent', value: m.sent },
                  {
                      label: 'Auto-sent',
                      value: `${m.autoSent} (${m.autoRate}%)`,
                  },
                  {
                      label: 'Needs attention',
                      value: m.needsAttention,
                      accent: m.needsAttention > 0 ? 'text-red-500' : undefined,
                  },
              ]
            : []

    return (
        <Container className="py-6">
            <h3 className="mb-1">Agent Inbox</h3>
            <p className="text-sm text-gray-500 mb-4">
                Your avatars&apos; chats — Fanvue, Telegram and social comments.
                The agent drafts a reply in each — review, edit and approve.
                Nothing is sent without you (until you switch a chat to auto).
            </p>

            {/*
                Una TIRA, no cinco tarjetas. En grid de 5 con el valor en
                `text-xl` esto se comía ~90px de alto antes de que empezara el
                chat, que es donde de verdad se trabaja. Los mismos cinco datos
                en línea ocupan ~40px. Envuelve solo en pantallas estrechas.
            */}
            {stats.length > 0 && (
                <Card className="mb-4 p-0!">
                    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-2.5">
                        {stats.map((s) => (
                            <div
                                key={s.label}
                                className="flex items-baseline gap-1.5"
                            >
                                <span className="text-xs text-gray-400">
                                    {s.label}
                                </span>
                                <span
                                    className={`text-sm font-bold ${s.accent ?? ''}`}
                                >
                                    {s.value}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/*
                `key` por avatar: cambiar de bandeja remonta la vista para que
                búsqueda, chat seleccionado e hilo no arrastren nada del otro
                avatar (el estado se inicializa desde estas props una vez).
            */}
            <InboxView
                key={avatarId ?? 'all'}
                avatars={avatars}
                avatarId={avatarId ?? null}
                initialChats={result.success ? (result.data ?? []) : []}
                loadError={result.success ? null : (result.error ?? null)}
            />
        </Container>
    )
}
