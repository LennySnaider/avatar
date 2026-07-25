import type { PhysicalMeasurements } from '@/@types/supabase'
import {
    getHairColorDescription,
    getSkinToneDescription,
} from '@/utils/bodyDescriptors'

/**
 * Prompt COMPACTO para MuleRouter Qwen Edit Max (límite duro: 800 chars,
 * negative 500). No se puede mandar el spec completo (~1.1KB) — esta es la
 * versión destilada que produjo el test decisivo (Raven retrato→cuerpo entero
 * con cuerpo correcto, 2026-07-25). El presupuesto: cara+encuadre (~110) +
 * cuerpo por cm (~230) + anatomía NSFW (~105) + escena (el resto).
 *
 * Principios heredados de la saga (memoria avatar-kie-cloning-state):
 * - cm + frases coherentes con el número (nunca amplificadores sueltos)
 * - glúteo = proyección hacia ATRÁS, no anchura
 * - CERO palabras-pigmento en el positivo; prohibiciones al negative
 * - escena sin tags [XXX] ni cláusulas largas de watermark (van al negative)
 */
export function buildMuleRouterEditMaxPrompt(params: {
    measurements?: PhysicalMeasurements | null
    /** Escena/pose del run (puede traer tags y cláusulas — se limpian). */
    scene: string
    nsfw: boolean
}): { prompt: string; negativePrompt: string } {
    const m = params.measurements
    const parts: string[] = []

    parts.push(
        'Keep the EXACT face, hair and identity of the woman in Image 1 unchanged. Generate a FULL BODY shot of her.',
    )

    if (m?.waist && m?.hips && m?.bust) {
        const shape = (m.shape ?? m.bodyType ?? 'hourglass').replace(/-/g, ' ')
        const bodyBits: string[] = [
            `Her body: ${shape} figure, cinched ${m.waist}cm waist clearly narrower than her ${m.bust}cm bust and ${m.hips}cm hips`,
        ]
        if ((m.glutesLevel ?? 0) >= 4)
            bodyBits.push('round glutes projecting strongly backward')
        else if ((m.glutesLevel ?? 0) === 3) bodyBits.push('full round glutes')
        const legShort: Record<string, string> = {
            athletic: 'athletic toned legs',
            slim: 'slim legs',
            toned: 'toned legs',
            'muscular-thighs': 'sculpted thighs',
            long: 'long legs',
            curvy: 'shapely legs',
            thick: 'full thighs',
        }
        if (m.legType && legShort[m.legType])
            bodyBits.push(legShort[m.legType])
        const hair = getHairColorDescription(m.hairColor).split(',')[0]
        if (hair) bodyBits.push(hair)
        const skin = getSkinToneDescription(m.skinTone).split(',')[0]
        if (skin) bodyBits.push(skin)
        parts.push(bodyBits.join(', ') + '.')
    }

    if (params.nsfw) {
        parts.push(
            'Bare breasts with small compact skin-toned areolas; her vulva a small closed delicate cleft, matte natural skin tone.',
        )
    }

    // Escena limpia: fuera tags [XXX] y la cláusula larga de watermark (esa
    // prohibición vive en el negative), espacios colapsados.
    const cleanScene = params.scene
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/Do NOT add any watermark[^.]*\./gi, ' ')
        .replace(/Her anatomy:[\s\S]*$/i, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
    const used = parts.join(' ').length
    const room = 800 - used - 1
    if (room > 40 && cleanScene) {
        const hard = cleanScene.slice(0, room)
        const cut = hard.lastIndexOf(' ')
        parts.push(cut > room * 0.6 ? hard.slice(0, cut) : hard)
    }

    const FIXED_NEG =
        'watermark, text, logo, signature, extra fingers, deformed hands, missing limbs, amputated limbs'
    const NSFW_NEG =
        'censored, censor bar, blurred crotch, smooth featureless crotch, doll-like genital area, pink areolas, blushed chest, open labia, gaping, oversized hips, exaggerated hourglass, oversized breasts'
    const negativePrompt = (
        params.nsfw ? `${NSFW_NEG}, ${FIXED_NEG}` : FIXED_NEG
    ).slice(0, 500)

    return { prompt: parts.join(' ').slice(0, 800), negativePrompt }
}

/** Mapa aspectRatio → size de MuleRouter ("w*h", ambos [512,2048]). */
export const MULEROUTER_SIZE: Record<string, string> = {
    '9:16': '928*1664',
    '16:9': '1664*928',
    '1:1': '1328*1328',
    '3:4': '1104*1472',
    '4:3': '1472*1104',
}
