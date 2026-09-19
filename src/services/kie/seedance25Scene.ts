/**
 * ESCENA efectiva de Seedance 2.5 (KIE). PURO: sin red ni Supabase, para
 * poder probar la regla sin gastar créditos — mismo criterio que
 * `seedance25Aspect`, que nació del 422 anterior de este mismo modelo.
 *
 * Contrato de KIE (createTask devolvía 422 el 2026-09-19):
 *   "The reference video and the first and last frames are mutually
 *    exclusive, and only one scene can be selected"
 * y su doc (docs.kie.ai/market/bytedance/seedance-2-5) lo enuncia entero:
 *   "Image-to-Video (First Frame), Image-to-Video (First & Last Frames), and
 *    Multimodal Reference-to-Video … are three mutually exclusive scenarios
 *    and cannot be used simultaneously."
 *
 * O sea: los canales `reference_*` (imagen, vídeo y audio) SÍ conviven entre
 * ellos —son la misma escena multimodal— pero NINGUNO admite al lado un
 * `first_frame_url` / `last_frame_url`. El código trataba vídeo y audio como
 * "canales independientes del modo de imagen" y por eso un vídeo de
 * referencia junto a un primer fotograma salía rebotado.
 *
 * Cuando el caller manda las dos cosas hay que elegir, y gana REFERENCIAS: el
 * vídeo/audio de referencia es una subida deliberada del usuario, mientras que
 * el "primer fotograma" suele ser el frame que el propio Studio deriva para
 * encadenar clips. Además no se pierde nada, porque en esa escena el fotograma
 * viaja igual como `reference_image_urls[0]` y el prompt lo reclama con
 * @Image1 — el mismo camino que ya usaba el modo continuación.
 */

export type Seedance25Scene = 'first-frame' | 'references'

export function seedance25Scene(opts: {
    /** ¿El caller aportó un primer fotograma? */
    hasFirstFrame: boolean
    /** Refs de identidad (`reference_image_urls`). */
    imageRefCount: number
    /** Refs de vídeo (`reference_video_urls`). */
    videoRefCount: number
    /** Refs de audio (`reference_audio_urls`). */
    audioRefCount: number
}): Seedance25Scene {
    const hasAnyRef =
        opts.imageRefCount > 0 ||
        opts.videoRefCount > 0 ||
        opts.audioRefCount > 0
    if (hasAnyRef) return 'references'
    return opts.hasFirstFrame ? 'first-frame' : 'references'
}
