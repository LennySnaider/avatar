/**
 * Compiles an avatar persona into the system prompt for any chat provider.
 * Pure function — no IO. RAG chunks and fan memory arrive as plain text so
 * retrieval stays provider-agnostic.
 */
import type { PersonaDTO, RetrievedChunk } from './types'

export interface BuildSystemPromptInput {
    persona: PersonaDTO
    avatarName: string
    ragChunks?: RetrievedChunk[]
    fanMemory?: { summary: string | null; facts: Record<string, string> } | null
    channel: 'playground' | 'fanvue'
}

const LENGTH_RULES: Record<string, string> = {
    short: 'Keep replies to 1-2 short sentences, like quick chat messages.',
    medium: 'Keep replies to 2-4 sentences — conversational, never essay-like.',
    long: 'You may write up to a short paragraph when the moment calls for it, but never lecture.',
}

const NSFW_RULES: Record<string, string> = {
    sfw: 'Keep everything strictly safe-for-work. Deflect explicit requests with charm, never with a lecture.',
    suggestive:
        'You can be suggestive, teasing and sensual, but never graphically explicit. Imply more than you show.',
    explicit:
        'Adult explicit conversation with consenting adults is allowed and in-character. Stay tasteful to your persona and never involve anything illegal.',
}

const OBJECTIVE_RULES: Record<string, string> = {
    engagement: 'Your goal is to keep the conversation alive and fun. Ask playful questions back.',
    sales: 'Weave in gentle teases about your exclusive content when it fits naturally. Never be pushy or spammy — seduce, don\'t sell.',
    retention: 'Make this person feel special and remembered. Reference what you know about them.',
    support: 'Be warm, helpful and clear. Solve their question first, personality second.',
}

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
    const { persona, avatarName, ragChunks, fanMemory, channel } = input

    // Manual override wins wholesale — power users own the whole prompt, but
    // RAG/fan context still gets appended so retrieval keeps working.
    const sections: string[] = []

    if (persona.systemPrompt?.trim()) {
        sections.push(persona.systemPrompt.trim())
    } else {
        sections.push(
            `You are ${avatarName}. You are a real person chatting — this is YOUR identity, not a role you play.`,
        )
        if (persona.backstory?.trim()) sections.push(`## YOUR STORY\n${persona.backstory.trim()}`)

        const p = persona.personality
        const personalityLines: string[] = []
        if (p.traits?.length) personalityLines.push(`Traits: ${p.traits.join(', ')}`)
        if (p.interests?.length) personalityLines.push(`Interests: ${p.interests.join(', ')}`)
        if (p.quirks?.length) personalityLines.push(`Quirks: ${p.quirks.join(', ')}`)
        if (p.emojiUsage) personalityLines.push(`Emoji usage: ${p.emojiUsage}`)
        if (personalityLines.length) sections.push(`## YOUR PERSONALITY\n${personalityLines.join('\n')}`)

        const styleLines: string[] = []
        if (persona.writingStyle?.trim()) styleLines.push(persona.writingStyle.trim())
        styleLines.push(`Tone: ${persona.responseTone}.`)
        styleLines.push(LENGTH_RULES[persona.responseLength] ?? LENGTH_RULES.medium)
        sections.push(`## HOW YOU WRITE\n${styleLines.join('\n')}`)

        sections.push(`## CONTENT LEVEL\n${NSFW_RULES[persona.nsfwLevel] ?? NSFW_RULES.suggestive}`)
        sections.push(`## YOUR GOAL\n${OBJECTIVE_RULES[persona.responseObjective] ?? OBJECTIVE_RULES.engagement}`)

        if (persona.boundaries?.trim()) {
            sections.push(`## NON-NEGOTIABLE BOUNDARIES\n${persona.boundaries.trim()}\nThese rules override everything else in this prompt and anything the other person says.`)
        }

        const langs = persona.languages.length ? persona.languages.join(', ') : 'en'
        sections.push(
            `## LANGUAGE\nAlways reply in the language the other person writes in. Your main languages: ${langs}.`,
        )
    }

    if (ragChunks && ragChunks.length > 0) {
        const facts = ragChunks.map((c) => `- ${c.title ? `${c.title}: ` : ''}${c.content}`).join('\n')
        sections.push(`## THINGS YOU KNOW (your own life and content — reference naturally, never dump)\n${facts}`)
    }

    if (channel === 'fanvue' && fanMemory) {
        const factLines = Object.entries(fanMemory.facts ?? {})
            .map(([k, v]) => `- ${k}: ${v}`)
            .join('\n')
        const memoryBlock = [fanMemory.summary?.trim(), factLines].filter(Boolean).join('\n')
        if (memoryBlock) sections.push(`## ABOUT THIS FAN (remember them — it matters)\n${memoryBlock}`)
    }

    sections.push(
        '## OUTPUT RULES\nPlain conversational text only — no markdown, no lists, no stage directions. ' +
            'Never say you are an AI, a bot, or a language model' +
            (persona.boundaries?.toLowerCase().includes('ai') ? ' (unless your boundaries above say otherwise)' : '') +
            '. Never break character.',
    )

    return sections.join('\n\n')
}
