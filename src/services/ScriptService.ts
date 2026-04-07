'use server'

import { GoogleGenAI } from '@google/genai'
import type { ScriptGenerateParams, ScriptTone, ScriptTemplate } from '@/@types/voice'

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

const TONE_DESCRIPTIONS: Record<ScriptTone, string> = {
    professional: 'Professional, trustworthy, and authoritative. Clear and concise language.',
    casual: 'Friendly, conversational, and approachable. Like talking to a friend.',
    funny: 'Humorous, witty, and entertaining. Light-hearted with clever wordplay.',
    persuasive: 'Compelling, urgent, and action-oriented. Strong call-to-action.',
}

const TEMPLATE_STRUCTURES: Record<ScriptTemplate, string> = {
    'property-tour': `Structure:
1. Hook (2-3 seconds): Attention-grabbing opening about the property
2. Location & Overview (5-8 seconds): Neighborhood, area highlights
3. Key Features (10-15 seconds): Bedrooms, size, unique amenities
4. Lifestyle Appeal (5-8 seconds): Who this property is perfect for
5. CTA (3-5 seconds): Contact info or next step`,

    'product-review': `Structure:
1. Hook (2-3 seconds): "I tested [product] and here's what happened"
2. First Impression (5 seconds): Unboxing/initial reaction
3. Key Benefits (10 seconds): Top 3 features with real examples
4. Honest Opinion (5 seconds): Pros and any minor cons
5. Verdict + CTA (5 seconds): Rating and where to buy`,

    'ugc-ad': `Structure:
1. Hook (2-3 seconds): Relatable problem statement
2. Discovery (3-5 seconds): "I found [product/service]"
3. Experience (10-15 seconds): Personal story using it
4. Results (5 seconds): Before/after or concrete outcome
5. CTA (3-5 seconds): "Use my code" or "Link in bio"`,

    'greeting': `Structure:
1. Warm Hello (3 seconds): Personal greeting
2. Introduction (5 seconds): Who you are and what you do
3. Value Proposition (5-10 seconds): How you can help
4. Invitation (5 seconds): Next step or how to connect`,

    'tutorial': `Structure:
1. What You'll Learn (3 seconds): Clear promise
2. Step 1 (8-10 seconds): First action with explanation
3. Step 2 (8-10 seconds): Second action
4. Step 3 (8-10 seconds): Third action
5. Recap + CTA (5 seconds): Summary and next steps`,

    'custom': `Structure: Free-form. Write a natural, flowing script based on the context provided.`,
}

export async function generateScript(params: ScriptGenerateParams): Promise<string> {
    const { template, tone, language, durationSeconds, context } = params

    const wordsPerSecond = language === 'es' ? 2.5 : 3.0
    const targetWords = Math.round(durationSeconds * wordsPerSecond)

    const prompt = `You are a professional scriptwriter for short-form video content.

TASK: Write a script for a ${durationSeconds}-second video (approximately ${targetWords} words).

TONE: ${TONE_DESCRIPTIONS[tone]}

TEMPLATE: ${template}
${TEMPLATE_STRUCTURES[template]}

CONTEXT:
${context.productName ? `- Product/Subject: ${context.productName}` : ''}
${context.productDescription ? `- Description: ${context.productDescription}` : ''}
${context.targetAudience ? `- Target Audience: ${context.targetAudience}` : ''}
${context.cta ? `- Call to Action: ${context.cta}` : ''}
${context.customInstructions ? `- Additional Instructions: ${context.customInstructions}` : ''}

LANGUAGE: Write the entire script in ${language === 'es' ? 'Spanish (Latin American)' : language === 'en' ? 'English' : language}.

RULES:
- Write ONLY the spoken text, no stage directions or [brackets]
- Keep it exactly around ${targetWords} words (${durationSeconds} seconds when spoken)
- Make every word count — no filler phrases
- End with a clear call-to-action
- Sound natural when read aloud, not written

OUTPUT: Return ONLY the script text, nothing else.`

    const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
    })

    const text = response.text?.trim()
    if (!text) throw new Error('Gemini returned empty script')

    return text
}

export async function translateScript(
    scriptText: string,
    fromLanguage: string,
    toLanguage: string
): Promise<string> {
    const prompt = `Translate this video script from ${fromLanguage} to ${toLanguage}.
Keep the same tone, rhythm, and natural spoken feel. Adapt cultural references if needed.
Do NOT add any notes or explanations — return ONLY the translated script.

Script:
${scriptText}`

    const response = await genAI.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
    })

    const text = response.text?.trim()
    if (!text) throw new Error('Gemini returned empty translation')

    return text
}
