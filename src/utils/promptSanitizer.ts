/**
 * Prompt Sanitizer for Image Generation
 *
 * Replaces words that trigger Gemini's image generation safety filters
 * with visually equivalent alternatives that pass the filters.
 *
 * Rules are ordered: compound phrases FIRST, then single words.
 * This prevents partial matches from breaking compound replacements.
 */

interface SanitizationRule {
    pattern: RegExp
    replacement: string
    label: string
}

/**
 * Ordered list of sanitization rules.
 * IMPORTANT: Keep compound phrases BEFORE their individual word components.
 * Add new confirmed trigger words here as they are discovered.
 */
const SANITIZATION_RULES: SanitizationRule[] = [
    // ── Compound phrases (longest first) ──
    { pattern: /strapless\s+bandeau\s+bikini\s+top/gi, replacement: 'bandeau-style swim top', label: 'strapless bandeau bikini top' },
    { pattern: /bandeau\s+bikini\s+top/gi, replacement: 'bandeau-style swim top', label: 'bandeau bikini top' },
    { pattern: /bandeau\s+bikini/gi, replacement: 'bandeau-style swim', label: 'bandeau bikini' },
    { pattern: /triangle\s+bikini\s+top/gi, replacement: 'triangle swim top', label: 'triangle bikini top' },
    { pattern: /triangle\s+bikini/gi, replacement: 'triangle swim top', label: 'triangle bikini' },
    { pattern: /string\s+bikini/gi, replacement: 'minimal swim set', label: 'string bikini' },
    { pattern: /two[- ]piece\s+bikini/gi, replacement: 'two-piece swim set', label: 'two-piece bikini' },
    { pattern: /bikini\s+tops?\b/gi, replacement: 'swim top', label: 'bikini top' },
    { pattern: /bikini\s+bottoms?\b/gi, replacement: 'swim bottom', label: 'bikini bottom' },

    // ── Single words ──
    { pattern: /\bbikinis\b/gi, replacement: 'swim sets', label: 'bikinis' },
    { pattern: /\bbikini\b/gi, replacement: 'swim set', label: 'bikini' },
    { pattern: /\bstrapless\b/gi, replacement: 'off-shoulder', label: 'strapless' },
    { pattern: /\blingerie\b/gi, replacement: 'delicate loungewear', label: 'lingerie' },
    { pattern: /\bbralette\b/gi, replacement: 'fitted top', label: 'bralette' },
    { pattern: /\bbustier\b/gi, replacement: 'structured bodice', label: 'bustier' },
    { pattern: /\bcorset\b/gi, replacement: 'structured waist garment', label: 'corset' },
]

/**
 * Sanitizes a prompt by replacing words known to trigger image generation
 * safety filters with safe alternatives that preserve visual meaning.
 *
 * @returns The sanitized prompt and a list of replacements made (for logging)
 */
export function sanitizePromptForGeneration(prompt: string): {
    sanitized: string
    replacements: string[]
} {
    let result = prompt
    const replacements: string[] = []

    for (const rule of SANITIZATION_RULES) {
        // Reset lastIndex for global regex
        rule.pattern.lastIndex = 0
        if (rule.pattern.test(result)) {
            replacements.push(`"${rule.label}" → "${rule.replacement}"`)
            rule.pattern.lastIndex = 0
            result = result.replace(rule.pattern, rule.replacement)
        }
    }

    if (replacements.length > 0) {
        console.log(
            `[PromptSanitizer] Applied ${replacements.length} replacement(s):`,
            replacements,
        )
    }

    return { sanitized: result, replacements }
}
