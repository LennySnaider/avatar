/**
 * CENTINELA DE PROMPTS POSITIVOS — `npm run check:prompts`
 *
 * Por qué existe: la difusión NO procesa negaciones en el prompt positivo.
 * Escribir "NOT glowing" o "never a hybrid" no prohíbe nada — mete los tokens
 * "glowing" y "hybrid" en lo que el modelo debe dibujar. Lo mismo con nombrar
 * una característica opcional: "freckles" las pinta aunque la referencia no
 * las tenga.
 *
 * Esta lección nos costó CINCO incidentes en un solo día (2026-07-26), todos
 * encontrados de la forma más cara —mirando imágenes ya pagadas— y uno de
 * ellos reincidiendo al arreglar el anterior:
 *
 *   · mannequin / doll   nombrados en positivo → se dibujaban
 *   · pezones rosados    palabra de color en positivo → rubor
 *   · freckles           nombradas → pecas en avatares sin pecas
 *   · skin markings      el ARREGLO de lo anterior → manchas por todo el cuerpo
 *   · ojos "NOT glowing" el guard anti-brillo → ojos fosforescentes
 *
 * Cómo funciona: es un RATCHET, no un muro. Cuenta las infracciones actuales y
 * falla si SUBEN respecto al baseline. Así no bloquea el trabajo por la deuda
 * que ya existe, pero impide añadir más — y el baseline solo puede bajar.
 *
 * Cuando corrijas alguna, baja BASELINE al número que reporte.
 */
import {
    buildMuleRouterEditMaxPrompt,
    buildMuleRouterFaceSwapPrompt,
} from '../src/utils/muleRouterPrompt'
import {
    hairClause,
    eyeClause,
    hairClauseCompact,
    INTACT_BODY_CLAUSE,
    INTACT_BODY_IN_FRAME_CLAUSE,
    EDIT_ANCHOR_CLAUSE,
} from '../src/services/kie/shared'
import {
    vulvaClause,
    pubicHairClause,
    tanLinesClause,
    nippleClause,
    describeBody,
    buildCurvesEmphasis,
} from '../src/utils/bodyDescriptors'
import { MASKED_EDIT_INSTRUCTION } from '../src/app/(protected-pages)/concepts/avatar-forge/avatar-studio/_utils/maskOverlay'
import type { PhysicalMeasurements } from '../src/@types/supabase'

/**
 * Sube este número SOLO si es deliberado y está justificado. Debe BAJAR.
 *
 * Las 5 que quedan son DEUDA CONSCIENTE, no descuido:
 *
 *  · vulvaClause (2)        APAGADA (VULVA_CLAUSE_ENABLED=false, prueba A/B:
 *                           "ahora se ve mal posicionada"). El baseline
 *                           mantiene su hueco a propósito para que volver a
 *                           encenderla no haga fallar el centinela — un
 *                           ratchet no debe bloquear un revert.
 *  · anti-mutilación (3)    INTACT_BODY / IN_FRAME / EDIT_ANCHOR. Se añadieron
 *                           por un bug real (brazos escondidos, extremidades
 *                           cortadas). Pasarlas a positivo es viable pero hay
 *                           que MEDIRLO generando, no asumirlo.
 *
 * SALDADO 2026-07-27 — alcance de piel (pubicHair y tanLines): el "never drawn
 * through/over clothing" resultó REDUNDANTE. Ambas cláusulas ya acotaban en
 * positivo ("visible ONLY where she is bare…"), que es la única forma en que la
 * difusión procesa un límite; la negación solo añadía el token `clothing` a un
 * prompt que busca lo contrario. Se borró sin perder la protección.
 */
const BASELINE = 3

const M = {
    age: 22,
    bust: 90,
    hips: 96,
    build: 3,
    shape: 'hourglass',
    waist: 45,
    height: 173,
    skinTone: 4,
    bustLevel: 3,
    glutesLevel: 5,
    // Las FORMAS faltaban en el fixture, y por eso el centinela nunca miró
    // BUST_SHAPE_PHRASE: ahí vivía "with centered nipples", que viajaba en
    // TODAS las generaciones (ver ANATOMIA_DESCUBIERTA abajo). Una rama sin
    // caso es una rama sin vigilancia — misma lección que pubicHairClause.
    bustShape: 'round',
    glutesShape: 'heart',
    hairColor: 'wavy dark brown',
    hairStyle: 'wavy',
    hairLength: 5,
    eyeColor: 'green',
    tanLines: true,
    pubicStyle: 'strip',
    pubicAmount: 3,
    nippleColor: 'rosy',
} as unknown as PhysicalMeasurements

/**
 * Negaciones. `no` va con lookahead de palabra para no cazar "nothing" ni
 * "north". Se busca en TEXTO QUE VA AL MODELO, no en comentarios.
 */
const NEGATIONS: [RegExp, string][] = [
    [/\bNOT\b/g, 'NOT'],
    [/\bnever\b/gi, 'never'],
    [/\bdo not\b/gi, 'do not'],
    [/\bdon't\b/gi, "don't"],
    [/\bwithout\b/gi, 'without'],
    [/\bavoid\b/gi, 'avoid'],
    [/\bno\s+(?:other|extra|hard|cuts|stubble|seduction|erotic|accessories|props|lens|pasted)/gi, 'no <cosa>'],
]

/**
 * Características OPCIONALES: nombrarlas las invoca. Si el avatar las tiene,
 * llegan por su foto de referencia — no hay que pedirlas por texto.
 */
const SUMMONED = [
    'freckle',
    'mole',
    'skin marking',
    'beauty mark',
    'blemish',
    'mannequin',
    'doll',
    'glowing',
    'oversaturated',
    'contact-lens',
]

/**
 * Anatomía que SOLO se ve con la prenda quitada. Nombrarla en un prompt que va
 * a una escena vestida no es un matiz que el motor ignore: es una orden que
 * cumple como puede — marcándola ENCIMA de la ropa.
 *
 * Incidente 2026-08-20 (tres imágenes + `full_api_prompt` en BD, 🌶️ APAGADO):
 * BUST_SHAPE_PHRASE.round decía "even fullness in every direction with centered
 * nipples" y viajaba en TODAS las generaciones vía buildCurvesEmphasis. Es la
 * misma lección que ya obligó a acotar tanLinesClause ("sin el alcance
 * explícito, los motores dibujaban las líneas encima de la ropa").
 *
 * Estas palabras NO están prohibidas: pertenecen a las cláusulas que solo
 * viajan en runs NSFW (nippleClause, vulvaClause, pubicHairClause), donde son
 * justo lo que se quiere. La regla es de ALCANCE, no de vocabulario — por eso
 * solo se mira en los casos marcados `sfw`.
 */
const ANATOMIA_DESCUBIERTA = ['nipple', 'areola', 'vulva', 'labia', 'genital']

type Case = { name: string; text: string; sfw?: boolean }

const cases: Case[] = []
/** `sfw` = este texto viaja también con el toggle 🌶️ APAGADO. */
const push = (name: string, text: string, sfw = false) => {
    if (text?.trim()) cases.push({ name, text, sfw })
}

for (const nsfw of [false, true]) {
    for (const cw of [100, 40]) {
        const roles: ('face' | 'clone' | 'body')[] =
            cw >= 50 ? ['clone', 'face'] : ['face', 'body']
        const r = buildMuleRouterEditMaxPrompt({
            measurements: M,
            scene: '[CLONE: a person in a white top taking a mirror selfie]',
            nsfw,
            imageRoles: roles,
            cloneWeight: cw,
            deferToPhase2: cw >= 50,
        } as never)
        push(`muleRouter fase1 nsfw=${nsfw} clone=${cw}`, r.prompt, !nsfw)
    }
    const p2 = buildMuleRouterFaceSwapPrompt('wavy dark brown', {
        undress: nsfw,
        eyeDesc: 'green eyes',
        areolaDesc: 'medium',
    })
    push(`muleRouter fase2 undress=${nsfw}`, p2.prompt, !nsfw)
}

push('hairClause', hairClause('long wavy dark brown hair'), true)
push('hairClauseCompact', hairClauseCompact('long wavy dark brown hair'), true)
push('eyeClause', eyeClause('green eyes'), true)
push('INTACT_BODY_CLAUSE', INTACT_BODY_CLAUSE, true)
push('INTACT_BODY_IN_FRAME_CLAUSE', INTACT_BODY_IN_FRAME_CLAUSE, true)
push('EDIT_ANCHOR_CLAUSE', EDIT_ANCHOR_CLAUSE, true)
// Vive en _utils/ y no en el juego de clausulas, asi que se colo un
// "NEVER paint purple" que Wan calcaba literalmente. El centinela solo
// protege lo que se le da a mirar.
push('MASKED_EDIT_INSTRUCTION', MASKED_EDIT_INSTRUCTION, true)
push('vulvaClause', vulvaClause('completely nude'))
push('pubicHairClause', pubicHairClause(M))
// El caso 'shaved' toma una rama DISTINTA de la función, con su propia
// frase — se le escapaba al centinela, y ahí vivía un "with no stubble"
// que nombraba justo lo que quería evitar. Una rama sin caso es una rama
// sin vigilancia.
push('pubicHairClause[shaved]', pubicHairClause({ ...M, pubicStyle: 'shaved' } as typeof M))
push('tanLinesClause', tanLinesClause(M), true)
push('nippleClause', nippleClause(M))
push('describeBody', describeBody(M), true)
push('buildCurvesEmphasis', buildCurvesEmphasis(M), true)

let total = 0
const rows: string[] = []
for (const c of cases) {
    const hits: string[] = []
    for (const [re, label] of NEGATIONS) {
        const n = (c.text.match(re) ?? []).length
        if (n) hits.push(`${label}×${n}`)
    }
    for (const w of SUMMONED) {
        const n = (c.text.toLowerCase().match(new RegExp(w, 'g')) ?? []).length
        if (n) hits.push(`«${w}»×${n}`)
    }
    const count = hits.reduce(
        (s, h) => s + Number(h.split('×')[1] ?? 1),
        0,
    )
    total += count
    if (count) rows.push(`  ${String(count).padStart(3)}  ${c.name.padEnd(38)} ${hits.join(', ')}`)
}

console.log('\nInfracciones en prompts POSITIVOS (negaciones + rasgos invocados)\n')
rows.sort((a, b) => Number(b.trim().split(' ')[0]) - Number(a.trim().split(' ')[0]))
rows.forEach((r) => console.log(r))
console.log(`\n  TOTAL ${total}   baseline ${BASELINE}\n`)

// ── Anatomía descubierta en texto SFW ──────────────────────────────────────
// A diferencia del ratchet de arriba, esto es un MURO con baseline 0: no hay
// deuda legítima que preservar. Si una frase que viaja con 🌶️ apagado nombra un
// pezón, el motor lo pinta sobre la ropa — y eso es una generación pagada y
// tirada, no un matiz de estilo.
const fugas: string[] = []
for (const c of cases.filter((x) => x.sfw)) {
    const low = c.text.toLowerCase()
    const hits = ANATOMIA_DESCUBIERTA.filter((w) => low.includes(w))
    if (hits.length) fugas.push(`  ${c.name.padEnd(38)} ${hits.join(', ')}`)
}
if (fugas.length) {
    console.error('Anatomía descubierta en texto que viaja en runs SFW:\n')
    fugas.forEach((f) => console.error(f))
    console.error(
        '\nFALLO: estas frases viajan con el toggle 🌶️ APAGADO. Pedir un pezón en\n' +
            'una escena vestida no se ignora: el motor lo marca ENCIMA de la prenda.\n' +
            'La forma es GEOMETRÍA; la anatomía descubierta vive en nippleClause /\n' +
            'vulvaClause / pubicHairClause, que ya están gated a nsfwLevel>=65.\n',
    )
    process.exit(1)
}
console.log('  Anatomía descubierta en texto SFW: 0 ✓\n')

if (total > BASELINE) {
    console.error(
        `FALLO: las infracciones subieron de ${BASELINE} a ${total}.\n` +
            'La difusión no procesa negaciones en el positivo: pásalas al negative_prompt,\n' +
            'y no nombres rasgos opcionales — llegan por la foto de referencia.\n',
    )
    process.exit(1)
}
if (total < BASELINE) {
    console.log(`Bajaron de ${BASELINE} a ${total} — actualiza BASELINE en este archivo.\n`)
}
