import type { Node } from '@xyflow/react'

export type NodeStatus =
    | 'idle'
    | 'running'
    | 'completed'
    | 'error'
    | 'pending'
    | 'skipped'

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
    /**
     * Named ports. Each entry becomes a labeled ReactFlow handle; edges carry
     * sourceHandle/targetHandle so values route port-to-port (ComfyUI-style)
     * instead of blind key merging.
     */
    inputs: string[]
    outputs: string[]
    /**
     * Input ports that accept multiple incoming edges; their wired values are
     * collected into an array (e.g. stitch.videoUrls).
     */
    listInputs?: string[]
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
