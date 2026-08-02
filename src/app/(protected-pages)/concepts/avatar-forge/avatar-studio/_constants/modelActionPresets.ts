// Model Action Presets for Avatar Studio
// These are pre-defined prompts for common model poses and actions

import type { SpicyTier } from '@/utils/spicyTiers'

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
    /**
     * 🌶️ Picante. Igual que en los prompts guardados, el default es OCULTO: el
     * drawer solo los muestra con el toggle NSFW encendido y el Dice 🎲 los
     * excluye salvo que se le pidan explícitamente. Es un flag aparte de
     * `category` a propósito — mañana puede haber un preset picante que viva en
     * `actions_dynamic`, y el gate debe seguir dependiendo del flag.
     */
    nsfw?: boolean
    /**
     * Tramo de intensidad al que pertenece la POSE. El slider 🌶️ reescribe el
     * VESTUARIO por tramo (`spicyTier.wardrobe`) pero no toca la pose — por eso
     * una acción de `explicit` no sirve de `lingerie` y hay que declararlo.
     *
     * La clave se importa de `@/utils/spicyTiers` en vez de redeclararse: con
     * dos copias de los tramos, la etiqueta de la UI y el comportamiento se
     * desincronizan en cuanto alguien mueva una frontera (la misma deriva que
     * ya costó las bandas de cm contra los niveles).
     */
    tier?: SpicyTier['key']
}

export type ActionCategory =
    | 'poses_basic'
    | 'poses_fashion'
    | 'expressions'
    | 'actions_dynamic'
    | 'interactions'
    | 'studio_angles'
    | 'spicy'

export const ACTION_CATEGORIES: Record<ActionCategory, { label: string; icon: string }> = {
    poses_basic: { label: 'Basic Poses', icon: 'pose' },
    poses_fashion: { label: 'Fashion Poses', icon: 'fashion' },
    expressions: { label: 'Expressions', icon: 'expression' },
    actions_dynamic: { label: 'Dynamic Actions', icon: 'action' },
    interactions: { label: 'Interactions', icon: 'interaction' },
    studio_angles: { label: 'Studio Angles', icon: 'camera' },
    spicy: { label: 'Spicy 🌶️', icon: 'flame' },
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

    {
        id: 'pose-floor-sit',
        name: 'Floor Sit',
        text: 'Sitting directly on the floor with the legs folded to one side, one hand planted behind the hip taking the weight, the opposite shoulder dropping so the torso spirals gently toward the lens, chin following the twist. Full body shot from a low seated eye level, 35mm lens, broad soft toplight pooling on the floor around her, grounded relaxed intimacy',
        scene: 'In a cream ribbed knit dress, on pale oak floorboards in an empty loft with one tall window.',
        category: 'poses_basic',
        mediaType: 'IMAGE',
    },
    {
        id: 'pose-low-crouch',
        name: 'Low Crouch',
        text: 'Dropped into a deep crouch with both heels flat, knees wide, forearms resting across the thighs and hands hanging loose between them, spine long, eyes lifting straight into the lens from below her usual height. Full body shot at her seated eye level, 35mm lens, hard overhead light with a clean shadow pooling beneath her, streetwear attitude and coiled stillness',
        scene: 'In a boxy grey hoodie, cargo trousers and white sneakers, on a rooftop stairwell landing with painted concrete.',
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

    {
        id: 'fashion-backlit-silhouette',
        name: 'Backlit Silhouette',
        text: 'Standing against a bright source directly behind her so the body reads as a clean dark shape with light spilling around every edge, arms held slightly away from the torso to keep the outline separated, hair lit into a bright halo of individual strands, face turned into the last of the fill. Full body contre-jour shot, 85mm lens flaring gently, deep silhouette with a soft bounce lifting the front, graphic and cinematic',
        scene: 'In a long chiffon slip dress that goes translucent in the light, in a doorway opening onto a white overcast sky.',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-street-flash',
        name: 'Street Style Flash',
        text: 'Caught mid-step by a direct on-camera flash the way a street photographer would take it, one hand lifting toward the lens in a half-shielding gesture, body still angled forward in the walk, expression caught between surprise and amusement. Medium full shot at eye level, 28mm lens, hard frontal flash blowing the foreground bright while the street behind falls into deep night, raw paparazzi immediacy',
        scene: 'In a cropped faux-fur coat over a black slip and knee boots, on a wet city sidewalk at night outside a lit entrance.',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },
    {
        id: 'fashion-mirror-selfie',
        name: 'Mirror Selfie',
        text: 'Taking a full-length mirror selfie, the phone held at chest height partly covering the lower face, the free hand resting on the hip, weight cocked onto one leg, eyes going to her own reflection rather than the camera. Full body shot framed as the mirror sees her, 24mm phone-style perspective with mild edge distortion, everyday room light with a soft screen bounce on the chin, authentic creator-feed candour',
        scene: 'In a matching ribbed lounge set of soft caramel, in front of a leaning bedroom mirror with clothes draped on a chair behind.',
        category: 'poses_fashion',
        mediaType: 'IMAGE',
    },

    // Expressions
    {
        id: 'expr-natural-smile',
        name: 'Natural Smile',
        text: 'A genuine unforced smile that reaches the eyes, outer corners crinkling, cheeks lifting naturally, lips parted just enough to read as warmth rather than performance. Tight medium close-up, 85mm lens, soft frontal light with a warm bounce filling the shadows, honest and disarming presence',
        scene: 'In a soft sage-green cashmere sweater and dark straight-leg jeans, in a bright kitchen with morning light across the counter.',
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
        scene: 'In a bright coral blouse and white trousers, in a confetti-strewn room mid-celebration with balloons out of focus.',
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

    {
        id: 'expr-challenging-smirk',
        name: 'Challenging Smirk',
        text: 'One corner of the mouth pulling into a slow crooked smirk while a single brow arches, chin dropping a fraction so the eyes come up under the lashes, the look holding a beat too long as if she has just been dared. Close-up, 85mm lens, crisp key from high and to one side with the smirking half of the mouth catching the light, teasing and quietly combative',
        scene: 'In a black leather blazer over bare skin, against a deep oxblood wall in a dim bar.',
        category: 'expressions',
        mediaType: 'IMAGE',
    },
    {
        id: 'expr-blown-kiss',
        name: 'Blowing a Kiss',
        text: 'Lips pursed against her own fingertips with the hand caught mid-flight away from the mouth, palm opening toward the lens, eyes crinkled bright above the gesture, shoulders lifted playfully. Medium close-up, 50mm lens, soft frontal beauty light with a warm bounce under the chin, affectionate flirtatious charm sent straight down the barrel',
        scene: 'In a red knit cardigan worn off one shoulder, against a soft blush-pink backdrop with heart bokeh behind.',
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
        scene: 'In a fitted white bodice and full tulle skirt of lavender, in an empty ballroom with tall windows and dusty light.',
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

    {
        id: 'action-water-splash',
        name: 'Water Splash',
        text: 'Rising out of waist-deep water and throwing her head back so the soaked hair whips into a long arc, a sheet of droplets flung off the ends and hanging frozen in the air, both hands sweeping the hair away from the face, water sheeting down the shoulders. Medium full shot at water level, 70mm lens, hard low sun turning every droplet into a bright bead, exhilarated and cinematic',
        scene: 'In a black high-cut one-piece swimsuit, waist deep in a turquoise sea at golden hour.',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },
    {
        id: 'action-boxing-combo',
        name: 'Boxing Combo',
        text: 'Mid-combination on the heavy bag with the rear hand landing and the bag deforming under the glove, front shoulder tucked to the chin, hips rotated fully through the punch, back heel lifted, breath held and jaw set. Medium full shot from a low angle, 50mm lens with a trace of blur in the striking arm, hard side light picking out sweat and chalk dust in the air, raw athletic power',
        scene: 'In a cropped black training top, high-waisted shorts and red wraps, in a dim old gym with a single caged lamp overhead.',
        category: 'actions_dynamic',
        mediaType: 'IMAGE',
    },

    // Interactions
    {
        id: 'interact-coffee-cup',
        name: 'Holding Coffee',
        text: 'Cradling a warm cup in both hands close to the chest, steam curling upward, shoulders drawn in cozily, looking at the lens over the rim with a small private smile. Medium close-up, 50mm lens, soft morning light from the side with the steam catching the beam, intimate unhurried warmth',
        scene: 'In a chunky rust-orange cardigan over a white tee with blue jeans, in a wood-and-brass cafe with warm lamplight.',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-reading-book',
        name: 'Reading Book',
        text: 'Absorbed in an open book held at a comfortable angle, one finger marking the page, head bowed slightly, eyes tracking the line, entirely unaware of the camera. Medium shot at eye level, 50mm lens, soft directional light falling across the pages and bouncing up onto the face, quiet intellectual calm',
        scene: 'In a soft navy knit and grey lounge trousers, curled into a leather armchair in a book-lined study.',
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

    {
        id: 'interact-car-hood',
        name: 'Leaning on Car',
        text: 'Perched back against the front wing of a car with both palms braced on the metal behind her, hips pushed forward off the panel, one ankle crossed over the other, head tipped back a few degrees with a level unbothered look. Full body shot from a slightly low angle, 35mm lens, low sun raking along the bodywork and throwing a long reflection under her, road-trip cool',
        scene: 'In a white ribbed tank, faded straight-leg denim and tan boots, against a dusty vintage convertible on an empty desert highway.',
        category: 'interactions',
        mediaType: 'IMAGE',
    },
    {
        id: 'interact-with-dog',
        name: 'With a Dog',
        text: 'Crouched down beside a large dog with one arm looped around its chest and the other scratching under its jaw, her cheek almost touching its head, both of them turning toward the lens at the same instant, her laughter caught in motion. Medium full shot at their shared eye level, 50mm lens, warm low backlight edging both silhouettes with soft haze, easy affectionate companionship',
        scene: 'In a chunky oatmeal sweater and dark leggings, on an autumn park path with a golden retriever, leaves scattered underfoot.',
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
        scene: 'In a lilac knit top and matching shorts, lying back on a bed of white linens.',
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
        scene: 'In an oversized plaid shirt, black denim shorts and chunky boots, in a graffiti-covered underpass.',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },

    {
        id: 'angle-overhead-topdown',
        name: 'Overhead Top-Down',
        text: 'Camera mounted directly overhead pointing straight down while she lies on her back looking up into it, hair fanned out around the head like a corona, arms floating loose at her sides, one knee drawn up, the whole body reading as a flat graphic shape against the surface. Full body top-down shot, 35mm lens perfectly perpendicular, even soft light with a faint shadow halo beneath her, dreamlike and composed',
        scene: 'In a pale blue slip dress, lying on white linen sheets scattered with loose petals.',
        category: 'studio_angles',
        mediaType: 'IMAGE',
    },
    {
        id: 'angle-through-wet-glass',
        name: 'Through Wet Glass',
        text: 'Photographed from outside through a rain-beaded pane so the droplets sit sharp in the foreground and her face falls a touch softer behind them, one palm pressed flat against the glass, forehead close to it, gaze going through the water toward the lens. Medium close-up, 85mm lens focused on the glass so the beads read crisp, cool ambient daylight with warm lamplight behind her, wistful separated intimacy',
        scene: 'In a heather-grey sweatshirt, behind the rain-streaked window of a warmly lit apartment at dusk.',
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
        scene: 'In a soft teal knit and high-waisted jeans, in a bright airy room with a large window behind her.',
        category: 'expressions',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-rise-from-seat',
        name: 'Rise from Seat',
        text: 'She pushes up out of a low chair in one unbroken movement, the weight rolling forward over the feet, the head rising last, one hand smoothing the front of the garment as she reaches full height and settles her eyes on the lens. Single continuous take, camera tilting up to follow her, 50mm, soft window light from the side, unhurried grounded poise',
        scene: 'In a camel wrap coat over a black turtleneck, in a quiet hotel lobby with leather seating.',
        category: 'poses_basic',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-wind-machine',
        name: 'Wind Machine',
        text: 'A steady wind hits her from the front so the hair streams back in continuous ribbons and the fabric ripples flat against the body then billows loose, her chin lifting into the current, eyes half closing and reopening on the lens, the whole body holding steady against the push. Locked-off camera, 85mm, hard sculpted key with deep falloff, high fashion film energy',
        scene: 'In a floor-length crimson gown with a long train, on a dark studio floor with a single beam of light.',
        category: 'poses_fashion',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-outfit-spin',
        name: 'Outfit Spin',
        text: 'She starts facing the lens, lifts her arms slightly, then turns a full slow revolution on the spot so the outfit reads from every side, the skirt or coat lifting with the rotation, coming back around to the front and finishing with a small pleased smile and a shrug of the shoulders. Continuous take, locked-off full body framing, 35mm, bright even light, playful creator-feed showcase',
        scene: 'In a pleated tartan mini skirt, cream cable-knit sweater and tall boots, in a bright bedroom with a full-length mirror.',
        category: 'poses_fashion',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-laugh-break',
        name: 'Laugh Break',
        text: 'She holds a composed expression for a moment, then the composure cracks and she breaks into real laughter, head dipping forward, one hand coming up to cover the mouth, shoulders shaking, and she looks back up at the lens still recovering with the smile lingering. Continuous take, tight medium close-up, 85mm, soft daylight with a warm bounce, candid and infectious',
        scene: 'In a white oversized shirt, at a kitchen island with morning light across the counter.',
        category: 'expressions',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-coffee-sip',
        name: 'Coffee Sip',
        text: 'She lifts a cup slowly to her lips with both hands, the steam bending as it moves, takes a sip with her eyes closing briefly, then lowers the cup and opens her eyes onto the lens with a small satisfied exhale. Continuous take, gentle push-in, 50mm, warm side light catching the steam in the beam, cosy and unhurried',
        scene: 'In a soft grey robe over pyjamas, on a couch by a rain-flecked window.',
        category: 'interactions',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-camera-orbit',
        name: 'Camera Orbit',
        text: 'She holds one still pose while the camera arcs a slow half circle around her, the background sliding past behind her as the light rolls across her face from one side to the other, her eyes tracking the lens the entire way through the move. Continuous orbiting move at a steady rate, 35mm, single hard key so the modelling shifts through the arc, sculptural and cinematic',
        scene: 'In a structured black dress, at the centre of a dark studio with one lamp on a stand.',
        category: 'studio_angles',
        mediaType: 'VIDEO',
    },
    {
        id: 'video-rain-walk',
        name: 'Rain Walk',
        text: 'She walks toward the lens through steady falling rain, water running off the hair and down the face, the soaked clothing clinging and moving with each step, hands hanging loose, her expression calm and unhurried as the drops keep landing. Camera tracking backward to hold framing, 50mm, hard backlight turning the falling rain into bright streaks, moody cinematic drama',
        scene: 'In a soaked white cotton shirt and dark jeans, on a neon-reflected street at night.',
        category: 'actions_dynamic',
        mediaType: 'VIDEO',
    },

    // 🌶️ Spicy — ocultos salvo que el toggle NSFW esté encendido, y fuera del
    // Dice 🎲 por default (ver `nsfw` en ActionPreset y getPresetsByMediaType).
    {
        id: 'spicy-lingerie-window',
        name: 'Lingerie by Window',
        text: 'Standing at a window in delicate lingerie with one forearm raised against the frame and the forehead resting on it, the opposite hip pushed out, spine curved into a long S, face turning back toward the lens under lowered lashes. Full body shot at eye level, 85mm lens, hard morning sun through half-open blinds laying bright bands and deep shadow across the skin, warm boudoir intimacy',
        scene: 'In a champagne lace bra and matching high-cut briefs, at a tall bedroom window with slatted blinds and rumpled white sheets behind.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'lingerie',
    },
    {
        id: 'spicy-bedsheet-wrap',
        name: 'Bedsheet Wrap',
        text: 'Kneeling upright on a bed with a loose sheet gathered against the chest and held in one fist, the fabric falling open down the back and pooling around the knees, the free hand pushing tousled hair off the face, gaze soft and just-woken. Medium full shot from a low kneeling eye level, 50mm lens, soft overcast window light wrapping the shoulders, tender morning-after intimacy',
        scene: 'In nothing but a crumpled white linen sheet, on an unmade bed in a bright minimal bedroom.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'lingerie',
    },
    {
        id: 'spicy-robe-off-shoulder',
        name: 'Robe Off Shoulder',
        text: 'Wearing a silk robe that has slipped down off one shoulder and hangs open at the front, the belt loose in one hand, the other arm crossing low over the waist, weight settled into one hip, chin dipped with a slow half-lidded look. Medium full shot, 85mm lens, low warm lamplight from one side with the silk catching a soft sheen, languid private glamour',
        scene: 'In a deep-emerald short silk robe over matching briefs, in a dim hotel room with a single bedside lamp.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'lingerie',
    },
    {
        id: 'spicy-steamed-glass',
        name: 'Steamed Shower Glass',
        text: 'Standing behind a fogged shower panel so the figure reads as a soft blurred shape through the condensation, one palm dragged down the glass leaving a clear streak that reveals a sharp band of wet skin and the eyes looking through it. Medium full shot, 50mm lens focused on the glass surface, warm bathroom light diffusing through the steam, suggestive and half-hidden',
        scene: 'Bare behind a steamed glass shower screen in a dark tiled bathroom with a warm ceiling light.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'topless',
    },
    {
        id: 'spicy-wet-shirt-pool',
        name: 'Wet Shirt Poolside',
        text: 'Sitting on the pool edge with the legs in the water to mid-calf, a soaked white shirt clinging translucent to the torso, leaning back on both straightened arms so the chest lifts and the head tips back toward the sun, hair dripping down the spine. Full body shot from water level, 35mm lens, hard midday sun with bright caustics rippling across the skin, sun-drenched and sultry',
        scene: 'In a soaked oversized white cotton shirt over a black bikini bottom, at the edge of a turquoise infinity pool at noon.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'suggestive',
    },
    {
        id: 'spicy-stockings-vanity',
        name: 'Stockings at the Vanity',
        text: 'Perched on a vanity stool with one leg lifted onto the seat edge, both hands rolling a sheer stocking up along the calf toward the thigh, spine curved forward over the movement, eyes flicking up to the lens mid-task. Medium full shot from a low angle, 85mm lens, warm bulb light from the mirror throwing a soft glare along the leg, retro boudoir ritual',
        scene: 'In a black lace balconette set with a garter belt and sheer stockings, at a bulb-lit vanity in a dim dressing room.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'lingerie',
    },
    {
        id: 'spicy-bare-back-arch',
        name: 'Bare Back Arch',
        text: 'Lying face down on the bed with the upper body propped on both forearms, the whole back bare and arching so the shoulder blades draw together and the spine hollows, ankles crossed and lifted in the air, face turning back over one shoulder toward the lens. Full body shot from a low side angle, 85mm lens, single warm side light raking along the spine to carve every contour, sculptural and unmistakably intimate',
        scene: 'Bare with a sheet draped low across the hips, on dark charcoal bedding in a shadowed room.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'topless',
    },
    {
        id: 'spicy-oversized-shirt-morning',
        name: 'His Shirt, Morning',
        text: 'Standing in a kitchen wearing only an oversized unbuttoned mens shirt that hangs to mid-thigh, one hip leaning on the counter edge, bare legs crossed at the ankle, one hand holding a mug and the other tugging the collar closed, a sleepy amused look thrown at the lens. Full body shot, 35mm lens, bright morning backlight flaring past her and turning the shirt fabric luminous, cosy and quietly suggestive',
        scene: 'In an oversized pale-blue mens dress shirt worn open, in a sunlit kitchen with a coffee pot on the counter.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'suggestive',
    },
    {
        id: 'spicy-video-strap-slip',
        name: 'Strap Slip',
        text: 'She holds the lens with a steady look, then lifts one hand and slides a thin strap slowly off the shoulder, the fabric easing down the upper arm as her chin turns toward the bared shoulder and her eyes come back up at the end of the movement. Single continuous take, locked-off medium close-up, 85mm, warm low key light with deep shadow behind, slow deliberate tease',
        scene: 'In a black satin slip with fine straps, on the edge of a bed in a dim room lit by one warm lamp.',
        category: 'spicy',
        mediaType: 'VIDEO',
        nsfw: true,
        tier: 'lingerie',
    },
    {
        id: 'spicy-video-robe-turn',
        name: 'Robe Turn',
        text: 'She stands with her back to the lens in an open silk robe, the fabric hanging off both shoulders to reveal the full bare back, then turns her upper body slowly around toward the camera while one hand gathers the robe closed across the front, finishing with her eyes on the lens over the shoulder. Single continuous take, slow push-in, 85mm, soft warm side light travelling across the spine as she rotates, languid and cinematic',
        scene: 'In a long ivory silk robe worn off the shoulders, in a candlelit bedroom with sheer curtains behind.',
        category: 'spicy',
        mediaType: 'VIDEO',
        nsfw: true,
        tier: 'lingerie',
    },

    // 🌶️ suggestive — sigue VESTIDA. La pose insinúa; la ropa no se quita.
    {
        id: 'spicy-hem-lift-glance',
        name: 'Hem Lift Glance',
        text: 'Standing with the weight on one hip, one hand gathering the hem of the dress a few inches up the outer thigh while the other rests flat on the opposite hip, the shoulder nearest the lens dropping so the collarbone catches the light, chin tucked and eyes lifting over it. Medium full shot at eye level, 85mm lens, warm low sun raking across the front of the body, playful restrained invitation',
        scene: 'In a fitted ribbed midi dress, in a doorway with late afternoon sun spilling across the floor.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'suggestive',
    },
    {
        id: 'spicy-collar-tug',
        name: 'Collar Tug',
        text: 'Seated leaning forward with the forearms braced on the thighs, one finger hooked into the neckline and drawing it a little away from the skin, the opposite hand pushing the hair back off the temple, gaze steady and level into the lens under a slight brow lift. Medium close-up from a fraction below eye level, 50mm lens, single warm key from the side leaving the far cheek in shadow, direct and unhurried',
        scene: 'In a soft grey scoop-neck knit, perched on the edge of a low sofa in a dim living room.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'suggestive',
    },
    {
        id: 'spicy-video-shirt-unbutton',
        name: 'Slow Unbutton',
        text: 'She works the top two buttons of the shirt open with unhurried fingers, the fabric parting just past the collarbone, then flattens her palm over her sternum and lets it slide down to rest at the waist, eyes holding the lens the whole way. Single continuous take, locked-off frame, 50mm, soft frontal key with a gentle falloff, deliberate and teasing',
        scene: 'In a crisp oversized white shirt, standing against a plain warm-grey wall.',
        category: 'spicy',
        mediaType: 'VIDEO',
        nsfw: true,
        tier: 'suggestive',
    },
    {
        id: 'spicy-video-hip-sway-turn',
        name: 'Hip Sway Turn',
        text: 'She rocks her weight slowly from one hip to the other, hands skimming down the outside of the thighs and back up to the waist, then turns a half step away and looks back over the shoulder with the chin low. Single continuous take, slow orbit around her, 85mm, warm practical light behind catching the edge of the silhouette, languid confident rhythm',
        scene: 'In a slinky satin slip dress, in a dim hallway lit by one warm sconce.',
        category: 'spicy',
        mediaType: 'VIDEO',
        nsfw: true,
        tier: 'suggestive',
    },

    // 🌶️ topless — pecho descubierto, la parte de abajo se queda puesta.
    {
        id: 'spicy-forearm-cover-sit',
        name: 'Forearm Cover',
        text: 'Sitting upright on the edge of the bed with the top removed, one forearm laid horizontally across the chest to cover while the opposite hand braces on the mattress beside the hip, spine long, shoulders rolled back, head tipped a few degrees with a calm direct gaze. Medium shot at eye level, 85mm lens, soft window light from the side sculpting the ribs and the line of the waist, composed and unashamed',
        scene: 'Topless in high-waisted black briefs, on the edge of an unmade bed in a bright bare room.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'topless',
    },
    {
        id: 'spicy-hands-cup-chest',
        name: 'Hands to Chest',
        text: 'Kneeling upright with both hands cupped over the bare chest, fingers spread and relaxed rather than gripping, elbows drawn in close to the ribs, shoulders lifted slightly, chin dipped and eyes raised into the lens through the lashes. Medium close-up at chest height, 85mm lens, warm low key light from one side with deep shadow filling the opposite ribs, intimate and self-possessed',
        scene: 'Topless in sheer black briefs, kneeling on dark rumpled bedding in a shadowed room.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'topless',
    },
    {
        id: 'spicy-back-arch-overhead',
        name: 'Arched, Arms Overhead',
        text: 'Lying back across the bed with the spine arched off the sheets, both arms stretched overhead and the wrists loosely crossed, the bare chest lifted with the arch, one knee folded up and falling open, head tipped back so the throat is long and the face comes to the lens upside down. Full body shot from directly above, 35mm lens, soft overhead light pooling down the centre of the body, languid and unguarded',
        scene: 'Topless in a thin gold hip chain and briefs, across white sheets in a sunlit bedroom.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'topless',
    },
    {
        id: 'spicy-video-top-slip-off',
        name: 'Top Slips Away',
        text: 'She eases both straps off her shoulders and lets the top fall away from the chest, catching it briefly against her stomach before setting it aside, then draws one hand slowly up her ribs to rest flat below the collarbone, eyes coming back to the lens. Single continuous take, slow push-in to a medium shot, 85mm, warm side key travelling across the bare skin as she moves, unhurried and intimate',
        scene: 'In a fine-strap camisole over briefs, seated on a low stool in a dim warm-lit room.',
        category: 'spicy',
        mediaType: 'VIDEO',
        nsfw: true,
        tier: 'topless',
    },

    // 🌶️ explicit — desnudo completo. La pose es el contenido, no el vestuario.
    {
        id: 'spicy-nude-kneel-thigh-hand',
        name: 'Kneeling, Hand on Thigh',
        text: 'Kneeling upright and fully bare with the thighs slightly apart, one hand spread flat high on the inner thigh and the other pushing the hair back off the face, spine stacked tall, shoulders open, chin level with a steady unbroken gaze into the lens. Full body shot at kneeling eye level, 85mm lens, warm single-source key from the side leaving one half of the body in soft shadow, confident and deliberate',
        scene: 'Fully bare on dark rumpled bedding in a warm shadowed bedroom lit by one lamp.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'explicit',
    },
    {
        id: 'spicy-nude-breast-cup-mirror',
        name: 'Mirror, Hand to Breast',
        text: 'Standing bare in front of a full-length mirror in three-quarter profile, one hand lifted to cup and lightly lift the near breast with the thumb resting below it, the other hand flat on the lower belly, hip pushed toward the glass, eyes meeting her own reflection rather than the lens. Full body shot catching both her and the reflection, 50mm lens, warm bedside lamp behind creating a soft rim down the front of the body, private and absorbed',
        scene: 'Fully bare before a leaning full-length mirror in a dim bedroom with one warm lamp.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'explicit',
    },
    {
        id: 'spicy-nude-supine-hand-trail',
        name: 'Lying Back, Hand Trailing',
        text: 'Lying back across the sheets fully bare, one knee raised and falling outward, the near hand trailing slowly down the centre of the body from between the breasts to rest low on the belly, the far arm folded under the head, lips parted and eyes half-closed toward the lens. Full body shot from a high three-quarter angle, 35mm lens, soft morning window light washing along the length of the body, languid and unhurried',
        scene: 'Fully bare across pale crumpled sheets in a bright minimal bedroom.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'explicit',
    },
    {
        id: 'spicy-nude-shower-wall',
        name: 'Against the Wet Wall',
        text: 'Standing bare under running water with the shoulder blades pressed back against wet tile, the head tipped back into the spray with the throat exposed, one hand smoothing water back through the hair and the other flat against the wall at hip height, one knee bent with the foot braced on the tile. Full body shot at eye level, 50mm lens, hard overhead light catching the running water and the wet sheen along the body, steamy and charged',
        scene: 'Fully bare under a running shower in a dark tiled bathroom with warm overhead light.',
        category: 'spicy',
        mediaType: 'IMAGE',
        nsfw: true,
        tier: 'explicit',
    },
    {
        id: 'spicy-video-nude-sheet-drop',
        name: 'Sheet Drops',
        text: 'She stands holding a sheet against her chest, holds the lens for a beat, then opens her fingers and lets the fabric fall away down her body to pool at her feet, drawing both hands slowly up her sides to rest at her ribs as she settles fully bare. Single continuous take, static frame, 85mm, warm low side key sweeping across the body as the sheet falls, slow and deliberate',
        scene: 'Holding a white linen sheet in a warm dim bedroom with a lamp behind.',
        category: 'spicy',
        mediaType: 'VIDEO',
        nsfw: true,
        tier: 'explicit',
    },
    {
        id: 'spicy-video-nude-turn-reveal',
        name: 'Turn and Settle',
        text: 'She stands fully bare with her back to the lens, rolls her shoulders once, then turns through profile to face front, one hand rising to rest across the collarbone and the other settling low on the hip as she comes to stillness with her eyes on the lens. Single continuous take, slow push-in from full body to medium, 85mm, warm rim light behind tracing the silhouette as she rotates into a soft frontal key, cinematic and composed',
        scene: 'Fully bare in a warm candlelit bedroom with sheer curtains behind.',
        category: 'spicy',
        mediaType: 'VIDEO',
        nsfw: true,
        tier: 'explicit',
    },
]

// Helper function to get presets by category
export const getPresetsByCategory = (
    category: ActionCategory,
    includeNsfw = false,
): ActionPreset[] => {
    return MODEL_ACTION_PRESETS.filter(
        preset =>
            preset.category === category && (includeNsfw || !preset.nsfw),
    )
}

/**
 * Helper function to get presets by media type. El 🌶️ queda FUERA salvo que se
 * pida — el Dice 🎲 llama a esto sin flag, así que un click al azar sigue sin
 * poder soltar un prompt picante de sorpresa.
 */
export const getPresetsByMediaType = (
    mediaType: 'IMAGE' | 'VIDEO',
    includeNsfw = false,
): ActionPreset[] => {
    return MODEL_ACTION_PRESETS.filter(
        preset =>
            preset.mediaType === mediaType && (includeNsfw || !preset.nsfw),
    )
}

// Get all categories with their presets
export const getGroupedPresets = (includeNsfw = false): Record<ActionCategory, ActionPreset[]> => {
    return MODEL_ACTION_PRESETS.filter(
        preset => includeNsfw || !preset.nsfw,
    ).reduce((acc, preset) => {
        if (!acc[preset.category]) {
            acc[preset.category] = []
        }
        acc[preset.category].push(preset)
        return acc
    }, {} as Record<ActionCategory, ActionPreset[]>)
}
