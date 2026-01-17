// Model Action Presets for Avatar Studio
// These are pre-defined prompts for common model poses and actions

export interface ActionPreset {
    id: string
    name: string
    text: string
    category: ActionCategory
    mediaType: 'IMAGE' | 'VIDEO'
}

export type ActionCategory =
    | 'poses_basic'
    | 'poses_fashion'
    | 'expressions'
    | 'actions_dynamic'
    | 'interactions'
    | 'studio_angles'

export const ACTION_CATEGORIES: Record<ActionCategory, { label: string; icon: string }> = {
    poses_basic: { label: 'Basic Poses', icon: 'pose' },
    poses_fashion: { label: 'Fashion Poses', icon: 'fashion' },
    expressions: { label: 'Expressions', icon: 'expression' },
    actions_dynamic: { label: 'Dynamic Actions', icon: 'action' },
    interactions: { label: 'Interactions', icon: 'interaction' },
    studio_angles: { label: 'Studio Angles', icon: 'camera' },
}

export const MODEL_ACTION_PRESETS: ActionPreset[] = [
    // Basic Poses
    {
        id: 'pose-standing-relaxed',
        name: 'Standing Relaxed',
        text: 'Standing in a relaxed natural pose, arms resting naturally at sides, weight slightly shifted to one leg, confident but approachable posture',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },
    {
        id: 'pose-sitting-elegant',
        name: 'Sitting Elegant',
        text: 'Sitting elegantly on a modern chair, legs crossed gracefully, hands resting on knee, back straight with refined posture, sophisticated and poised',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },
    {
        id: 'pose-walking-confident',
        name: 'Walking Confident',
        text: 'Walking confidently forward with purposeful stride, one foot in front of the other, natural arm swing, dynamic mid-step pose',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },
    {
        id: 'pose-leaning-wall',
        name: 'Leaning on Wall',
        text: 'Casually leaning against a wall, one shoulder touching the surface, relaxed stance, cool and effortless attitude',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },
    {
        id: 'pose-power-stance',
        name: 'Power Pose',
        text: 'Standing with hands on hips, feet shoulder-width apart, chin slightly raised, confident power stance, commanding presence',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },
    {
        id: 'pose-crossed-arms',
        name: 'Arms Crossed',
        text: 'Standing with arms crossed over chest, confident and assertive pose, slight smile, professional demeanor',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },

    // Fashion Poses
    {
        id: 'fashion-editorial',
        name: 'Editorial Pose',
        text: 'High fashion editorial pose, dramatic angular stance, one hand touching face, intense gaze, avant-garde positioning',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-casual-lifestyle',
        name: 'Casual Lifestyle',
        text: 'Relaxed lifestyle pose, natural and candid positioning, subtle movement suggestion, effortlessly stylish',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-over-shoulder',
        name: 'Looking Over Shoulder',
        text: 'Glamour shot looking over shoulder, head turned back towards camera, sultry gaze, elegant neck line visible',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-runway-walk',
        name: 'Runway Walk',
        text: 'Mid-runway walk pose, one foot crossing in front of the other, arms swaying naturally, fierce confident expression',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-beauty-closeup',
        name: 'Beauty Close-up',
        text: 'Close-up beauty shot, hands gently framing face, soft expression, emphasis on skin texture and features',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-dynamic-movement',
        name: 'Dynamic Movement',
        text: 'Dynamic fashion pose with implied movement, fabric flowing, hair in motion, energetic and captivating',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },

    // Expressions
    {
        id: 'expr-natural-smile',
        name: 'Natural Smile',
        text: 'Genuine natural smile, eyes slightly crinkled with warmth, relaxed facial muscles, authentic happiness',
        category: 'expressions',
        mediaType: 'IMAGE',
    },
    {
        id: 'expr-serious-editorial',
        name: 'Serious Editorial',
        text: 'Serious editorial expression, neutral face with intensity in eyes, strong jaw line, professional modeling look',
        category: 'expressions',
        mediaType: 'IMAGE',
    },
    {
        id: 'expr-candid-laugh',
        name: 'Candid Laugh',
        text: 'Candid laughing expression, mouth open in genuine laughter, eyes sparkling, natural joy captured mid-moment',
        category: 'expressions',
        mediaType: 'IMAGE',
    },
    {
        id: 'expr-mysterious-gaze',
        name: 'Mysterious Gaze',
        text: 'Soft mysterious gaze, eyes slightly narrowed, enigmatic half-smile, alluring and intriguing expression',
        category: 'expressions',
        mediaType: 'IMAGE',
    },
    {
        id: 'expr-surprised',
        name: 'Surprised',
        text: 'Pleasantly surprised expression, eyes wide open, eyebrows raised, mouth slightly open, genuine amazement',
        category: 'expressions',
        mediaType: 'IMAGE',
    },
    {
        id: 'expr-thoughtful',
        name: 'Thoughtful',
        text: 'Thoughtful contemplative expression, slight head tilt, eyes looking slightly away, pensive mood',
        category: 'expressions',
        mediaType: 'IMAGE',
    },

    // Dynamic Actions
    {
        id: 'action-hair-flip',
        name: 'Hair Flip',
        text: 'Dynamic hair flip in motion, head turning, hair flowing dramatically through the air, energetic movement',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },
    {
        id: 'action-twirling',
        name: 'Twirling in Dress',
        text: 'Gracefully twirling, dress fabric spinning outward in beautiful flow, arms slightly extended, joyful movement',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },
    {
        id: 'action-running-playful',
        name: 'Running Playfully',
        text: 'Running playfully, hair and clothes flowing with movement, natural athletic stride, carefree energy',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },
    {
        id: 'action-dancing',
        name: 'Dancing Elegantly',
        text: 'Dancing elegantly, graceful arm movements, body in fluid motion, expressive and artistic pose',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },
    {
        id: 'action-jumping-joy',
        name: 'Jumping with Joy',
        text: 'Jumping with joy, feet off the ground, arms raised in celebration, genuine happiness in expression',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },
    {
        id: 'action-stretching',
        name: 'Stretching',
        text: 'Stretching gracefully, arms extended above head, elongated elegant pose, serene expression',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },

    // Interactions
    {
        id: 'interact-coffee-cup',
        name: 'Holding Coffee',
        text: 'Holding a coffee cup with both hands, warm and cozy pose, slight smile, looking at camera over the cup rim',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-reading-book',
        name: 'Reading Book',
        text: 'Reading a book, holding it at comfortable angle, absorbed in content, intellectual and sophisticated',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-phone',
        name: 'Using Phone',
        text: 'Looking at smartphone, natural modern pose, one hand holding phone, engaged but photogenic angle',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-sunglasses',
        name: 'With Sunglasses',
        text: 'Wearing stylish sunglasses, adjusting them with one hand, cool and fashionable pose',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-hat',
        name: 'Touching Hat',
        text: 'Wearing a hat, one hand touching the brim, stylish and playful pose, fashion-forward look',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-mirror',
        name: 'Looking in Mirror',
        text: 'Looking into a mirror, reflection visible, applying makeup or adjusting hair, intimate candid moment',
        category: 'interactions',
        mediaType: 'IMAGE',
    },

    // Studio Angles
    {
        id: 'angle-three-quarter',
        name: '3/4 View',
        text: 'Classic three-quarter view angle, body turned 45 degrees from camera, face towards lens, flattering perspective',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },
    {
        id: 'angle-profile',
        name: 'Profile Shot',
        text: 'Perfect profile view, side of face visible, elegant jawline and nose silhouette, artistic composition',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },
    {
        id: 'angle-frontal',
        name: 'Frontal Portrait',
        text: 'Direct frontal portrait, face centered and symmetrical, eyes locked on camera, powerful direct connection',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },
    {
        id: 'angle-high-angle',
        name: 'High Angle',
        text: 'Shot from slightly above, looking up at camera, flattering angle that slims face, doe-eyed effect',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },
    {
        id: 'angle-low-angle',
        name: 'Low Angle',
        text: 'Shot from below, powerful and commanding perspective, elongates figure, dramatic and imposing',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },
    {
        id: 'angle-dutch',
        name: 'Dutch Angle',
        text: 'Tilted camera angle for dynamic composition, creates visual tension and interest, edgy and artistic',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },

    // Video-specific actions
    {
        id: 'video-slow-turn',
        name: 'Slow Turn',
        text: 'Slowly turning from profile to frontal view, graceful head movement, maintaining eye contact with camera',
        category: 'poses_basic',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-hair-toss',
        name: 'Hair Toss Animation',
        text: 'Tossing hair back in slow motion, sensual movement, hair flowing dramatically, cinematic quality',
        category: 'actions_dynamic',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-walking-towards',
        name: 'Walking Towards Camera',
        text: 'Walking confidently towards camera, model strut, maintaining eye contact, powerful approach',
        category: 'poses_fashion',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-smile-develop',
        name: 'Smile Development',
        text: 'Neutral expression slowly developing into warm genuine smile, eyes brightening, engaging transformation',
        category: 'expressions',
        mediaType: 'VIDEO',
    },
]

// Helper function to get presets by category
export const getPresetsByCategory = (category: ActionCategory): ActionPreset[] => {
    return MODEL_ACTION_PRESETS.filter(preset => preset.category === category)
}

// Helper function to get presets by media type
export const getPresetsByMediaType = (mediaType: 'IMAGE' | 'VIDEO'): ActionPreset[] => {
    return MODEL_ACTION_PRESETS.filter(preset => preset.mediaType === mediaType)
}

// Get all categories with their presets
export const getGroupedPresets = (): Record<ActionCategory, ActionPreset[]> => {
    return MODEL_ACTION_PRESETS.reduce((acc, preset) => {
        if (!acc[preset.category]) {
            acc[preset.category] = []
        }
        acc[preset.category].push(preset)
        return acc
    }, {} as Record<ActionCategory, ActionPreset[]>)
}
