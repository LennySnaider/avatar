import type { PortType } from '../_engine/types'

/** Socket color per port data type (ComfyUI-style visual typing). */
export const PORT_COLORS: Record<PortType, string> = {
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
