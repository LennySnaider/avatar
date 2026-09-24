import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Container from '@/components/shared/Container'
import getAvatarAgentData from '@/server/actions/getAvatarAgentData'
import AgentView from './_components/AgentView'

interface PageProps {
    params: Promise<{ slug: string }>
}

export default async function Page({ params }: PageProps) {
    const session = await auth()
    const { slug: avatarId } = await params
    if (!session?.user?.id) redirect('/sign-in')

    const { avatar, persona, knowledgeCount } = await getAvatarAgentData(avatarId)
    // El filtro por user_id sobra: getAvatarAgentData ya acota por
    // organizacion, asi que si el avatar no es de tu org, avatar viene null.
    // Exigir ademas user_id === yo rompia con un segundo miembro en la org:
    // la lista mostraba el avatar (es de tu org) pero aca rebotaba sin
    // mensaje, creando un bucle lista -> detalle -> lista.
    if (!avatar) {
        redirect('/concepts/avatar-forge/agent')
    }

    return (
        <Container className="py-6">
            <h3 className="mb-1">{avatar.name} — AI Agent</h3>
            <p className="text-sm text-gray-500 mb-6">
                Persona, knowledge and playground for this avatar&apos;s conversational agent
            </p>
            <AgentView
                avatarId={avatar.id}
                avatarName={avatar.name}
                initialPersona={persona}
                initialKnowledgeCount={knowledgeCount}
                initialFanvueCreatorUuid={avatar.fanvue_creator_uuid ?? null}
            />
        </Container>
    )
}
