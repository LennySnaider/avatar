import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Container from '@/components/shared/Container'
import Card from '@/components/ui/Card'
import InboxView from './_components/InboxView'
import { getAgentMetrics, listAgentChats } from '@/services/AgentInboxService'

export default async function Page() {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')

    const [result, metricsRes] = await Promise.all([listAgentChats(), getAgentMetrics()])
    const m = metricsRes.success ? metricsRes.data : null

    const stats: { label: string; value: string | number; accent?: string }[] = m
        ? [
              { label: 'Fan chats', value: m.fanChats },
              { label: 'Pending drafts', value: m.drafts },
              { label: 'Replies sent', value: m.sent },
              { label: 'Auto-sent', value: `${m.autoSent} (${m.autoRate}%)` },
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
            <p className="text-sm text-gray-500 mb-6">
                Your avatars&apos; Fanvue chats. The agent drafts a reply in each — review, edit
                and approve. Nothing is sent without you (until you switch a chat to auto).
            </p>

            {stats.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                    {stats.map((s) => (
                        <Card key={s.label} className="p-3!">
                            <p className="text-xs text-gray-400">{s.label}</p>
                            <p className={`text-xl font-bold ${s.accent ?? ''}`}>{s.value}</p>
                        </Card>
                    ))}
                </div>
            )}

            <InboxView
                initialChats={result.success ? (result.data ?? []) : []}
                loadError={result.success ? null : (result.error ?? null)}
            />
        </Container>
    )
}
