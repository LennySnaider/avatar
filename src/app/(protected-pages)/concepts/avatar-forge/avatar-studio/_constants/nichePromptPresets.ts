// Niche Prompt Packs for Avatar Studio
// Prompts completos por nicho/categoría de contenido (Sweet Girl, GFE, etc.).
// A diferencia de los Action Presets (que se AÑADEN al prompt actual), estos
// REEMPLAZAN el prompt: son escenas completas con outfit + pose + locación +
// luz + cámara. La identidad del avatar la aporta el Identity Lock / referencia,
// por eso ningún preset describe rasgos físicos del personaje.

export interface NichePreset {
    id: string
    name: string
    text: string
    niche: NicheCategory
    mediaType: 'IMAGE' | 'VIDEO'
    /** 🌶️ Mismo gate que el resto de la librería: oculto salvo toggle NSFW. */
    nsfw?: boolean
}

export type NicheCategory =
    | 'sweet_girl'
    | 'gfe'
    | 'dark_gothic'
    | 'fitness'
    | 'baddie_glam'
    | 'egirl_alt'
    | 'boudoir'
    | 'lingerie'

export const NICHE_CATEGORIES: Record<NicheCategory, { label: string; icon: string }> = {
    sweet_girl: { label: 'Sweet Girl', icon: 'heart' },
    gfe: { label: 'GFE', icon: 'chat' },
    dark_gothic: { label: 'Dark / Gothic', icon: 'moon' },
    fitness: { label: 'Fitness', icon: 'barbell' },
    baddie_glam: { label: 'Baddie / Glam', icon: 'diamond' },
    egirl_alt: { label: 'E-girl / Alt', icon: 'gamepad' },
    boudoir: { label: 'Boudoir 🌶️', icon: 'bed' },
    lingerie: { label: 'Lingerie 🌶️', icon: 'butterfly' },
}

export const NICHE_PROMPT_PRESETS: NichePreset[] = [
    // ── Sweet Girl ──────────────────────────────────────────────
    {
        id: 'sweet-windowsill-morning',
        name: 'Windowsill Morning',
        text: 'Soft smile, wearing a pastel pink knit cardigan over a white sundress, sitting on a windowsill hugging a plush pillow, golden morning light through sheer curtains in a cozy bedroom, 85mm portrait, shallow depth of field',
        niche: 'sweet_girl',
        mediaType: 'IMAGE',
    },
    {
        id: 'sweet-milkshake-cafe',
        name: 'Milkshake Café',
        text: 'Playful laugh, in an oversized cream sweater and denim shorts, holding a strawberry milkshake with two hands, pastel cafe interior, soft diffused daylight, candid shot with fine film grain',
        niche: 'sweet_girl',
        mediaType: 'IMAGE',
    },
    {
        id: 'sweet-cherry-blossom',
        name: 'Cherry Blossom Walk',
        text: 'Shy glance over the shoulder, wearing a floral midi dress, walking through a cherry blossom park with petals falling, dreamy backlight, bokeh background, 50mm lens',
        niche: 'sweet_girl',
        mediaType: 'IMAGE',
    },
    {
        id: 'sweet-picnic-meadow',
        name: 'Picnic Meadow',
        text: 'Sitting cross-legged on a picnic blanket in a gingham dress, a basket of peaches beside her, sunny meadow, warm afternoon light, wholesome vibe, high detail',
        niche: 'sweet_girl',
        mediaType: 'IMAGE',
    },
    {
        id: 'sweet-baking-cookies',
        name: 'Baking Cookies',
        text: 'Baking cookies in a bright kitchen with flour on her cheek, pastel apron over a casual outfit, laughing at the camera, soft window light, lifestyle photography',
        niche: 'sweet_girl',
        mediaType: 'IMAGE',
    },
    {
        id: 'sweet-reading-bed',
        name: 'Reading in Bed',
        text: 'Lying on her stomach on a fluffy bed reading a book, knee socks, fairy lights glowing in the background, warm cozy tones, top-down candid angle',
        niche: 'sweet_girl',
        mediaType: 'IMAGE',
    },
    {
        id: 'sweet-daisy-bouquet',
        name: 'Daisy Bouquet',
        text: 'Holding a bouquet of daisies covering half her face, big sparkling eyes, white blouse, pastel studio backdrop, soft beauty lighting, editorial cute',
        niche: 'sweet_girl',
        mediaType: 'IMAGE',
    },
    {
        id: 'sweet-bubble-tea',
        name: 'Bubble Tea Street',
        text: 'Sipping bubble tea on a city street in a mini skirt and cropped cardigan, one hand doing a peace sign, soft overcast light, Japanese street fashion vibe',
        niche: 'sweet_girl',
        mediaType: 'IMAGE',
    },
    {
        id: 'sweet-boardwalk-twirl',
        name: 'Boardwalk Twirl',
        text: 'Twirling in a light summer dress at golden hour on a beach boardwalk, hair flowing, subtle motion blur on the dress, joyful expression',
        niche: 'sweet_girl',
        mediaType: 'IMAGE',
    },
    {
        id: 'sweet-teddy-selfie',
        name: 'Teddy Bear Selfie',
        text: 'Hugging a giant teddy bear on a pastel couch in a silk pajama set, soft ring light glow, playful pout, Instagram selfie style, 35mm',
        niche: 'sweet_girl',
        mediaType: 'IMAGE',
    },

    // ── GFE (Girlfriend Experience) ─────────────────────────────
    {
        id: 'gfe-dinner-date-pov',
        name: 'Dinner Date POV',
        text: 'POV across the table on a dinner date, candlelight, elegant slip dress, reaching her hand toward the camera, warm restaurant ambience, intimate eye contact, 35mm',
        niche: 'gfe',
        mediaType: 'IMAGE',
    },
    {
        id: 'gfe-morning-bed-selfie',
        name: 'Morning Bed Selfie',
        text: 'Morning bed selfie POV, messy hair, oversized boyfriend shirt, sleepy smile, soft daylight through blinds, arm extended holding the phone, authentic candid feel',
        niche: 'gfe',
        mediaType: 'IMAGE',
    },
    {
        id: 'gfe-coffee-handoff',
        name: 'Coffee for You',
        text: 'Handing the camera a cup of coffee in a cozy kitchen, silk robe, affectionate gaze, morning light, shallow depth of field, homey atmosphere',
        niche: 'gfe',
        mediaType: 'IMAGE',
    },
    {
        id: 'gfe-movie-night',
        name: 'Movie Night Couch',
        text: 'Cuddled under a blanket on the couch for movie night, fairy lights, holding a popcorn bowl, looking at the camera like at a partner, warm low light, POV composition',
        niche: 'gfe',
        mediaType: 'IMAGE',
    },
    {
        id: 'gfe-video-call',
        name: 'Late Night Video Call',
        text: 'Video-call style framing, lying on a pillow in a cozy hoodie, soft bedside lamp glow, gentle smile, slightly grainy webcam aesthetic, intimate late-night vibe',
        niche: 'gfe',
        mediaType: 'IMAGE',
    },
    {
        id: 'gfe-follow-me-autumn',
        name: 'Follow Me (Autumn)',
        text: 'Walking ahead holding the viewer’s hand, look-back smile, autumn street with golden leaves, knit sweater and jeans, follow-me POV, cinematic warm grade',
        niche: 'gfe',
        mediaType: 'IMAGE',
    },
    {
        id: 'gfe-zipper-help',
        name: 'Help Me With This?',
        text: 'Mirror selfie getting ready for a date, elegant black dress half-zipped, playful “help me with this?” expression, warm bathroom vanity lights',
        niche: 'gfe',
        mediaType: 'IMAGE',
    },
    {
        id: 'gfe-shared-headphones',
        name: 'Shared Headphones',
        text: 'Sharing headphones on a train window seat, head tilted toward the camera’s shoulder, passing city lights at dusk, soft reflections, romantic travel mood',
        niche: 'gfe',
        mediaType: 'IMAGE',
    },
    {
        id: 'gfe-cooking-together',
        name: 'Cooking Together',
        text: 'Cooking dinner together POV, she feeds a spoon toward the camera, cozy apron, steam rising, warm kitchen tungsten light, laughing',
        niche: 'gfe',
        mediaType: 'IMAGE',
    },
    {
        id: 'gfe-goodnight-kiss',
        name: 'Goodnight Kiss',
        text: 'Goodnight selfie in bed under dim fairy lights, blowing a kiss to the camera, tucked under the duvet, soft warm tones, phone-camera realism',
        niche: 'gfe',
        mediaType: 'IMAGE',
    },

    // ── Dark / Gothic ───────────────────────────────────────────
    {
        id: 'goth-cathedral-candles',
        name: 'Candle-lit Cathedral',
        text: 'Black lace corset dress, choker with a silver pendant, standing in a candle-lit gothic cathedral interior, dramatic chiaroscuro lighting, dark romantic editorial, 50mm',
        niche: 'dark_gothic',
        mediaType: 'IMAGE',
    },
    {
        id: 'goth-neon-alley',
        name: 'Neon Rain Alley',
        text: 'Smoky eye makeup and dark lipstick, leather jacket over a mesh top, neon-lit rainy alley at night, purple and teal reflections on wet asphalt, moody cinematic',
        niche: 'dark_gothic',
        mediaType: 'IMAGE',
    },
    {
        id: 'goth-baroque-library',
        name: 'Baroque Library',
        text: 'Long black velvet gown, sitting on a baroque armchair in a dark mansion library, moonlight through a tall window, ravens motif, painterly atmosphere',
        niche: 'dark_gothic',
        mediaType: 'IMAGE',
    },
    {
        id: 'goth-black-rose',
        name: 'Black Rose Fog',
        text: 'Silver jewelry and a black slip dress, holding a single black rose, fog rolling over an old cemetery gate at dusk, desaturated cold palette, ethereal gothic',
        niche: 'dark_gothic',
        mediaType: 'IMAGE',
    },
    {
        id: 'goth-rooftop-alt',
        name: 'Rooftop Alt Flash',
        text: 'Alt fashion platform boots, fishnets, plaid mini skirt and band tee, sitting on a graffiti rooftop at night, city lights bokeh, direct flash photography style',
        niche: 'dark_gothic',
        mediaType: 'IMAGE',
    },
    {
        id: 'goth-veil-portrait',
        name: 'Lace Veil Portrait',
        text: 'Dramatic winged eyeliner and dark cherry lips, close-up beauty portrait under a black veil with lace detail, deep red backdrop, low-key studio lighting',
        niche: 'dark_gothic',
        mediaType: 'IMAGE',
    },
    {
        id: 'goth-victorian-candelabra',
        name: 'Victorian Candelabra',
        text: 'Victorian goth blouse with a high lace collar and cameo brooch, holding a candelabra in a dark corridor, warm candle glow against cold shadows',
        niche: 'dark_gothic',
        mediaType: 'IMAGE',
    },
    {
        id: 'goth-industrial-club',
        name: 'Industrial Club',
        text: 'Black latex-look mini dress in an industrial nightclub, red strobe light, confident stare into the lens, high contrast, editorial fashion',
        niche: 'dark_gothic',
        mediaType: 'IMAGE',
    },
    {
        id: 'goth-witchy-forest',
        name: 'Witchy Twilight Forest',
        text: 'Witchy aesthetic with a wide-brim black hat and layered dark dress, forest at twilight with fog and fireflies, mystical green-tinted light',
        niche: 'dark_gothic',
        mediaType: 'IMAGE',
    },
    {
        id: 'goth-vanity-grunge',
        name: 'Grunge Vanity',
        text: 'Sitting at a vanity with round bulbs applying black nail polish, tattoos visible, dark bedroom with posters and candles, moody grunge tones',
        niche: 'dark_gothic',
        mediaType: 'IMAGE',
    },

    // ── Fitness ─────────────────────────────────────────────────
    {
        id: 'fit-barbell-squat',
        name: 'Barbell Squat',
        text: 'Matching seamless workout set, mid squat with a barbell, industrial gym, dramatic side lighting, sweat sheen, athletic photography, 35mm',
        niche: 'fitness',
        mediaType: 'IMAGE',
    },
    {
        id: 'fit-mirror-selfie',
        name: 'Post-Workout Mirror',
        text: 'Post-workout mirror selfie in a sports bra and leggings, towel around the neck, gym mirror with equipment behind, phone flash realism',
        niche: 'fitness',
        mediaType: 'IMAGE',
    },
    {
        id: 'fit-sunrise-run',
        name: 'Sunrise Coastal Run',
        text: 'Morning run at sunrise on a coastal path, ponytail in motion, athletic shorts and top, golden rim light, dynamic action shot',
        niche: 'fitness',
        mediaType: 'IMAGE',
    },
    {
        id: 'fit-rooftop-yoga',
        name: 'Rooftop Yoga Dawn',
        text: 'Yoga pose on a rooftop at dawn in flowing athleisure, city skyline background, serene expression, soft pastel sky, wide shot',
        niche: 'fitness',
        mediaType: 'IMAGE',
    },
    {
        id: 'fit-protein-shake',
        name: 'Protein Shake Wink',
        text: 'Drinking a protein shake at the gym bar with a playful wink, fitted crop top, shallow depth of field, lifestyle candid',
        niche: 'fitness',
        mediaType: 'IMAGE',
    },
    {
        id: 'fit-boxing-bag',
        name: 'Heavy Bag Session',
        text: 'Boxing training with wrapped hands hitting a heavy bag, focused expression, gritty gym with hanging lights, high shutter action freeze',
        niche: 'fitness',
        mediaType: 'IMAGE',
    },
    {
        id: 'fit-track-stretch',
        name: 'Track Field Stretch',
        text: 'Stretching on a track field at sunset, backlight tracing an athletic silhouette, vibrant sportswear, editorial sports magazine style',
        niche: 'fitness',
        mediaType: 'IMAGE',
    },
    {
        id: 'fit-pilates-studio',
        name: 'Pilates Reformer',
        text: 'Elegant controlled pose on a pilates reformer, neutral-tone outfit, bright clean natural light in a minimalist studio',
        niche: 'fitness',
        mediaType: 'IMAGE',
    },
    {
        id: 'fit-playful-flex',
        name: 'Playful Flex',
        text: 'Flexing playfully at the camera after a set, gym gloves, confident grin, dumbbell rack in the background, punchy contrast',
        niche: 'fitness',
        mediaType: 'IMAGE',
    },
    {
        id: 'fit-summit-selfie',
        name: 'Summit Selfie',
        text: 'Outdoor hike summit selfie in leggings and a windbreaker, mountain vista behind, wind in the hair, golden hour, adventurous smile',
        niche: 'fitness',
        mediaType: 'IMAGE',
    },

    // ── Baddie / Glam ───────────────────────────────────────────
    {
        id: 'glam-rooftop-champagne',
        name: 'Rooftop Champagne',
        text: 'Bodycon satin dress, glass of champagne on a rooftop lounge at night, city skyline bokeh, confident smirk, editorial glam, 85mm',
        niche: 'baddie_glam',
        mediaType: 'IMAGE',
    },
    {
        id: 'glam-paparazzi-car',
        name: 'Paparazzi Exit',
        text: 'Designer sunglasses and an oversized blazer, stepping out of a black car, paparazzi flash style, high fashion attitude',
        niche: 'baddie_glam',
        mediaType: 'IMAGE',
    },
    {
        id: 'glam-marble-lobby',
        name: 'Marble Lobby Walk',
        text: 'Gold jewelry stack and a silk blouse, walking toward the camera through a marble hotel lobby, glossy magazine lighting, full-body shot',
        niche: 'baddie_glam',
        mediaType: 'IMAGE',
    },
    {
        id: 'glam-closet-selfie',
        name: 'Walk-in Closet Selfie',
        text: 'Mirror selfie in a walk-in closet with luxury handbags on the shelves, chic monochrome outfit, ring light reflection, influencer aesthetic',
        niche: 'baddie_glam',
        mediaType: 'IMAGE',
    },
    {
        id: 'glam-resort-pool',
        name: 'Resort Poolside',
        text: 'Poolside at a Dubai-style resort in an elegant one-piece swimsuit and sheer sarong, sun hat, turquoise water, crisp bright sunlight',
        niche: 'baddie_glam',
        mediaType: 'IMAGE',
    },
    {
        id: 'glam-private-jet',
        name: 'Private Jet Espresso',
        text: 'Private jet cabin seat in a cream co-ord set, holding an espresso, window light, quiet luxury palette, relaxed crossed legs',
        niche: 'baddie_glam',
        mediaType: 'IMAGE',
    },
    {
        id: 'glam-red-carpet',
        name: 'Red Carpet Gown',
        text: 'Red carpet gown with a high slit, jewelry sparkle, stanchion ropes and camera flashes in the background, poised over-the-shoulder pose',
        niche: 'baddie_glam',
        mediaType: 'IMAGE',
    },
    {
        id: 'glam-paris-shopping',
        name: 'Paris Shopping Haul',
        text: 'Shopping haul candid with multiple boutique bags, mini dress and heels, luxury shopping street in Paris, golden afternoon light',
        niche: 'baddie_glam',
        mediaType: 'IMAGE',
    },
    {
        id: 'glam-penthouse-dusk',
        name: 'Penthouse Dusk',
        text: 'Penthouse balcony at dusk in a silk slip dress, wind in the hair, holding a wine glass, city lights below, cinematic teal-orange grade',
        niche: 'baddie_glam',
        mediaType: 'IMAGE',
    },
    {
        id: 'glam-yacht-bow',
        name: 'Yacht Bow',
        text: 'Sitting on a yacht bow in a white linen outfit, sunglasses pushed up, Mediterranean coastline behind, breezy glamour, wide angle',
        niche: 'baddie_glam',
        mediaType: 'IMAGE',
    },

    // ── E-girl / Alt ────────────────────────────────────────────
    {
        id: 'egirl-rgb-room',
        name: 'RGB Gaming Room',
        text: 'RGB-lit gaming room, cat-ear headset and cropped hoodie, peace sign at the camera, pink and blue neon glow, desk with a mechanical keyboard, selfie angle',
        niche: 'egirl_alt',
        mediaType: 'IMAGE',
    },
    {
        id: 'egirl-split-dye',
        name: 'Split-Dye Portrait',
        text: 'Split-dyed pink and black hair, winged eyeliner with a heart stamp under the eye, close-up portrait, holographic backdrop, ring light catchlights',
        niche: 'egirl_alt',
        mediaType: 'IMAGE',
    },
    {
        id: 'egirl-led-bed',
        name: 'LED Bed Controller',
        text: 'Oversized band hoodie and pleated skirt, sitting cross-legged on a bed with LED strip lights, holding a game controller, playful tongue out',
        niche: 'egirl_alt',
        mediaType: 'IMAGE',
    },
    {
        id: 'egirl-streamer-pov',
        name: 'Streamer POV',
        text: 'Streaming setup POV with a mic arm in frame, headphones around the neck, neon room glow, laughing at chat, candid streamer aesthetic',
        niche: 'egirl_alt',
        mediaType: 'IMAGE',
    },
    {
        id: 'egirl-arcade-plushie',
        name: 'Arcade Plushie',
        text: 'Plaid skirt, chain belt and a striped long-sleeve under a black tee, arcade neon background, holding a claw-machine plushie, flash photo style',
        niche: 'egirl_alt',
        mediaType: 'IMAGE',
    },
    {
        id: 'egirl-konbini-night',
        name: 'Convenience Store Night',
        text: 'Pastel goth outfit and platform sneakers in a convenience store at night, fluorescent light contrasting with neon signs outside, Tokyo vibe',
        niche: 'egirl_alt',
        mediaType: 'IMAGE',
    },
    {
        id: 'egirl-y2k-mirror',
        name: 'Y2K Mirror Flash',
        text: 'Mirror selfie with a digital camera and flash, y2k baby tee and low-rise cargo pants, stickers on the mirror, bedroom wall covered in posters',
        niche: 'egirl_alt',
        mediaType: 'IMAGE',
    },
    {
        id: 'egirl-gloss-closeup',
        name: 'Gloss Close-up',
        text: 'Close-up applying glossy lip balm, colored contact lenses, chrome nails, vaporwave gradient background, hyper-detailed beauty shot',
        niche: 'egirl_alt',
        mediaType: 'IMAGE',
    },
    {
        id: 'egirl-desk-rgb',
        name: 'Desk & RGB Tower',
        text: 'Sitting on a desk beside a PC tower with visible RGB fans, thigh-high socks, hoodie sleeves pulled over the hands, soft purple key light, anime figurines on the shelf',
        niche: 'egirl_alt',
        mediaType: 'IMAGE',
    },
    {
        id: 'egirl-neon-ramen',
        name: 'Neon Ramen Stall',
        text: 'Late-night ramen at a neon-lit street stall, chopsticks mid-bite, choker and mesh sleeves, cyberpunk color palette, cinematic candid',
        niche: 'egirl_alt',
        mediaType: 'IMAGE',
    },

    // ── Boudoir 🌶️ ──────────────────────────────────────────────
    {
        id: 'boudoir-window-blinds',
        name: 'Morning Blinds',
        text: 'Kneeling on rumpled white sheets in a champagne silk slip, morning sun through half-open blinds laying warm bands of light and shadow across her, one strap slipping off the shoulder, gaze soft toward the lens, 85mm, intimate boudoir editorial',
        niche: 'boudoir',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'boudoir-sheet-morning',
        name: 'Sheet & Coffee',
        text: 'Sitting up in bed wrapped loosely in a white linen sheet, holding a coffee mug, tousled morning hair, soft overcast window light, tender just-woken intimacy, shallow depth of field',
        niche: 'boudoir',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'boudoir-velvet-chaise',
        name: 'Velvet Chaise',
        text: 'Reclining on a deep emerald velvet chaise longue in a black lace bodysuit, one arm draped over the backrest, warm lamplight from one side sculpting the pose, dark moody boudoir glamour, 50mm',
        niche: 'boudoir',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'boudoir-silk-robe-vanity',
        name: 'Silk Robe Vanity',
        text: 'Seated at a bulb-lit vanity in an open silk robe over a matching lace set, applying red lipstick, eyes meeting the lens through the mirror, warm retro Hollywood boudoir mood',
        niche: 'boudoir',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'boudoir-back-lace',
        name: 'Lace Back Study',
        text: 'Back to the camera showing the crossed straps of a delicate lace bralette, looking over one shoulder, hair swept to one side, single warm side light tracing the spine, sculptural low-key boudoir portrait',
        niche: 'boudoir',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'boudoir-candlelit-bed',
        name: 'Candlelit Bed',
        text: 'Lying on her side across dark satin bedding in a burgundy lace set, head propped on one hand, candlelight flickering warm across the skin, deep shadows, romantic candlelit boudoir, 85mm',
        niche: 'boudoir',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'boudoir-tulle-window',
        name: 'Sheer Curtain Light',
        text: 'Standing behind a sheer white curtain that softens her silhouette, silk slip visible through the fabric, one palm pressed lightly against the curtain, bright diffused daylight, dreamy ethereal boudoir',
        niche: 'boudoir',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'boudoir-stocking-ritual',
        name: 'Stocking Ritual',
        text: 'Perched on the edge of the bed rolling a sheer stocking up one calf, garter belt visible under a slip, warm bedside lamp glow, classic pin-up boudoir ritual, low angle, 85mm',
        niche: 'boudoir',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'boudoir-mirror-floor',
        name: 'Floor Mirror',
        text: 'Sitting on the floor in front of a leaning full-length mirror in a satin robe half open over lingerie, reflection sharing the frame, moody window light, intimate candid observation, film grain',
        niche: 'boudoir',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'boudoir-hotel-dusk',
        name: 'Hotel Room Dusk',
        text: 'Standing at a floor-to-ceiling hotel window at dusk in a short silk robe, city lights below, silhouette rimmed by the last of the daylight, glass reflection doubling her figure, cinematic boudoir at blue hour',
        niche: 'boudoir',
        mediaType: 'IMAGE',
        nsfw: true,
    },

    // ── Lingerie 🌶️ ─────────────────────────────────────────────
    {
        id: 'lingerie-black-lace-classic',
        name: 'Classic Black Lace',
        text: 'Standing pose in a black lace balconette set, one hand on the hip, weight on one leg, dark studio backdrop with a single soft key light, elegant low-key glamour, 85mm',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-red-satin-valentine',
        name: 'Red Satin Valentine',
        text: 'Kneeling on a bed scattered with rose petals in a red satin and lace set, warm romantic lamplight, playful smile toward the lens, Valentine boudoir mood, shallow depth of field',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-white-bridal',
        name: 'White Bridal Set',
        text: 'Delicate white lace bridal lingerie set with a sheer robe, standing in a bright airy bedroom with billowing curtains, soft high-key daylight, innocent romantic elegance',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-emerald-silk',
        name: 'Emerald Silk',
        text: 'Emerald silk cami and shorts set, sitting on a windowsill with one knee drawn up, golden hour light washing over her, relaxed luxurious mood, 50mm',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-garter-noir',
        name: 'Garter Noir',
        text: 'Black lace set with garter belt and sheer stockings, standing in a dim room lit by venetian-blind shadows, film noir contrast, mysterious over-the-shoulder gaze, 35mm',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-champagne-mirror',
        name: 'Champagne Mirror Selfie',
        text: 'Mirror selfie in a champagne satin set, phone at chest height, soft bedroom lamplight, authentic creator-feed styling, warm tones, candid confidence',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-mesh-bodysuit',
        name: 'Mesh Bodysuit',
        text: 'Black mesh bodysuit with structured seams, editorial standing pose against a raw concrete wall, hard directional light with deep shadow, high fashion attitude, 85mm',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-pastel-cute',
        name: 'Pastel Cute Set',
        text: 'Pastel pink cotton-and-lace set with knee socks, sitting cross-legged on a fluffy bed among plush pillows, fairy lights bokeh, playful sweet-spicy contrast, soft ring light',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-oversized-cardigan',
        name: 'Cardigan Slip',
        text: 'Chunky oversized knit cardigan worn open over a simple black lace set, standing in a cozy bedroom holding a mug, warm morning light, effortless girl-next-door tease',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-corset-baroque',
        name: 'Baroque Corset',
        text: 'Structured lace corset with boning, standing in a baroque room with gilded mirrors and candles, dramatic warm chiaroscuro, dark romantic editorial, 50mm',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-window-silhouette',
        name: 'Window Silhouette',
        text: 'Standing at a bright window in a sheer robe over a matching set, body reading as a soft backlit silhouette with light spilling around the edges, contre-jour, dreamy and suggestive',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-satin-bed-topdown',
        name: 'Satin Top-Down',
        text: 'Lying on her back on satin sheets in an ivory lace set, hair fanned out around her head, one knee drawn up, camera directly overhead, even soft light, graphic dreamy composition',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-stairs-heels',
        name: 'Staircase & Heels',
        text: 'Seated on a grand staircase in a black lace set with heels, elbows on knees, chin lifted with a level confident stare, cool marble tones against warm skin, editorial glamour',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-neon-vibe',
        name: 'Neon Room',
        text: 'Matching set under pink and blue neon light in a dark room, colored rim light tracing the figure, moody synthwave palette, edgy alt glamour, 35mm',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-silk-kimono',
        name: 'Silk Kimono',
        text: 'Floral silk kimono worn open over a black set, kneeling on a low bed in a japandi bedroom, warm paper-lantern light, serene elegant sensuality',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-golden-hour-bed',
        name: 'Golden Hour Bed',
        text: 'Sitting back on her heels on a bed in a terracotta ribbed set, golden hour sun streaming low across the room, long warm shadows, glowing skin, relaxed natural pose',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-fur-throw',
        name: 'Fur Throw Winter',
        text: 'Wrapped in a faux fur throw slipping off the shoulders over a deep plum lace set, fireplace glow in a cabin bedroom, cozy winter warmth, intimate low light',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-polaroid-flash',
        name: 'Polaroid Flash',
        text: 'Direct on-camera flash polaroid aesthetic, sitting on the edge of a bed in a simple white cotton set, slightly overexposed foreground against a dark room, raw retro intimate snapshot',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-balcony-morning',
        name: 'Balcony Morning',
        text: 'Leaning on a wrought-iron balcony railing in a slip and silk robe, holding coffee, soft Mediterranean morning light, terracotta rooftops behind, vacation-morning intimacy',
        niche: 'lingerie',
        mediaType: 'IMAGE',
        nsfw: true,
    },
    {
        id: 'lingerie-video-robe-reveal',
        name: 'Robe Reveal (Video)',
        text: 'She stands facing the lens in a long silk robe over a lace set, slowly unties the belt and lets the robe slip off one shoulder, then the other, finishing with a small smile and a tilt of the head. Single continuous take, locked-off medium shot, 85mm, warm low-key lamplight, slow deliberate tease',
        niche: 'lingerie',
        mediaType: 'VIDEO',
        nsfw: true,
    },
]

// Presets de un nicho, respetando el gate NSFW (hoy todos son SFW, pero el
// filtro queda para cuando se sumen packs 🌶️).
export const getNichePresets = (
    niche: NicheCategory,
    includeNsfw = false,
): NichePreset[] => {
    return NICHE_PROMPT_PRESETS.filter(
        (preset) => preset.niche === niche && (includeNsfw || !preset.nsfw),
    )
}

export const getGroupedNichePresets = (
    includeNsfw = false,
): Record<NicheCategory, NichePreset[]> => {
    return NICHE_PROMPT_PRESETS.filter(
        (preset) => includeNsfw || !preset.nsfw,
    ).reduce(
        (acc, preset) => {
            if (!acc[preset.niche]) {
                acc[preset.niche] = []
            }
            acc[preset.niche].push(preset)
            return acc
        },
        {} as Record<NicheCategory, NichePreset[]>,
    )
}
