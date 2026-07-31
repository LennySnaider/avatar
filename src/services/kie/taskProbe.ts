/**
 * Consulta el estado de UN taskId de KIE sin saber de qué familia es.
 *
 * POR QUÉ EXISTE: KIE no tiene un endpoint de estado único. Los modelos del
 * createTask genérico viven en `/jobs/recordInfo`, pero Flux Kontext y GPT-4o
 * Image tienen su PROPIO record-info con otra forma de respuesta
 * (successFlag + response.resultImageUrl en vez de state + resultJson).
 *
 * El reconciliador preguntaba SIEMPRE por `/jobs/recordInfo`: una tarea de
 * flux-kontext o gpt-4o devolvía 404 por ahí y se contaba como "sin rescate"
 * aunque en KIE estuviera terminada y con la imagen viva en su CDN. Probar las
 * tres familias es la diferencia entre recuperar la generación y perderla.
 *
 * Módulo NO `'use server'`: es una función normal (no una server action) para
 * poder llamarla desde otros servicios sin exponer un endpoint por cada helper.
 */
import type {
    KieRecordInfoResponse,
    KieResultJsonShape,
    KieFluxKontextRecordInfoResponse,
} from '@/@types/kie'

const KIE_API_BASE = 'https://api.kie.ai/api/v1'
const PROBE_TIMEOUT_MS = 30_000

/** Familia de endpoint donde vive la tarea — también dice de qué modelo era. */
export type KieTaskFamily = 'jobs' | 'flux-kontext' | 'gpt4o-image'

export type KieTaskProbe =
    | { state: 'running'; family: KieTaskFamily; model?: string }
    | {
          state: 'success'
          family: KieTaskFamily
          urls: string[]
          model?: string
          /**
           * Prompt con el que se lanzó la tarea, recuperado del `param` que
           * guarda KIE. Existe porque `generations.prompt` es NOT NULL y el
           * rescate manual no tiene de dónde sacarlo: sin esto, recuperar una
           * tarea huérfana moría con "null value in column prompt".
           */
          prompt?: string
      }
    | { state: 'fail'; family: KieTaskFamily; error: string; model?: string }
    /** Ninguna familia reconoce el id (o la clave no ve esa tarea). */
    | { state: 'unknown'; family: null; error: string }

/**
 * Saca el prompt del `param` que KIE guarda con cada tarea.
 *
 * Viene DOBLEMENTE serializado en la familia `jobs`: `param` es un JSON string
 * cuyo campo `input` es OTRO JSON string. Se tolera también la forma plana (un
 * solo nivel) porque no todas las familias lo anidan igual.
 *
 * Nunca lanza: esto es telemetría de rescate. Si el formato cambia, el rescate
 * debe seguir funcionando con su texto de respaldo, no morirse parseando.
 */
function promptFromParam(param?: string): string | undefined {
    if (!param) return undefined
    try {
        const outer = JSON.parse(param) as Record<string, unknown>
        const inner =
            typeof outer.input === 'string'
                ? (JSON.parse(outer.input) as Record<string, unknown>)
                : (outer.input as Record<string, unknown> | undefined)
        const prompt = inner?.prompt ?? outer.prompt
        return typeof prompt === 'string' && prompt.trim() ? prompt : undefined
    } catch {
        return undefined
    }
}

function authHeaders(): Record<string, string> {
    const key = process.env.KIE_API_KEY
    if (!key) throw new Error('KIE_API_KEY is not defined')
    return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

/**
 * Resultado crudo de una familia (sin la etiqueta de familia, que la pone el
 * despachador). null = esta familia no conoce el id.
 *
 * Se escribe a mano en vez de `Omit<KieTaskProbe,'family'>`: Omit sobre una
 * unión la colapsa en un solo objeto y perdería los campos por variante.
 */
type FamilyResult =
    | { state: 'running'; model?: string }
    | { state: 'success'; urls: string[]; model?: string; prompt?: string }
    | { state: 'fail'; error: string; model?: string }
    | null

async function getJson(
    path: string,
    taskId: string,
): Promise<{ ok: boolean; status: number; json?: unknown; text?: string }> {
    const res = await fetch(
        `${KIE_API_BASE}${path}?taskId=${encodeURIComponent(taskId)}`,
        {
            headers: authHeaders(),
            signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        },
    )
    if (!res.ok) {
        return { ok: false, status: res.status, text: await res.text() }
    }
    return { ok: true, status: res.status, json: await res.json() }
}

async function probeJobs(taskId: string): Promise<FamilyResult> {
    const r = await getJson('/jobs/recordInfo', taskId)
    if (!r.ok) return null
    const json = r.json as KieRecordInfoResponse
    // code !== 200 con data vacío = "no existe por aquí", no un fallo de tarea.
    if (!json.data?.state) return null
    if (json.data.state === 'success') {
        const parsed: KieResultJsonShape = json.data.resultJson
            ? JSON.parse(json.data.resultJson)
            : {}
        const urls = parsed.resultUrls ?? []
        return urls.length
            ? {
                  state: 'success',
                  urls,
                  model: json.data.model,
                  prompt: promptFromParam(json.data.param),
              }
            : {
                  state: 'fail',
                  error: 'KIE dice success pero no devolvió resultUrls',
                  model: json.data.model,
              }
    }
    if (json.data.state === 'fail') {
        return {
            state: 'fail',
            error:
                `${json.data.failCode || ''} ${json.data.failMsg || 'Unknown error'}`.trim(),
            model: json.data.model,
        }
    }
    return { state: 'running', model: json.data.model }
}

/** successFlag: 0=generando, 1=ok, 2=create-failed, 3=generate-failed. */
function readFlagShape(
    flag: number | undefined,
    urls: string[],
    errorMessage?: string,
    errorCode?: string,
): FamilyResult {
    if (flag === undefined) return null
    if (flag === 1 && urls.length) return { state: 'success', urls }
    if (flag === 2 || flag === 3) {
        return {
            state: 'fail',
            error: errorMessage || errorCode || `flag=${flag}`,
        }
    }
    return { state: 'running' }
}

async function probeFluxKontext(taskId: string): Promise<FamilyResult> {
    const r = await getJson('/flux/kontext/record-info', taskId)
    if (!r.ok) return null
    const json = r.json as KieFluxKontextRecordInfoResponse
    const data = json.data as
        | (KieFluxKontextRecordInfoResponse['data'] & {
              resultImageUrl?: string
          })
        | undefined
    if (!data) return null
    // Igual que el poll de Flux: la URL sale unas veces dentro de `response` y
    // otras al nivel de `data` — aceptar ambas o se pierde el rescate.
    const url = data.response?.resultImageUrl ?? data.resultImageUrl
    return readFlagShape(
        data.successFlag,
        url ? [url] : [],
        data.errorMessage,
        data.errorCode,
    )
}

async function probeGpt4o(taskId: string): Promise<FamilyResult> {
    const r = await getJson('/gpt4o-image/record-info', taskId)
    if (!r.ok) return null
    const json = r.json as {
        data?: {
            successFlag?: number
            response?: { resultUrls?: string[] }
            errorCode?: string
            errorMessage?: string
        }
    }
    if (!json.data) return null
    return readFlagShape(
        json.data.successFlag,
        json.data.response?.resultUrls ?? [],
        json.data.errorMessage,
        json.data.errorCode,
    )
}

/**
 * Pregunta a KIE por un taskId probando las tres familias, en el orden en que
 * es probable acertar (la genérica cubre casi todos los modelos actuales).
 *
 * Un error de RED sí se propaga: devolver 'unknown' ante un fallo transitorio
 * haría que el reconciliador borrase el rastro de una tarea perfectamente viva.
 */
export async function probeKieTask(taskId: string): Promise<KieTaskProbe> {
    const families: Array<[KieTaskFamily, (id: string) => Promise<FamilyResult>]> =
        [
            ['jobs', probeJobs],
            ['flux-kontext', probeFluxKontext],
            ['gpt4o-image', probeGpt4o],
        ]
    const misses: string[] = []
    for (const [family, probe] of families) {
        const r = await probe(taskId)
        if (r) return { ...r, family } as KieTaskProbe
        misses.push(family)
    }
    return {
        state: 'unknown',
        family: null,
        error: `Ninguna familia de KIE reconoce este taskId (${misses.join(', ')}). Puede ser de otro proveedor, de otra cuenta/API key, o haber caducado en su historial.`,
    }
}
