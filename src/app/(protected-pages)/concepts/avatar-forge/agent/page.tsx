import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Container from '@/components/shared/Container'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import { getOrgContext } from '@/lib/tenant/getOrgContext'
import { orgTable } from '@/lib/org/orgTable'

interface AvatarCard {
    id: string
    name: string
}

interface PersonaCard {
    avatar_id: string
    enabled: boolean
    chat_provider: string
    chat_model: string
}

/** AI Agent index: every avatar with its persona state, linking to its agent page. */
export default async function Page() {
    const session = await auth()
    if (!session?.user?.id) redirect('/sign-in')

    // El listado ya no filtra por `user_id`: dentro de una org ese campo es
    // sólo "creado por" (ver orgTable.ts), la frontera real es la org — mismo
    // criterio que getAvatars() desde 2f963e1.
    //
    // El try/catch NO es decorativo: getOrgContext() lanza por dos motivos
    // (sin sesión, sin fila en organization_members) y el redirect de arriba
    // sólo cubre el primero. Un usuario autenticado pero sin membresía haría
    // llegar el throw al render y saldría como 500 genérico (no hay error.tsx
    // en (protected-pages)). Mismo contrato "vacío, no throw" que
    // getAvatarStudioData / getAvatarAgentData (685cf32).
    let avatars: AvatarCard[] = []
    let personaByAvatar = new Map<string, PersonaCard>()
    try {
        const ctx = await getOrgContext()
        const [{ data: avatarRows }, { data: personaRows }] = await Promise.all([
            orgTable(ctx, 'avatars')
                .select('id, name')
                .order('created_at', { ascending: true }),
            orgTable(ctx, 'avatar_personas').select(
                'avatar_id, enabled, chat_provider, chat_model',
            ),
        ])
        avatars = (avatarRows ?? []) as AvatarCard[]
        personaByAvatar = new Map(
            ((personaRows ?? []) as PersonaCard[]).map((p) => [p.avatar_id, p]),
        )
    } catch (e) {
        // Estado vacío, PERO con rastro: un catch mudo hace que una caída de
        // BD se lea como «No avatars yet — create one in Avatar Studio first»
        // y el usuario crea un avatar duplicado creyendo que no tenía ninguno.
        console.warn('[agent] no se pudo listar avatares/personas', e)
    }

    return (
        <Container className="py-6">
            <h3 className="mb-1">AI Agents</h3>
            <p className="text-sm text-gray-500 mb-6">
                Each avatar gets its own conversational agent — persona, knowledge (RAG) and
                a playground to chat with it
            </p>

            {avatars.length === 0 ? (
                <Card>
                    <p className="text-sm text-gray-500">
                        No avatars yet — create one in Avatar Studio first.
                    </p>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {avatars.map((avatar) => {
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
