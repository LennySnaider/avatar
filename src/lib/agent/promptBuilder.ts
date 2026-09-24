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
    channel: 'playground' | 'fanvue' | 'telegram' | 'social_comment'
    /** Contenido de pago disponible (sólo Telegram). Título y precio en Stars. */
    paidCatalog?: { title: string; stars: number }[]
    /** Teasers GRATIS disponibles (sólo Telegram). Sin precio: no lo tienen.
     *  Quien decide si se adjunta uno es el motor de oferta, no la persona. */
    freeCatalog?: { title: string }[]
    /** Datos del post bajo el que se comenta (sólo `social_comment`). */
    postContext?: { platform: string; caption: string | null; postUrl?: string | null }
    /**
     * Reactivar: el fan no ha contestado (o nunca escribió) y el humano pidió
     * un borrador igual. `previousMessages` = lo que el avatar ya le mandó,
     * del más viejo al más nuevo, para no repetirlo. Sólo chats privados:
     * en un comentario público no tiene sentido y se ignora.
     */
    reengage?: { previousMessages: string[] }
}

/** Cuántos mensajes previos del avatar se le enseñan al modelo al reactivar. */
const REENGAGE_PREVIOUS_LIMIT = 6

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
    const {
        persona,
        avatarName,
        ragChunks,
        fanMemory,
        channel,
        paidCatalog,
        freeCatalog,
        postContext,
        reengage,
    } = input

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

    if ((channel === 'fanvue' || channel === 'telegram' || channel === 'social_comment') && fanMemory) {
        const factLines = Object.entries(fanMemory.facts ?? {})
            .map(([k, v]) => `- ${k}: ${v}`)
            .join('\n')
        const memoryBlock = [fanMemory.summary?.trim(), factLines].filter(Boolean).join('\n')
        if (memoryBlock) sections.push(`## ABOUT THIS FAN (remember them — it matters)\n${memoryBlock}`)
    }

    if (channel === 'telegram') {
        sections.push(
            '## CHANNEL: TELEGRAM\n' +
                'You are chatting on Telegram, in a private chat with a fan. Messaging style: short, ' +
                'one to three sentences, like texting. If the last fan message is "/start", they just ' +
                'opened the chat for the first time: greet them warmly, introduce yourself in one line ' +
                'and ask their name or what brought them here. Never mention bots, commands or that ' +
                'this is Telegram.\n' +
                'Never promise to send a photo, video or "surprise" on your own. The system decides if ' +
                'media is attached to this message; write so the text works with or without it. If the ' +
                'fan asks for a photo and nothing is attached, deflect with charm without promising.',
        )
        if (freeCatalog && freeCatalog.length > 0) {
            const freeList = freeCatalog.map((i) => `- ${i.title}`).join('\n')
            sections.push(
                '## YOUR FREE TEASERS\n' +
                    freeList +
                    '\nYou can share these for free when the fan asks for a photo or shows curiosity. ' +
                    'The SYSTEM attaches the photo — you never attach it and never say you are sending ' +
                    'it. Never send the same one twice.',
            )
        }
        if (paidCatalog && paidCatalog.length > 0) {
            const list = paidCatalog.map((i) => `- ${i.title} (${i.stars} Stars)`).join('\n')
            sections.push(
                '## YOUR EXCLUSIVE PAID CONTENT (unlockable with Telegram Stars)\n' +
                    list +
                    '\nYou have this content. Tease it naturally when the conversation warms up — ' +
                    'never dump the list, never invent titles or prices, never pressure. The actual ' +
                    'offer is attached by the system; you only build desire in words.',
            )
        }
    }

    if (channel === 'social_comment') {
        const platformName = postContext?.platform ?? 'social media'
        const captionBlock = postContext?.caption?.trim()
            ? `\nThe post says: "${postContext.caption.trim()}"`
            : ''
        sections.push(
            '## CHANNEL: PUBLIC COMMENT\n' +
                `This is a PUBLIC reply under your own post on ${platformName}, visible to everyone who sees ` +
                'the post — this is not a private chat. Reply in 1-2 short sentences. Never share private ' +
                'information, prices or links here. Do not invite this person to DM you unless they ask how ' +
                'to reach you. Talk about the post itself when it fits — it is what they are commenting on. ' +
                'You have no access to private knowledge here; speak only from your public persona and the post itself.' +
                captionBlock,
        )
    }

    if (reengage && channel !== 'social_comment') {
        const previous = reengage.previousMessages
            .map((m) => m.trim())
            .filter(Boolean)
            .slice(-REENGAGE_PREVIOUS_LIMIT)
        const mainLanguage = persona.languages[0] ?? 'en'
        sections.push(
            '## NO REPLY YET\n' +
                (previous.length > 0
                    ? "The fan hasn't written back since your last messages. "
                    : 'The fan has never written to you. ') +
                'Write ONE message to (re)start the conversation: light, playful and personal, true to ' +
                'who you are. Give them an easy reason to answer — a simple question about them works ' +
                'best. Never guilt-trip, never complain that they did not answer, never beg. Do not ' +
                'repeat or paraphrase what you already sent. No links, no prices.' +
                (previous.length > 0
                    ? `\nWhat you already sent them (oldest first):\n${previous.map((m) => `- ${m}`).join('\n')}` +
                      '\nWrite in the same language as those messages.'
                    : `\nWrite in your first main language (${mainLanguage}).`),
        )
    }

    sections.push(
        '## OUTPUT RULES\nPlain conversational text only — no markdown, no lists, no stage directions. ' +
            'Never say you are an AI, a bot, or a language model' +
            (persona.boundaries?.toLowerCase().includes('ai') ? ' (unless your boundaries above say otherwise)' : '') +
            '. Never break character.',
    )

    return sections.join('\n\n')
}
