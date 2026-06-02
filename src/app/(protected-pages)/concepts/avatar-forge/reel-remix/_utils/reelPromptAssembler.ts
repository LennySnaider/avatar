/**
 * Combines the individual Gemini analyses of a Reel into a single editable
 * "recipe" — the prose the user sees as the extracted prompt, and the text that
 * gets handed to Avatar Studio.
 *
 * The handoff deliberately reuses Avatar Studio's existing Clone Ref mechanism:
 * the studio already knows how to take a `[CLONE: ...]` tag in the prompt plus a
 * clone image and recreate that scene with the avatar's face (see
 * BottomControlBar.handleCloneRefUpload + avatarStudioStore.getFullPrompt). So
 * Reel Remix doesn't reinvent generation — it produces the same `[CLONE: ...]`
 * the studio would have gotten from a manual clone-ref upload.
 */

export type ReelMode = 'LOOK' | 'REEL'

export interface ReelAnalysis {
    /** Scene/outfit/lighting prose from analyzeImageForClone. */
    sceneDescription: string
    /** Optional body pose prose from analyzePoseFromImage. */
    poseDescription?: string
    /** Optional motion/transitions prose from analyzeReelMotion (REEL mode). */
    motionDescription?: string
}

/**
 * Merge the analyses into one comma-joined recipe paragraph. Scene leads (it
 * carries outfit + setting + lighting), pose refines the body position, and —
 * only in REEL mode — the motion description is appended so the downstream video
 * model knows what should move.
 */
export function assembleReelRecipe(
    analysis: ReelAnalysis,
    mode: ReelMode,
): string {
    const parts: string[] = []

    const scene = analysis.sceneDescription?.trim()
    if (scene) parts.push(scene)

    const pose = analysis.poseDescription?.trim()
    // Skip the pose if the scene prose already implies it strongly enough to
    // avoid contradictory instructions; otherwise add it as a refinement.
    if (pose && !scene?.toLowerCase().includes(pose.toLowerCase().slice(0, 20))) {
        parts.push(pose)
    }

    if (mode === 'REEL') {
        const motion = analysis.motionDescription?.trim()
        if (motion) parts.push(`motion: ${motion}`)
    }

    return parts
        .join(', ')
        .replace(/\s+/g, ' ')
        .replace(/,\s*,+/g, ',')
        .trim()
}

/**
 * Wrap the (possibly user-edited) recipe in the `[CLONE: ...]` tag Avatar Studio
 * expects. This is the single string written to the studio's prompt on handoff.
 */
export function recipeToStudioPrompt(recipe: string): string {
    const clean = recipe.trim()
    if (!clean) return ''
    // If the user already kept/typed a [CLONE: ...] wrapper, don't double-wrap.
    if (/^\[clone:/i.test(clean)) return clean
    return `[CLONE: ${clean}]`
}
