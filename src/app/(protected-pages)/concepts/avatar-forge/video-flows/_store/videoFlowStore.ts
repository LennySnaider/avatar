import { create } from 'zustand'
import {
    applyNodeChanges,
    applyEdgeChanges,
    addEdge,
    type OnNodesChange,
    type OnEdgesChange,
    type OnConnect,
    type XYPosition,
    type Edge,
} from '@xyflow/react'
import type { VideoFlowNode, VideoNodeData, NodeStatus } from '../_engine/types'
import { getTemplate } from '../_nodes/templates'

interface VideoFlowStore {
    nodes: VideoFlowNode[]
    edges: Edge[]
    onNodesChange: OnNodesChange<VideoFlowNode>
    onEdgesChange: OnEdgesChange
    onConnect: OnConnect
    flowId: string | null
    flowName: string
    isDirty: boolean
    executionStatus: 'idle' | 'running' | 'completed' | 'error'
    nodeStatuses: Record<string, NodeStatus>
    executionError: { nodeId: string; message: string } | null
    selectedNodeId: string | null
    setSelectedNodeId: (id: string | null) => void
    addNode: (type: string, position: XYPosition) => void
    removeNode: (id: string) => void
    setNodeData: (id: string, updates: Partial<VideoNodeData>) => void
    setNodeConfig: (id: string, config: Record<string, unknown>) => void
    setNodeStatus: (id: string, status: NodeStatus) => void
    setExecutionStatus: (status: 'idle' | 'running' | 'completed' | 'error') => void
    setExecutionError: (nodeId: string, message: string) => void
    resetExecution: () => void
    setFlowMeta: (id: string | null, name: string) => void
    setIsDirty: (dirty: boolean) => void
    clearCanvas: () => void
    loadFlowData: (nodes: VideoFlowNode[], edges: Edge[]) => void
}

export const useVideoFlowStore = create<VideoFlowStore>()((set, get) => ({
    nodes: [],
    edges: [],
    onNodesChange: (changes) => {
        set({ nodes: applyNodeChanges(changes, get().nodes), isDirty: true })
    },
    onEdgesChange: (changes) => {
        set({ edges: applyEdgeChanges(changes, get().edges), isDirty: true })
    },
    onConnect: (connection) => {
        set({ edges: addEdge(connection, get().edges), isDirty: true })
    },
    flowId: null,
    flowName: 'Untitled Flow',
    isDirty: false,
    executionStatus: 'idle',
    nodeStatuses: {},
    executionError: null,
    selectedNodeId: null,
    setSelectedNodeId: (id) => set({ selectedNodeId: id }),
    addNode: (type, position) => {
        const template = getTemplate(type)
        if (!template) return
        const id = `${type}-${Date.now()}`
        const newNode: VideoFlowNode = {
            id,
            type: 'videoNode',
            position,
            data: {
                type: template.type,
                label: template.label,
                category: template.category,
                icon: template.icon,
                status: 'idle',
                config: { ...template.defaultData },
            },
        }
        set((state) => ({ nodes: [...state.nodes, newNode], isDirty: true }))
    },
    removeNode: (id) => {
        set((state) => ({
            nodes: state.nodes.filter((n) => n.id !== id),
            edges: state.edges.filter(
                (e) => e.source !== id && e.target !== id
            ),
            selectedNodeId:
                state.selectedNodeId === id ? null : state.selectedNodeId,
            isDirty: true,
        }))
    },
    setNodeData: (id, updates) => {
        set((state) => ({
            nodes: state.nodes.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, ...updates } } : n
            ),
            isDirty: true,
        }))
    },
    setNodeConfig: (id, config) => {
        set((state) => ({
            nodes: state.nodes.map((n) =>
                n.id === id
                    ? {
                          ...n,
                          data: {
                              ...n.data,
                              config: { ...n.data.config, ...config },
                          },
                      }
                    : n
            ),
            isDirty: true,
        }))
    },
    setNodeStatus: (id, status) => {
        set((state) => ({
            nodeStatuses: { ...state.nodeStatuses, [id]: status },
            nodes: state.nodes.map((n) =>
                n.id === id ? { ...n, data: { ...n.data, status } } : n
            ),
        }))
    },
    setExecutionStatus: (executionStatus) => set({ executionStatus }),
    setExecutionError: (nodeId, message) =>
        set({ executionError: { nodeId, message } }),
    resetExecution: () => {
        set((state) => ({
            executionStatus: 'idle',
            nodeStatuses: {},
            executionError: null,
            nodes: state.nodes.map((n) => ({
                ...n,
                data: { ...n.data, status: 'idle' as const },
            })),
        }))
    },
    setFlowMeta: (id, name) => set({ flowId: id, flowName: name }),
    setIsDirty: (dirty) => set({ isDirty: dirty }),
    clearCanvas: () =>
        set({
            nodes: [],
            edges: [],
            flowId: null,
            flowName: 'Untitled Flow',
            isDirty: false,
            executionStatus: 'idle',
            nodeStatuses: {},
            executionError: null,
            selectedNodeId: null,
        }),
    loadFlowData: (nodes, edges) => set({ nodes, edges, isDirty: false }),
}))
