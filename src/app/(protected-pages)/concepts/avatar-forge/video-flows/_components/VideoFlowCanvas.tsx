'use client'

import { useCallback, useEffect, useRef, type DragEvent } from 'react'
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    MiniMap,
    Controls,
    type ReactFlowInstance,
    type IsValidConnection,
    type OnConnectStart,
    type OnConnectEnd,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import useTheme from '@/utils/hooks/useTheme'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import { nodeTypes } from '../_nodes/registry'
import { getTemplate } from '../_nodes/templates'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
import {
    arePortsCompatible,
    getPortType,
    PORT_LABEL_ES,
    nodesAcceptingPort,
} from '../_constants/portTypes'
import type { VideoFlowNode } from '../_engine/types'
import NodePalette from './NodePalette'
import FlowToolbar from './FlowToolbar'
import NodePropertiesPanel from './NodePropertiesPanel'
import FlowStatusBar from './FlowStatusBar'

export default function VideoFlowCanvas() {
    const reactFlowWrapper = useRef<HTMLDivElement>(null)
    const reactFlowInstance = useRef<ReactFlowInstance<VideoFlowNode> | null>(null)

    const mode = useTheme((state) => state.mode)
    const isDark = mode === 'dark'

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        selectedNodeId,
        setSelectedNodeId,
        setConnectingFrom,
    } = useVideoFlowStore()

    // Seed an empty canvas with Trigger → Select Avatar already wired — nearly
    // every flow starts there, so the user has a working starting point
    // instead of a blank grid.
    const seeded = useRef(false)
    useEffect(() => {
        if (seeded.current) return
        seeded.current = true
        const store = useVideoFlowStore.getState()
        if (store.nodes.length === 0 && !store.flowId) {
            const triggerId = store.addNode('manual-trigger', { x: 40, y: 150 })
            const avatarId = store.addNode('select-avatar', { x: 320, y: 120 })
            if (triggerId && avatarId) {
                store.connectNodes(triggerId, 'trigger', avatarId, 'trigger')
            }
            store.setIsDirty(false)
        }
    }, [])

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

    // Only same-typed sockets connect (media accepts image/video, any accepts
    // all) — invalid targets simply refuse the drop, like ComfyUI.
    const isValidConnection: IsValidConnection = useCallback(
        (connection) => {
            if (connection.source === connection.target) return false
            const { nodes: currentNodes } = useVideoFlowStore.getState()
            const sourceNode = currentNodes.find((n) => n.id === connection.source)
            const targetNode = currentNodes.find((n) => n.id === connection.target)
            if (!sourceNode || !targetNode) return false
            const sourcePort = getTemplate(sourceNode.data.type)?.outputs.find(
                (p) => p.key === connection.sourceHandle,
            )
            const targetPort = getTemplate(targetNode.data.type)?.inputs.find(
                (p) => p.key === connection.targetHandle,
            )
            if (!sourcePort || !targetPort) return true
            return arePortsCompatible(sourcePort.type, targetPort.type)
        },
        []
    )

    // While a wire is being dragged, publish the origin handle's data type so
    // every node can dim the sockets this wire can't legally land on.
    const onConnectStart: OnConnectStart = useCallback(
        (_event, { nodeId, handleId, handleType }) => {
            if (!nodeId || !handleType) return
            const node = useVideoFlowStore
                .getState()
                .nodes.find((n) => n.id === nodeId)
            if (!node) return
            const portType = getPortType(
                node.data.type,
                handleId,
                handleType === 'source' ? 'source' : 'target',
            )
            if (portType) setConnectingFrom({ portType, handleType })
        },
        [setConnectingFrom],
    )

    // Clear the drag feedback and, when the wire was dropped on an INCOMPATIBLE
    // socket (isValid === false), explain WHY it refused — the silent snap-back
    // was the whole reason "I can't connect anything" felt broken.
    const onConnectEnd: OnConnectEnd = useCallback(
        (_event, state) => {
            setConnectingFrom(null)
            if (state.isValid !== false) return
            const { fromHandle, toHandle } = state
            if (!fromHandle || !toHandle) return
            const { nodes: currentNodes } = useVideoFlowStore.getState()
            const typeOf = (handle: typeof fromHandle) => {
                const n = currentNodes.find((node) => node.id === handle.nodeId)
                if (!n) return undefined
                return getPortType(
                    n.data.type,
                    handle.id,
                    handle.type === 'source' ? 'source' : 'target',
                )
            }
            const fromType = typeOf(fromHandle)
            const toType = typeOf(toHandle)
            if (!fromType || !toType) return
            // The wire always carries the OUTPUT (source) type; name whichever
            // handle is the source so the message reads correctly either way.
            const outType = fromHandle.type === 'source' ? fromType : toType
            const inType = fromHandle.type === 'source' ? toType : fromType
            const targets = nodesAcceptingPort(outType).slice(0, 4)
            toast.push(
                <Notification type="warning" title="Puertos incompatibles">
                    {`El puerto ${PORT_LABEL_ES[outType]} no conecta con ${PORT_LABEL_ES[inType]} — solo se unen puertos del mismo color.${
                        targets.length
                            ? ` Un puerto ${PORT_LABEL_ES[outType]} va a: ${targets.join(', ')}.`
                            : ''
                    }`}
                </Notification>,
            )
        },
        [setConnectingFrom],
    )

    const showHint = nodes.length <= 1 && edges.length === 0

    return (
        <div className="relative w-full h-full" ref={reactFlowWrapper}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                onInit={onInit}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                isValidConnection={isValidConnection}
                deleteKeyCode={['Backspace', 'Delete']}
                fitView
                fitViewOptions={{ maxZoom: 1 }}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{
                    type: 'smoothstep',
                    animated: true,
                    style: {
                        stroke: isDark ? '#525252' : '#a3a3a3',
                        strokeWidth: 2,
                    },
                }}
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={16}
                    size={1}
                    color={isDark ? '#404040' : '#d4d4d4'}
                />
                <MiniMap
                    nodeColor={(node) => {
                        const category = (node.data as Record<string, unknown>)?.category as string
                        return CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS]?.border ?? '#737373'
                    }}
                    maskColor={isDark ? 'rgba(23, 23, 23, 0.8)' : 'rgba(229, 229, 229, 0.7)'}
                    style={{ background: isDark ? '#262626' : '#fafafa' }}
                />
                <Controls
                    showInteractive={false}
                    className={
                        isDark
                            ? '!bg-gray-800 !border-gray-700 !shadow-lg [&>button]:!bg-gray-800 [&>button]:!border-gray-700 [&>button]:!text-gray-300 [&>button:hover]:!bg-gray-700'
                            : '!bg-white !border-gray-200 !shadow-lg [&>button]:!bg-white [&>button]:!border-gray-200 [&>button]:!text-gray-600 [&>button:hover]:!bg-gray-100'
                    }
                />
            </ReactFlow>

            {/* First-use hint */}
            {showHint && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 mt-24 z-[5] pointer-events-none text-center max-w-sm">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Drag nodes from the palette onto the canvas
                    </p>
                    <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">
                        Connect ports of the same color, then press <span className="font-semibold">Run</span>
                    </p>
                </div>
            )}

            {/* Floating panels */}
            <NodePalette />
            <FlowToolbar />
            {selectedNodeId && <NodePropertiesPanel />}
            <FlowStatusBar />
        </div>
    )
}
