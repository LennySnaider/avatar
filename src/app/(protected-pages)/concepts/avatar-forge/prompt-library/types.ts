import type { Prompt, MediaType } from '@/@types/supabase'

export interface PromptWithActions extends Prompt {
    onSelect?: (prompt: Prompt) => void
    onDelete?: (id: string) => void
}

// Re-export
export type { Prompt, MediaType }
