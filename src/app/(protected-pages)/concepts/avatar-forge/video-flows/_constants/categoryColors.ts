import type { NodeCategory } from '../_engine/types'

export const CATEGORY_COLORS: Record<NodeCategory, { border: string; bg: string; label: string }> = {
    input:      { border: '#10b981', bg: '#10b98115', label: 'Input' },
    ai:         { border: '#8b5cf6', bg: '#8b5cf615', label: 'AI' },
    generation: { border: '#f43f5e', bg: '#f43f5e15', label: 'Generation' },
    transform:  { border: '#3b82f6', bg: '#3b82f615', label: 'Transform' },
    voice:      { border: '#ec4899', bg: '#ec489915', label: 'Voice' },
    logic:      { border: '#f59e0b', bg: '#f59e0b15', label: 'Logic' },
    output:     { border: '#14b8a6', bg: '#14b8a615', label: 'Output' },
}
