import type { PortType } from '../_engine/types'
import { getTemplate, NODE_TEMPLATES } from '../_nodes/templates'

/** Socket color per port data type (ComfyUI-style visual typing). */
export const PORT_COLORS: Record<PortType, string> = {
    trigger: '#84cc16', // lime (flow start)
    avatar: '#10b981', // emerald
    image:  '#f59e0b', // amber
    video:  '#f43f5e', // rose
    audio:  '#ec4899', // pink
    text:   '#8b5cf6', // violet
    media:  '#06b6d4', // cyan (image or video)
    any:    '#737373', // neutral
}

/** Port types shown in the palette legend (in display order). */
export const PORT_LEGEND: PortType[] = [
    'trigger',
    'avatar',
    'image',
    'video',
    'audio',
    'text',
]

/** Whether an output socket may be wired into an input socket. */
export function arePortsCompatible(source: PortType, target: PortType): boolean {
    if (source === 'any' || target === 'any') return true
    if (source === target) return true
    if (target === 'media') return source === 'image' || source === 'video'
    if (source === 'media') return target === 'image' || target === 'video'
    return false
}

/**
 * Resolve a port's data type from its node type + handle id. `dir` picks the
 * side: 'source' reads the node's outputs, 'target' its inputs. Shared by the
 * canvas (connection validation / feedback) and the node (handle dimming).
 */
export function getPortType(
    nodeType: string,
    handleId: string | null | undefined,
    dir: 'source' | 'target',
): PortType | undefined {
    if (!handleId) return undefined
    const template = getTemplate(nodeType)
    const ports = dir === 'source' ? template?.outputs : template?.inputs
    return ports?.find((p) => p.key === handleId)?.type
}

/** Human-friendly Spanish label per port type, for connection-error toasts. */
export const PORT_LABEL_ES: Record<PortType, string> = {
    trigger: 'disparador',
    avatar: 'avatar',
    image: 'imagen',
    video: 'video',
    audio: 'audio',
    text: 'texto',
    media: 'media (imagen/video)',
    any: 'cualquiera',
}

/**
 * Which node labels accept a given port type as INPUT — so a refused-connection
 * toast can point the user at valid destinations (e.g. avatar → Generate Image).
 * Same-type ("same color") matches lead; nodes that only accept it through a
 * wildcard `any` port trail, since those aren't the intuitive destination.
 */
export function nodesAcceptingPort(type: PortType): string[] {
    const exact: string[] = []
    const wildcard: string[] = []
    for (const template of NODE_TEMPLATES) {
        const typed = template.inputs.some(
            (p) => p.type !== 'any' && arePortsCompatible(type, p.type),
        )
        const anyOnly =
            !typed && template.inputs.some((p) => p.type === 'any')
        if (typed) exact.push(template.label)
        else if (anyOnly) wildcard.push(template.label)
    }
    return [...exact, ...wildcard]
}
