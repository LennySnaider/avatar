// Model Action Presets for Avatar Studio
// These are pre-defined prompts for common model poses and actions

export interface ActionPreset {
    id: string
    name: string
    text: string
    category: ActionCategory
    mediaType: 'IMAGE' | 'VIDEO'
    /**
     * Vestuario + locación concretos. SOLO los concatena el Dice (prompt
     * completo). Los chips de la librería usan `text` a secas porque se AÑADEN
     * a la escena que el usuario ya escribió — un 2º outfit ahí chocaría.
     * Sin esto el prompt queda sin ropa ni lugar y el spec del cuerpo llena el
     * vacío (los 3 motores devolvían la plantilla del Body Lab).
     */
    scene?: string
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
        text: 'Standing in a relaxed natural stance, weight shifted onto one hip, shoulders open and soft, one arm loose at her side, chin level with a calm steady gaze. Medium full shot at eye level, 85mm shallow depth of field, soft directional key light wrapping one side of the face, natural skin texture, approachable unforced mood',
        scene: 'Wearing a soft burgundy oversized knit sweater and straight-leg blue jeans, in a sunlit apartment doorway with warm wood tones behind her.',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },
    {
        id: 'pose-sitting-elegant',
        name: 'Sitting Elegant',
        text: 'Seated with poised elegance, spine long, legs crossed at the knee with the top leg angled toward camera, hands resting softly on the upper knee, shoulders drawn back. Three-quarter medium shot from a slightly low angle, 50mm lens, soft window light raking across the body to sculpt the posture, refined composed atmosphere',
        scene: 'In a tailored charcoal blazer dress, seated in a mid-century lounge chair in a gallery-white room with one sculptural plant.',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },
    {
        id: 'pose-walking-confident',
        name: 'Walking Confident',
        text: 'Caught mid-stride walking forward, one foot crossing past the other, hips leading the step, arms swinging in natural counter-rhythm, fabric and hair lifting with the motion. Full body shot at eye level, 70mm lens with a hint of motion blur in the limbs, crisp directional light, forward momentum frozen at its peak',
        scene: 'In a crisp white shirt and wide-leg charcoal trousers, crossing a city street with glass towers rising behind her.',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },
    {
        id: 'pose-leaning-wall',
        name: 'Leaning on Wall',
        text: 'Leaning casually against a vertical surface, one shoulder blade making contact, hips angled out, one knee bent with the foot flat behind her, hands relaxed. Medium full shot at eye level, 50mm lens, hard side light carving shadow along the surface behind her, effortless cool attitude and unhurried body language',
        scene: 'In a cropped leather jacket and dark denim, against a graffiti-washed brick wall in a narrow city lane.',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },
    {
        id: 'pose-power-stance',
        name: 'Power Pose',
        text: 'Standing tall in a commanding power stance, feet planted shoulder-width apart, hands firm on the hips, elbows flared, shoulders squared to the lens, chin lifted with an unwavering gaze. Full body shot from a slightly low angle, 35mm lens for presence, strong key light with deep contrast, bold authoritative mood',
        scene: 'In a sharply tailored scarlet suit, at the centre of a marble lobby with tall columns receding behind her.',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },
    {
        id: 'pose-crossed-arms',
        name: 'Arms Crossed',
        text: 'Standing with arms folded across the chest, weight even, shoulders relaxed rather than tense, head tilted a few degrees with the faintest knowing smile. Medium shot at eye level, 85mm lens, clean soft key with a subtle rim separating her from the background, self-assured quietly confident presence',
        scene: 'In a black ribbed turtleneck and slim trousers, against a deep charcoal studio wall.',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },

    // Fashion Poses
    {
        id: 'fashion-editorial',
        name: 'Editorial Pose',
        text: 'High fashion editorial posture, body angled into sharp geometry, one arm raised so the hand grazes the jaw, opposite hip pushed out, neck elongated, gaze piercing straight down the lens. Medium full shot, 85mm lens, dramatic single-source light with deeply sculpted shadow, glossy magazine finish, avant-garde and unapologetic',
        scene: 'In an architectural avant-garde gown of black silk, against raw concrete with a slash of coloured gel light.',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-casual-lifestyle',
        name: 'Casual Lifestyle',
        text: 'Relaxed candid lifestyle moment, caught mid-gesture between movements, one hand pushing hair back, body loose and unposed, weight rocking onto one foot. Medium shot at eye level, 35mm lens, warm diffused daylight with soft open shadows, fine natural film grain, effortless lived-in styling',
        scene: 'In a blue-striped linen shirt over a black bralette and white denim cutoff shorts, on a sunny cafe terrace with woven chairs.',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-over-shoulder',
        name: 'Looking Over Shoulder',
        text: 'Turned away from camera then looking back over one shoulder, spine twisting, shoulder blade lifted, chin dropping toward the deltoid, long clean neckline exposed, eyes locked sultry on the lens. Tight medium shot, 85mm lens, soft key from the front with gentle shadow falling down the back, glamorous and intimate',
        scene: 'In a backless emerald satin dress, on a dim rooftop at dusk with city bokeh glittering behind her.',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-runway-walk',
        name: 'Runway Walk',
        text: 'Mid-runway stride with one foot crossing directly in front of the other, hips swinging through the step, arms loose and swaying, fabric trailing with the momentum, expression fierce and unblinking. Full body shot from a slightly low angle, 70mm lens, crisp bright key with hard floor reflections, high fashion energy',
        scene: 'In a structured cobalt coat over sheer black tights, on a glossy white runway under bright overhead spots.',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-beauty-closeup',
        name: 'Beauty Close-up',
        text: 'Beauty close-up with both hands framing the face, fingertips barely grazing the cheekbones, lips softly parted, gaze steady and unguarded. Tight head-and-shoulders crop, 100mm macro lens, large soft frontal light with a clean catchlight in each eye, every pore and skin texture preserved, luminous and clean',
        scene: 'Bare shoulders with delicate gold jewellery, against a seamless dusty-rose backdrop.',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-dynamic-movement',
        name: 'Dynamic Movement',
        text: 'Dynamic fashion pose caught mid-movement, torso twisting as the body pivots, fabric flaring outward and hair sweeping through the air, one arm extended for counterbalance, weight suspended between steps. Full body shot, 70mm lens with a trace of motion blur at the edges, punchy directional light freezing the peak of the motion, kinetic and captivating',
        scene: 'In a pleated cherry-red midi dress that catches the air, in a sunlit plaza with pigeons scattering.',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },

    // Expressions
    {
        id: 'expr-natural-smile',
        name: 'Natural Smile',
        text: 'A genuine unforced smile that reaches the eyes, outer corners crinkling, cheeks lifting naturally, lips parted just enough to read as warmth rather than performance. Tight medium close-up, 85mm lens, soft frontal light with a warm bounce filling the shadows, honest and disarming presence',
        scene: 'In a soft sage-green cashmere sweater, in a bright kitchen with morning light across the counter.',
        category: 'expressions',
        mediaType: 'IMAGE',
    },
    {
        id: 'expr-serious-editorial',
        name: 'Serious Editorial',
        text: 'A still serious editorial expression, face neutral but the eyes carrying quiet intensity, jaw set, lips closed and relaxed, no trace of a smile. Close-up portrait, 85mm lens, single hard key raking across the cheekbone to define the bone structure, cool restrained mood, high fashion gravity',
        scene: 'In a stark black high-neck top, against a shadowed slate-grey backdrop.',
        category: 'expressions',
        mediaType: 'IMAGE',
    },
    {
        id: 'expr-candid-laugh',
        name: 'Candid Laugh',
        text: 'Caught mid-laugh, head tipping back slightly, mouth open in real laughter, eyes squeezed bright with joy, shoulders lifting with the breath. Medium close-up, 50mm lens, natural daylight with soft wraparound fill, a shade of movement in the hair, spontaneous unposed happiness',
        scene: 'In a yellow summer sundress, on a park lawn with dappled light through the trees.',
        category: 'expressions',
        mediaType: 'IMAGE',
    },
    {
        id: 'expr-mysterious-gaze',
        name: 'Mysterious Gaze',
        text: 'A slow mysterious gaze, eyelids lowered a fraction, one brow barely raised, the faintest asymmetric half-smile withheld at the corner of the mouth. Close-up, 85mm lens, moody low-key light with half the face falling into soft shadow, enigmatic and quietly magnetic',
        scene: 'In a dark velvet slip dress, in a candlelit room where most of the frame falls into deep shadow.',
        category: 'expressions',
        mediaType: 'IMAGE',
    },
    {
        id: 'expr-surprised',
        name: 'Surprised',
        text: 'A moment of genuine pleasant surprise, eyes wide, brows lifted high, lips parted mid-breath, hands not yet caught up to the reaction. Medium close-up, 50mm lens, bright even light with a lively catchlight, candid and alive, captured a half second after the realization',
        scene: 'In a bright coral blouse, in a confetti-strewn room mid-celebration with balloons out of focus.',
        category: 'expressions',
        mediaType: 'IMAGE',
    },
    {
        id: 'expr-thoughtful',
        name: 'Thoughtful',
        text: 'A quiet contemplative expression, head tilted a few degrees, gaze drifting off past the lens, lips softly closed, the smallest crease of concentration between the brows. Close-up, 85mm lens, soft directional window light coming from the side she gazes toward, introspective and unhurried',
        scene: 'In an oversized grey wool coat, beside a rain-streaked window in a quiet cafe.',
        category: 'expressions',
        mediaType: 'IMAGE',
    },

    // Dynamic Actions
    {
        id: 'action-hair-flip',
        name: 'Hair Flip',
        text: 'A hair flip at its apex, head whipping around, hair fanning out in a wide arc with individual strands separating in the air, neck exposed, expression alive with the motion. Medium full shot, 70mm lens, fast crisp light freezing every strand, a whisper of motion blur at the tips, explosive kinetic energy',
        scene: 'In a metallic silver slip dress, on a neon-washed street at night with wet asphalt reflecting the signs.',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },
    {
        id: 'action-twirling',
        name: 'Twirling in Dress',
        text: 'Mid-twirl with the body rotating, the skirt flaring into a wide circle around the legs, arms floating outward for balance, hair lifting off the shoulders, head carried into the spin with delight. Full body shot slightly below eye level, 50mm lens, bright airy light, joyful weightless movement',
        scene: 'In a full tulle skirt of lavender, in an empty ballroom with tall windows and dusty light.',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },
    {
        id: 'action-running-playful',
        name: 'Running Playfully',
        text: 'Running playfully mid-stride, both feet nearly clear of the ground, hair streaming back, clothing rippling against the body, arms pumping loosely, laughter breaking across the face. Full body tracking shot, 70mm lens with motion blur in the background, bright natural light, carefree unrestrained energy',
        scene: 'In black athletic shorts and a bright teal crop top, along a beach boardwalk with the sea behind her.',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },
    {
        id: 'action-dancing',
        name: 'Dancing Elegantly',
        text: 'Caught inside a dance movement, one arm sweeping overhead in a long unbroken line, spine arching, weight rolling through the supporting leg, fabric and hair trailing a beat behind the body. Full body shot, 50mm lens, dramatic directional light carving the silhouette, expressive fluid and artistic',
        scene: 'In a flowing burnt-orange jumpsuit, in a warehouse studio with light shafts cutting through the dust.',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },
    {
        id: 'action-jumping-joy',
        name: 'Jumping with Joy',
        text: 'Airborne at the top of a joyful jump, both feet clear of the ground, knees slightly tucked, arms thrown up and open, hair suspended in the air, face split by an unguarded grin. Full body shot from a low angle, 35mm lens, bright punchy light against open brightness, pure celebratory release',
        scene: 'In denim overalls over a white tee, on a rooftop against a wide-open blue sky.',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },
    {
        id: 'action-stretching',
        name: 'Stretching',
        text: 'Stretching with both arms extended high overhead, fingers laced, the whole body elongating into one long line, ribcage lifting, chin raised and eyes closed. Full body shot, 85mm lens, warm low side light tracing the contour of the extended silhouette, serene and quietly sensual',
        scene: 'In a sage-green ribbed activewear set, in a minimalist studio with soft morning light.',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },

    // Interactions
    {
        id: 'interact-coffee-cup',
        name: 'Holding Coffee',
        text: 'Cradling a warm cup in both hands close to the chest, steam curling upward, shoulders drawn in cozily, looking at the lens over the rim with a small private smile. Medium close-up, 50mm lens, soft morning light from the side with the steam catching the beam, intimate unhurried warmth',
        scene: 'In a chunky rust-orange cardigan, in a wood-and-brass cafe with warm lamplight.',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-reading-book',
        name: 'Reading Book',
        text: 'Absorbed in an open book held at a comfortable angle, one finger marking the page, head bowed slightly, eyes tracking the line, entirely unaware of the camera. Medium shot at eye level, 50mm lens, soft directional light falling across the pages and bouncing up onto the face, quiet intellectual calm',
        scene: 'In a soft navy knit, curled into a leather armchair in a book-lined study.',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-phone',
        name: 'Using Phone',
        text: 'Glancing down at a smartphone held in one hand, the other arm crossed loosely beneath it, weight settled on one hip, face lit faintly from below by the screen glow. Medium shot, 35mm lens, mixed ambient light with a cool screen accent, natural modern candid moment',
        scene: 'In a sleek black bomber and joggers, on a subway platform with tiled walls and cool fluorescent light.',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-sunglasses',
        name: 'With Sunglasses',
        text: 'Wearing sleek sunglasses and lowering them a fraction with one fingertip, eyes visible over the top of the frame in a direct look, chin dipped, the other hand relaxed. Medium close-up, 85mm lens, bright hard light with sharp reflections in the lenses, cool assured fashion attitude',
        scene: 'In a white linen shirt open over a black one-piece swimsuit, on a sun-blasted marina promenade with yachts behind.',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-hat',
        name: 'Touching Hat',
        text: 'Wearing a brimmed hat with one hand reaching up to tilt the brim, the face half shadowed beneath it, eyes catching the light under the edge, chin turned slightly off axis. Medium shot, 85mm lens, strong directional sun drawing a clean shadow line across the face, playful fashion-forward styling',
        scene: 'In a burgundy trench coat and wide-brim felt hat, on an autumn street with amber leaves underfoot.',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-mirror',
        name: 'Looking in Mirror',
        text: 'Facing a mirror in a private unguarded moment, one hand adjusting her hair, the reflection visible alongside her, gaze fixed on her own image rather than the camera. Medium shot framing both her and the reflection, 35mm lens, soft lamp light, intimate candid observation',
        scene: 'In deep-red silk pyjamas, at a vanity mirror ringed with warm bulbs in a dim bedroom.',
        category: 'interactions',
        mediaType: 'IMAGE',
    },

    // Studio Angles
    {
        id: 'angle-three-quarter',
        name: '3/4 View',
        text: 'Classic three-quarter angle with the body rotated forty-five degrees off axis and the face turning back toward the lens, far shoulder receding, near cheekbone catching the light. Medium shot at eye level, 85mm lens, soft key on the near side with gentle shadow on the far, flattering dimensional portrait',
        scene: 'In a deep-green satin blouse, against a rich mustard studio backdrop.',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },
    {
        id: 'angle-profile',
        name: 'Profile Shot',
        text: 'A clean full profile with the face turned ninety degrees to the lens, jawline nose and lips reading as one continuous silhouette, neck long and shoulders squared away. Close-up, 100mm lens, strong rim light separating the outline from the background, sculptural graphic composition',
        scene: 'Bare shouldered with sleek pulled-back hair, against a pure black backdrop.',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },
    {
        id: 'angle-frontal',
        name: 'Frontal Portrait',
        text: 'Direct frontal portrait, face square and symmetrical to the lens, shoulders level, eyes locked straight into the camera without deflection. Tight head-and-shoulders crop, 85mm lens, even frontal beauty light with twin catchlights, unflinching confrontational connection',
        scene: 'In a crisp white tee, against a bold cyan seamless backdrop.',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },
    {
        id: 'angle-high-angle',
        name: 'High Angle',
        text: 'Camera positioned above her eyeline looking down as she tilts her face up toward it, chin lifted, eyes wide beneath raised lashes, jaw slimmed by the perspective. Medium close-up, 50mm lens angled down, soft light falling from the camera side, doe-eyed and disarming',
        scene: 'In a lilac knit top, lying back on a bed of white linens.',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },
    {
        id: 'angle-low-angle',
        name: 'Low Angle',
        text: 'Camera set below her waistline looking up, legs and torso elongating dramatically toward the lens, chin high, the figure towering over the frame. Full body shot, 24mm wide lens for exaggerated perspective, hard light from above, imposing monumental presence',
        scene: 'In a floor-length black column gown, at the base of a grand stone staircase.',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },
    {
        id: 'angle-dutch',
        name: 'Dutch Angle',
        text: 'Camera rolled off horizontal so the frame tilts on a diagonal, her body cutting across the composition at an angle, verticals leaning, balance deliberately unsettled. Medium full shot, 35mm lens tilted, contrasty directional light, edgy destabilized artistic tension',
        scene: 'In an oversized plaid shirt and chunky boots, in a graffiti-covered underpass.',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },

    // Video-specific actions
    {
        id: 'video-slow-turn',
        name: 'Slow Turn',
        text: 'She turns slowly from full profile around to face the camera, the rotation carried by the shoulders first with the head following a beat later, hair swinging softly across the shoulder, eyes finding the lens at the end and holding. Smooth continuous motion, locked-off camera, 85mm, soft directional light, unhurried cinematic pacing',
        scene: 'In an emerald silk gown, in a softly lit hotel suite with sheer curtains.',
        category: 'poses_basic',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-hair-toss',
        name: 'Hair Toss Animation',
        text: 'She tosses her hair back in slow motion, head sweeping up and around, strands lifting and separating through the air before settling across the shoulders, chin rising as her eyes return to the lens. Slow motion capture, subtle push-in, crisp light freezing each strand, sensual cinematic quality',
        scene: 'In a black halter dress, on a nightclub floor under moving coloured lights.',
        category: 'actions_dynamic',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-walking-towards',
        name: 'Walking Towards Camera',
        text: 'She walks directly toward the camera with a measured runway strut, hips rolling through each step, arms swinging loose, hair and clothing moving with the rhythm, gaze locked forward the entire time. Camera tracking backward to hold the framing, 50mm, bright directional light, powerful confident approach',
        scene: 'In a navy trench over a deep-red slip, on a wide boulevard at golden hour.',
        category: 'poses_fashion',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-smile-develop',
        name: 'Smile Development',
        text: 'Her neutral expression slowly blooms into a genuine smile, the eyes lighting first, then the cheeks lifting and the lips parting, the whole transformation unfolding over several seconds without a break. Tight close-up, locked-off camera, 85mm, soft frontal light, intimate emotional shift',
        scene: 'In a soft teal knit, in a bright airy room with a large window behind her.',
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
