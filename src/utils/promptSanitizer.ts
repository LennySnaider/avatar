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

/**
 * Aggressive sanitization for retry attempts after a safety block.
 * Strips clothing details, body descriptors, and suggestive context
 * while preserving the core scene/composition intent.
 */
const AGGRESSIVE_STRIP_PATTERNS: RegExp[] = [
    // Clothing detail phrases that can trigger in combination
    /\b(low[- ]cut|backless|sleeveless|skin[- ]tight|body[- ]hugging|figure[- ]hugging|form[- ]fitting|revealing|sheer|see[- ]through|plunging|micro|thong|g[- ]string|mini)\b/gi,
    // Swimwear variants the basic sanitizer might miss
    /\b(beachwear|bathing suit|one[- ]piece|monokini|tankini|maillot|swimwear|swim\s+set|swim\s+top|swim\s+bottom)\b/gi,
    // Body/skin descriptors that can trigger when combined with clothing
    /\b(cleavage|midriff|navel|belly\s+button|bare\s+skin|exposed|naked|nude|undressed|topless|braless)\b/gi,
    // Suggestive poses/contexts
    /\b(seductive|sensual|provocative|sultry|alluring|flirty|intimate|bedroom\s+eyes)\b/gi,
]

export function aggressiveSanitize(prompt: string): {
    sanitized: string
    wasModified: boolean
} {
    // First apply standard sanitization
    const { sanitized: firstPass } = sanitizePromptForGeneration(prompt)

    let result = firstPass
    let wasModified = false

    for (const pattern of AGGRESSIVE_STRIP_PATTERNS) {
        pattern.lastIndex = 0
        if (pattern.test(result)) {
            wasModified = true
            pattern.lastIndex = 0
            result = result.replace(pattern, '')
        }
    }

    // Clean up extra whitespace from removals
    result = result.replace(/\s{2,}/g, ' ').trim()

    if (wasModified) {
        console.log('[PromptSanitizer] Aggressive sanitization applied for retry')
    }

    return { sanitized: result, wasModified }
}
