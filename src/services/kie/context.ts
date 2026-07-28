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
    /**
     * true = se esta EDITANDO una foto existente (la fuente viaja como
     * `referenceImage`), no generando desde cero. El contexto no podia
     * distinguirlo, y por eso el fallback de outfit se colaba en las ediciones:
     * la foto que se edita YA lleva su ropa puesta.
     */
    editMode?: boolean
    /**
     * ¿La hoja de cuerpo que viaja como ref es la NUDE del Body Lab?
     *
     * Existía en el Studio y se le pasaba a MuleRouter, pero NO llegaba aquí —
     * así que las rutas de KIE trataban igual a las dos hojas: le pedían a la
     * nude que "ignorara su ropa" (que no tiene) y nunca le pedían la PIEL,
     * que es lo que hizo que la nude funcionara ("con la hoja NUDE se copia
     * además la piel y la anatomía reales, lo que el texto no lograba").
     * La mejora vivía en muleRouterPrompt y no cruzó, porque el dato no
     * cruzaba: una ruta no puede usar lo que no recibe.
     */
    bodySheetNude?: boolean
    /**
     * El prompt YA es completo y auto-contenido: la ruta NO debe envolverlo en
     * su ancla de identidad ni recortarlo contra el presupuesto de escena.
     *
     * Existe por el Body Lab (2026-07-28). Sus hojas no son "un avatar en una
     * escena" —son la DEFINICIÓN del cuerpo—, y su prompt ya trae dentro todo
     * lo que el ancla intenta aportar (qué es la referencia, qué copiar de
     * ella, qué no). Al tratarlas como escena, el ancla de Seedream (~1.370
     * chars, hablando de una cara que la plantilla no aporta) se comía la mitad
     * del presupuesto y decapitaba la hoja a ~1.379 chars: se perdían tono de
     * piel, consistencia entre vistas, anclas de fotorrealismo y negativos.
     *
     * Peor: el corte caía en OFFSETS DISTINTOS para la variante vestida y la
     * nude (su cláusula de vestuario mide distinto y va ANTES del spec), así
     * que cada hoja se quedaba con un spec de cuerpo diferente —la vestida
     * conservaba "extremely thick, heavy, massive thighs" y la nude no— y las
     * dos hojas del MISMO avatar salían con cuerpos distintos.
     */
    selfContainedPrompt?: boolean
    /**
     * Region a editar en PIXELES de la imagen original [x1,y1,x2,y2].
     *
     * Wan 2.7 (base y pro) la acepta como `bbox_list`, un canal NATIVO. Es la
     * alternativa a quemar la mascara sobre la foto — que en un fusor literal
     * acaba copiada en la salida, con negacion o sin ella.
     */
    maskBBox?: [number, number, number, number]
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
