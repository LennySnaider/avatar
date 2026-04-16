'use client'

import { useCallback, useRef, type DragEvent } from 'react'
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    MiniMap,
    Controls,
    type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import { nodeTypes } from '../_nodes/registry'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
import type { VideoFlowNode } from '../_engine/types'
import NodePalette from './NodePalette'
import FlowToolbar from './FlowToolbar'
import NodePropertiesPanel from './NodePropertiesPanel'
import FlowStatusBar from './FlowStatusBar'

export default function VideoFlowCanvas() {
    const reactFlowWrapper = useRef<HTMLDivElement>(null)
    const reactFlowInstance = useRef<ReactFlowInstance<VideoFlowNode> | null>(null)

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        selectedNodeId,
        setSelectedNodeId,
    } = useVideoFlowStore()

    const onInit = useCallback((instance: ReactFlowInstance<VideoFlowNode>) => {
        reactFlowInstance.current = instance
    }, [])

    const onDragOver = useCallback((event: DragEvent) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
    }, [])

    const onDrop = useCallback(
        (event: DragEvent) => {
            event.preventDefault()
            const type = event.dataTransfer.getData('application/video-flow-node')
            if (!type || !reactFlowInstance.current || !reactFlowWrapper.current) return

            const bounds = reactFlowWrapper.current.getBoundingClientRect()
            const position = reactFlowInstance.current.screenToFlowPosition({
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top,
            })
            addNode(type, position)
        },
        [addNode]
    )

    const onNodeClick = useCallback(
        (_: React.MouseEvent, node: VideoFlowNode) => {
            setSelectedNodeId(node.id)
        },
        [setSelectedNodeId]
    )

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null)
    }, [setSelectedNodeId])

    return (
        <div className="relative w-full h-full" ref={reactFlowWrapper}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={onInit}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                fitView
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{
                    type: 'smoothstep',
                    animated: true,
                    style: { stroke: '#475569', strokeWidth: 2 },
                }}
            >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
                <MiniMap
                    nodeColor={(node) => {
                        const category = (node.data as Record<string, unknown>)?.category as string
                        return CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS]?.border ?? '#475569'
                    }}
                    maskColor="rgba(15, 23, 42, 0.8)"
                    style={{ background: '#1e293b' }}
                />
                <Controls
                    showInteractive={false}
                    className="!bg-slate-800 !border-slate-700 !shadow-lg [&>button]:!bg-slate-800 [&>button]:!border-slate-700 [&>button]:!text-slate-300 [&>button:hover]:!bg-slate-700"
                />
            </ReactFlow>

            {/* Floating panels */}
            <NodePalette />
            <FlowToolbar />
            {selectedNodeId && <NodePropertiesPanel />}
            <FlowStatusBar />
        </div>
    )
}
