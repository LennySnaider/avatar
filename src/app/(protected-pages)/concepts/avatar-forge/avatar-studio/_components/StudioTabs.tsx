'use client'

import { useState } from 'react'
import Tabs from '@/components/ui/Tabs'
import VideoFlowCanvas from '../../video-flows/_components/VideoFlowCanvas'
import { StudioHeaderSlotContext } from './StudioHeaderSlotContext'

const { TabList, TabNav } = Tabs

interface StudioTabsProps {
    children: React.ReactNode
}

const StudioTabs = ({ children }: StudioTabsProps) => {
    const [activeTab, setActiveTab] = useState('avatar-studio')
    // Lazy-mount the Flow Editor: ReactFlow only needs to init once its tab is
    // first activated (it requires a sized container to render).
    const [flowMounted, setFlowMounted] = useState(false)
    // DOM node in the tab bar where AvatarStudioMain portals its header actions
    // (Prompts / Upload / Tools) so they share the tabs' row.
    const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)

    const handleChange = (val: string) => {
        setActiveTab(val)
        if (val === 'flow-editor') {
            setFlowMounted(true)
        }
    }

    return (
        <StudioHeaderSlotContext.Provider value={headerSlot}>
            <Tabs
                value={activeTab}
                onChange={handleChange}
                className="flex flex-col h-[calc(100vh-theme(spacing.16))]"
            >
                {/* Tab bar row: tabs on the left, a portal slot on the right where the
                Avatar Studio header actions (Prompts / Upload / Tools) land, so
                they share this row instead of taking their own header. The
                underline border moves from the TabList to this wrapper so it
                still spans the full width. */}
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pr-3">
                    <TabList className="border-b-0">
                        <TabNav value="avatar-studio">Avatar Studio</TabNav>
                        <TabNav value="flow-editor">Flow Editor</TabNav>
                    </TabList>
                    <div
                        ref={setHeaderSlot}
                        className="flex items-center gap-1 shrink-0"
                    />
                </div>
                {/*
                Both panels stay mounted so switching tabs preserves the Avatar
                Studio session (gallery / generation state). We toggle visibility
                with `hidden` instead of ECME's TabContent, which unmounts
                inactive children.
            */}
                <div
                    className={
                        activeTab === 'avatar-studio'
                            ? 'flex-1 min-h-0'
                            : 'hidden'
                    }
                >
                    {children}
                </div>
                <div
                    className={
                        activeTab === 'flow-editor'
                            ? 'flex-1 min-h-0 p-0'
                            : 'hidden'
                    }
                >
                    {flowMounted && <VideoFlowCanvas />}
                </div>
            </Tabs>
        </StudioHeaderSlotContext.Provider>
    )
}

export default StudioTabs
