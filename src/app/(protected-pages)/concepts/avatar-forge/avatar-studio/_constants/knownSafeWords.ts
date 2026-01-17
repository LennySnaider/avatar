/**
 * Known Safe Words Dictionary
 *
 * These are words/phrases that the safety checker may flag but we know
 * from experience that Gemini accepts them without issues.
 *
 * Add new words here when you discover they pass generation successfully.
 */

export const KNOWN_SAFE_WORDS: string[] = [
    // Clothing & Fashion
    'bikini',
    'two-piece bikini',
    'triangle top',
    'high-cut',
    'side-tie',
    'high-cut, side-tie bottoms',
    'swimsuit',
    'swimwear',
    'bathing suit',
    'crop top',
    'sports bra',
    'tank top',
    'shorts',
    'mini skirt',
    'bodysuit',
    'leotard',
    'lingerie',

    // Descriptive terms
    'accentuating',
    'form-fitting',
    'figure-hugging',
    'tight-fitting',
    'revealing',
    'low-cut',
    'backless',
    'strapless',
    'sleeveless',

    // Age-neutral descriptors
    'young woman',
    'young adult',
    'young lady',
    'adult woman',
    'woman',

    // Body descriptors (neutral)
    'slim',
    'athletic',
    'fit',
    'toned',
    'curvy',
    'petite',
    'tall',

    // Poses & Actions
    'posing',
    'modeling',
    'walking',
    'standing',
    'sitting',
    'lying down',
    'stretching',
    'dancing',

    // Settings
    'beach',
    'pool',
    'poolside',
    'spa',
    'gym',
    'yoga studio',
    'bedroom',
    'bathroom',
]

/**
 * Check if a flagged term matches any known safe word
 * Uses case-insensitive matching and partial matching
 */
export function isKnownSafeWord(term: string): boolean {
    const lowerTerm = term.toLowerCase().trim()

    return KNOWN_SAFE_WORDS.some(safeWord => {
        const lowerSafe = safeWord.toLowerCase()
        // Exact match
        if (lowerTerm === lowerSafe) return true
        // Term contains safe word
        if (lowerTerm.includes(lowerSafe)) return true
        // Safe word contains term (for multi-word terms)
        if (lowerSafe.includes(lowerTerm) && lowerTerm.length >= 4) return true
        return false
    })
}

/**
 * Filter out known safe words from corrections array
 */
export function filterKnownSafeCorrections(
    corrections: { term: string; alternatives: string[] }[]
): { term: string; alternatives: string[] }[] {
    return corrections.filter(correction => !isKnownSafeWord(correction.term))
}
