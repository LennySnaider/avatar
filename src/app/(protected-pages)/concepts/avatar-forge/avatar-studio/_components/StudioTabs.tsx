'use client'

import { useState } from 'react'
import Tabs from '@/components/ui/Tabs'
import VideoFlowCanvas from '../../video-flows/_components/VideoFlowCanvas'

const { TabList, TabNav } = Tabs

interface StudioTabsProps {
    children: React.ReactNode
}

const StudioTabs = ({ children }: StudioTabsProps) => {
    const [activeTab, setActiveTab] = useState('avatar-studio')
    // Lazy-mount the Flow Editor: ReactFlow only needs to init once its tab is
    // first activated (it requires a sized container to render).
    const [flowMounted, setFlowMounted] = useState(false)

    const handleChange = (val: string) => {
        setActiveTab(val)
        if (val === 'flow-editor') {
            setFlowMounted(true)
        }
    }

    return (
        <Tabs
            value={activeTab}
            onChange={handleChange}
            className="flex flex-col h-[calc(100vh-theme(spacing.16))]"
        >
            <TabList>
                <TabNav value="avatar-studio">Avatar Studio</TabNav>
                <TabNav value="flow-editor">Flow Editor</TabNav>
            </TabList>
            {/*
                Both panels stay mounted so switching tabs preserves the Avatar
                Studio session (gallery / generation state). We toggle visibility
                with `hidden` instead of ECME's TabContent, which unmounts
                inactive children.
            */}
            <div
                className={activeTab === 'avatar-studio' ? 'flex-1 min-h-0' : 'hidden'}
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
    )
}

export default StudioTabs
