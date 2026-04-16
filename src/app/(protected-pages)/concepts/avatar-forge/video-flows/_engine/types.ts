import type { Node, Edge } from '@xyflow/react'

export type NodeStatus = 'idle' | 'running' | 'completed' | 'error' | 'pending'

export type NodeCategory =
    | 'input'
    | 'ai'
    | 'generation'
    | 'transform'
    | 'voice'
    | 'logic'
    | 'output'

export interface VideoNodeTemplate {
    type: string
    label: string
    category: NodeCategory
    icon: string
    description: string
    inputs: string[]
    outputs: string[]
    defaultData: Record<string, unknown>
}

export interface VideoNodeData extends Record<string, unknown> {
    type: string
    label: string
    category: NodeCategory
    icon: string
    status: NodeStatus
    config: Record<string, unknown>
}

export type VideoFlowNode = Node<VideoNodeData>

export type ExecutionContext = Map<string, Record<string, unknown>>

export interface NodeResult {
    output: Record<string, unknown>
}

export type VideoNodeHandler = (
    node: VideoFlowNode,
    inputs: Record<string, unknown>,
    context: ExecutionContext
) => Promise<NodeResult>
