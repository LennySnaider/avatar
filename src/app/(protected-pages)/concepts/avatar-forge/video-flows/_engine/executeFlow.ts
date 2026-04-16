import type { Edge } from '@xyflow/react'
import type { VideoFlowNode, ExecutionContext, VideoNodeHandler } from './types'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import { handlers } from '../_handlers'

// ─── Topological Sort (Kahn's algorithm) ─────────────────────
function topologicalSort(nodes: VideoFlowNode[], edges: Edge[]): VideoFlowNode[] {
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()
    const nodeMap = new Map<string, VideoFlowNode>()

    for (const node of nodes) {
        inDegree.set(node.id, 0)
        adjacency.set(node.id, [])
        nodeMap.set(node.id, node)
    }

    for (const edge of edges) {
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
        adjacency.get(edge.source)?.push(edge.target)
    }

    const queue: string[] = []
    for (const [id, degree] of inDegree) {
        if (degree === 0) queue.push(id)
    }

    const sorted: VideoFlowNode[] = []
    while (queue.length > 0) {
        const id = queue.shift()!
        const node = nodeMap.get(id)
        if (node) sorted.push(node)

        for (const neighbor of adjacency.get(id) ?? []) {
            const newDegree = (inDegree.get(neighbor) ?? 1) - 1
            inDegree.set(neighbor, newDegree)
            if (newDegree === 0) queue.push(neighbor)
        }
    }

    if (sorted.length !== nodes.length) {
        throw new Error('Flow contains a cycle — cannot execute')
    }

    return sorted
}

// ─── Merge inputs from upstream nodes ────────────────────────
function mergeInputs(
    nodeId: string,
    edges: Edge[],
    context: ExecutionContext
): Record<string, unknown> {
    const incoming = edges.filter((e) => e.target === nodeId)
    const merged: Record<string, unknown> = {}

    for (const edge of incoming) {
        const upstreamOutput = context.get(edge.source)
        if (upstreamOutput) {
            Object.assign(merged, upstreamOutput)
        }
    }

    return merged
}

// ─── Execute Flow ────────────────────────────────────────────
export async function executeFlow(): Promise<void> {
    const store = useVideoFlowStore.getState()
    const { nodes, edges } = store

    if (nodes.length === 0) return

    // Mark all nodes as pending
    for (const node of nodes) {
        store.setNodeStatus(node.id, 'pending')
    }

    const sorted = topologicalSort(nodes, edges)
    const context: ExecutionContext = new Map()

    for (const node of sorted) {
        store.setNodeStatus(node.id, 'running')

        const inputs = mergeInputs(node.id, edges, context)

        // Merge node's own config into inputs (config acts as defaults)
        const mergedInputs = { ...node.data.config, ...inputs }

        const handler = handlers[node.data.type] as VideoNodeHandler | undefined
        if (!handler) {
            store.setNodeStatus(node.id, 'error')
            store.setExecutionError(node.id, `No handler for node type: ${node.data.type}`)
            store.setExecutionStatus('error')
            return
        }

        try {
            const result = await handler(node, mergedInputs, context)
            context.set(node.id, result.output)
            store.setNodeStatus(node.id, 'completed')
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            store.setNodeStatus(node.id, 'error')
            store.setExecutionError(node.id, message)
            store.setExecutionStatus('error')
            return
        }
    }

    store.setExecutionStatus('completed')
}
