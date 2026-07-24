/**
 * Contrato de las rutas de imagen KIE.
 *
 * Una RUTA es una función autocontenida por modelo que construye el request de
 * KIE (`{ model, input }`) a partir de un contexto de ingredientes. Es PURA
 * salvo por `ctx.uploadRef` (la única dependencia con efecto), lo que la hace
 * verificable por snapshot determinista (se stubea el uploader).
 */

import type { KieRefWithRole } from './shared'

/** El request final que se manda a KIE createTask. */
export interface KieImageRequest {
    /** id REAL de modelo para KIE (ya resuelto de alias y de variante i2i). */
    model: string
    input: Record<string, unknown>
    /**
     * Prompt intermedio (post pose-relocate + strip, PRE-ancla) que la fachada
     * guarda como `fullApiPrompt` para debug. Preservado para paridad byte-a-byte
     * con el `generateImageKie` original; NO se envía a KIE.
     */
    fullApiPrompt: string
}

/**
 * Ingredientes que una ruta necesita para construir su request. Espejo de los
 * campos que hoy recibe `generateImageKie`, más `uploadRef` inyectable.
 */
export interface ImageRouteContext {
    model: string
    aspectRatio: string
    /** Prompt ya sanitizado que entra a la ruta (la escena/harness del cliente). */
    prompt: string
    referenceImage?: { base64: string; mimeType: string } | null
    referenceImages?: KieRefWithRole[]
    bodyEmphasis?: string
    hairEmphasis?: string
    eyeEmphasis?: string
    identityWeight?: number
    deepfakeMode?: boolean
    curveBoost?: string
    /**
     * Peso del Clone Ref (0-100). 100 = recrear la foto EXACTA (default);
     * más bajo = referencia más suelta / "inspirado en". Cada ruta lo traduce
     * a su manera (fuerza del clause). El cliente además decide si MANDA la
     * imagen del clone según el umbral.
     */
    cloneWeight?: number
    /** Negative prompt (lo que NO debe salir). Cada ruta decide si lo manda.
     *  OJO: Wan base/pro NO lo soportan (verificado en docs 2026-07-23) — esa
     *  ruta lo descarta a propósito; Qwen sí lo consume. */
    negativePrompt?: string
    /** Seed (reproducibilidad). Hoy solo Wan base/pro lo soportan en KIE
     *  (0-2147483647; 0/undefined = aleatorio). Para A/B de calibración. */
    seed?: number
    /**
     * SAFE MODE (cimiento del age-gate / entitlement "paquete NSFW"): true →
     * las rutas prenden el filtro de contenido de KIE (`nsfw_checker: true`,
     * `enable_safety_checker: true`) y la fachada NO salta la sanitización de
     * prompts para los permisivos. Hoy nadie lo pasa (default undefined =
     * comportamiento actual); se activará desde el perfil del usuario en el
     * servidor cuando entre el control de edad.
     */
    safeMode?: boolean
    /**
     * Sube un ref y devuelve su URL pública. En producción =
     * `uploadReferenceToSupabase`; en el snapshot = un stub determinista. Es la
     * ÚNICA dependencia con efecto de una ruta.
     */
    uploadRef: (base64: string, mimeType: string) => Promise<string>
    /**
     * Recorta un base64 al aspect ratio pedido (solo Grok lo usa — espeja el AR
     * del ref). En producción = `cropBase64ToAspect` (sharp); en el snapshot un
     * stub identidad (el uploader stubeado ignora los bytes → sigue determinista).
     */
    cropToAspect: (
        base64: string,
        mimeType: string,
        aspectRatio: string,
    ) => Promise<{ base64: string; mimeType: string }>
}

/**
 * Una ruta por modelo. `matches` decide si el modelo le pertenece; `build`
 * arma el request. `isPermissive` alimenta la escalera de moderación compartida
 * (los permisivos mandan el prompt crudo; los filtrados lo sanitizan más).
 */
export interface ImageRoute {
    /** Nombre para logs/diagnóstico (p.ej. "seedream"). */
    label: string
    matches: (model: string) => boolean
    isPermissive: boolean
    build: (ctx: ImageRouteContext) => Promise<KieImageRequest>
}
