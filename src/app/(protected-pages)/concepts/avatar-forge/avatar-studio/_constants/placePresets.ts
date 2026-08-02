/**
 * LOCACIONES listas para el tag `[PLACE: …]`.
 *
 * POR QUÉ existe: hasta ahora el único modo de conseguir un `[PLACE:]` era
 * SUBIR una foto y hacer que Gemini la describiera (`analyzeImageForPlace` en
 * BottomControlBar). Eso obliga a tener una imagen a mano, gasta una llamada al
 * proveedor por cada sitio y depende de que Gemini esté en pie. Estas veinte se
 * aplican de un click y no llaman a nadie.
 *
 * FORMATO — el del ejemplo validado por el usuario: frases cortas separadas por
 * comas, de lo general a lo concreto (interior/exterior → tipo de espacio →
 * paleta → objetos → luz → profundidad → atmósfera). Sin verbos y sin narrativa.
 *
 * REGLA DURA: un PLACE **no describe a nadie**. Nada de "she", "her", "a woman",
 * "model". La persona la ponen el avatar y la pose; si el sitio además describe
 * un sujeto, compiten y el motor promedia (la misma sopa de órdenes que ya se
 * documentó en la investigación del clon de Wan). Hay un test que lo vigila.
 */

export interface PlacePreset {
    id: string
    name: string
    /** Descripción de la locación, SIN el envoltorio `[PLACE: …]`. */
    text: string
    category: PlaceCategory
    /** 🌶️ Mismo gate que el resto: oculto salvo toggle NSFW. */
    nsfw?: boolean
}

export type PlaceCategory = 'home' | 'luxury' | 'outdoor' | 'nightlife' | 'studio'

export const PLACE_CATEGORIES: Record<PlaceCategory, { label: string }> = {
    home: { label: 'Casa' },
    luxury: { label: 'Lujo' },
    outdoor: { label: 'Exterior' },
    nightlife: { label: 'Noche' },
    studio: { label: 'Estudio' },
}

/** Envuelve la locación en el tag que entiende el pipeline. */
export const asPlaceTag = (text: string): string => `[PLACE: ${text}]`

export const PLACE_PRESETS: PlacePreset[] = [
    // ── Casa ────────────────────────────────────────────────────
    {
        // Guardado tal cual lo pasó el usuario — es la referencia de formato
        // para todos los demás.
        id: 'place-pink-bedroom',
        name: 'Pink Bedroom',
        text: 'Indoor, bedroom, feminine aesthetic, cozy, light pink color palette, white bedding, pink throw pillow, wall-mounted floating shelves, hanging faux ivy vine, photo collage wall art, small lamp with warm glow, bedside table, minimalist room decor, pastel tones, soft diffused lighting, shallow depth of field, intimate and stylish atmosphere.',
        category: 'home',
    },
    {
        id: 'place-sunlit-kitchen',
        name: 'Sunlit Kitchen',
        text: 'Indoor, kitchen, bright and airy, warm neutral palette, white shaker cabinets, pale oak counter, open shelving with ceramic mugs, a glass jar of coffee beans, a small potted herb on the sill, hard morning sun through a large window casting sharp panes across the floor, high key exposure, crisp detail, fresh unhurried atmosphere.',
        category: 'home',
    },
    {
        id: 'place-marble-bathroom',
        name: 'Marble Bathroom',
        text: 'Indoor, bathroom, spa-like, warm ivory and veined marble palette, freestanding tub, brushed gold fixtures, a folded stack of white towels, a lit candle on the ledge, eucalyptus hanging from the shower rail, faint steam in the air, soft warm sconce light with a gentle falloff, shallow depth of field, quiet indulgent atmosphere.',
        category: 'home',
    },
    {
        id: 'place-cozy-living-night',
        name: 'Living Room, Night In',
        text: 'Indoor, living room, lived-in and cozy, deep amber and charcoal palette, a low linen sofa with rumpled throws, a coffee table with an open book and a half-full glass, string lights along the shelf, a television glow off frame, warm lamplight as the only key with deep shadow in the corners, shallow depth of field, calm late-evening atmosphere.',
        category: 'home',
    },
    {
        id: 'place-walk-in-closet',
        name: 'Walk-In Closet',
        text: 'Indoor, walk-in wardrobe, boutique styling, cream and pale wood palette, garments hung in graded colour order, a mirrored island with folded scarves, shoe shelves lit from beneath, a velvet stool, full-length mirror at the end, even warm strip lighting with soft reflections, medium depth of field, curated affluent atmosphere.',
        category: 'home',
    },
    {
        id: 'place-messy-dorm',
        name: 'Student Flat',
        text: 'Indoor, small university flat bedroom, cluttered and personal, muted warm palette, an unmade single bed against the wall, a desk buried under books and a laptop, fairy lights taped along the ceiling line, posters and polaroids covering the wall, laundry over the chair back, flat overhead ceiling light with a warm desk lamp fighting it, medium depth of field, unstyled real-life atmosphere.',
        category: 'home',
    },

    // ── Lujo ────────────────────────────────────────────────────
    {
        id: 'place-penthouse-night',
        name: 'Penthouse, City Night',
        text: 'Indoor, high-floor penthouse living space, cold and expensive, black and smoked-glass palette, floor-to-ceiling windows filled with a lit city grid, a low leather sofa, a marble bar cart with cut crystal, a single sculptural floor lamp, reflections doubling in the glass, cool ambient city light as the key with one warm practical, shallow depth of field, elevated nocturnal atmosphere.',
        category: 'luxury',
    },
    {
        id: 'place-hotel-suite-dusk',
        name: 'Hotel Suite at Dusk',
        text: 'Indoor, hotel suite, transient and elegant, warm taupe and brass palette, a large unmade bed with crisp white linen, an open suitcase on the luggage rack, heavy curtains half drawn on a dusk sky, a bedside lamp already on, a room-service tray by the door, mixed warm interior light against cool blue window light, shallow depth of field, in-between-places atmosphere.',
        category: 'luxury',
    },
    {
        id: 'place-infinity-pool',
        name: 'Infinity Pool',
        text: 'Outdoor, resort infinity pool terrace, hot and bright, turquoise and bleached-stone palette, the pool edge dissolving into a distant sea horizon, a pair of cream loungers with rolled towels, a low palm throwing hard shade, water caustics rippling across the tile, harsh overhead midday sun with strong specular glare, deep focus, languid holiday atmosphere.',
        category: 'luxury',
    },
    {
        id: 'place-yacht-deck',
        name: 'Yacht Deck',
        text: 'Outdoor, yacht foredeck, open and moving, white gelcoat and teak palette, polished stainless rails, coiled rope and a folded sun pad, deep blue open water on every side, a wake trailing behind, hard afternoon sun bouncing off the deck as a second light source, deep focus with a slight lens flare, wealthy and windswept atmosphere.',
        category: 'luxury',
    },

    // ── Exterior ────────────────────────────────────────────────
    {
        id: 'place-beach-golden-hour',
        name: 'Beach, Golden Hour',
        text: 'Outdoor, wide empty beach at golden hour, warm and hazy, amber and pale sand palette, gentle surf lines running up the shore, scattered footprints, low dune grass at the frame edge, the sun low over the water, strong warm backlight with long shadows and airborne haze, shallow depth of field, tranquil end-of-day atmosphere.',
        category: 'outdoor',
    },
    {
        id: 'place-mediterranean-balcony',
        name: 'Mediterranean Balcony',
        text: 'Outdoor, small tiled balcony over an old town, sun-bleached and warm, terracotta and whitewash palette, wrought-iron railing, a bougainvillea spilling over the wall, a bistro table with an espresso cup, terracotta rooftops stepping away below, hard late-morning sun with crisp shadow edges, medium depth of field, slow holiday-morning atmosphere.',
        category: 'outdoor',
    },
    {
        id: 'place-greenhouse',
        name: 'Botanical Greenhouse',
        text: 'Indoor, Victorian glasshouse, humid and overgrown, deep green and rusted-iron palette, tall palms and monstera crowding the path, condensation beading on the panes, a mossy stone bench, watering cans stacked in a corner, soft diffused daylight falling through fogged glass with dappled leaf shadow, shallow depth of field, lush enclosed atmosphere.',
        category: 'outdoor',
    },
    {
        id: 'place-rainy-street-night',
        name: 'Rainy Street, Night',
        text: 'Outdoor, narrow city street after rain at night, cold and cinematic, black asphalt and saturated neon palette, wet tarmac mirroring shopfront signage, puddles between cobbles, a lit convenience store across the road, steam rising from a vent, mixed magenta and cyan neon as the key with deep unlit shadow, shallow depth of field, moody nocturnal atmosphere.',
        category: 'outdoor',
    },
    {
        id: 'place-mountain-cabin',
        name: 'Cabin, Fireside',
        text: 'Indoor, timber mountain cabin, warm and enclosed, honey pine and wool palette, a stone fireplace with a live fire, a sheepskin thrown over a low armchair, snow banked against the window outside, a mug and an open book on the hearth, firelight as the flickering key against cold blue window light, shallow depth of field, insulated cosy atmosphere.',
        category: 'outdoor',
    },
    {
        id: 'place-rooftop-string-lights',
        name: 'Rooftop, String Lights',
        text: 'Outdoor, apartment rooftop terrace at night, warm and casual, amber bulb and dark-sky palette, festoon lights strung overhead in loops, mismatched garden chairs, a low table with bottles and a portable speaker, the blurred city glow beyond the parapet, warm bulb light overhead as the key with cool city ambience behind, shallow depth of field, easy sociable atmosphere.',
        category: 'outdoor',
    },

    // ── Noche ───────────────────────────────────────────────────
    {
        id: 'place-neon-club',
        name: 'Neon Club',
        text: 'Indoor, small nightclub interior, dense and loud, magenta and cyan palette, a crowded dance floor blurred in the background, a mirrored disco ball throwing moving specks, a lit bar with bottles backlit, haze thick in the beams, hard coloured spotlights cutting through smoke with heavy contrast, shallow depth of field, charged nocturnal atmosphere.',
        category: 'nightlife',
        nsfw: true,
    },
    {
        id: 'place-dive-bar-bathroom',
        name: 'Dive Bar Bathroom',
        text: 'Indoor, cramped bar bathroom, grimy and characterful, cold tile and sticker-covered palette, a spotted mirror above a chipped basin, graffiti layered on the cubicle door, a bare bulb overhead, crumpled paper towels in the corner, harsh unflattering top light with hard shadow under everything, medium depth of field, late-night unpolished atmosphere.',
        category: 'nightlife',
        nsfw: true,
    },
    {
        id: 'place-retro-motel',
        name: 'Retro Motel Room',
        text: 'Indoor, roadside motel room, dated and cinematic, teal and burnt-orange palette, a low double bed with a patterned coverlet, wood-veneer headboard, a boxy television on a dresser, a neon vacancy sign bleeding red through the blinds, an ice bucket on the side table, mixed warm lamp light against cold neon window spill, shallow depth of field, transient Americana atmosphere.',
        category: 'nightlife',
        nsfw: true,
    },

    // ── Estudio ─────────────────────────────────────────────────
    {
        id: 'place-cyclorama-studio',
        name: 'Cyclorama Studio',
        text: 'Indoor, photography studio, clean and controlled, seamless mid-grey palette, an infinite curved cyclorama wall with no visible corner, a light stand just outside frame, a coiled cable on the swept floor, no props and no set dressing, large soft key from one side with a subtle rim on the far edge, medium depth of field, neutral professional atmosphere.',
        category: 'studio',
    },
    {
        id: 'place-boutique-gym',
        name: 'Boutique Gym',
        text: 'Indoor, boutique training studio, dark and industrial, charcoal and brushed-steel palette, racked dumbbells along a mirrored wall, rubber flooring with lane markings, a rowing machine at the far end, chalk dust catching the air, hard directional overhead spots with deep shadow between them, medium depth of field, focused early-morning atmosphere.',
        category: 'studio',
    },
]
