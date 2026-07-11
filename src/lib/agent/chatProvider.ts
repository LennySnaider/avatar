/**
 * Multi-provider chat model factory (Vercel AI SDK).
 *
 * Per-avatar key resolution mirrors the Upload-Post pattern: the persona may
 * carry its own api_key in DB; null falls back to the env key. Keys never
 * reach the client — this module is server-only.
 */
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import type { ChatProviderSlug } from './types'

export interface ChatModelOptions {
    provider: ChatProviderSlug
    model: string
    apiKey?: string | null
}

export function getChatModel(opts: ChatModelOptions): LanguageModel {
    switch (opts.provider) {
        case 'gemini': {
            const apiKey = opts.apiKey?.trim() || process.env.GEMINI_API_KEY
            if (!apiKey) throw new Error('No Gemini API key — set one on the persona or GEMINI_API_KEY in env')
            return createGoogleGenerativeAI({ apiKey })(opts.model)
        }
        case 'openrouter': {
            const apiKey = opts.apiKey?.trim() || process.env.OPENROUTER_API_KEY
            if (!apiKey) {
                throw new Error('No OpenRouter API key — set one on the persona or OPENROUTER_API_KEY in env')
            }
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3030'
            return createOpenAICompatible({
                name: 'openrouter',
                baseURL: 'https://openrouter.ai/api/v1',
                apiKey,
                headers: { 'HTTP-Referer': appUrl, 'X-Title': 'Prime Avatar' },
            })(opts.model)
        }
        case 'kie':
            // api.kie.ai/grok/v1/responses uses a custom (non-OpenAI) protocol —
            // adapter pending; reserved in the DB constraint for when it lands.
            throw new Error('KIE (Grok) chat adapter not implemented yet — use OpenRouter for permissive models')
        default:
            throw new Error(`Unknown chat provider: ${String(opts.provider)}`)
    }
}
