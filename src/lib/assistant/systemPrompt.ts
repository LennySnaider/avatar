/**
 * F5.2 (Estratega) — El PROMPT DE SISTEMA del agente de la organización.
 *
 * Puro a propósito (sin imports de runtime): el prompt es la pieza que más se
 * va a retocar, y poder ver en un test QUÉ frase entra y cuál no es la única
 * forma de retocarlo sin romperlo a ciegas.
 *
 * Lo que contiene y por qué:
 *  - CONTEXTO REAL de la organización (nombre, avatares, redes, fecha). Sin
 *    esto, el modelo pregunta lo que ya sabemos o se inventa un avatar. La
 *    fecha va explícita porque el modelo no la tiene y "últimos 7 días" sin
 *    hoy es una cuenta imposible.
 *  - LA PANTALLA desde la que se abrió el widget: el usuario pregunta "¿cómo
 *    va esto?" y "esto" es lo que está mirando.
 *  - REGLAS DURAS: nunca inventar cifras, leerlas con las herramientas, y
 *    responder en cuanto los datos basten. Esta última no es estética: cada
 *    paso extra del bucle de herramientas es un turno más de tokens (Fase 0
 *    midió ~14k en un turno con una llamada al MCP frente a ~2.7k en uno
 *    simple), y el `stopWhen(stepCountIs(6))` de la ruta corta por lo bruto
 *    lo que esta frase evita por las buenas.
 *  - EL ESTADO DE META, y sólo una de las dos frases posibles. Si se
 *    escribieran las dos ("si está conectado… si no…"), el modelo elige la
 *    que le viene bien y acaba diciéndole al usuario que conecte algo que ya
 *    tiene conectado.
 */
import type { AssistantScreen } from './types'

/** Lo que el prompt necesita saber de cada avatar. */
export interface StrategistAvatarBrief {
    name: string
    /** Redes conectadas en Upload-Post. Vacío = ninguna. */
    platforms: string[]
    /** ¿Tiene persona de IA encendida? */
    aiOn: boolean
}

export interface StrategistPromptInput {
    orgName: string
    avatars: StrategistAvatarBrief[]
    screen: AssistantScreen
    /** ¿Hay grant de Meta por Vercel Connect para este usuario? */
    hasMeta: boolean
    /** Hoy en formato `YYYY-MM-DD` (UTC). Lo pone el llamador para que el
     *  prompt sea determinista y testeable. */
    today: string
}

/** Cómo se llama cada pantalla EN CASTELLANO, que es como la ve el usuario. */
const SCREEN_LABEL: Record<AssistantScreen, string> = {
    inbox: 'el inbox de conversaciones (mensajes de fans y borradores de la IA)',
    'social-accounts': 'las cuentas de redes sociales conectadas',
    'social-posts': 'las publicaciones de redes sociales y su rendimiento',
    studio: 'el estudio de creación de contenido del avatar',
    modules: 'los módulos instalables de la plataforma',
    other: 'una pantalla general del panel',
}

function avatarLine(a: StrategistAvatarBrief): string {
    const redes =
        a.platforms.length > 0 ? a.platforms.join(', ') : 'sin redes conectadas'
    return `- ${a.name} (${redes}; IA ${a.aiOn ? 'encendida' : 'apagada'})`
}

export function buildStrategistSystemPrompt({
    orgName,
    avatars,
    screen,
    hasMeta,
    today,
}: StrategistPromptInput): string {
    const listaAvatares =
        avatars.length > 0
            ? avatars.map(avatarLine).join('\n')
            : '- (todavía no hay avatares en esta organización)'

    const meta = hasMeta
        ? 'Meta Ads está conectado: puedes leer cuentas publicitarias y sus insights con las herramientas de Meta.'
        : 'Meta Ads no está conectado en esta organización. Si la pregunta necesita datos de anuncios, dilo claramente y pide que se conecte con el botón "Conectar Meta" que aparece en este mismo panel; no inventes cifras de campañas ni las estimes.'

    return [
        `Eres el Social Media Manager de "${orgName}", una agencia de creadoras digitales (avatares de IA).`,
        `Hoy es ${today} (UTC).`,
        '',
        'CÓMO HABLAS',
        '- En español, profesional y concreto. Sin adornos ni entusiasmo de vendedor.',
        '- Respuestas cortas: la conclusión primero y, si hace falta, las cifras que la sostienen.',
        '',
        'REGLAS QUE NO SE ROMPEN',
        '- Nunca inventes cifras, nombres ni fechas. Todo dato numérico sale de una herramienta.',
        '- Si no tienes la herramienta o los datos, dilo y explica qué haría falta.',
        '- Responde en cuanto los datos basten: no encadenes llamadas innecesarias a herramientas.',
        '- No prometas acciones: en esta versión sólo puedes LEER. Si te piden publicar, contestar o cambiar algo, explica dónde hacerlo en el panel.',
        '- Cita siempre el periodo de los datos que das (por ejemplo, "últimos 14 días").',
        '',
        'DÓNDE ESTÁ EL USUARIO',
        `- Ha abierto este asistente desde ${SCREEN_LABEL[screen]}. Si su pregunta es ambigua, asume que habla de eso.`,
        '',
        'AVATARES DE LA ORGANIZACIÓN',
        listaAvatares,
        '',
        'META ADS',
        `- ${meta}`,
    ].join('\n')
}
