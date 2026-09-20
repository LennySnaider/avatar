// src/services/kie/engineCaps.ts
/**
 * Capacidades declaradas POR MOTOR, en un solo sitio.
 *
 * Por qué existe: dar de alta un motor de imagen exige hoy acertar una decisión
 * binaria en ~11 listas-por-string repartidas entre el Studio, el modal de
 * preview, la fachada de KIE y el cobro (`m.startsWith('qwen')` aparece en
 * nueve sitios de `AvatarStudioMain.tsx` solamente). Cada olvido falla en
 * SILENCIO: no lanza, simplemente genera o cobra otra cosa. La prueba de que el
 * patrón ya se pudrió está en el propio código — `dfCapable` y
 * `deepfakeCapable` son la misma lista escrita dos veces.
 *
 * REGLA DE USO (importa tanto como el módulo): aquí se describen SOLO los
 * motores nuevos. Los existentes devuelven `undefined` a propósito y sus
 * predicados quedan intactos, por lo que cada call site delega con `??` y NO
 * con `||`:
 *
 *     const isExplicitCapableModel = (m: string): boolean =>
 *         engineCaps(m)?.explicitCapable ?? (m.startsWith('seedream/') || …)
 *
 * Sin entrada en esta tabla se evalúa exactamente el booleano de hoy, y
 * `engineCaps.test.ts` lo afirma modelo por modelo. Migrar aquí a Seedream,
 * Wan, FLUX.2 o Qwen 2 es el refactor que rompe lo que factura: no se hace
 * "ya que estamos".
 */

export type EngineResolution = '1K' | '2K' | '4K'

export interface EngineCaps {
    /** providerId de billing. Une la card del catálogo con el sku del ledger. */
    id: string
    /** i2i PURO: sin imagen de entrada la API rechaza. Bloquea antes de cobrar. */
    requiresRefs: boolean
    /** Tope de imágenes de referencia que se le mandan. */
    maxRefs: number
    /** Submit + poll en el navegador (createTask devuelve taskId y se sondea). */
    asyncSubmit: boolean
    /** Rinde desnudo explícito de verdad (batch y toggle 🌶️). */
    explicitCapable: boolean
    /** Acepta el lienzo + cara del path de Deepfake. */
    deepfakeCapable: boolean
    /** Puede editar una imagen ya generada (dropdown del preview). */
    canEdit: boolean
    /** Usa el flujo de dos fases (t2i + face-swap) del Studio. */
    twoPhase: boolean
    /** Resolución que se manda si nadie elige otra. */
    defaultResolution: EngineResolution
    /** Tramos que la API acepta; el orden es el que verá la UI. */
    resolutions: readonly EngineResolution[]
    /** Aspect ratios que la API acepta. Fuera de este set se usa el fallback. */
    aspectRatios: ReadonlySet<string>
}

/** Ratios de Qwen 3 (doc KIE: `image_size`). */
const QWEN3_RATIOS = new Set([
    '1:1',
    '3:2',
    '2:3',
    '4:3',
    '3:4',
    '16:9',
    '9:16',
    '21:9',
])

/** Ratios de GPT Image 2.5 Flare (doc KIE: `aspect_ratio`). */
const FLARE_RATIOS = new Set([
    'auto',
    '1:1',
    '3:2',
    '2:3',
    '16:9',
    '9:16',
    '4:3',
    '3:4',
    '21:9',
    '27:16',
    '16:27',
    '9:8',
    '8:9',
])

/**
 * Qwen 3 Pro. i2i PURO — `image_urls` es obligatorio en la doc.
 *
 * `twoPhase: false` no es un detalle: el Studio activa su flujo de dos fases
 * con `kieModel.startsWith('qwen')` y la fase 1 HARDCODEA `qwen2/text-to-image`.
 * Sin esto, elegir Qwen 3 con un avatar con cara —el caso normal— dispararía
 * dos generaciones de dos motores distintos y DOS cobros.
 *
 * `explicitCapable: true` está MEDIDO en vivo (19-sep-2026, task 303a85d6…):
 * con `nsfw_checker: false` y un prompt explícito, la tarea se completó en 22s
 * y se cobró igual que una normal (14.9cr) — no rebota río arriba, que es
 * justo lo que descarta a los demás de esta lista (FLUX.2 da 422, Grok 431,
 * Gemini filtra). Lo que la medición NO cubre es la CALIDAD del render: si al
 * revisarlo se ve que devuelve a la persona vestida, esto se apaga.
 */
const QWEN3_PRO: EngineCaps = {
    id: 'kie-qwen3-pro',
    requiresRefs: true,
    // La doc dice "Multiple Files: Yes" pero NO publica el máximo. Este 3 es
    // NUESTRO tope (cara + 2 assets), el mismo criterio que ya usa la ruta de
    // Qwen 2 — no un límite de la API que nadie ha verificado.
    maxRefs: 3,
    asyncSubmit: true,
    explicitCapable: true,
    deepfakeCapable: false,
    canEdit: true,
    twoPhase: false,
    // 2K son $0.0625 por imagen; 1K, $0.0345 (casi la mitad, y lo mismo que
    // cuesta Seedream 5 Pro).
    defaultResolution: '2K',
    resolutions: ['1K', '2K'],
    aspectRatios: QWEN3_RATIOS,
}

/**
 * GPT Image 2.5 Flare. Releva a GPT Image 2 en el selector; su i2i
 * (`gpt-image-2-5-flare-image-to-image`, `input_urls` máx 16) tiene el mismo
 * contrato que el del modelo al que sustituye.
 *
 * `explicitCapable: false` porque OpenAI filtra río arriba: el prompt debe
 * pasar por el saneador, no viajar crudo.
 */
const FLARE: EngineCaps = {
    id: 'kie-gpt-image-2-5-flare',
    requiresRefs: false,
    maxRefs: 16,
    asyncSubmit: true,
    explicitCapable: false,
    deepfakeCapable: true,
    canEdit: true,
    twoPhase: false,
    defaultResolution: '2K',
    resolutions: ['1K', '2K', '4K'],
    aspectRatios: FLARE_RATIOS,
}

/**
 * Capacidades del modelo, o `undefined` si todavía no está descrito aquí —
 * que es el caso de TODOS los motores anteriores a Qwen 3, a propósito.
 */
export function engineCaps(
    model: string | null | undefined,
): EngineCaps | undefined {
    if (!model) return undefined
    if (model.startsWith('qwen3/pro-')) return QWEN3_PRO
    // El hermano no-pro comparte contrato de API y cambia de precio.
    if (model.startsWith('qwen3/')) return { ...QWEN3_PRO, id: 'kie-qwen3' }
    if (model.startsWith('gpt-image-2-5-flare')) return FLARE
    return undefined
}
