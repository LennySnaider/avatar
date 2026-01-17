// Prompt Analyzer - Detects "contaminating" terms in prompts
// These are terms that describe physical characteristics which might conflict with the avatar

export interface DetectedTerm {
    id: string
    term: string           // The exact text found
    category: TermCategory
    startIndex: number     // Position in the prompt
    endIndex: number
}

export type TermCategory =
    | 'ethnicity'      // Asian, Caucasian, African, etc.
    | 'gender'         // woman, man, girl, boy
    | 'age'            // young, old, elderly, teenage
    | 'hair'           // hair color, style, length
    | 'eyes'           // eye color, shape
    | 'skin'           // skin tone, complexion
    | 'facial'         // facial features, nose, lips, etc.
    | 'body'           // body type, height, weight

// Patterns to detect - case insensitive
// Order matters: longer/more specific patterns first to capture full context
const PATTERNS: Record<TermCategory, RegExp[]> = {
    ethnicity: [
        // Full phrases with ethnicity + gender
        /\b(beautiful|stunning|gorgeous|attractive)?\s*(east\s+)?asian\s+(woman|man|girl|boy|person|model|female|male)\b/gi,
        /\b(beautiful|stunning|gorgeous|attractive)?\s*caucasian\s+(woman|man|girl|boy|person|model|female|male)\b/gi,
        /\b(beautiful|stunning|gorgeous|attractive)?\s*african(\s+american)?\s+(woman|man|girl|boy|person|model|female|male)\b/gi,
        /\b(beautiful|stunning|gorgeous|attractive)?\s*latina?o?\s+(woman|man|girl|boy|person|model|female|male)\b/gi,
        /\b(beautiful|stunning|gorgeous|attractive)?\s*hispanic\s+(woman|man|girl|boy|person|model|female|male)\b/gi,
        /\b(beautiful|stunning|gorgeous|attractive)?\s*(south\s+)?indian\s+(woman|man|girl|boy|person|model|female|male)\b/gi,
        /\b(beautiful|stunning|gorgeous|attractive)?\s*middle\s+eastern\s+(woman|man|girl|boy|person|model|female|male)\b/gi,
        /\b(beautiful|stunning|gorgeous|attractive)?\s*european\s+(woman|man|girl|boy|person|model|female|male)\b/gi,
        /\b(beautiful|stunning|gorgeous|attractive)?\s*white\s+(woman|man|girl|boy|person|model|female|male)\b/gi,
        /\b(beautiful|stunning|gorgeous|attractive)?\s*black\s+(woman|man|girl|boy|person|model|female|male)\b/gi,
        /\b(beautiful|stunning|gorgeous|attractive)?\s*(korean|japanese|chinese|vietnamese|thai|filipino)\s+(woman|man|girl|boy|person|model|female|male)\b/gi,
        // Standalone ethnicity terms
        /\b(east\s+)?asian\b/gi,
        /\bcaucasian\b/gi,
        /\bafrican(\s+american)?\b/gi,
        /\bmiddle\s+eastern\b/gi,
    ],
    gender: [
        // Full phrases with adjectives + gender
        /\b(a\s+)?(beautiful|stunning|gorgeous|attractive|pretty|handsome|lovely)?\s*(young|elderly|old)?\s*(woman|female|lady|girl|man|male|gentleman|boy)\b/gi,
    ],
    age: [
        // Age with context
        /\b(beautiful|stunning)?\s*(young|elderly|old|senior|aged|teenage|middle[\s-]aged)\s*(woman|man|person|adult|lady|girl|boy)?\b/gi,
        /\bin\s+(her|his)\s+(early\s+)?(20s|30s|40s|50s|60s|70s)\b/gi,
        /\b(around|about|approximately)?\s*\d{2}[\s-]?years?[\s-]?old\b/gi,
    ],
    hair: [
        // Complex hair descriptions with "and" connector - capture full phrase
        /\b(with\s+)?(long|short|medium[\s-]length|shoulder[\s-]length)[\s,]*(dark|black|brown|blonde|blond|red|gray|grey|white|auburn|ginger|chestnut|platinum|golden|strawberry)?\s*(brown|black|blonde|blond)?\s*hair(\s+and\s+(wispy|thick|thin|soft|gentle|delicate|subtle)?\s*bangs)?\b/gi,
        // Hair with multiple adjectives
        /\b(her|his)?\s*(long|short|medium[\s-]length|shoulder[\s-]length)[\s,]*(dark|light|deep|rich|bright|vibrant)?\s*(brown|black|blonde|blond|red|auburn|ginger|chestnut|platinum|golden)?\s*(brown|black|blonde|blond)?\s*hair\b/gi,
        // Styled hair descriptions
        /\b(straight|curly|wavy|frizzy|kinky|silky|shiny|glossy|sleek|messy|tousled)\s*(dark|light|brown|black|blonde|blond|red)?\s*hair\b/gi,
        // Bangs with adjectives
        /\b(wispy|thick|thin|soft|gentle|blunt|side[\s-]swept|curtain)?\s*bangs(\s+that\s+(softly\s+)?frame\s+(her|his)\s+face)?\b/gi,
        // Hair color standalone
        /\b(dark|light|deep|rich)?\s*(brown|black|blonde|blond|red|auburn|ginger|chestnut|platinum|golden|strawberry)\s+hair\b/gi,
    ],
    eyes: [
        // Eyes with multiple descriptors
        /\b(her|his)?\s*(light|dark|deep|bright|vivid|pale|piercing|sparkling|captivating)?\s*(blue|green|brown|hazel|amber|gray|grey|violet|emerald|sapphire)\s*eyes\b/gi,
        // Eye shape with color
        /\b(big|small|large|round|narrow|almond[\s-]shaped|wide[\s-]set|deep[\s-]set)\s*(blue|green|brown|hazel|amber|gray|grey)?\s*eyes\b/gi,
        // Simple eye color
        /\b(blue|green|brown|hazel|amber|gray|grey|violet|emerald)\s+eyes\b/gi,
    ],
    skin: [
        // Complex skin descriptions
        /\b(her|his)?\s*skin(\s+features)?\s+(prominent|natural|light|subtle)?\s*(freckles|moles|beauty\s+marks)?\s*(scattered\s+(across|over)\s+(her|his)\s+(nose|face|cheeks)(\s+and\s+(cheeks|nose|face))?)?\b/gi,
        // Skin tone with adjectives
        /\b(beautiful|flawless|smooth|soft|glowing|radiant|clear|perfect)?\s*(fair|pale|light|dark|tan|tanned|olive|bronze|ebony|porcelain|caramel|chocolate|honey)\s*skin(ned)?\b/gi,
        // Freckles with location
        /\b(natural\s+)?(freckles|moles)(\s+scattered)?\s*(across|over|on)?\s*(her|his)?\s*(nose|face|cheeks)?(\s+and\s+(cheeks|nose|face))?\b/gi,
        // Simple skin descriptions
        /\b(clear|flawless|smooth|soft|glowing)\s+skin\b/gi,
        /\bfreckles\b/gi,
        /\bcomplexion\b/gi,
    ],
    facial: [
        // Lips with adjectives
        /\b(her|his)?\s*(full|thin|plump|pouty|natural|soft|pink|red|rosy)(\s+(peachy[\s-]pink|rose|coral|natural))?\s*(colored\s+)?\s*lips\b/gi,
        // Nose descriptions
        /\b(small|big|large|button|pointed|round|flat|aquiline|straight|delicate|petite)\s*nose\b/gi,
        // Cheekbones
        /\b(high|prominent|defined|sculpted|sharp|soft)\s*cheekbones?\b/gi,
        // Jaw/chin
        /\b(strong|weak|defined|chiseled|square|round|delicate|soft)\s*(jaw|jawline|chin)\b/gi,
        // Full lips standalone
        /\bfull\s+lips\b/gi,
    ],
    body: [
        // Body type with context
        /\b(slim|slender|thin|curvy|athletic|muscular|petite|tall|short|fit|toned)\s*(build|body|figure|frame|physique)?\b/gi,
        /\b(narrow|wide|broad)\s*(shoulders?|hips?|waist)\b/gi,
    ],
}

// Category display names and colors
export const CATEGORY_INFO: Record<TermCategory, { label: string; color: string }> = {
    ethnicity: { label: 'Ethnicity', color: 'red' },
    gender: { label: 'Gender', color: 'purple' },
    age: { label: 'Age', color: 'orange' },
    hair: { label: 'Hair', color: 'amber' },
    eyes: { label: 'Eyes', color: 'blue' },
    skin: { label: 'Skin', color: 'rose' },
    facial: { label: 'Facial', color: 'pink' },
    body: { label: 'Body', color: 'cyan' },
}

/**
 * Analyzes a prompt and detects terms that might contaminate avatar generation
 * Prioritizes longer matches to capture full context
 */
export function analyzePromptForContaminants(prompt: string): DetectedTerm[] {
    const allMatches: DetectedTerm[] = []

    // Collect all possible matches
    for (const [category, patterns] of Object.entries(PATTERNS) as [TermCategory, RegExp[]][]) {
        for (const pattern of patterns) {
            pattern.lastIndex = 0
            let match: RegExpExecArray | null

            while ((match = pattern.exec(prompt)) !== null) {
                const term = match[0].trim()
                // Skip very short matches or empty ones
                if (term.length < 3) continue

                allMatches.push({
                    id: crypto.randomUUID(),
                    term,
                    category,
                    startIndex: match.index,
                    endIndex: match.index + match[0].length,
                })
            }
        }
    }

    // Sort by length (longest first) then by position
    allMatches.sort((a, b) => {
        const lengthDiff = b.term.length - a.term.length
        if (lengthDiff !== 0) return lengthDiff
        return a.startIndex - b.startIndex
    })

    // Filter out overlapping matches, keeping the longest ones
    const detected: DetectedTerm[] = []
    const usedRanges: Array<{ start: number; end: number }> = []

    const overlaps = (start: number, end: number) =>
        usedRanges.some(r =>
            (start >= r.start && start < r.end) ||
            (end > r.start && end <= r.end) ||
            (start <= r.start && end >= r.end)
        )

    for (const match of allMatches) {
        if (!overlaps(match.startIndex, match.endIndex)) {
            detected.push(match)
            usedRanges.push({ start: match.startIndex, end: match.endIndex })
        }
    }

    // Sort final results by position in prompt
    detected.sort((a, b) => a.startIndex - b.startIndex)

    return detected
}

/**
 * Removes a detected term from the prompt, cleaning up surrounding punctuation
 */
export function removeTermFromPrompt(prompt: string, term: DetectedTerm): string {
    const before = prompt.substring(0, term.startIndex)
    const after = prompt.substring(term.endIndex)

    // Clean up: remove extra spaces, commas, and periods
    let result = before + after

    // Clean up "with" that might be left hanging
    result = result.replace(/\bwith\s*,/gi, ',')
    result = result.replace(/\bwith\s*\./gi, '.')
    result = result.replace(/\bwith\s+and\b/gi, 'and')
    result = result.replace(/\bwith\s*$/gi, '')

    // Clean up "and" that might be left hanging
    result = result.replace(/\band\s*,/gi, ',')
    result = result.replace(/\band\s*\./gi, '.')
    result = result.replace(/,\s*and\s*,/gi, ',')
    result = result.replace(/^\s*and\s+/gi, '')
    result = result.replace(/\s+and\s*$/gi, '')

    // Clean up double spaces
    result = result.replace(/\s{2,}/g, ' ')

    // Clean up orphaned commas
    result = result.replace(/,\s*,/g, ',')
    result = result.replace(/,\s*\./g, '.')
    result = result.replace(/\.\s*,/g, '.')

    // Clean up leading/trailing punctuation
    result = result.replace(/^\s*[,.:]\s*/g, '')
    result = result.replace(/\s*[,.:]\s*$/g, '')

    // Clean up spaces around punctuation
    result = result.replace(/\s+([,.])/g, '$1')
    result = result.replace(/([,.])\s+/g, '$1 ')

    return result.trim()
}
