import type { Edge } from '@xyflow/react'
import type { VideoFlowNode, ExecutionContext, VideoNodeHandler } from './types'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import { getTemplate } from '../_nodes/templates'
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

// ─── Port-to-port input mapping ──────────────────────────────
// Each edge routes ONE named output of the source node to ONE named input of
// the target node (edge.sourceHandle → edge.targetHandle), ComfyUI-style.
// List inputs (template.listInputs) collect every incoming edge into an array.
// Edges saved before ports existed carry no handle ids — those fall back to
// the legacy behavior of merging the whole upstream output object.
function mergeInputs(
    node: VideoFlowNode,
    edges: Edge[],
    context: ExecutionContext,
): Record<string, unknown> {
    const incoming = edges.filter((e) => e.target === node.id)
    const merged: Record<string, unknown> = {}
    const listKeys = new Set(getTemplate(node.data.type)?.listInputs ?? [])
    const wired = new Map<string, unknown[]>()

    for (const edge of incoming) {
        const upstreamOutput = context.get(edge.source)
        if (!upstreamOutput) continue

        if (!edge.sourceHandle || !edge.targetHandle) {
            // Legacy edge (saved before named ports): merge everything.
            Object.assign(merged, upstreamOutput)
            continue
        }

        const value = upstreamOutput[edge.sourceHandle]
        if (value === undefined) continue

        const values = wired.get(edge.targetHandle) ?? []
        values.push(value)
        wired.set(edge.targetHandle, values)
    }

    for (const [key, values] of wired) {
        if (listKeys.has(key)) {
            // Flatten one level so an upstream array output feeds the list too.
            merged[key] = values.flat()
        } else {
            merged[key] = values[values.length - 1]
        }
    }

    return merged
}

// ─── Branch gating ───────────────────────────────────────────
// A condition node "takes" its true or false output port. Edges hanging off
// the other port are dead; a node whose live incoming edges are ALL dead gets
// skipped (transitively, via the skipped set).
function isEdgeLive(
    edge: Edge,
    skipped: Set<string>,
    branchTaken: Map<string, 'true' | 'false'>,
): boolean {
    if (skipped.has(edge.source)) return false
    const taken = branchTaken.get(edge.source)
    if (
        taken &&
        (edge.sourceHandle === 'true' || edge.sourceHandle === 'false')
    ) {
        return edge.sourceHandle === taken
    }
    return true
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

    let sorted: VideoFlowNode[]
    try {
        sorted = topologicalSort(nodes, edges)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid flow'
        store.setExecutionError('', message)
        store.setExecutionStatus('error')
        return
    }

    const context: ExecutionContext = new Map()
    const skipped = new Set<string>()
    const branchTaken = new Map<string, 'true' | 'false'>()

    for (const node of sorted) {
        const incoming = edges.filter((e) => e.target === node.id)
        const hasLiveInput =
            incoming.length === 0 ||
            incoming.some((e) => isEdgeLive(e, skipped, branchTaken))

        if (!hasLiveInput) {
            skipped.add(node.id)
            store.setNodeStatus(node.id, 'skipped')
            continue
        }

        store.setNodeStatus(node.id, 'running')

        const liveEdges = incoming.filter((e) =>
            isEdgeLive(e, skipped, branchTaken),
        )
        const inputs = mergeInputs(node, liveEdges, context)

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
            store.setNodeResult(node.id, result.output)
            store.setNodeStatus(node.id, 'completed')

            if (node.data.type === 'condition') {
                branchTaken.set(
                    node.id,
                    result.output.result ? 'true' : 'false',
                )
            }
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
