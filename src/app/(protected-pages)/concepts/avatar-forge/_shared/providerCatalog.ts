// Catálogo REAL de providers del Avatar Studio — módulo UNIVERSAL (sin
// 'use client'): lo leen server components (página AI Providers: chequeo de
// env keys con process.env) y client components (drawer/selector). Importar
// esto desde un módulo 'use client' en un server component convierte los
// exports en referencias opacas del RSC ('DEFAULT_PROVIDERS is not iterable').
import type { AIProvider, ProviderType } from '@/@types/supabase'


// Predefined providers - exported for use in initialization
export const DEFAULT_PROVIDERS: AIProvider[] = [
    // Image Providers
    {
        id: 'gemini-nano-banana',
        name: 'Gemini 3 Pro Image',
        type: 'GOOGLE' as ProviderType,
        model: 'gemini-3-pro-image-preview',
        endpoint: null,
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'GEMINI_API_KEY',
        created_at: null,
    },
    {
        id: 'gemini-flash-lite-image',
        name: 'Gemini 3.1 Flash Lite Image',
        type: 'GOOGLE' as ProviderType,
        model: 'gemini-3.1-flash-lite-image',
        endpoint: null,
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'GEMINI_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-nano-banana-pro',
        name: 'Nano Banana Pro · KIE',
        type: 'KIE' as ProviderType,
        model: 'nano-banana-pro',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'minimax-image-01',
        name: 'MiniMax image-01',
        type: 'MINIMAX' as ProviderType,
        model: 'image-01',
        endpoint: 'https://api.minimaxi.com/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'MINIMAX_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-flux-kontext',
        name: 'Flux.1 Kontext Pro (KIE)',
        type: 'KIE' as ProviderType,
        model: 'flux-kontext-pro',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-flux-kontext-max',
        name: 'Flux.1 Kontext Max (KIE)',
        type: 'KIE' as ProviderType,
        model: 'flux-kontext-max',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-gpt-4o-image',
        name: 'GPT 4o Image (KIE)',
        type: 'KIE' as ProviderType,
        model: 'gpt-4o-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-gpt-image-2',
        name: 'GPT Image 2 · KIE',
        type: 'KIE' as ProviderType,
        model: 'gpt-image-2-text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    // ─── Permissive image models (nsfw_checker off) — text→image ───────────
    {
        id: 'kie-seedream-4-5',
        name: 'Seedream 4.5 · KIE',
        type: 'KIE' as ProviderType,
        model: 'seedream/4.5-text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-flux-2-pro',
        name: 'FLUX.2 Pro · KIE',
        type: 'KIE' as ProviderType,
        model: 'flux-2/pro-text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    // Z-Image removed (2026-07-13): no image-to-image variant exists on KIE
    // (verified — 4 candidate ids all 422), so it can never lock the avatar's
    // face. KieService still supports the model if it's ever re-added.
    {
        id: 'kie-seedream-5-lite',
        name: 'Seedream 5.0 Lite · KIE',
        type: 'KIE' as ProviderType,
        model: 'seedream/5-lite-text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-seedream-5-pro',
        name: 'Seedream 5.0 Pro · KIE',
        type: 'KIE' as ProviderType,
        model: 'seedream/5-pro-image-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-qwen-image',
        name: 'Qwen Image 2.0 · KIE',
        type: 'KIE' as ProviderType,
        model: 'qwen2/text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-ideogram-v3',
        name: 'Ideogram V3 · KIE',
        type: 'KIE' as ProviderType,
        model: 'ideogram/v3-text-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-nano-banana-2',
        name: 'Nano Banana 2 · KIE',
        type: 'KIE' as ProviderType,
        model: 'nano-banana-2',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-nano-banana-2-lite',
        name: 'Nano Banana 2 Lite · KIE',
        type: 'KIE' as ProviderType,
        model: 'nano-banana-2-lite',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-grok-imagine',
        name: 'Grok Imagine · KIE',
        type: 'KIE' as ProviderType,
        model: 'grok-imagine/image-to-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-wan-image',
        name: 'Wan 2.7 Image · KIE',
        type: 'KIE' as ProviderType,
        model: 'wan/2-7-image',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: true,
        supports_video: false,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    // Video Providers
    {
        id: 'gemini-veo-3-1',
        name: 'Gemini Veo 3.1',
        type: 'GOOGLE' as ProviderType,
        model: 'veo-3.1-fast-generate-preview',
        endpoint: null,
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'GEMINI_API_KEY',
        created_at: null,
    },
    {
        id: 'kling-v1-5',
        name: 'Kling v1.5',
        type: 'KLING' as ProviderType,
        model: 'kling-v1-5',
        endpoint: 'https://api-singapore.klingai.com',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KLING_ACCESS_KEY',
        created_at: null,
    },
    {
        id: 'kling-v1-6',
        name: 'Kling v1.6',
        type: 'KLING' as ProviderType,
        model: 'kling-v1-6',
        endpoint: 'https://api-singapore.klingai.com',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KLING_ACCESS_KEY',
        created_at: null,
    },
    {
        id: 'kling-v2-6',
        name: 'Kling v2.6 (Voice)',
        type: 'KLING' as ProviderType,
        model: 'kling-v2-6',
        endpoint: 'https://api-singapore.klingai.com',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KLING_ACCESS_KEY',
        created_at: null,
    },
    {
        id: 'kling-v3',
        name: 'Kling v3 (Latest)',
        type: 'KLING' as ProviderType,
        model: 'kling-v3',
        endpoint: 'https://api-singapore.klingai.com',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KLING_ACCESS_KEY',
        created_at: null,
    },
    {
        id: 'minimax-hailuo-2-3',
        name: 'MiniMax Hailuo 2.3',
        type: 'MINIMAX' as ProviderType,
        model: 'MiniMax-Hailuo-2.3',
        endpoint: 'https://api.minimax.io/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'MINIMAX_API_KEY',
        created_at: null,
    },
    {
        id: 'minimax-hailuo-2-3-fast',
        name: 'MiniMax Hailuo 2.3 Fast',
        type: 'MINIMAX' as ProviderType,
        model: 'MiniMax-Hailuo-2.3-Fast',
        endpoint: 'https://api.minimax.io/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'MINIMAX_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-seedance-2',
        name: 'Seedance 2.0 (KIE)',
        type: 'KIE' as ProviderType,
        model: 'bytedance/seedance-2',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-wan-2-7',
        name: 'Wan 2.7 i2v (KIE)',
        type: 'KIE' as ProviderType,
        model: 'wan/2-7-image-to-video',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-wan-2-2-uncensored',
        name: 'Wan 2.2 Sin Censura · KIE',
        type: 'KIE' as ProviderType,
        model: 'wan/2-2-a14b-image-to-video-turbo',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
    {
        id: 'kie-kling-3-0',
        name: 'Kling 3.0 · KIE',
        type: 'KIE' as ProviderType,
        model: 'kling-3.0/video',
        endpoint: 'https://api.kie.ai/api/v1',
        is_active: true,
        supports_image: false,
        supports_video: true,
        requires_api_key: true,
        api_key_env_var: 'KIE_API_KEY',
        created_at: null,
    },
]

// Approx USD cost PER IMAGE, shown on each card so the pick weighs price too.
// KIE models: measured live from `creditsConsumed × $0.005/credit` (KIE's rate,
// e.g. Veo3 Fast $0.40 = 80 cr). z-image 0.8cr=$0.004 · grok 4cr=$0.02 · seedream
// 5-lite 5.5cr=$0.028 · seedream 4.5 6.5cr=$0.033 · flux-2 7cr=$0.035 · nano-2
// 12cr=$0.06. Non-KIE + kontext/gpt from docs/cost-routing.md. qwen/ideogram/
// gemini/minimax are estimates (KIE errored on the probe / no live meter) → keep
// the ~ prefix honest. Re-measure from kie.ai/logs if a price drifts.
export const PROVIDER_COST: Record<string, string> = {
    'gemini-nano-banana': '~$0.13',
    'gemini-flash-lite-image': '~$0.02',
    'kie-nano-banana-pro': '~$0.09',
    'minimax-image-01': '~$0.01',
    'kie-flux-kontext': '~$0.04',
    'kie-flux-kontext-max': '~$0.08',
    'kie-gpt-4o-image': '~$0.03',
    'kie-gpt-image-2': '~$0.03',
    'kie-seedream-4-5': '~$0.033',
    'kie-flux-2-pro': '~$0.035',
    'kie-seedream-5-lite': '~$0.028',
    'kie-seedream-5-pro': '~$0.035',
    'kie-qwen-image': '~$0.02',
    'kie-ideogram-v3': '~$0.05',
    'kie-nano-banana-2': '~$0.06',
    'kie-nano-banana-2-lite': '~$0.034',
    'kie-grok-imagine': '~$0.02',
    // Medido live 2026-07-16: 4.8cr en 1K y en 2K (precio plano por imagen).
    'kie-wan-image': '~$0.024',
}

// Verified against the generation dispatch (AvatarStudioMain.handleGenerate):
//  face = sends the avatar's FACE image → identity consistency.
//  permissive = disables the content filter (nsfw off / less restrictive).
// The sweet spot is BOTH (MiniMax). Drives the badges on each card so the pick
// is obvious instead of trial-and-error.
export const PROVIDER_TRAITS: Record<string, { face?: boolean; permissive?: boolean }> = {
    'gemini-nano-banana': { face: true },
    'gemini-flash-lite-image': { face: true },
    'kie-nano-banana-pro': { face: true },
    'minimax-image-01': { face: true, permissive: true },
    'kie-gpt-4o-image': { face: true },
    'kie-gpt-image-2': { face: true },
    'kie-flux-kontext': { face: true },
    'kie-flux-kontext-max': { face: true },
    'kie-seedream-4-5': { face: true, permissive: true },
    'kie-seedream-5-lite': { face: true, permissive: true },
    'kie-seedream-5-pro': { face: true, permissive: true },
    'kie-flux-2-pro': { permissive: true },
    'kie-qwen-image': { permissive: true },
    'kie-grok-imagine': { face: true },
    // Ambos reciben la cara vía image_input[] (mismo patrón que nano-banana-pro)
    'kie-nano-banana-2': { face: true },
    'kie-nano-banana-2-lite': { face: true },
    // i2v: la identidad viaja en la imagen (first frame). Open-weights sin
    // filtro; en KIE nsfw_checker default false → el permisivo REAL de video.
    'kie-wan-2-2-uncensored': { face: true, permissive: true },
    // Unified t2i+edit; refs vía input_urls (cara + body). Sin moderación
    // upstream (edit NSFW verificado live) → el permisivo REAL de imagen.
    'kie-wan-image': { face: true, permissive: true },
}

// Descripción por provider — a nivel módulo para compartirla con la página
// AI Providers (misma fuente de verdad que el selector del Studio).
export const getProviderDescription = (provider: AIProvider): string => {
    switch (provider.id) {
        case 'gemini-nano-banana':
            return 'Studio-quality images, text rendering, multi-image blending'
        case 'gemini-flash-lite-image':
            return 'Rápido y barato (~3s), 9:16 nativo — ideal para volumen'
        case 'gemini-veo-3-1':
            return 'Veo 3.1 - audio nativo, hasta 3 ref images + first frame, 9:16 vertical'
        case 'kling-v1-6':
            return 'Video estable, motion brush, camera control'
        case 'kling-v2-6':
            return 'Voice synthesis, lip-sync, talking avatars'
        case 'kling-v3':
            return 'Video generation, motion control, voice synthesis, mejor calidad'
        case 'minimax-image-01':
            return 'Menos restrictivo, subject reference, fashion-friendly'
        case 'minimax-hailuo-2-3':
            return 'Video Hailuo 2.3, subject reference (avatar lock), 1080P'
        case 'minimax-hailuo-2-3-fast':
            return 'Hailuo 2.3 Fast - más rápido y económico'
        case 'kie-flux-kontext':
            return 'Flux.1 Kontext Pro - context-aware editing, 8 unidades por imagen'
        case 'kie-flux-kontext-max':
            return 'Flux.1 Kontext Max - mejor calidad para escenas complejas'
        case 'kie-gpt-4o-image':
            return 'OpenAI GPT 4o - photorealistic, mejor con texto en imagen'
        case 'kie-gpt-image-2':
            return 'OpenAI GPT Image 2 vía KIE - usa refs (image-to-image, hasta 16), 9:16 nativo, 2K'
        case 'kie-seedream-4-5':
            return 'Seedream 4.5 (ByteDance) — PERMISIVO (filtro NSFW off) + usa la CARA del avatar (i2i 4.5-edit, verificado). Calidad 2K, ideal fashion/sensual'
        case 'kie-flux-2-pro':
            return 'FLUX.2 Pro (Black Forest Labs) — filtro de KIE off, 2K, i2i con cara + Body Ref. OJO: BFL aplica SU propia moderación (422 nsfw en swimwear atrevido/edits picantes) — para eso usa Seedream'
        case 'kie-seedream-5-lite':
            return 'Seedream 5.0 Lite (ByteDance) — PERMISIVO (filtro off) + usa la CARA del avatar (i2i verificado: misma cara, mismo precio). 2K'
        case 'kie-seedream-5-pro':
            return 'Seedream 5.0 Pro (ByteDance) — PERMISIVO + CARA del avatar (image-to-image nativo, verificado). Más calidad que Lite. Requiere avatar con cara'
        case 'kie-qwen-image':
            return 'Qwen Image 2.0 (Alibaba) — filtro de KIE off, PERO su moderación upstream bloquea desnudos ("flagged as sensitive", verificado). Fashion/sensual OK; para NSFW real usa Wan 2.7 Image. i2i con cara (image_url)'
        case 'kie-ideogram-v3':
            return 'Ideogram V3 — el mejor para TEXTO dentro de la imagen (carteles/logos). Filtro estándar. Solo texto→imagen'
        case 'kie-nano-banana-2':
            return 'Nano Banana 2 (Google) — calidad top hasta 4K, usa la cara del avatar (image_input). OJO: Google = filtro estricto (no ayuda con bloqueos)'
        case 'kie-nano-banana-2-lite':
            return 'Nano Banana 2 Lite (Gemini 3.1 Flash-Lite) — el más RÁPIDO (~4s) y barato de Google, 1K, usa la cara del avatar (image_input). Filtro estricto de Google — para SFW con identidad y volumen'
        case 'kie-grok-imagine':
            return 'Grok Imagine (xAI) · image-to-image — usa la cara del avatar (la ref se recorta al aspect ratio pedido: su salida copia el ratio del input). OJO: su PROPIO filtro bloquea bikini/sensual aun con nsfw off — para sensual usa Seedream / FLUX.2. Para SFW con identidad'
        case 'kie-wan-image':
            return 'Wan 2.7 Image (Alibaba) — SIN CENSURA real de imagen: nsfw off y SIN moderación upstream (edit NSFW verificado live). Genera Y edita en el mismo modelo, usa la cara del avatar (input_urls, hasta 9 refs), 9:16 nativo, 2K, ~30s. El único que edita desnudos — Qwen/FLUX.2/Grok bloquean upstream'
        case 'kie-kling-3-0':
            return 'Kling 3.0 vía KIE — video i2v/t2v + motion-control v2v, audio nativo opcional, ~20% más barato que el directo'
        case 'kie-wan-2-2-uncensored':
            return 'Wan 2.2 A14B turbo (Alibaba, open-weights) — video SIN CENSURA: sin filtro embebido y nsfw_checker off. i2v: anima una imagen (la identidad viaja en el first frame — usa Animate sobre una foto del avatar). 480p/720p, ~5s, hereda el aspect de la imagen'
        case 'kie-nano-banana-pro':
            return 'Gemini 3 Pro Image vía KIE - mismo modelo que el directo, ~30% más barato, 9:16 nativo, 2K'
        default:
            return provider.model
    }
}

/**
 * Modelos t2i PUROS y permisivos aptos para el BODY ANGLE SHEET. El sheet se
 * genera SIN foto de cara (text-to-image), así que el cuerpo lo define 100% el
 * configurador.
 *
 * OJO con la trampa de nombres: los ids `seedream/*-text-to-image` NO sirven
 * para t2i puro — en KIE ese endpoint EXIGE `image_urls` y sin referencia
 * devuelve 500 "This field is required" (solo funcionan en modo edit, con
 * imagen). Qwen Image 2.0 (unificado) y FLUX.2 Pro sí son text-to-image real.
 * Por eso el body sheet usa un allowlist explícito, no un filtro por nombre.
 */
export const BODY_SHEET_T2I_MODELS = [
    'qwen2/text-to-image',
    // FLUX.2 quitado: lento, caro y daba cuerpos peores para el sheet.
]

export function getPermissiveBodyModels(providers: AIProvider[]): AIProvider[] {
    const usable = providers.filter(
        (p) =>
            PROVIDER_TRAITS[p.id]?.permissive === true &&
            p.type === 'KIE' &&
            p.supports_image === true &&
            !!p.model &&
            BODY_SHEET_T2I_MODELS.includes(p.model),
    )
    // Orden = el del allowlist (Qwen primero como default t2i confiable).
    return usable.sort(
        (a, b) =>
            BODY_SHEET_T2I_MODELS.indexOf(a.model as string) -
            BODY_SHEET_T2I_MODELS.indexOf(b.model as string),
    )
}
