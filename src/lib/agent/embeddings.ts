/**
 * Gemini embeddings for the avatar knowledge base.
 *
 * gemini-embedding-001 truncated to 768 dims does NOT return normalized
 * vectors — L2 normalization here is mandatory or cosine similarity (and the
 * min_similarity threshold in match_avatar_knowledge) is miscalibrated.
 */
import { GoogleGenAI } from '@google/genai'

export const EMBEDDING_MODEL = 'gemini-embedding-001'
export const EMBEDDING_DIMENSIONS = 768

export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

const BATCH_SIZE = 100

function getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured (required for embeddings)')
    return new GoogleGenAI({ apiKey })
}

function l2Normalize(values: number[]): number[] {
    let norm = 0
    for (const v of values) norm += v * v
    norm = Math.sqrt(norm)
    if (!Number.isFinite(norm) || norm === 0) return values
    return values.map((v) => v / norm)
}

export async function embedTexts(texts: string[], taskType: EmbedTask): Promise<number[][]> {
    if (texts.length === 0) return []
    const ai = getClient()
    const out: number[][] = []
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE)
        const res = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: batch,
            config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
        })
        const embeddings = res.embeddings ?? []
        if (embeddings.length !== batch.length) {
            throw new Error(`Embedding count mismatch: sent ${batch.length}, got ${embeddings.length}`)
        }
        for (const e of embeddings) out.push(l2Normalize(e.values ?? []))
    }
    return out
}

export async function embedText(text: string, taskType: EmbedTask): Promise<number[]> {
    const [vector] = await embedTexts([text], taskType)
    return vector
}
