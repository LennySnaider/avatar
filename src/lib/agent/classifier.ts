/**
 * Inbound-message risk classifier for autopilot. FAIL-CLOSED: any error, or
 * any category that isn't clearly safe, resolves to `autopilotSafe: false` so
 * the message escalates to a human draft instead of auto-sending.
 */
import { GoogleGenAI, Type } from '@google/genai'
import { AGENT_UTILITY_MODEL } from './models'

/**
 * `greeting` SÓLO lo produce el atajo puro `isStartCommand` — a propósito NO
 * está en el `enum` del `responseSchema` de abajo: el LLM sigue teniendo las
 * siete categorías de siempre (un "hola" escrito a mano es `small_talk`) y
 * esta octava distingue en el registro al fan que sólo pulsó Iniciar.
 */
export type RiskCategory =
    | 'greeting'
    | 'small_talk'
    | 'purchase_intent'
    | 'payment_issue'
    | 'complaint'
    | 'sensitive'
    | 'underage_risk'
    | 'other'

export interface MessageRisk {
    category: RiskCategory
    autopilotSafe: boolean
    reason: string
}

/** Only these categories may ever auto-send. Everything else escalates. */
const SAFE_CATEGORIES = new Set<RiskCategory>(['greeting', 'small_talk', 'purchase_intent'])

/**
 * ¿Es el texto el comando de arranque de Telegram (`/start`, opcionalmente con
 * payload de deep link)? Pura y con test.
 *
 * VISTO EN VIVO: el fan que sólo pulsa "Iniciar" manda exactamente `/start`, y
 * el LLM lo clasificaba como "comando de bot sin texto conversacional" →
 * `other` → autopilot escalado. Resultado: el primer contacto de cada fan
 * nuevo se quedaba esperando a que un humano aprobara el saludo. Un `/start`
 * no tiene riesgo que clasificar: es literalmente abrir la puerta.
 *
 * Distingue mayúsculas porque Telegram las distingue: `/START` no dispara el
 * comando, así que tampoco debe entrar por este atajo (y si llega, que lo
 * juzgue el LLM — fallar cerrado). `/start@MiBot` (forma de grupo) tampoco:
 * este canal es de chats privados, y ante la duda, al clasificador.
 */
export function isStartCommand(text: string): boolean {
    const clean = text.trim()
    return clean === '/start' || clean.startsWith('/start ')
}

const UNSAFE: MessageRisk = {
    category: 'other',
    autopilotSafe: false,
    reason: 'Could not classify — escalated for safety',
}

export async function classifyInboundMessage(
    text: string,
    recentContext: string[] = [],
): Promise<MessageRisk> {
    const clean = text.trim()
    if (!clean) return { category: 'other', autopilotSafe: false, reason: 'Empty message' }

    // Atajo ANTES del LLM: un `/start` es un saludo seguro por definición (ver
    // `isStartCommand`). También ahorra una llamada al modelo en el mensaje
    // más repetido del canal.
    if (isStartCommand(clean)) {
        return { category: 'greeting', autopilotSafe: true, reason: 'Telegram /start' }
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return UNSAFE

    try {
        const ai = new GoogleGenAI({ apiKey })
        const res = await ai.models.generateContent({
            model: AGENT_UTILITY_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text:
                                'You are a safety classifier for an adult creator chat autopilot. ' +
                                'Classify the LATEST fan message into ONE category:\n' +
                                '- small_talk: casual chat, greetings, compliments, flirting\n' +
                                '- purchase_intent: wants to buy/see content, asks prices\n' +
                                '- payment_issue: refund, chargeback, billing problem, "I paid but…"\n' +
                                '- complaint: upset, angry, threatening to unsubscribe/report\n' +
                                '- sensitive: self-harm, mental health crisis, illegal requests, violence, real-world meetup\n' +
                                '- underage_risk: any hint the fan is a minor or references minors\n' +
                                '- other: anything unclear\n\n' +
                                (recentContext.length
                                    ? `RECENT CONTEXT:\n${recentContext.slice(-4).join('\n')}\n\n`
                                    : '') +
                                `LATEST FAN MESSAGE:\n${clean}`,
                        },
                    ],
                },
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        category: {
                            type: Type.STRING,
                            enum: [
                                'small_talk',
                                'purchase_intent',
                                'payment_issue',
                                'complaint',
                                'sensitive',
                                'underage_risk',
                                'other',
                            ],
                        },
                        reason: { type: Type.STRING },
                    },
                    required: ['category', 'reason'],
                },
            },
        })
        const raw = res.text
        if (!raw) return UNSAFE
        const parsed = JSON.parse(raw) as { category?: RiskCategory; reason?: string }
        const category = (parsed.category ?? 'other') as RiskCategory
        return {
            category,
            autopilotSafe: SAFE_CATEGORIES.has(category),
            reason: parsed.reason ?? '',
        }
    } catch (e) {
        console.warn('[classifier] failed (fail-closed → unsafe)', e)
        return UNSAFE
    }
}
