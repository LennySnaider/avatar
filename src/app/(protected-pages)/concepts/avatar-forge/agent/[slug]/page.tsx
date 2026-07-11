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
    if (!avatar || (avatar.user_id && avatar.user_id !== session.user.id)) {
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
