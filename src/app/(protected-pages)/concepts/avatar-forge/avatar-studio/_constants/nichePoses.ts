/**
 * POSE por preset de nicho.
 *
 * POR QUÉ existe: los presets de nicho describían outfit + locación + luz +
 * cámara, pero no qué hace el CUERPO. Reporte del usuario sobre
 * `sweet-windowsill-morning`: "le falta la pose o acción". El daño se ve al
 * subir el slider 🌶️ — `spicyTier` reescribe el VESTUARIO pero no la pose, así
 * que un preset sin acción acaba en el avatar desnudo sin hacer nada, que es
 * literalmente la queja que originó los tramos ("manda todo sin ropa, sin mucho
 * chiste o variedad").
 *
 * Va en un fichero APARTE y no dentro de cada preset porque los 90 presets ya
 * están validados: un diff sobre todos ellos es riesgo puro sobre contenido que
 * funciona. Aquí se añade sin tocarlos. `nichePoses.test.ts` exige que TODO
 * preset tenga entrada, así que el fichero no se puede quedar atrás cuando
 * alguien añada presets nuevos.
 *
 * `base` es la pose del preset tal cual. `spicy` es la variante para los tramos
 * altos (topless/explicit), donde las manos y el peso corporal cambian de
 * verdad; si un preset no la define, se usa `base`.
 *
 * Registro: anatómico y concreto (manos, peso, mirada), NUNCA argot. Los
 * motores obedecen mucho mejor la descripción precisa que la jerga, y el
 * vocabulario crudo dispara filtros aguas abajo.
 */

export interface NichePose {
    /** Pose del preset en su versión normal. */
    base: string
    /** Variante para tramos altos (topless/explicit). Cae a `base` si falta. */
    spicy?: string
}

export const NICHE_POSES: Record<string, NichePose> = {
    // ── Sweet Girl ──────────────────────────────────────────────
    'sweet-windowsill-morning': {
        base: 'One knee drawn up to her chest with both arms wrapped around it, the opposite leg hanging off the sill, chin resting on the knee and eyes turning to the lens with a soft unguarded smile',
        spicy: 'Reclining back against the window frame with both knees fallen open, one hand spread flat across her stomach and the other resting above her head, chin tipped down and gaze steady on the lens',
    },
    'sweet-teddy-selfie': {
        base: 'Lying on her front with ankles crossed in the air behind her, the plush toy hugged under her chin, both elbows planted and shoulders lifted, nose scrunched into a grin at the lens',
        spicy: 'Lying on her front with the ankles crossed high behind her, weight on both forearms so the back arches deeply, chin resting on one shoulder as she looks back over it at the lens',
    },
    'sweet-picnic-meadow': {
        base: 'Sitting with her legs folded to one side and one hand planted in the grass behind her hip, the free hand tucking hair behind an ear, head tilted back into the sun with her eyes half closed',
        spicy: 'Reclining back on both elbows with the legs stretched out and one knee bent up, head tipped back toward the sun, throat long, eyes drifting down to the lens',
    },
    'sweet-cherry-blossom': {
        base: 'Caught mid-turn with one hand lifted toward a low branch and the other holding her bag strap, weight on the back foot, chin over the shoulder and a soft laugh breaking across her face',
        spicy: 'Standing with her back against the trunk, both hands raised behind her head into her hair, elbows wide, chin lifted and eyes lowered to the lens',
    },
    'sweet-bubble-tea': {
        base: 'Holding the cup in both hands close to her chest with the straw at her lips, shoulders drawn up in a small delighted shrug, eyes rounding over the rim toward the lens',
        spicy: 'Holding the cup low at her hip with one hand while the other hooks a thumb into her waistband, weight cocked onto one leg, lips parted around the straw and eyes level on the lens',
    },
    'sweet-milkshake-cafe': {
        base: 'Leaning both forearms on the table with the glass between her hands, ankles hooked around the chair legs, head cocked and a slow smile spreading as she looks up at the lens',
        spicy: 'Leaning far forward over the table on both forearms so the shoulders round in, one finger tracing the rim of the glass, chin low and eyes lifted into the lens',
    },
    'sweet-baking-cookies': {
        base: 'Caught mid-laugh with one flour-dusted hand raised near her cheek and the other braced on the counter edge, hip leaning into the cabinets, shoulders lifted in the laugh',
        spicy: 'Braced back against the counter on both hands with the hips pushed forward, one shoulder dropped, chin tucked and eyes raised to the lens through the lashes',
    },
    'sweet-daisy-bouquet': {
        base: 'Holding the bouquet up beside her face with both hands, one eye peeking past the petals, shoulders drawn up and head tipped into the flowers',
        spicy: 'Holding the bouquet low against her hip in one hand, the other arm crossing loosely under her chest, weight on one hip, chin turned over the shoulder toward the lens',
    },
    'sweet-reading-bed': {
        base: 'Lying on her side with the book propped open against the pillow, one hand under her cheek and the other holding the page, knees drawn up under the covers, eyes lifting off the page to the lens',
        spicy: 'Lying on her side with the book set aside, the upper knee drawn forward and the lower leg long, one hand under her cheek and the other resting on the dip of her waist, eyes on the lens',
    },
    'sweet-boardwalk-twirl': {
        base: 'Mid-twirl with the skirt flaring out, both arms lifted loosely away from her sides, hair swinging across her face, head thrown back into an open laugh',
        spicy: 'Coming out of the turn with her back to the lens and looking over one shoulder, both hands gathering her hair up off the nape, spine curved and hip pushed out',
    },

    // ── GFE ─────────────────────────────────────────────────────
    'gfe-morning-bed-selfie': {
        base: 'Lying on her side facing the lens with the duvet pulled up under her chin, one hand emerging to push tousled hair off her forehead, eyes still heavy with a small private smile',
        spicy: 'Lying on her side with the duvet pushed down to her hip, the upper arm draped along the curve of her waist and the hand resting on her thigh, eyes half-lidded on the lens',
    },
    'gfe-coffee-handoff': {
        base: 'Holding the mug out toward the lens in both hands with the arms extended, weight leaning forward from the hips, eyebrows raised in a warm expectant offer',
        spicy: 'Holding the mug in one hand out to the side, the other arm crossing under her chest as she leans a shoulder into the doorframe, chin dipped and eyes level on the lens',
    },
    'gfe-goodnight-kiss': {
        base: 'Leaning in close to the lens with the eyes closed and lips pursed forward, one hand rising to cup the air beside the frame as if holding a cheek',
        spicy: 'Leaning in with one hand braced beside the lens, lips parted rather than pursed, eyes open and holding contact right up to the edge of the frame',
    },
    'gfe-movie-night': {
        base: 'Curled into the corner of the couch with her legs tucked under a blanket, the popcorn bowl balanced on her knees, head lolling sideways onto the cushion toward the lens',
        spicy: 'Stretched along the couch with her head on the armrest and one knee raised, the blanket slipped to the floor, one hand resting flat on her stomach as she looks down the length of her body to the lens',
    },
    'gfe-cooking-together': {
        base: 'Caught mid-stir with the wooden spoon in one hand and the other steadying the pan handle, hip cocked against the counter, head turning back over the shoulder with a grin',
        spicy: 'Turned away from the stove and leaning back against the counter edge on both hands, one ankle crossed over the other, chin tipped down and eyes raised to the lens',
    },
    'gfe-shared-headphones': {
        base: 'Head tilted toward the empty side of the frame with one earbud held out in an offered hand, the other hand pressing her own earbud in, eyes wide in invitation',
        spicy: 'Head tipped back with both eyes closed and the chin lifted, one hand pressing the earbud in and the other trailing slowly down the side of her neck',
    },
    'gfe-dinner-date-pov': {
        base: 'Both elbows on the table with her chin resting in her laced fingers, leaning in over the candle, shoulders drawn together and a slow smile aimed straight at the lens',
        spicy: 'Leaning far forward with one forearm along the table edge and the other hand loosely around the stem of a glass, shoulders rolled in, eyes holding the lens over the flame',
    },
    'gfe-video-call': {
        base: 'Lying back against the pillows holding the phone above her face at arm\'s length, the free hand tucked under her cheek, eyes crinkled in a sleepy grin at the screen',
        spicy: 'Lying back with the phone held above her, the free hand trailing from her collarbone down over her ribs, chin tipped back and lips parted toward the screen',
    },
    'gfe-zipper-help': {
        base: 'Standing with her back to the lens holding the dress closed against her chest with one hand, the other reaching back for the zip, chin turning over the shoulder with a raised brow',
        spicy: 'Standing with her back to the lens, the dress released and slipping off both shoulders, one hand holding it at the small of her back, looking over the shoulder with a level gaze',
    },
    'gfe-follow-me-autumn': {
        base: 'Walking ahead of the lens and turning back mid-step, one arm stretched behind her with the hand open in invitation, hair swinging with the turn, laughing over her shoulder',
        spicy: 'Stopped mid-path and turned back with the coat falling open, one hand still extended toward the lens and the other holding the collar at her throat, chin low and eyes lifted',
    },

    // ── Fitness ─────────────────────────────────────────────────
    'fit-mirror-selfie': {
        base: 'Standing square to the mirror with the phone held at chest height, the free hand on her hip, weight cocked onto one leg, chin lifted with a satisfied half smile',
        spicy: 'Standing side-on to the mirror with the phone low at her hip, the free hand lifting the hem of the top just clear of the ribs, spine arched and eyes on the reflection',
    },
    'fit-rooftop-yoga': {
        base: 'Held in a long low lunge with the back heel lifted and both arms sweeping overhead, palms together, spine extending forward over the front knee, chin following the reach',
        spicy: 'Kneeling upright with the hips settling back onto the heels, both arms reaching overhead and the spine arching backward, throat exposed, eyes closed',
    },
    'fit-barbell-squat': {
        base: 'Caught at the bottom of the squat with the bar racked across the shoulders, elbows driven under it, knees tracking wide, jaw set and eyes fixed forward',
        spicy: 'Rising out of the squat with the bar overhead in both hands, hips pushed forward at the top, chin tipped down and a slow look thrown to the lens',
    },
    'fit-boxing-bag': {
        base: 'Mid-strike with one gloved fist buried in the bag and the shoulder rotating through it, the other glove tucked at the jaw, weight pivoting onto the ball of the back foot',
        spicy: 'Resting against the bag with both gloved forearms crossed over it above her head, forehead leaning on them, torso long, chin turning to the lens',
    },
    'fit-sunrise-run': {
        base: 'Caught mid-stride at full extension with one knee driving up and the opposite arm swinging through, chest open to the light, breath visible and gaze fixed ahead',
        spicy: 'Stopped at the end of the run with both hands laced behind her head and elbows wide, chest lifted and ribs long, chin tipped back toward the sun',
    },
    'fit-protein-shake': {
        base: 'Holding the shaker up beside her face in one hand, the other thumb hooked in her waistband, one eye closing in a wink over the top of the bottle',
        spicy: 'Tipping the shaker back with the chin raised and the throat long, the free hand flat on her stomach, eyes cutting sideways to the lens as she drinks',
    },
    'fit-track-stretch': {
        base: 'Seated on the track in a long forward fold with both hands reaching past the toes, spine lengthening over the legs, head turning sideways to the lens',
        spicy: 'Seated with the legs opened wide and both hands planted on the track behind her hips, spine arched and chest lifted, head rolling back before turning to the lens',
    },
    'fit-pilates-studio': {
        base: 'Lying back on the reformer with both feet on the bar and the knees folded in, hands gripping the straps at her shoulders, core braced and eyes tracking the line of the legs',
        spicy: 'Lying back on the reformer with one leg extended long up the line of the frame and the other knee dropping open, both hands loose in the straps, head turning to the lens',
    },
    'fit-playful-flex': {
        base: 'Both arms curled into a double biceps flex with the shoulders drawn up around her ears, nose wrinkled and tongue caught between her teeth in mock effort',
        spicy: 'One arm curled into a flex while the other hand runs from her collarbone down the centre of her ribs, chin dipped, eyes raised to the lens with a slow smile',
    },
    'fit-summit-selfie': {
        base: 'Standing at the edge with both arms thrown wide above her head, chest open to the drop, head tipped back in an open shout of triumph',
        spicy: 'Standing at the edge with her back to the lens and both hands gathering her hair up off her neck, elbows wide, looking back over one shoulder',
    },

    // ── Baddie / Glam ───────────────────────────────────────────
    'glam-red-carpet': {
        base: 'Stopped at a three-quarter angle with one hand resting on the pushed-out hip and the other falling loose, the front foot pointed toward the lens, chin lifted and lips parted',
        spicy: 'Turned so the open back of the gown faces the lens, one hand on the hip and the other lifting her hair clear of the shoulder blades, looking back with the chin low',
    },
    'glam-penthouse-dusk': {
        base: 'Standing at the glass with one shoulder against it and a drink held at chest height, the free hand flat on the pane, gaze angled out over the city rather than at the lens',
        spicy: 'Facing the glass with both palms flat on it above her head, forehead nearly touching, spine long and hips pushed back, head turning to the lens over the shoulder',
    },
    'glam-rooftop-champagne': {
        base: 'Mid-toast with the flute raised toward the lens in one hand, the other arm draped along the rail behind her, weight leaning back into it, brow raised in a smirk',
        spicy: 'Leaning back against the rail on both elbows with the flute set down, the chest lifted and the head tipped back, chin coming level with a slow look at the lens',
    },
    'glam-yacht-bow': {
        base: 'Standing at the bow with one hand on the rail and the other holding her hair back from the wind, weight into the front foot, chin turning into the breeze',
        spicy: 'Seated on the bow rail with both hands braced behind her, legs extended and crossed at the ankle, spine arched, head tipped back into the sun',
    },
    'glam-private-jet': {
        base: 'Reclined in the leather seat with the espresso cup at her lips, one leg crossed high over the other, the free hand resting along the armrest, eyes cutting to the lens over the rim',
        spicy: 'Reclined deep into the seat with both legs drawn up onto it and folded to one side, one arm stretched along the seat back, chin resting on that shoulder toward the lens',
    },
    'glam-marble-lobby': {
        base: 'Striding through frame with the coat sweeping behind her, sunglasses being lowered on one finger, chin level and gaze locked past the lens',
        spicy: 'Stopped mid-lobby with the coat held open by both hands at the lapels, weight on one hip, chin dipped and eyes raised to the lens over the lowered glasses',
    },
    'glam-paparazzi-car': {
        base: 'Caught stepping out of the car with one heel on the pavement and the hand braced on the door frame, the other lifting to shield her eyes from the flashes',
        spicy: 'Seated sideways in the open door with both feet on the pavement and the knees angled together, leaning back on one hand, chin turning up to the lens',
    },
    'glam-closet-selfie': {
        base: 'Standing among the racks with the phone raised in one hand and the other pulling a garment forward on its hanger, hip cocked, brow raised at the mirror',
        spicy: 'Standing with her back to the mirror and looking over the shoulder, both hands lifting her hair off the nape, spine curved and one heel raised',
    },
    'glam-resort-pool': {
        base: 'Reclined along the lounger with one knee bent up and the sunglasses pushed into her hair, one arm behind the head and the other resting across her stomach',
        spicy: 'Lying on her front along the lounger with the ankles crossed in the air, weight on both forearms so the back arches, chin resting on one shoulder toward the lens',
    },
    'glam-paris-shopping': {
        base: 'Walking with shopping bags gathered in both hands, mid-step and turning her upper body back toward the lens, chin over the shoulder with a satisfied smile',
        spicy: 'Stopped with the bags set down at her feet, both hands smoothing down the front of the coat from the ribs to the hips, weight on one leg, eyes level on the lens',
    },

    // ── Dark / Gothic ───────────────────────────────────────────
    'goth-cathedral-candles': {
        base: 'Standing still with both hands folded low in front of her, chin dropped and eyes lifted straight into the lens from under the brow, shoulders squared and unmoving',
        spicy: 'Kneeling upright with both hands resting palm-up on her thighs, spine stacked tall, head tipped back and eyes closed, throat long in the candlelight',
    },
    'goth-veil-portrait': {
        base: 'Both hands raised to hold the veil away from her face at the temples, elbows wide, chin level, gaze fixed and unblinking through the lace',
        spicy: 'One hand drawing the veil slowly down off her shoulder while the other rests flat at the base of her throat, chin lifted, eyes half-closed',
    },
    'goth-black-rose': {
        base: 'Holding a single stem across her collarbone with both hands, head tipped down toward it, eyes rising to the lens through the fog',
        spicy: 'Drawing the stem slowly down the centre of her body from throat to ribs, the free hand hanging loose, chin lifted and eyes locked on the lens',
    },
    'goth-victorian-candelabra': {
        base: 'Seated straight-backed in the high chair with both hands gripping the armrests, ankles crossed, chin raised in a cold level stare at the lens',
        spicy: 'Draped sideways across the chair with the legs over one armrest and the spine curving back over the other, one arm trailing toward the floor, head hanging back',
    },
    'goth-baroque-library': {
        base: 'Standing at the shelves with one hand drawing a volume half out and the other holding an open book against her hip, head turning to the lens mid-motion',
        spicy: 'Leaning back against the shelves with both hands gripping the edge behind her hips, one knee bent and the foot flat on the wood, chin down and eyes up',
    },
    'goth-witchy-forest': {
        base: 'Standing among the trees with both arms lifted slightly away from her sides, palms open and forward, chin level, gaze steady into the lens through the mist',
        spicy: 'Kneeling in the moss with the spine arched and both hands sliding up her own thighs, head tipped back, hair falling away from the throat',
    },
    'goth-neon-alley': {
        base: 'Leaning a shoulder into the wet brick with one boot flat against it behind her, hands pushed into her jacket pockets, chin low and eyes up into the lens',
        spicy: 'Pressed back against the wet brick with both hands flat on it beside her hips, one knee lifted, chest open to the rain, chin tipped back',
    },
    'goth-industrial-club': {
        base: 'Caught mid-motion in the strobe with one arm raised overhead and the head thrown back, weight low through the hips, hair frozen mid-swing',
        spicy: 'Both hands laced behind her head with the elbows wide, hips rolling low through the beat, chin dropping to find the lens between strobe flashes',
    },
    'goth-rooftop-alt': {
        base: 'Squared to the lens with both thumbs hooked into her belt loops, weight even, chin dipped, eyes flat and direct into the harsh flash',
        spicy: 'Turned side-on with one hand pushing the jacket off a shoulder and the other on the buckle, spine arched, head rolling back toward the lens',
    },
    'goth-vanity-grunge': {
        base: 'Leaning both forearms on the vanity top toward the mirror, shoulders rounded in, head tilted as she studies her own reflection rather than the lens',
        spicy: 'Sitting back from the vanity with one heel up on the stool edge and the knee falling open, one hand loose in her hair, watching the reflection through half-closed eyes',
    },

    // ── E-girl / Alt ────────────────────────────────────────────
    'egirl-rgb-room': {
        base: 'Spun sideways in the gaming chair with both knees pulled up onto the seat, the headset pushed back off one ear, chin resting on a knee toward the lens',
        spicy: 'Slouched deep in the chair with one leg hooked over the armrest, the headset around her neck, one hand trailing from her collarbone down her stomach',
    },
    'egirl-led-bed': {
        base: 'Lying on her back across the bed with the controller held up above her face in both hands, knees folded up, head turning sideways to the lens mid-game',
        spicy: 'Lying on her back with the controller set down on her stomach, both arms stretched above her head and the wrists loosely crossed, spine arching off the sheets',
    },
    'egirl-streamer-pov': {
        base: 'Leaning in close to the camera with both hands framing her face, elbows on the desk, eyes wide and mouth open mid-word to the chat',
        spicy: 'Leaning back from the desk with one arm hooked over the chair back, the other hand toying with the headset cable at her throat, chin low and eyes on the lens',
    },
    'egirl-desk-rgb': {
        base: 'Seated at the desk in three-quarter profile with one hand on the mouse and the other resting on the keyboard, head turning over the shoulder to the lens',
        spicy: 'Turned fully away from the desk with both hands gripping the seat edge between her knees, shoulders drawn up, chin dipped and eyes raised to the lens',
    },
    'egirl-split-dye': {
        base: 'Head tilted so the two-tone hair falls in a hard diagonal, one hand pushing the darker side back behind an ear, chin low, eyes flat and direct',
        spicy: 'Both hands buried in her hair at the crown, elbows lifted wide, head tipped back and the chin coming down slowly to meet the lens',
    },
    'egirl-gloss-closeup': {
        base: 'One fingertip resting at the corner of her mouth, lips slightly parted, eyes rounded and lifted just above the lens line',
        spicy: 'One fingertip drawn slowly across the lower lip and away, chin tipping back, eyes never leaving the lens',
    },
    'egirl-y2k-mirror': {
        base: 'Standing hip-cocked to the mirror with the flip phone raised in one hand and the other flashing a peace sign beside her face, tongue out at the reflection',
        spicy: 'Turned to show her back to the mirror with the phone raised over one shoulder, the free hand lifting the hem of the top clear of the small of her back',
    },
    'egirl-arcade-plushie': {
        base: 'Hugging the plush prize to her chest with both arms, shoulders drawn up around it, chin tucked down into the toy and eyes crinkling at the lens',
        spicy: 'Holding the plush loosely at her hip in one hand, the other arm crossing under her chest, weight on one leg, chin turned over the shoulder',
    },
    'egirl-neon-ramen': {
        base: 'Perched on the stool leaning over the bowl with the chopsticks raised, one hand catching her hair back from the steam, eyes flicking sideways to the lens',
        spicy: 'Turned away from the counter with both elbows hooked back on it behind her, spine arched and one heel up on the stool rung, chin lifted toward the lens',
    },
    'egirl-konbini-night': {
        base: 'Standing in the aisle mid-reach with one hand on a shelf item and the other holding a drink, head turning to the lens as if just caught',
        spicy: 'Leaning back into the cooler door with both hands flat on the glass beside her hips, one knee bent, chin dipped and eyes raised into the lens',
    },

    // ── Boudoir 🌶️ ──────────────────────────────────────────────
    'boudoir-silk-robe-vanity': {
        base: 'Seated at the vanity in three-quarter turn with one hand drawing the robe closed at the chest and the other resting on the tabletop, chin over the shoulder to the lens',
        spicy: 'Seated with the robe fallen from both shoulders to the elbows, one hand cupping the near breast and the other flat on the vanity, eyes meeting her reflection',
    },
    'boudoir-candlelit-bed': {
        base: 'Kneeling upright on the bed with both hands resting on the tops of her thighs, spine stacked long, chin dipped and eyes lifted into the lens',
        spicy: 'Kneeling upright and bare with the thighs slightly apart, one hand spread high on the inner thigh and the other pushing hair off her face, gaze unbroken',
    },
    'boudoir-window-blinds': {
        base: 'Standing side-on to the blinds with one forearm raised against the frame and the forehead resting on it, hip pushed out, face turning back to the lens',
        spicy: 'Facing the blinds with both palms flat on the frame above her head, spine arched and hips pushed back, chin turning over the shoulder with the light in bands across the skin',
    },
    'boudoir-sheet-morning': {
        base: 'Sitting up in bed with the sheet gathered against her chest in one fist and the coffee cup in the other, knees drawn up, hair pushed back and a sleepy half smile',
        spicy: 'Sitting up with the sheet fallen to her lap and the cup set aside, one arm laid across her chest and the opposite hand resting on the raised knee, eyes level on the lens',
    },
    'boudoir-velvet-chaise': {
        base: 'Draped along the chaise on one hip with the upper knee bent forward, one elbow taking her weight and the free hand resting at her waist, head turned to the lens',
        spicy: 'Draped along the chaise on her back with the spine arched over the bolster, both arms stretched overhead, one knee falling open, head hanging back toward the lens',
    },
    'boudoir-mirror-floor': {
        base: 'Kneeling before the leaning mirror with both hands resting on her thighs, spine long, watching her own reflection rather than the lens',
        spicy: 'Kneeling before the mirror with one hand lifting and cupping the near breast and the other flat on her lower belly, hip angled to the glass, eyes on the reflection',
    },
    'boudoir-back-lace': {
        base: 'Seated with her back to the lens and the spine curved into a long S, both hands gathering her hair up off the nape, chin turning a few degrees over the shoulder',
        spicy: 'Seated with her back to the lens and the lace released, one arm crossing over the chest from the far side, the other trailing down the spine, looking back with the chin low',
    },
    'boudoir-hotel-dusk': {
        base: 'Standing at the foot of the bed with one hand on the post and the other on her hip, weight cocked, chin level and eyes steady into the lens',
        spicy: 'Kneeling on the end of the bed with both hands braced on the footboard, elbows locked and shoulders drawn up, spine dipped, chin lifted to the lens',
    },
    'boudoir-stocking-ritual': {
        base: 'Perched on the edge of the bed with one foot up on the frame, both hands drawing the stocking up the calf, head bowed to the task then flicking up to the lens',
        spicy: 'Perched with one foot up and the stocking half-drawn, one hand pausing high on the inner thigh and the other braced behind her on the mattress, eyes raised to the lens',
    },
    'boudoir-tulle-window': {
        base: 'Standing wrapped in the drifting curtain with one hand holding it across her body and the other raised against the glass, face turned into the light',
        spicy: 'Standing with the curtain released and drifting behind her, both hands lifting her hair off her neck, elbows wide, chin tipped back into the light',
    },

    // ── Lingerie 🌶️ ─────────────────────────────────────────────
    'lingerie-black-lace-classic': {
        base: 'Standing square to the lens with one hand on the pushed-out hip and the other loose at her side, weight cocked, chin dipped and eyes raised',
        spicy: 'Standing with the bra released and held loosely in one hand at her side, the other forearm laid across her chest, hip pushed out, gaze level and unhurried',
    },
    'lingerie-red-satin-valentine': {
        base: 'Kneeling on the bed with both hands resting on her thighs, spine long, shoulders rolled back, head tipped with a slow knowing smile',
        spicy: 'Kneeling with the satin pooled at her knees, one hand cupping the near breast and the other spread flat on her stomach, chin low and eyes on the lens',
    },
    'lingerie-white-bridal': {
        base: 'Seated on the bed edge with the ankles crossed and both hands braced on the mattress beside her hips, shoulders drawn back, chin lifted',
        spicy: 'Seated with the bridal set half-undone, one hand holding the loosened strap at her shoulder and the other resting high on her inner thigh, eyes level on the lens',
    },
    'lingerie-emerald-silk': {
        base: 'Standing in three-quarter turn with one hand smoothing the silk down over her hip and the other lifting her hair off her shoulder, chin over the shoulder',
        spicy: 'Standing with the silk slipped from both shoulders and caught at the waist, both hands holding it there, spine arched, chin tipped back',
    },
    'lingerie-mesh-bodysuit': {
        base: 'Standing with both hands laced behind her head and the elbows wide, weight on one leg, ribs long, chin level and eyes direct',
        spicy: 'Standing with one hand tracing the mesh from her throat down between her breasts to her navel, the other on the hip, chin dipped and eyes raised to the lens',
    },
    'lingerie-garter-noir': {
        base: 'Seated on the stool with one heel hooked on the rung and the knee falling open, both hands resting on the thighs, chin low and eyes up',
        spicy: 'Seated with one hand hooked under a garter strap at the thigh and the other braced behind her on the stool, spine arched, head rolling back to the lens',
    },
    'lingerie-corset-baroque': {
        base: 'Standing tall with both hands resting on the corset at the waist, shoulders drawn back and ribs lifted, chin raised in a composed stare',
        spicy: 'Standing with the corset laces released and the front held closed by one hand, the other reaching back to the small of her waist, chin turning over the shoulder',
    },
    'lingerie-satin-bed-topdown': {
        base: 'Lying on her back with the arms relaxed above her head and one knee folded up, hair fanned across the satin, eyes lifting straight up into the lens',
        spicy: 'Lying on her back with both arms stretched overhead and the wrists loosely crossed, the spine arched off the sheets, one knee falling open, lips parted to the lens',
    },
    'lingerie-golden-hour-bed': {
        base: 'Lying on her side propped on one forearm with the upper knee drawn forward, the free hand resting on the dip of her waist, eyes half-closed in the light',
        spicy: 'Lying on her side with the upper arm draped over her chest and the hand resting on the far ribs, the lower hand trailing along the thigh, gaze soft on the lens',
    },
    'lingerie-window-silhouette': {
        base: 'Standing side-on in the window frame with one hand raised against the glass and the other on her hip, the body reading as a clean outline',
        spicy: 'Standing side-on with both arms lifted to the frame above her head, the spine arched and the chest opened to the light, chin tipped back',
    },
    'lingerie-silk-kimono': {
        base: 'Standing with the kimono held closed at the waist by one hand, the other pushing hair off her shoulder, weight cocked, chin over the shoulder',
        spicy: 'Standing with the kimono open down the front and held wide by both hands at the hips, shoulders back, chin dipped and eyes raised to the lens',
    },
    'lingerie-oversized-cardigan': {
        base: 'Standing with the cardigan hanging open over the set, both hands pushed into its pockets, shoulders drawn up, head tilted with a soft smile',
        spicy: 'Standing with the cardigan slipped off both shoulders to the crook of the elbows, one forearm crossing the chest, chin low and eyes level on the lens',
    },
    'lingerie-fur-throw': {
        base: 'Seated on the floor wrapped in the throw with the knees drawn up and both arms holding it closed at her chest, chin resting on top of the fur',
        spicy: 'Seated with the throw fallen open around her hips, one arm laid across the chest and the other braced behind her, spine arched, head rolling back',
    },
    'lingerie-pastel-cute': {
        base: 'Kneeling with the ankles tucked under her and both hands resting palm-down on her thighs, shoulders drawn up, nose scrunched into a grin',
        spicy: 'Kneeling upright with the spine long, one hand loosening the bow at her chest and the other flat on her stomach, chin tipped down and eyes raised',
    },
    'lingerie-balcony-morning': {
        base: 'Leaning both forearms on the balcony rail with the hips pushed back, coffee cup in one hand, head turning to the lens over the shoulder',
        spicy: 'Leaning back against the rail on both elbows with the chest lifted to the morning sun, one knee bent and the foot flat, chin tipped back then lowering to the lens',
    },
    'lingerie-champagne-mirror': {
        base: 'Standing to the mirror with the phone in one hand at chest height and the flute in the other, hip cocked, watching the reflection with a smirk',
        spicy: 'Standing with her back to the mirror and looking over the shoulder, the flute set down, both hands gathering her hair off the nape, spine curved',
    },
    'lingerie-neon-vibe': {
        base: 'Standing square in the neon with both thumbs hooked into the waistband, weight even, chin dipped and eyes flat into the lens',
        spicy: 'Standing with one hand drawing slowly up her ribs to rest below the collarbone and the other in her hair, hips angled, chin turning into the coloured light',
    },
    'lingerie-stairs-heels': {
        base: 'Standing a few steps up with one hand trailing on the banister and the other on her hip, the front foot pointed down the stair, chin over the shoulder',
        spicy: 'Seated on the stair tread leaning back on both elbows with the knees bent and slightly apart, spine arched, head tipped back toward the lens',
    },
    'lingerie-polaroid-flash': {
        base: 'Caught square to the hard flash with one hand raised in a half-wave near her face and the other on her hip, shoulders lifted mid-laugh',
        spicy: 'Caught square to the flash with both arms lifted overhead and the wrists crossed, ribs long and spine arched, chin dropped and eyes into the lens',
    },
    'lingerie-video-robe-reveal': {
        base: 'She stands holding the robe closed at her waist, holds the lens for a beat, then lets both hands fall so the robe swings open, settling with one hand back on her hip',
        spicy: 'She lets the robe fall from both shoulders and slide down her arms to the floor, then draws both hands slowly up her sides to rest at her ribs as she settles still',
    },

    // ── Uniformes 🌶️ ────────────────────────────────────────────
    // El `text` ya trae su pose base; aquí importa sobre todo `spicy`, que es
    // lo que el slider NO reescribe.
    'uniform-teacher-desk': {
        base: 'Perched on the front edge of the desk with one heel hooked on the rail, both hands braced on the desktop beside her hips, chin dipped and eyes raised',
        spicy: 'Seated back on the desk with the blouse open and pushed off both shoulders, one hand cupping the near breast and the other flat on the wood behind her, gaze level',
    },
    'uniform-college-library': {
        base: 'Sitting sideways in the carrel with one knee up against the desk edge, a pen twirling against her lower lip, head turning to the lens',
        spicy: 'Turned out of the carrel with both hands gripping the seat edge between her knees, the sweatshirt pushed up under her collarbone, chin low and eyes raised',
    },
    'uniform-nurse-station': {
        base: 'Leaning back against the counter with both hands gripping its edge behind her hips, ankles crossed, head tipping back then coming level to the lens',
        spicy: 'Leaning back on the counter with the scrub top open to the waist, one hand drawing the stethoscope slowly down between her breasts, chin tipped back',
    },
    'uniform-flight-attendant': {
        base: 'Standing in the aisle with one hand on a seat back and the other unclipping the neck scarf, hip cocked, chin over the shoulder',
        spicy: 'Standing in the aisle drawing the loosened scarf slowly from around her throat with both hands, blouse open, elbows wide, eyes level on the lens',
    },
    'uniform-secretary-office': {
        base: 'Half-seated on the desk edge with one hand flat on the wood behind her, pulling a pen from her hair, legs crossed at the ankle',
        spicy: 'Seated back on the desk with both hands braced behind her and the knees slightly apart, spine arched, blouse fallen open, chin lifted to the lens',
    },
    'uniform-waitress-diner': {
        base: 'Leaning both forearms on the counter from behind it, order pad in one hand, shoulders rounded toward the lens with a knowing half smile',
        spicy: 'Leaning far over the counter on both forearms with the dress unbuttoned at the chest, one finger tracing the chrome edge, chin low and eyes raised',
    },
    'uniform-barista-counter': {
        base: 'Turned side-on at the machine with one hand on the portafilter, hip leaning into it, head tipping back over the shoulder to the lens',
        spicy: 'Leaning back against the bar with the apron bib untied and hanging at the waist, both hands gripping the counter behind her, chest lifted, chin tipped back',
    },
    'uniform-maid-suite': {
        base: 'Kneeling on the bed with one hand smoothing the sheet and the other on her own thigh, spine long, head turning to the lens',
        spicy: 'Kneeling on the bed with the apron untied and the dress open down the front, one hand holding it aside at her ribs, the other high on her thigh, eyes on the lens',
    },
    'uniform-officer-generic': {
        base: 'Standing with the weight on one hip and both thumbs hooked into the belt, shoulders squared, chin dipped and gaze level',
        spicy: 'Standing with the shirt fully open and pushed back off both shoulders, thumbs still hooked in the belt, ribs long, chin low and eyes flat on the lens',
    },
    'uniform-cadet-generic': {
        base: 'Sitting on the bunk edge with elbows on the knees and the hands loosely clasped, head lifting slowly to the lens',
        spicy: 'Sitting on the bunk with the jacket off and the tank pushed up, leaning back on both hands with the spine arched, head rolling back toward the lens',
    },
    'uniform-firefighter-generic': {
        base: 'Standing in the bay with the coat hanging from the waist, both hands hooked in the braces at her hips, jaw set toward the lens',
        spicy: 'Standing with the braces pushed off both shoulders and hanging at the thighs, one forearm laid across her chest, the other hand at her belt, chin lifted',
    },
    'uniform-trainer-floor': {
        base: 'Crouched on one knee beside the bench with a forearm across the raised thigh, stopwatch hanging from the other hand, head turned up to the lens',
        spicy: 'Kneeling upright with the crop top unzipped to the sternum, one hand drawing the zip down and the other braced on her thigh, chin dipped and eyes raised',
    },
    'uniform-yoga-instructor': {
        base: 'Kneeling upright with the hips settled onto the heels, both hands palm-up on the thighs, spine stacked long, eyes opening slowly to the lens',
        spicy: 'Kneeling upright with the top drawn off overhead and set aside, both arms reaching high and the spine arching back, throat long, eyes closing',
    },
    'uniform-cheer-sideline': {
        base: 'Standing with the pom-poms lowered against her thighs, weight cocked onto one hip, chin dipped and eyes raised into the lens',
        spicy: 'Standing with the pom-poms dropped and both hands lifting her ponytail off the nape, elbows wide, spine arched, chin turning over the shoulder',
    },
    'uniform-video-nurse-corridor': {
        base: 'She walks toward the lens, pulls the stethoscope from her neck, then leans a shoulder into the wall and tips her head back before levelling her eyes',
        spicy: 'She stops against the wall, works the scrub top open one tie at a time, then draws both hands slowly up her ribs and holds, eyes never leaving the lens',
    },
}
