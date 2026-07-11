import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Container from '@/components/shared/Container'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import { agentSupabase } from '@/lib/agent/db'

/** AI Agent index: every avatar with its persona state, linking to its agent page. */
export default async function Page() {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')
    const userId = session.user.id

    const supabase = agentSupabase()
    const [{ data: avatars }, { data: personas }] = await Promise.all([
        supabase.from('avatars').select('id, name, user_id').order('created_at', { ascending: true }),
        supabase.from('avatar_personas').select('avatar_id, enabled, chat_provider, chat_model'),
    ])
    const mine = (avatars ?? []).filter((a) => !a.user_id || a.user_id === userId)
    const personaByAvatar = new Map((personas ?? []).map((p) => [p.avatar_id, p]))

    return (
        <Container className="py-6">
            <h3 className="mb-1">AI Agents</h3>
            <p className="text-sm text-gray-500 mb-6">
                Each avatar gets its own conversational agent — persona, knowledge (RAG) and
                a playground to chat with it
            </p>

            {mine.length === 0 ? (
                <Card>
                    <p className="text-sm text-gray-500">
                        No avatars yet — create one in Avatar Studio first.
                    </p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {mine.map((avatar) => {
                        const persona = personaByAvatar.get(avatar.id)
                        return (
                            <Link
                                key={avatar.id}
                                href={`/concepts/avatar-forge/agent/${avatar.id}`}
                            >
                                <Card clickable className="h-full">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <h6 className="font-bold">{avatar.name}</h6>
                                        {!persona ? (
                                            <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-100 border-0">
                                                No persona
                                            </Tag>
                                        ) : persona.enabled ? (
                                            <Tag className="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 border-0">
                                                Active
                                            </Tag>
                                        ) : (
                                            <Tag className="bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-100 border-0">
                                                Draft
                                            </Tag>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400">
                                        {persona
                                            ? `${persona.chat_provider} · ${persona.chat_model}`
                                            : 'Click to create its persona'}
                                    </p>
                                </Card>
                            </Link>
                        )
                    })}
                </div>
            )}
        </Container>
    )
}
