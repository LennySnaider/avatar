'use client'

import { useState } from 'react'
import Tabs from '@/components/ui/Tabs'
import PersonaEditor from './PersonaEditor'
import KnowledgeManager from './KnowledgeManager'
import Playground from './Playground'
import FanvueChatCard from './FanvueChatCard'
import AutopilotCard from './AutopilotCard'
import type { PersonaDTO } from '@/lib/agent/types'

const { TabList, TabNav, TabContent } = Tabs

interface AgentViewProps {
    avatarId: string
    avatarName: string
    initialPersona: PersonaDTO | null
    initialKnowledgeCount: number
    initialFanvueCreatorUuid: string | null
}

const AgentView = ({
    avatarId,
    avatarName,
    initialPersona,
    initialKnowledgeCount,
    initialFanvueCreatorUuid,
}: AgentViewProps) => {
    const [activeTab, setActiveTab] = useState('persona')
    // Kept at this level so a save in Persona immediately affects the Playground.
    const [persona, setPersona] = useState<PersonaDTO | null>(initialPersona)

    return (
        <Tabs value={activeTab} onChange={(val) => setActiveTab(val as string)}>
            <TabList>
                <TabNav value="persona">Persona</TabNav>
                <TabNav value="knowledge">Knowledge ({initialKnowledgeCount})</TabNav>
                <TabNav value="playground">Playground</TabNav>
            </TabList>
            <div className="pt-4">
                <TabContent value="persona">
                    <PersonaEditor
                        avatarId={avatarId}
                        avatarName={avatarName}
                        persona={persona}
                        onPersonaChange={setPersona}
                    />
                    <FanvueChatCard
                        avatarId={avatarId}
                        initialCreatorUuid={initialFanvueCreatorUuid}
                    />
                    <AutopilotCard avatarId={avatarId} />
                </TabContent>
                <TabContent value="knowledge">
                    <KnowledgeManager avatarId={avatarId} />
                </TabContent>
                <TabContent value="playground">
                    <Playground avatarId={avatarId} avatarName={avatarName} hasPersona={!!persona} />
                </TabContent>
            </div>
        </Tabs>
    )
}

export default AgentView
