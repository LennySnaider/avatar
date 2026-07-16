import type { Node } from '@xyflow/react'

export type NodeStatus =
    | 'idle'
    | 'running'
    | 'completed'
    | 'error'
    | 'pending'
    | 'skipped'

export type NodeCategory =
    | 'trigger'
    | 'input'
    | 'ai'
    | 'generation'
    | 'transform'
    | 'voice'
    | 'logic'
    | 'output'

/**
 * Port data types (ComfyUI-style typed sockets). Only compatible types can be
 * wired together; each type has a distinct socket color. Values traveling on
 * the wires are bundles (see MediaBundle / AvatarBundle) or plain strings for
 * `text`, so one cable carries everything a node needs.
 */
export type PortType =
    | 'trigger'
    | 'avatar'
    | 'image'
    | 'video'
    | 'audio'
    | 'text'
    | 'media' // image or video
    | 'any'

export interface PortDef {
    key: string
    type: PortType
    /** Accepts multiple incoming edges, collected into an array (stitch.videos). */
    list?: boolean
}

/** Value shape carried by image / video / audio wires. */
export interface MediaBundle {
    kind: 'image' | 'video' | 'audio'
    url: string
    base64?: string
    mimeType?: string
    duration?: number
    /** Prompt that produced the media — used by save-to-gallery records. */
    prompt?: string
    /**
     * Gallery row id when the media exists in `generations` (From Gallery /
     * Save to Gallery set it). Publishing nodes (Fanvue/Social) require it.
     */
    generationId?: string
    /** Owning avatar, when known (used by publishing nodes). */
    avatarId?: string
}

/** Value shape carried by trigger wires (flow start context). */
export interface TriggerBundle {
    kind: 'trigger'
    source: 'manual' | 'schedule' | 'event'
    firedAt: string
    payload?: Record<string, unknown>
}

/** Value shape carried by avatar wires: full identity in one cable. */
export interface AvatarBundle {
    kind: 'avatar'
    avatarId: string
    avatarName?: string
    thumbnailUrl?: string
    references?: unknown[]
    faceRef?: unknown
    measurements?: Record<string, unknown>
}

export interface VideoNodeTemplate {
    type: string
    label: string
    category: NodeCategory
    icon: string
    description: string
    /**
     * Named typed ports. Each entry becomes a labeled ReactFlow handle; edges
     * carry sourceHandle/targetHandle so values route port-to-port
     * (ComfyUI-style) instead of blind key merging.
     */
    inputs: PortDef[]
    outputs: PortDef[]
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
