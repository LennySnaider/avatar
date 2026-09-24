/**
 * UN turno de conversación en vivo, de punta a punta:
 *
 *   audio del visitante → STT → persona (LLM en streaming) → frases →
 *   TTS en streaming con la voz clonada → marcos NDJSON al navegador
 *
 * El navegador empuja cada marco `audio` al proveedor de cara, que lo
 * reproduce con los labios sincronizados. LLM y TTS corren EN PARALELO: el
 * modelo sigue escribiendo la segunda frase mientras la primera ya suena.
 *
 * SIN SESIÓN DE NEXTAUTH (ver cabecera de `./session.ts`): todo cuelga de la
 * fila `live_sessions` ya autenticada, y cada consulta filtra por su
 * `organization_id`. La conversación queda en `agent_chats`/`agent_messages`
 * (platform `live`) para que el inbox la muestre como transcripción.
 */
import { streamText, type ModelMessage } from 'ai'
import { orgSupabase } from '@/lib/org/orgTable'
import { ingestMessage } from '@/lib/agent/inboxSync'
import { getChatModel } from '@/lib/agent/chatProvider'
import { buildSystemPrompt } from '@/lib/agent/promptBuilder'
import { toPersonaDTO } from '@/lib/agent/personaMapper'
import { retrieveKnowledge } from '@/lib/agent/retrieval'
import type { AvatarPersonaRow } from '@/lib/agent/db'
import type { RetrievedChunk } from '@/lib/agent/types'
import type { VoiceTtsSettings } from '@/@types/voice'
import type { LiveFrame, LiveTurnUsage } from './frames'
import { capNsfwForLive, LIVE_LIMITS } from './policy'
import { SentenceChunker } from './sentenceChunker'
import { PcmFramer } from './pcmFramer'
import { transcribeUtterance } from './stt'
import { languageBoostFor, synthesizePcmStream } from './ttsStream'
import { addSpokenChars, LIVE_PLATFORM, type UsableSession } from './session'
import { FACE_AUDIO_SAMPLE_RATE } from './face/types'

/** Lo que ve el modelo en el turno de saludo, cuando no hay texto fijo. */
const GREETING_TURN =
    '[The call just connected. Greet them warmly in one short spoken sentence, say your name and ask theirs.]'

export interface RunLiveTurnInput {
    usable: UsableSession
    seq: number
    kind: 'utterance' | 'greeting'
    audio: Uint8Array | null
    mimeType: string
    signal: AbortSignal
    emit: (frame: LiveFrame) => void
}

export interface LiveTurnResult {
    /** El visitante dijo algo y hubo respuesta: cuenta para refrescar la memoria. */
    answered: boolean
}

const isAbort = (e: unknown) =>
    e instanceof Error && (e.name === 'AbortError' || /aborted/i.test(e.message))

export async function runLiveTurn(input: RunLiveTurnInput): Promise<LiveTurnResult> {
    const { session, settings } = input.usable
    const orgId = session.organization_id
    const chatId = session.chat_id
    const turnId = `${session.id}:${input.seq}`
    const usage: LiveTurnUsage = { sttMs: 0, llmMs: 0, ttsChars: 0, audioMs: 0 }
    input.emit({ type: 'session', turnId, seq: input.seq })
    if (!chatId) throw new Error('La sesión no tiene chat asociado')

    const supabase = orgSupabase()
    const [avatarRes, personaRes, historyRes, memoryRes] = await Promise.all([
        supabase
            .from('avatars')
            .select('name, default_voice_id')
            .eq('organization_id', orgId)
            .eq('id', session.avatar_id)
            .maybeSingle(),
        supabase
            .from('avatar_personas')
            .select('*')
            .eq('organization_id', orgId)
            .eq('avatar_id', session.avatar_id)
            .maybeSingle(),
        supabase
            .from('agent_messages')
            .select('direction, text')
            .eq('organization_id', orgId)
            .eq('chat_id', chatId)
            .in('status', ['received', 'sent'])
            .order('created_at', { ascending: false })
            .limit(LIVE_LIMITS.historyLimit),
        supabase
            .from('avatar_fan_memories')
            .select('summary, facts')
            .eq('organization_id', orgId)
            .eq('avatar_id', session.avatar_id)
            .eq('platform', LIVE_PLATFORM)
            .eq('external_fan_id', session.visitor_id)
            .maybeSingle(),
    ])
    const avatar = avatarRes.data
    const personaRow = personaRes.data as AvatarPersonaRow | null
    if (!avatar || !personaRow) throw new Error('Falta el avatar o su persona')
    if (!avatar.default_voice_id) throw new Error('El avatar no tiene voz por defecto')
    const { data: voice } = await supabase
        .from('cloned_voices')
        .select('provider_voice_id, tts_settings, language')
        .eq('organization_id', orgId)
        .eq('id', avatar.default_voice_id)
        .maybeSingle()
    if (!voice) throw new Error('La voz por defecto del avatar no existe')

    const persona = toPersonaDTO(personaRow)
    const languageHint = persona.languages[0] ?? voice.language ?? null

    // ── 1. Qué dijo el visitante ─────────────────────────────────────────
    let userText: string | null = null
    if (input.kind === 'utterance') {
        if (!input.audio?.length) throw new Error('Turno sin audio')
        const stt = await transcribeUtterance({
            audio: input.audio,
            mimeType: input.mimeType,
            languageHint,
            provider: settings.sttProvider,
        })
        usage.sttMs = stt.durationMs
        input.emit({ type: 'transcript', text: stt.text, provider: stt.provider, durationMs: stt.durationMs })
        if (!stt.text) {
            input.emit({ type: 'done', turnId, replyText: '', empty: true, usage })
            return { answered: false }
        }
        userText = stt.text
        await ingestMessage({
            organizationId: orgId,
            chatId,
            direction: 'in',
            externalMessageId: `${turnId}:in`,
            text: userText,
        })
    }

    // ── 2. La respuesta, frase a frase ───────────────────────────────────
    const sentences: string[] = []
    let llmDone = false
    let llmError: unknown = null
    let wake: (() => void) | null = null
    const notify = () => {
        const w = wake
        wake = null
        w?.()
    }

    // Señal propia: se aborta si el visitante corta (barge-in) O si el TTS
    // falla — en ese caso no tiene sentido que el LLM siga gastando tokens.
    const local = new AbortController()
    const onClientAbort = () => local.abort()
    if (input.signal.aborted) local.abort()
    else input.signal.addEventListener('abort', onClientAbort, { once: true })

    const fixedGreeting = input.kind === 'greeting' ? settings.greeting?.trim() : ''
    const llmStartedAt = Date.now()
    const producer = (async () => {
        try {
            if (fixedGreeting) {
                const fixed = new SentenceChunker()
                sentences.push(...fixed.push(`${fixedGreeting} `))
                const rest = fixed.flush()
                if (rest) sentences.push(rest)
                return
            }
            const history = (historyRes.data ?? [])
                .slice()
                .reverse()
                .filter((m) => m.text?.trim())
                .map<ModelMessage>((m) => ({
                    role: m.direction === 'in' ? 'user' : 'assistant',
                    content: m.text as string,
                }))
            // El mensaje del visitante ya está en `agent_messages`, pero el
            // historial se leyó ANTES de insertarlo: se añade a mano.
            const messages: ModelMessage[] = [
                ...history,
                { role: 'user', content: userText ?? GREETING_TURN },
            ]
            let ragChunks: RetrievedChunk[] = []
            if (userText) {
                try {
                    ragChunks = await retrieveKnowledge(session.avatar_id, userText)
                } catch (e) {
                    console.warn('[live] RAG falló (se sigue sin conocimiento)', e)
                }
            }
            const memory = memoryRes.data
            const result = streamText({
                model: getChatModel({
                    provider: persona.chatProvider,
                    model: persona.chatModel,
                    apiKey: personaRow.api_key,
                }),
                system: buildSystemPrompt({
                    persona: { ...persona, nsfwLevel: capNsfwForLive(persona.nsfwLevel) },
                    avatarName: avatar.name,
                    ragChunks,
                    fanMemory: memory
                        ? { summary: memory.summary, facts: (memory.facts ?? {}) as Record<string, string> }
                        : null,
                    channel: 'live',
                }),
                messages,
                maxOutputTokens: LIVE_LIMITS.maxOutputTokens,
                abortSignal: local.signal,
            })
            const chunker = new SentenceChunker()
            for await (const delta of result.textStream) {
                input.emit({ type: 'text', delta })
                const ready = chunker.push(delta)
                if (ready.length) {
                    sentences.push(...ready)
                    notify()
                }
            }
            const tail = chunker.flush()
            if (tail) sentences.push(tail)
        } catch (e) {
            llmError = e
        } finally {
            usage.llmMs = Date.now() - llmStartedAt
            llmDone = true
            notify()
        }
    })()

    const spoken: string[] = []
    let interrupted = false
    let failure: unknown = null
    try {
        let index = 0
        for (;;) {
            if (local.signal.aborted) throw new DOMException('aborted', 'AbortError')
            if (index < sentences.length) {
                const text = sentences[index]
                input.emit({ type: 'sentence', index, text })
                const framer = new PcmFramer()
                const gen = synthesizePcmStream({
                    text,
                    voiceId: voice.provider_voice_id,
                    settings: (voice.tts_settings ?? null) as VoiceTtsSettings | null,
                    language: languageBoostFor(voice.language),
                    sampleRate: FACE_AUDIO_SAMPLE_RATE[settings.faceProvider],
                    signal: local.signal,
                })
                for (;;) {
                    const step = await gen.next()
                    if (step.done) {
                        usage.ttsChars += step.value.characters
                        usage.audioMs += step.value.audioMs
                        break
                    }
                    for (const frame of framer.push(step.value)) {
                        input.emit({ type: 'audio', index, pcm16: Buffer.from(frame).toString('base64') })
                    }
                }
                framer.flush()
                input.emit({ type: 'audio_end', index })
                spoken.push(text)
                index++
                continue
            }
            if (llmDone) break
            await new Promise<void>((resolve) => {
                wake = resolve
            })
        }
        await producer
        if (llmError && !isAbort(llmError)) throw llmError
    } catch (e) {
        if (isAbort(e) && input.signal.aborted) interrupted = true
        else failure = e
        local.abort()
    } finally {
        input.signal.removeEventListener('abort', onClientAbort)
        // Se guarda SÓLO lo que llegó a decirse: si el visitante interrumpió,
        // el inbox no debe enseñar frases que nunca sonaron.
        const replyText = spoken.join(' ').trim()
        if (replyText) {
            try {
                await ingestMessage({
                    organizationId: orgId,
                    chatId,
                    direction: 'out',
                    externalMessageId: `${turnId}:out`,
                    text: replyText,
                    generatedBy: {
                        provider: persona.chatProvider,
                        model: persona.chatModel,
                        channel: 'live',
                        kind: input.kind,
                        ...(interrupted ? { interrupted: true } : {}),
                    },
                })
                const now = new Date().toISOString()
                await supabase
                    .from('agent_chats')
                    .update({
                        last_message_at: now,
                        updated_at: now,
                        ...(userText ? { last_fan_message_at: now } : {}),
                    })
                    .eq('organization_id', orgId)
                    .eq('id', chatId)
                await addSpokenChars(session, usage.ttsChars || replyText.length)
            } catch (e) {
                console.error('[live] no se pudo guardar la respuesta del turno', { turnId }, e)
            }
        }
        if (!input.signal.aborted && !failure) {
            input.emit({ type: 'done', turnId, replyText, ...(interrupted ? { interrupted } : {}), usage })
        }
    }
    if (failure) throw failure
    return { answered: Boolean(userText) }
}
