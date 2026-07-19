'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import AvatarEditDrawer from './AvatarEditDrawer'
import BottomControlBar from './BottomControlBar'
import GalleryPanel from './GalleryPanel'
import ImagePreviewModal from './ImagePreviewModal'
import PostModal from './PostModal'
import LipsyncDialog from './LipsyncDialog'
import ToolModal from './ToolModal'
import VideoEditorMain from '../../video-editor/_components/VideoEditorMain'
import dynamic from 'next/dynamic'

// Studio-consolidation tools, lazily loaded so they don't weigh the studio
// bundle until opened (see docs/superpowers/specs/2026-07-09-studio-consolidation-design.md)
const VoiceStudioTool = dynamic(
    () => import('../../voice-studio/_components/VoiceStudioMain'),
    { ssr: false },
)
const ReelRemixTool = dynamic(
    () => import('../../reel-remix/_components/ReelRemixMain'),
    { ssr: false },
)
const ReelDownloaderTool = dynamic(
    () => import('../../reel-downloader/_components/ReelDownloaderMain'),
    { ssr: false },
)
import AvatarSelector from './AvatarSelector'
import PromptLibraryDrawer from './PromptLibraryDrawer'
import ProviderManagerDrawer, {
    DEFAULT_PROVIDERS,
} from './ProviderManagerDrawer'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    apiCreateAvatar,
    apiUpdateAvatar,
    apiUploadReference,
    apiGetAvatarReferences,
    apiDeleteAvatarReference,
    apiCreateGenerationUploadUrl,
    apiSaveGeneration,
    apiGetGenerations,
    apiGetAvatars,
} from '@/services/AvatarForgeService'
import { getStoragePublicUrl } from '@/lib/storagePaths'
import { uploadToSignedStorageUrl } from '@/lib/storageUpload'
import {
    generateAvatar,
    generateVideoSafe as generateVideoGeminiSafe,
    enhancePrompt,
    analyzeFaceFromImages,
    editImage,
    describeImageForPrompt,
    analyzePromptSafety,
} from '@/services/GeminiService'
import {
    generateVideo as generateVideoKling,
    generateAvatarVideo as generateAvatarVideoKling,
    generateVideoWithMotionControl as generateMotionControlKling,
    generateImage as generateImageKling,
    generateVideoOmniKling,
} from '@/services/KlingService'
import {
    generateImage as generateImageMiniMax,
    generateVideoMiniMax,
} from '@/services/MiniMaxService'
import type { MiniMaxVideoModel } from '@/@types/minimax'
import {
    generateImageKie,
    submitVideoKieTask,
    generateMotionControlKieSafe,
    submitKieImageTask,
    checkKieImageTask,
    submitTalkingVideoKieTask,
    submitLipsyncVideoKieTask,
    checkKieVideoTask,
} from '@/services/KieService'
import { generateImageViaGateway } from '@/services/GatewayService'
import {
    buildAvatarPrompt,
    buildDiffusionBodyPreamble,
    buildLeanIdentityPrompt,
    stripHarnessForFaceSwap,
    type RefRole,
} from '@/utils/avatarPromptBuilder'
import { describeBody, getHairColorDescription, getEyeColorDescription, buildCurvesEmphasis } from '@/utils/bodyDescriptors'
import { readDefaultProviderId } from '../../_shared/providerPrefs'
import { PROVIDER_TRAITS } from '../../_shared/providerCatalog'
import { createPortal } from 'react-dom'
import { useStudioHeaderSlot } from './StudioHeaderSlotContext'
import {
    HiOutlineCog,
    HiOutlineBookOpen,
    HiX,
    HiChevronDown,
    HiChevronUp,
    HiOutlineUpload,
    HiOutlineSearch,
} from 'react-icons/hi'
import { getPostedGenerationMap } from '@/services/SocialService'
import { AppState } from '../types'
import type { GeneratedMedia, ReferenceImage } from '../types'
import type { AspectRatio, Avatar, ReferenceType } from '@/@types/supabase'
import { useImageOptimization } from '../_hooks/useImageOptimization'

interface AvatarStudioMainProps {
    userId?: string
}

/**
 * Submit a KIE image task and poll it from the BROWSER until done (up to 18 min).
 * nano-banana-pro and gpt-image-2 can run 12+ min; the old synchronous server
 * poll abandoned slow tasks at 600s (orphaned result, wasted credits, phantom
 * re-runs). Client-side polling never holds a server function open. Shared by
 * handleGenerate AND handleEditImage so both routes get the async behavior.
 */
async function pollKieImageTask(
    params: Parameters<typeof submitKieImageTask>[0],
): Promise<{ url: string; fullApiPrompt: string }> {
    // Hasta 2 tareas: KIE marca tareas fallidas con "internal error, please
    // try again later" (transitorio — su propio mensaje pide reintentar; las
    // tareas fallidas cobran 0 créditos). El path síncrono viejo re-enviaba
    // una vez; este es el mismo self-healing a nivel poll. Qwen es el que más
    // lo dispara.
    for (let attempt = 1; attempt <= 2; attempt++) {
        const sub = await submitKieImageTask(params)
        if (!sub.success) {
            throw new Error(sub.error)
        }
        let failMsg = ''
        const deadlineMs = Date.now() + 18 * 60 * 1000
        while (Date.now() < deadlineMs) {
            await new Promise((r) => setTimeout(r, 5000))
            const st = await checkKieImageTask(sub.taskId)
            if (st.status === 'done') {
                return { url: st.url, fullApiPrompt: sub.fullApiPrompt }
            }
            if (st.status === 'failed') {
                failMsg = st.error
                break
            }
        }
        if (!failMsg) {
            throw new Error('KIE tardó demasiado (>18 min). Intenta de nuevo.')
        }
        if (!/internal error/i.test(failMsg)) {
            throw new Error(failMsg)
        }
        if (attempt === 2) {
            // 2 tasks seguidas con "internal error" = el MODELO está caído en
            // KIE (verificado con Qwen: hasta el t2i trivial falla igual), no
            // el prompt del usuario. Mensaje claro + sin pánico por créditos.
            throw new Error(
                'El modelo parece estar CAÍDO en KIE (2 intentos con "internal error"). No es tu prompt — prueba otro provider o reintenta más tarde. Las tareas fallidas NO cobran créditos.',
            )
        }
        console.warn('[KIE] Task failed with transient internal error — resubmitting once')
    }
    throw new Error('KIE image task failed')
}

/** KIE models that use the unified async createTask + client-poll flow. */
const KIE_ASYNC_MODELS = ['nano-banana-pro', 'gpt-image-2-text-to-image']
// ALL KIE generic-createTask image models now poll async in the BROWSER (submit
// returns a taskId fast, then checkKieImageTask). The old synchronous server
// poll held one request open 50–140s; when it outlived the serverless/HTTP
// window the client saw a "failure" even though KIE had finished — losing the
// result from the gallery and prompting a duplicate re-gen (double charge).
const isKieAsyncImageModel = (m: string): boolean =>
    KIE_ASYNC_MODELS.includes(m) ||
    m.startsWith('seedream/') ||
    m.startsWith('flux-2/') ||
    m.startsWith('qwen') ||
    m.startsWith('ideogram/') ||
    m === 'z-image' ||
    m.startsWith('nano-banana-2') ||
    m.startsWith('grok-imagine/') ||
    m === 'wan/2-7-image'

/**
 * InfiniteTalk talking-heads regularly run past 10 minutes — same async
 * client-poll pattern as pollKieImageTask so no server function is held open
 * and slow-but-healthy jobs are never abandoned mid-flight.
 */
async function pollKieTalkingVideoTask(
    params: Parameters<typeof submitTalkingVideoKieTask>[0],
): Promise<string> {
    const sub = await submitTalkingVideoKieTask(params)
    if (!sub.success) {
        throw new Error(sub.error)
    }
    const deadlineMs = Date.now() + 30 * 60 * 1000
    while (Date.now() < deadlineMs) {
        await new Promise((r) => setTimeout(r, 5000))
        const st = await checkKieVideoTask(sub.taskId)
        if (st.status === 'done') {
            return st.url
        }
        if (st.status === 'failed') {
            throw new Error(st.error)
        }
    }
    throw new Error(
        `KIE tardó demasiado (>30 min). El job ${sub.taskId} puede seguir corriendo en kie.ai/logs.`,
    )
}

/**
 * Client-side unwrap for generateVideoGeminiSafe. The server action returns the
 * error as DATA; we re-throw it HERE (client code) so handleGenerate's catch
 * shows the REAL message instead of the sanitized server-action 500 ("An error
 * occurred in the Server Components render"). Returns the video URL on success.
 */
async function genVideoGemini(
    params: Parameters<typeof generateVideoGeminiSafe>[0],
): Promise<string> {
    const r = await generateVideoGeminiSafe(params)
    if (!r.success) {
        throw new Error(r.error)
    }
    return r.url
}

/**
 * KIE video generation via ASYNC submit + BROWSER polling (mirrors
 * pollKieTalkingVideoTask). The server returns a taskId in ~1s, then the
 * browser polls checkKieVideoTask every 5s. This replaces the old single
 * long-held server request (generateVideoKieSafe), which — when the 50–140s
 * poll outlived the serverless/HTTP window — REJECTED on the client even
 * though KIE had finished, losing the video from the gallery and prompting a
 * duplicate re-generation (double charge). Same params/signature, so the
 * call sites are unchanged.
 */
async function genVideoKie(
    params: Parameters<typeof submitVideoKieTask>[0],
): Promise<string> {
    // Hasta 2 tareas: mismo self-healing que pollKieImageTask para el
    // "internal error, please try again later" transitorio de KIE (las tareas
    // fallidas cobran 0 créditos).
    for (let attempt = 1; attempt <= 2; attempt++) {
        const sub = await submitVideoKieTask(params)
        if (!sub.success) {
            throw new Error(sub.error)
        }
        // KIE video can take minutes; poll up to 30 min. Each request is short,
        // so no single call can time out — the taskId survives on KIE regardless.
        let failMsg = ''
        const deadlineMs = Date.now() + 30 * 60 * 1000
        while (Date.now() < deadlineMs) {
            await new Promise((r) => setTimeout(r, 5000))
            const st = await checkKieVideoTask(sub.taskId)
            if (st.status === 'done') {
                return st.url
            }
            if (st.status === 'failed') {
                failMsg = st.error
                break
            }
        }
        if (!failMsg) {
            throw new Error(
                `KIE tardó demasiado (>30 min). El job ${sub.taskId} puede seguir corriendo en kie.ai/logs.`,
            )
        }
        if (!/internal error/i.test(failMsg) || attempt === 2) {
            throw new Error(failMsg)
        }
        console.warn('[KIE] Video task failed with transient internal error — resubmitting once')
    }
    throw new Error('KIE video task failed')
}

async function genMotionControlKie(
    params: Parameters<typeof generateMotionControlKieSafe>[0],
): Promise<string> {
    const r = await generateMotionControlKieSafe(params)
    if (!r.success) {
        throw new Error(r.error)
    }
    return r.url as string
}

/**
 * Sube un blob al bucket `generations` vía URL firmada, con reintentos (3).
 * La subida va directa del navegador a Supabase Storage (Cloudflare delante) y
 * a veces responde una página HTML transitoria que el cliente reporta como
 * "Unexpected token '<' … is not valid JSON" — un retry corto lo absorbe.
 * URL firmada NUEVA en cada intento (son de un solo uso). Devuelve el path.
 */
async function uploadGenerationWithRetry(
    mediaType: Parameters<typeof apiCreateGenerationUploadUrl>[0],
    blob: Blob,
    contentType: string,
): Promise<string> {
    let lastError: unknown = null
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const { path, token } =
                await apiCreateGenerationUploadUrl(mediaType)
            await uploadToSignedStorageUrl('generations', path, token, blob, contentType)
            return path
        } catch (e) {
            lastError = e
            console.warn(`[Gallery] Upload attempt ${attempt}/3 failed:`, e)
            if (attempt < 3) {
                await new Promise((r) => setTimeout(r, attempt * 1500))
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

const AvatarStudioMain = ({ userId }: AvatarStudioMainProps) => {
    const [isAvatarSelectorOpen, setIsAvatarSelectorOpen] = useState(false)
    const [isAvatarEditOpen, setIsAvatarEditOpen] = useState(false)
    // Item queued for the unified Post modal (social + Fanvue). Only saved
    // items can be posted — the Post buttons stay disabled until saveState === 'saved'.
    const [postMedia, setPostMedia] = useState<GeneratedMedia | null>(null)
    // Collapse the creation panel to give the gallery the full height.
    const [isCreationCollapsed, setIsCreationCollapsed] = useState(false)
    // Video queued for the in-place Video Editor ToolModal (Gallery "Edit"
    // on a VIDEO). Non-null == modal open; VideoEditorMain is keyed by
    // media.id so switching videos forces a fresh mount.
    const [videoEditorMedia, setVideoEditorMedia] =
        useState<GeneratedMedia | null>(null)

    // Studio-consolidation tools hosted in ToolModals (Voice / Remix / Downloader).
    // Voice Studio needs the avatar list — fetched lazily on first open.
    const [activeTool, setActiveTool] = useState<
        'voice' | 'remix' | 'downloader' | null
    >(null)
    // Video queued for the Lipsync dialog (gallery video + Voice Studio audio)
    const [lipsyncMedia, setLipsyncMedia] = useState<GeneratedMedia | null>(
        null,
    )
    const [toolAvatars, setToolAvatars] = useState<Avatar[] | null>(null)
    const openVoiceTool = useCallback(async () => {
        setActiveTool('voice')
        if (!toolAvatars && userId) {
            try {
                setToolAvatars(await apiGetAvatars())
            } catch (e) {
                console.error('Failed to load avatars for Voice Studio:', e)
                setToolAvatars([])
            }
        }
    }, [toolAvatars, userId])
    const pendingAutoGenerateRef = useRef(false)
    // "Dejar en espera": id del run de generación en PRIMER plano + set de
    // runs mandados a segundo plano. KIE no tiene API de cancelación — el run
    // backgroundeado sigue vivo en su closure (poll incluido) y estos refs
    // evitan que su success/catch/finally pise el estado del run nuevo.
    const foregroundRunIdRef = useRef<string | null>(null)
    const backgroundedRunsRef = useRef<Set<string>>(new Set())
    // Drives the gallery's hidden upload input from the header "Upload" button.
    const galleryUploadInputRef = useRef<HTMLInputElement>(null)

    const {
        // State
        avatarId,
        avatarName,
        generalReferences,
        faceRef,
        angleRef,
        bodyRef,
        assetImages,
        sceneImage,
        poseImage,
        cloneImage,
        deepfakeImage,
        placeImage,
        bustRef,
        glutesRef,
        videoInputImage,
        identityWeight,
        measurements,
        faceDescription,
        prompt,
        generationMode,
        videoSubMode,
        avatarDefaultVoice,
        aspectRatio,
        videoResolution,
        videoDuration,
        cameraMotion,
        cameraShot,
        cameraAngle,
        cinemaLens,
        cinemaFocalLength,
        cinemaAperture,
        subjectAction,
        videoDialogue,
        voiceStyle,
        noMusic,
        noBackgroundEffects,
        // Kling Motion Control
        klingMotionControlEnabled,
        klingMotionVideoBase64,
        klingMotionVideoUrl,
        klingPresetMotion,
        klingMotionOrientation,
        klingKeepOriginalSound,
        klingMotionDuration,
        klingNativeAudioEnabled,
        activeProviderId,
        providers,
        errorMsg,
        isGenerating,
        isLoadingReferences,
        continueUseAvatarIdentity,
        continueIdentityModel,

        // Actions
        setAvatarId,
        setAvatarName,
        setCurrentAvatar,
        setFaceDescription,
        clearAvatarReferences,
        unlockAvatar,
        setAvatarDefaultVoice,
        setPrompt,
        setGenerationMode,
        setVideoSubMode,
        setVideoInputImage,
        setAppState,
        setErrorMsg,
        setIsGenerating,
        setIsSavingAvatar,
        addPendingGeneration,
        removePendingGeneration,
        addToGallery,
        updateGalleryItem,
        loadPersistedGallery,
        setIsEnhancingPrompt,
        setIsPromptLibraryOpen,
        setIsDescribingImage,
        setIsAnalyzing,
        setSafetyAnalysis,
        setCloneImage,
        getActiveProvider,
        getFullPrompt,
        setPromptAndAnalyze,
        setProviders,
        setActiveProviderId,
        setVideoDialogue,
        setAspectRatio,
        setContinueUseAvatarIdentity,
        setContinueIdentityModel,
        geminiAutoFallback,
        // Toggle de la barra de búsqueda+filtros de la galería (header).
        galleryBarOpen,
        setGalleryBarOpen,
        gallerySearchQuery,
        galleryMediaTypeFilter,
        galleryAvatarFilter,
        galleryView,
    } = useAvatarStudioStore()

    // Punto en el toggle cuando hay búsqueda/filtro activo (para no “perder”
    // un filtro con la barra cerrada).
    const galleryFiltersActive =
        !!gallerySearchQuery ||
        galleryMediaTypeFilter !== 'ALL' ||
        galleryAvatarFilter !== 'ALL' ||
        galleryView !== 'all'

    // Image optimization hook for API calls
    const { prepareAvatarPayload, optimizeImage } = useImageOptimization()
    // Tab-bar slot: the header actions (Prompts / Upload / Tools) are portaled up
    // to the StudioTabs row to save a header row.
    const headerSlot = useStudioHeaderSlot()

    // Initialize providers on mount and update when mode changes
    useEffect(() => {
        // Always ensure providers are set
        if (providers.length === 0) {
            setProviders(DEFAULT_PROVIDERS)
        }

        // Set appropriate default provider when mode changes or on mount
        const currentProvider = providers.find((p) => p.id === activeProviderId)
        const isProviderValidForMode = currentProvider
            ? generationMode === 'IMAGE'
                ? currentProvider.supports_image
                : currentProvider.supports_video
            : false

        if (!activeProviderId || !isProviderValidForMode) {
            const availableProviders =
                providers.length > 0 ? providers : DEFAULT_PROVIDERS
            const isForMode = (p: (typeof availableProviders)[number]) =>
                generationMode === 'IMAGE'
                    ? p.supports_image
                    : p.supports_video
            // El pin (📌 del Provider Manager) manda: sin él, este efecto
            // caía SIEMPRE al primero del catálogo (Gemini 3 Pro) e ignoraba
            // el default guardado del modo.
            const pinned = readDefaultProviderId(generationMode)
            const defaultProvider =
                (pinned
                    ? availableProviders.find(
                          (p) => p.id === pinned && isForMode(p),
                      )
                    : null) ?? availableProviders.find(isForMode)
            if (defaultProvider) {
                setActiveProviderId(defaultProvider.id)
            }
        }
    }, [
        generationMode,
        providers,
        activeProviderId,
        setProviders,
        setActiveProviderId,
    ])

    // (The old sessionStorage['studioImport'] receiver was removed: the only
    // writer was the standalone Gallery page, now consolidated into this
    // Studio gallery. Cross-tool media handoff will move to in-place modals.)

    // Seed the inline gallery with the user's persisted history on mount. The
    // Studio gallery IS the history now — fetch the `generations` rows, resolve
    // signed storage URLs (mirrors gallery/page.tsx), map to GeneratedMedia and
    // merge them in via loadPersistedGallery (dedupes against session items).
    useEffect(() => {
        if (!userId) return
        let cancelled = false
        ;(async () => {
            try {
                const [rows, postedRes] = await Promise.all([
                    apiGetGenerations(),
                    getPostedGenerationMap(),
                ])
                const postedMap = postedRes.success
                    ? (postedRes.data ?? {})
                    : {}
                // Public URLs are a pure string build — the `generations` bucket
                // is public, so the old per-row createSignedUrl (one HTTP round
                // trip × 160+ items, and nothing rendered until ALL resolved)
                // was pure latency. The gallery now seeds instantly.
                const items = rows.map((gen): GeneratedMedia => {
                    const url = getStoragePublicUrl(
                        'generations',
                        gen.storage_path,
                    )
                    return {
                            id: crypto.randomUUID(),
                            url,
                            prompt: gen.prompt,
                            aspectRatio:
                                (gen.aspect_ratio as AspectRatio) || '1:1',
                            timestamp: gen.created_at
                                ? new Date(gen.created_at).getTime()
                                : Date.now(),
                            mediaType: gen.media_type,
                            metadata: gen.metadata ?? undefined,
                            providerName: (
                                gen.metadata as { providerName?: string } | null
                            )?.providerName,
                            favorite:
                                (gen.metadata as { favorite?: boolean } | null)
                                    ?.favorite ?? false,
                            archived:
                                (gen.metadata as { archived?: boolean } | null)
                                    ?.archived ?? false,
                            generationId: gen.id,
                            avatarId: gen.avatar_id,
                            postedPlatforms: postedMap[gen.id],
                            saveState: 'saved',
                            publicUrl: url,
                        }
                    })
                if (!cancelled) loadPersistedGallery(items)
            } catch (error) {
                console.error('Failed to load persisted gallery:', error)
            }
        })()
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId])

    // Save Avatar Handler
    const handleSaveAvatar = useCallback(
        async (name: string) => {
            if (!userId) {
                toast.push(
                    <Notification type="danger" title="Error">
                        You must be logged in to save avatars
                    </Notification>,
                )
                return
            }

            setIsSavingAvatar(true)
            try {
                let savedAvatarId = avatarId

                // Estado FRESCO del store, no el closure del render: el Edit
                // drawer hace setMeasurements(...) y llama onSaveAvatar en el
                // MISMO tick, así que el closure aún trae los valores del
                // render anterior — se persistía la edición ANTERIOR (Nova
                // quedó con hairColor viejo tras guardar el degradado).
                const fresh = useAvatarStudioStore.getState()
                const freshMeasurements = fresh.measurements
                const freshFaceDescription = fresh.faceDescription
                const freshIdentityWeight = fresh.identityWeight

                // Create or update avatar
                if (avatarId) {
                    await apiUpdateAvatar(avatarId, {
                        name,
                        identity_weight: freshIdentityWeight,
                        face_description: freshFaceDescription,
                        measurements: freshMeasurements,
                    })
                } else {
                    const newAvatar = await apiCreateAvatar({
                        name,
                        user_id: userId,
                        identity_weight: freshIdentityWeight,
                        face_description: freshFaceDescription,
                        measurements: freshMeasurements,
                    })
                    savedAvatarId = newAvatar.id
                    setAvatarId(newAvatar.id)
                }

                // Upload references — también del estado FRESCO (el drawer las
                // setea en el mismo tick que dispara este save).
                if (savedAvatarId) {
                    const allRefs = [
                        ...fresh.generalReferences.map((r) => ({
                            ...r,
                            type: 'general' as const,
                        })),
                        ...(fresh.faceRef
                            ? [{ ...fresh.faceRef, type: 'face' as const }]
                            : []),
                        ...(fresh.angleRef
                            ? [{ ...fresh.angleRef, type: 'angle' as const }]
                            : []),
                        ...(fresh.bodyRef
                            ? [{ ...fresh.bodyRef, type: 'body' as const }]
                            : []),
                        ...(fresh.bustRef
                            ? [{ ...fresh.bustRef, type: 'bust' as const }]
                            : []),
                        ...(fresh.glutesRef
                            ? [{ ...fresh.glutesRef, type: 'glutes' as const }]
                            : []),
                    ]

                    // Tipos SINGLETON: al re-guardar con una imagen nueva se
                    // BORRA la fila previa del mismo tipo — sin esto cada Save
                    // acumulaba filas (MiaUltra llegó a tener 2 'body' y el
                    // loader tomaba una arbitraria).
                    const SINGLETON_REF_TYPES = new Set([
                        'face',
                        'angle',
                        'body',
                        'bust',
                        'glutes',
                    ])
                    for (const ref of allRefs) {
                        if (!ref.storagePath) {
                            if (SINGLETON_REF_TYPES.has(ref.type)) {
                                try {
                                    const existing =
                                        await apiGetAvatarReferences(
                                            savedAvatarId,
                                            ref.type as ReferenceType,
                                        )
                                    for (const old of existing) {
                                        await apiDeleteAvatarReference(old.id)
                                    }
                                } catch (e) {
                                    console.warn(
                                        '[save] dedupe of previous',
                                        ref.type,
                                        'ref failed:',
                                        e,
                                    )
                                }
                            }
                            // Upload new reference
                            const blob = await fetch(ref.url).then((r) =>
                                r.blob(),
                            )
                            const file = new File(
                                [blob],
                                `${ref.type}-${Date.now()}.jpg`,
                                {
                                    type: ref.mimeType,
                                },
                            )
                            await apiUploadReference(
                                savedAvatarId,
                                file,
                                ref.type,
                            )
                        }
                    }
                }

                setAvatarName(name)
                toast.push(
                    <Notification type="success" title="Saved">
                        Avatar saved successfully
                    </Notification>,
                )
            } catch (error) {
                console.error('Failed to save avatar:', error)
                toast.push(
                    <Notification type="danger" title="Error">
                        Failed to save avatar
                    </Notification>,
                )
            } finally {
                setIsSavingAvatar(false)
            }
        },
        [userId, avatarId, setAvatarId, setAvatarName, setIsSavingAvatar],
    )

    // Analyze Face Handler
    const handleAnalyzeFace = useCallback(async () => {
        // Filter for images with valid base64
        const validRefs = faceRef?.base64
            ? [faceRef]
            : generalReferences
                  .filter((r) => r.base64 && r.base64.length > 0)
                  .slice(0, 3)

        if (validRefs.length === 0) {
            toast.push(
                <Notification type="warning" title="No Images">
                    Please add reference images first
                </Notification>,
            )
            return
        }

        try {
            // Resize each ref to ~1024px before sending — full-res photos blow
            // past Vercel's ~4.5MB server-action body cap (413). Browser canvas.
            const optimizedRefs = (
                await Promise.all(
                    validRefs.map((img) =>
                        optimizeImage({
                            base64: img.base64,
                            mimeType: img.mimeType,
                        }),
                    ),
                )
            ).filter((r): r is { base64: string; mimeType: string } => !!r)
            const description = await analyzeFaceFromImages(
                (optimizedRefs.length > 0 ? optimizedRefs : validRefs).map(
                    (img) => ({
                        base64: img.base64,
                        mimeType: img.mimeType,
                    }),
                ),
            )
            if (description) {
                setFaceDescription(description)
            }
        } catch (error) {
            console.error('Face analysis failed:', error)
            toast.push(
                <Notification type="danger" title="Error">
                    Failed to analyze face
                </Notification>,
            )
        }
    }, [faceRef, generalReferences, setFaceDescription, optimizeImage])

    // Auto-persist a freshly generated item to the `generations` table in the
    // background (non-blocking). Same signed-URL upload flow as
    // handleSaveToGallery but WITHOUT the avatarId guard — auto-save works
    // before an avatar is saved (avatar_id is nullable). Drives the item's
    // saveState (saving → saved/error) and stamps the DB row id onto it so the
    // Post modal can resolve the media by generationId.
    const persistGeneration = useCallback(
        async (media: GeneratedMedia) => {
            if (!userId) return
            updateGalleryItem(media.id, { saveState: 'saving' })
            try {
                const response = await fetch(media.url)
                const blob = await response.blob()
                const contentType =
                    media.mediaType === 'VIDEO' ? 'video/mp4' : 'image/jpeg'

                const path = await uploadGenerationWithRetry(
                    media.mediaType,
                    blob,
                    contentType,
                )

                const row = await apiSaveGeneration({
                    user_id: userId,
                    // Inherit the media's own avatar when present (edited/cropped
                    // copies stay with their source's owner).
                    avatar_id: media.avatarId ?? avatarId ?? null,
                    media_type: media.mediaType,
                    storage_path: path,
                    prompt: media.prompt,
                    aspect_ratio: media.aspectRatio,
                    // Persist providerName inside metadata so the model tag
                    // survives a reload (it's otherwise a session-only field).
                    metadata: {
                        ...((media.metadata as Record<string, unknown>) ?? {}),
                        ...(media.providerName
                            ? { providerName: media.providerName }
                            : {}),
                    } as typeof media.metadata,
                })

                updateGalleryItem(media.id, {
                    saveState: 'saved',
                    generationId: row.id,
                    avatarId: media.avatarId ?? avatarId ?? null,
                    publicUrl: getStoragePublicUrl('generations', path),
                })
            } catch (error) {
                console.error('Auto-save failed:', error)
                updateGalleryItem(media.id, { saveState: 'error' })
            }
        },
        [userId, avatarId, updateGalleryItem],
    )

    // Generate Handler
    const handleGenerate = useCallback(async () => {
        if (isGenerating) return
        if (isLoadingReferences) {
            toast.push(
                <Notification type="warning" title="Please Wait">
                    Avatar references are still loading...
                </Notification>,
            )
            return
        }
        const fullPrompt = getFullPrompt()
        // Deepfake: la foto es la instrucción; el prompt de texto es opcional.
        const deepfakeWaiving =
            generationMode === 'IMAGE' && Boolean(deepfakeImage?.base64)
        if (!fullPrompt.trim() && !deepfakeWaiving) {
            toast.push(
                <Notification type="warning" title="Missing Prompt">
                    Please enter a prompt
                </Notification>,
            )
            return
        }

        const activeProvider = getActiveProvider()

        // Deepfake requiere un modelo KIE multi-imagen con ancla calibrada —
        // aviso ANTES de generar (con Gemini/Kling/MiniMax no viaja la foto).
        if (generationMode === 'IMAGE' && deepfakeImage?.base64) {
            const m = activeProvider?.model || ''
            const dfCapable =
                m.startsWith('seedream/') ||
                m === 'wan/2-7-image' ||
                m.startsWith('flux-2/') ||
                m.startsWith('qwen') ||
                m === 'nano-banana-pro' ||
                m.startsWith('nano-banana-2') ||
                m === 'gpt-image-2-text-to-image'
            if (!dfCapable) {
                toast.push(
                    <Notification type="warning" title="Deepfake">
                        {`${activeProvider?.name ?? 'Este modelo'} no soporta Deepfake. Usa Seedream, Wan, FLUX.2, Qwen, Nano Banana o GPT Image 2.`}
                    </Notification>,
                )
                return
            }
        }

        // Identidad de ESTE run — si el usuario lo manda "a espera", el run
        // deja de ser foreground y sus setters de estado global se saltan.
        const runId = crypto.randomUUID()
        foregroundRunIdRef.current = runId

        setIsGenerating(true)
        setAppState(AppState.GENERATING)
        setErrorMsg(null)

        // Filter out references without valid base64
        const validGeneralRefs = generalReferences.filter(
            (r) => r.base64 && r.base64.length > 0,
        )
        const validAssetRefs = assetImages.filter(
            (r) => r.base64 && r.base64.length > 0,
        )

        try {
            let resultUrl: string

            // Optimize images before sending to API (resize to 1024px max)
            const optimizedPayload = await prepareAvatarPayload({
                generalRefs: validGeneralRefs,
                assetImages: validAssetRefs,
                faceRef,
                bodyRef,
                sceneImage: sceneImage, // Scene Composite - literally places avatar in this scene
            })

            // Optimize angle ref separately if needed
            const optimizedAngleRef = angleRef?.base64
                ? await optimizeImage({
                      base64: angleRef.base64,
                      mimeType: angleRef.mimeType,
                  })
                : null

            // Optimize pose ref (session tool) — drives body position. Gemini
            // already handles poseRefImage; we also forward it to KIE multi-ref.
            const optimizedPoseRef = poseImage?.base64
                ? await optimizeImage({
                      base64: poseImage.base64,
                      mimeType: poseImage.mimeType,
                  })
                : null

            // Optimize the Clone Ref IMAGE (the original to replicate). Image
            // models like GPT Image 2 can't clone body/outfit/pose from text —
            // they need the actual image (as you did in ChatGPT: face + scene).
            const optimizedCloneRef = cloneImage?.base64
                ? await optimizeImage({
                      base64: cloneImage.base64,
                      mimeType: cloneImage.mimeType,
                  })
                : null

            // Deepfake Ref — face-swap puro. Solo se optimiza si el provider
            // lo soporta (seedream/wan/flux2 vía cláusula de clone variante).
            const optimizedDeepfakeRef = deepfakeImage?.base64
                ? await optimizeImage({
                      base64: deepfakeImage.base64,
                      mimeType: deepfakeImage.mimeType,
                  })
                : null

            // Place Ref IMAGE — antes SOLO viajaba su texto [PLACE:] (ningún
            // path recibía la foto del lugar). Va a los modelos KIE multi-ref
            // con rol 'place'; el path Gemini queda intocado (benchmark).
            const optimizedPlaceRef = placeImage?.base64
                ? await optimizeImage({
                      base64: placeImage.base64,
                      mimeType: placeImage.mimeType,
                  })
                : null

            // Refs de REGIÓN (Bust/Glutes) — como Body Ref pero
            // independientes. SOLO viajan a providers con trait permissive:
            // con un modelo no permisivo ni siquiera entran al array.
            const isPermissiveProvider =
                PROVIDER_TRAITS[activeProvider?.id ?? '']?.permissive === true
            const optimizedBustRef =
                isPermissiveProvider && bustRef?.base64
                    ? await optimizeImage({
                          base64: bustRef.base64,
                          mimeType: bustRef.mimeType,
                      })
                    : null
            const optimizedGlutesRef =
                isPermissiveProvider && glutesRef?.base64
                    ? await optimizeImage({
                          base64: glutesRef.base64,
                          mimeType: glutesRef.mimeType,
                      })
                    : null

            // All reference images for providers that accept multiple inputs
            // (Nano Banana Pro / GPT Image 2 via KIE). Each carries a `role` so
            // KieService can label it in the prompt ("Image 1 is the face…") —
            // without labels the model blends them and loses identity.
            const kieReferenceImages = [
                optimizedPayload.faceRef && {
                    ...optimizedPayload.faceRef,
                    role: 'face',
                },
                optimizedAngleRef && { ...optimizedAngleRef, role: 'angle' },
                optimizedPayload.bodyRef && {
                    ...optimizedPayload.bodyRef,
                    role: 'body',
                },
                optimizedBustRef && { ...optimizedBustRef, role: 'bust' },
                optimizedGlutesRef && {
                    ...optimizedGlutesRef,
                    role: 'glutes',
                },
                // Assets (logo/producto) antes solo llegaban al path Gemini
                // (assetReferences) — en KIE el clone decía "hoodie with logo"
                // y Seedream pintaba la palabra literal "LOGO" en la prenda.
                ...(optimizedPayload.assetImages ?? []).map((a) => ({
                    ...a,
                    role: 'asset',
                })),
                optimizedPoseRef && { ...optimizedPoseRef, role: 'pose' },
                optimizedPayload.sceneImage && {
                    ...optimizedPayload.sceneImage,
                    role: 'scene',
                },
                optimizedPlaceRef && { ...optimizedPlaceRef, role: 'place' },
            ].filter(
                (r): r is { base64: string; mimeType: string; role: string } =>
                    Boolean(r && r.base64),
            )

            let apiPrompt: string | undefined

            if (generationMode === 'IMAGE') {
                const isMiniMaxProvider = activeProvider?.type === 'MINIMAX'
                const isKlingProvider = activeProvider?.type === 'KLING'

                if (isMiniMaxProvider) {
                    // MiniMax image-01 — direct generation with subject_reference for facial consistency
                    const subjectRef =
                        optimizedPayload.faceRef ??
                        optimizedPayload.generalRefs[0] ??
                        null
                    const faceReferenceUrl = subjectRef
                        ? `data:${subjectRef.mimeType};base64,${subjectRef.base64}`
                        : undefined

                    // MiniMax hard-caps the prompt at 1500 chars. Budget it so the
                    // things that MUST survive actually do, in this order:
                    //   1. Gemini body brain preamble (measurements = source of truth)
                    //   2. the user's SCENE/POSE text (this got truncated away when
                    //      preamble + [BODY:] + a long [FACE:] ate the cap — MiniMax
                    //      then ignored the pose entirely)
                    //   3. [FACE:] only if room remains — it's redundant here, the
                    //      face already rides on subject_reference (the image).
                    // The [BODY:]/[FACE:] tags are stripped from fullPrompt: the
                    // preamble carries the same measurements in richer form.
                    const MINIMAX_CAP = 1500
                    const sceneText = fullPrompt
                        .replace(/\[BODY:[^\]]*\]/gi, '')
                        .replace(/\[FACE:[^\]]*\]/gi, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim()
                    let miniMaxPrompt = `${buildDiffusionBodyPreamble(measurements, { cameraShot, cameraAngle })} ${sceneText}`
                    const faceRoom = MINIMAX_CAP - miniMaxPrompt.length - 12
                    if (faceDescription?.trim() && faceRoom > 80) {
                        miniMaxPrompt += ` [FACE: ${faceDescription.trim().slice(0, faceRoom)}]`
                    }

                    const result = await generateImageMiniMax({
                        prompt: miniMaxPrompt,
                        aspectRatio,
                        faceReferenceUrl,
                    })

                    if (!result.success) {
                        throw new Error(result.error)
                    }

                    resultUrl = result.url
                    apiPrompt = result.fullApiPrompt
                } else if (isKlingProvider) {
                    // Kling — single reference image (face > body > first general).
                    // Base/KOLORS models clone the scene only via the [CLONE:] text
                    // in fullPrompt (1 image slot, used for the face).
                    const referenceImage =
                        optimizedPayload.faceRef ??
                        optimizedPayload.bodyRef ??
                        optimizedPayload.generalRefs[0] ??
                        null

                    // Fold faceDescription into prompt since Kling image API doesn't
                    // accept separate identity hints like Gemini does.
                    const klingPrompt = faceDescription?.trim()
                        ? `[FACE: ${faceDescription.trim()}] ${fullPrompt}`
                        : fullPrompt

                    // Kling v3 Omni takes a multi-image list — feed the avatar face
                    // (identity, slot 1) + the Clone (pose/outfit/scene, slot 2) so it
                    // clones from the IMAGE like nano-banana. Other Kling models are
                    // single-ref, so the clone rides only on the [CLONE:] text.
                    const klingModel = activeProvider?.model || 'kling-v2-1'
                    const klingRefImages =
                        klingModel === 'kling-v3-omni' &&
                        optimizedCloneRef &&
                        referenceImage
                            ? [referenceImage, optimizedCloneRef]
                            : undefined

                    const result = await generateImageKling({
                        prompt: klingPrompt,
                        referenceImage,
                        referenceImages: klingRefImages,
                        aspectRatio,
                        modelName: klingModel,
                    })

                    if (!result.success) {
                        throw new Error(result.error)
                    }

                    resultUrl = result.url
                    apiPrompt = result.fullApiPrompt
                } else if (activeProvider?.type === 'KIE') {
                    // KIE aggregator — single reference image (face > body > first general).
                    const referenceImage =
                        optimizedPayload.faceRef ??
                        optimizedPayload.bodyRef ??
                        optimizedPayload.generalRefs[0] ??
                        null

                    // Per-model prompt strategy:
                    // - Nano Banana Pro (= same model as direct Gemini): the FULL
                    //   Gemini harness — it loves the verbose, structured prompt.
                    // - GPT Image 2 (OpenAI): a LEAN, natural prompt. The harness's
                    //   "DEEPFAKE/FACE SWAP" language trips OpenAI moderation and its
                    //   size causes timeouts; OpenAI clones identity from clean
                    //   prompts + the reference images (as in ChatGPT itself).
                    const kieModel = activeProvider.model || ''
                    let refRoles = kieReferenceImages.map(
                        (r) => r.role as RefRole,
                    )
                    // Default for the permissive/generic diffusion models (Seedream,
                    // FLUX.2, Z-Image, Qwen, Ideogram, Nano Banana 2, Grok): port the
                    // Gemini body brain as a leading natural-language sentence. The
                    // instruction-following models below (Nano Banana Pro / GPT Image 2
                    // / Flux Kontext) replace kiePrompt with their own harness, so this
                    // only reaches the diffusion models that actually benefit from it.
                    let kiePrompt = `${buildDiffusionBodyPreamble(measurements, { cameraShot, cameraAngle })} ${fullPrompt}`
                    let kieRefsToSend = kieReferenceImages
                    // DEEPFAKE puro: cara del avatar + la foto original como
                    // 'clone'. Sin preamble de cuerpo ni curvas — la imagen 2
                    // manda en TODO menos la cara. Solo modelos con ancla
                    // multi-imagen calibrada.
                    const deepfakeCapable =
                        kieModel.startsWith('seedream/') ||
                        kieModel === 'wan/2-7-image' ||
                        kieModel.startsWith('flux-2/') ||
                        kieModel.startsWith('qwen') ||
                        kieModel === 'nano-banana-pro' ||
                        kieModel.startsWith('nano-banana-2') ||
                        kieModel === 'gpt-image-2-text-to-image'
                    const deepfakeActive = Boolean(
                        optimizedDeepfakeRef &&
                            deepfakeCapable &&
                            kieReferenceImages.some((r) => r.role === 'face'),
                    )
                    if (deepfakeActive && optimizedDeepfakeRef) {
                        kieRefsToSend = [
                            ...kieReferenceImages.filter((r) => r.role === 'face'),
                            { ...optimizedDeepfakeRef, role: 'clone' },
                        ]
                        kiePrompt =
                            prompt.trim() ||
                            'photorealistic, natural skin texture, realistic lighting, seamless face integration'
                        // Los nanos NO pasan por planExtraRefs (su branch envía
                        // los refs tal cual) → la instrucción de swap viaja en
                        // el propio prompt.
                        if (
                            kieModel === 'nano-banana-pro' ||
                            kieModel.startsWith('nano-banana-2')
                        ) {
                            kiePrompt = `The FIRST image is the person whose FACE to use. The LAST image is the ORIGINAL photo to reproduce EXACTLY — same body, build, outfit, pose, hands, framing, lighting, background and setting, everything unchanged. The FACE SWAP is MANDATORY: replace the face in the last image with the face from the first image (exact features, freckles, likeness) — never keep the original face. Do NOT alter or remove any clothing. REMOVE any overlaid stickers, watermarks, emojis or UI graphics pasted on the photo — output a clean photograph. ${kiePrompt}`
                        }
                    } else if (optimizedDeepfakeRef && !deepfakeCapable) {
                        toast.push(
                            <Notification type="info" title="Deepfake">
                                {`${activeProvider?.name ?? 'Este modelo'} no soporta el modo Deepfake — usa Seedream, Wan o FLUX.2.`}
                            </Notification>,
                        )
                    }
                    // The single ref passed to the sync adapters (flux-kontext /
                    // gpt-4o / generic). Defaults to the face; flux-kontext edit
                    // mode overrides it to the Clone (the canvas to edit).
                    let kieSingleRef = referenceImage

                    // Feed the Clone Ref IMAGE (not just the [CLONE:] text) so the
                    // model clones the EXACT pose/outfit/framing/scene — same lever
                    // that fixed GPT Image 2. Appended LAST so FACE_ANCHOR stays
                    // slot 1 (high-fidelity identity) and the image order == refRoles
                    // order for the prompt's mapping. Guarded on
                    // kieReferenceImages.length so we never send a lone clone with
                    // no face image behind the keep-face anchor. Además de los nano
                    // (harness propio), Seedream/Wan/FLUX.2 lo consumen vía
                    // planExtraRefs con guard de maniquí (KieService) — antes solo
                    // recibían el texto [CLONE:] y re-imaginaban el outfit.
                    if (
                        !deepfakeActive &&
                        (kieModel === 'nano-banana-pro' ||
                            kieModel.startsWith('nano-banana-2') ||
                            kieModel.startsWith('seedream/') ||
                            kieModel === 'wan/2-7-image' ||
                            kieModel.startsWith('flux-2/')) &&
                        optimizedCloneRef &&
                        kieReferenceImages.length > 0
                    ) {
                        kieRefsToSend = [
                            ...kieReferenceImages,
                            { ...optimizedCloneRef, role: 'clone' as const },
                        ]
                        refRoles = kieRefsToSend.map((r) => r.role as RefRole)
                    }


                    if (
                        kieRefsToSend.length > 0 ||
                        (kieModel.startsWith('flux-kontext') &&
                            optimizedCloneRef)
                    ) {
                        // Flux is single-input (edit on the Clone canvas) so it can run
                        // with ONLY a clone and no avatar ref images; the others need
                        // their ref array, hence the length>0 path above.
                        // nano-banana-2 / -lite are Gemini-family too: same
                        // instruction harness as nano-banana-pro (the plain
                        // diffusion preamble left the face unanchored — the
                        // output wasn't the avatar).
                        if (
                            (kieModel === 'nano-banana-pro' ||
                                kieModel.startsWith('nano-banana-2')) &&
                            !deepfakeActive
                        ) {
                            const { systemPreamble, finalPrompt } =
                                buildAvatarPrompt({
                                    prompt: fullPrompt,
                                    aspectRatio,
                                    measurements,
                                    faceDescription,
                                    identityWeight,
                                    cameraShot,
                                    cameraAngle,
                                    refRoles,
                                })
                            kiePrompt = `${systemPreamble}\n\n${finalPrompt}`
                        } else if (
                            kieModel === 'gpt-image-2-text-to-image' &&
                            deepfakeActive &&
                            optimizedDeepfakeRef
                        ) {
                            // Deepfake = exactamente su flujo face-swap probado:
                            // canvas (la foto) + cara, prompt lean.
                            const faceOnly = kieReferenceImages.filter(
                                (r) => r.role === 'face',
                            )
                            kieRefsToSend = [
                                { ...optimizedDeepfakeRef, role: 'scene' as const },
                                ...(faceOnly.length > 0
                                    ? faceOnly
                                    : [kieReferenceImages[0]]),
                            ]
                            kiePrompt = buildLeanIdentityPrompt(
                                stripHarnessForFaceSwap(kiePrompt),
                                ['scene', 'face'],
                                true,
                            )
                        } else if (kieModel === 'gpt-image-2-text-to-image') {
                            // Face-swap EDIT, mirroring how ChatGPT processes it:
                            // Clone/original FIRST (the canvas to recreate exactly)
                            // + face SECOND (swap in the avatar's face). 2 refs,
                            // light enough to avoid the KIE 500. No angle-sheet.
                            const faceOnly = kieReferenceImages.filter(
                                (r) => r.role === 'face',
                            )
                            const faceRefs =
                                faceOnly.length > 0
                                    ? faceOnly
                                    : [kieReferenceImages[0]]
                            if (optimizedCloneRef) {
                                kieRefsToSend = [
                                    {
                                        ...optimizedCloneRef,
                                        role: 'scene' as const,
                                    },
                                    ...faceRefs,
                                ]
                                // Face-swap i2i: strip the Gemini harness ([BODY:]
                                // measurements + the incomplete/contradictory auto
                                // [CLONE:] scene re-description) so the IMAGE — not
                                // text — drives body/pose/scene. Keeps [FACE:] +
                                // user text + a generic preserve list. faceIsImage
                                // = true: the avatar face IS a real 2nd image here.
                                kiePrompt = buildLeanIdentityPrompt(
                                    stripHarnessForFaceSwap(fullPrompt),
                                    ['scene', 'face'],
                                    true,
                                )
                            } else {
                                kieRefsToSend = faceRefs
                                kiePrompt = buildLeanIdentityPrompt(
                                    fullPrompt,
                                    ['face'],
                                )
                            }
                        } else if (
                            kieModel.startsWith('flux-kontext') &&
                            optimizedCloneRef
                        ) {
                            // Flux Kontext = instruction EDIT model. Feed the Clone as
                            // the single canvas image (generateImageFluxKontext puts the
                            // referenceImage into body.inputImage) and let the avatar
                            // face ride on the [FACE:] text + relight/preserve-skin
                            // clause — Flux is single-input, so there is no second face
                            // image. Same lean strategy as GPT Image 2; strip the Gemini
                            // harness ([BODY:]/[CLONE:]) that fights an edit canvas.
                            kieSingleRef = optimizedCloneRef
                            // faceIsImage = false: Flux is single-input (only the
                            // clone is sent), so identity rides on the [FACE:] text,
                            // not a non-existent "Image 2".
                            kiePrompt = buildLeanIdentityPrompt(
                                stripHarnessForFaceSwap(fullPrompt),
                                ['scene', 'face'],
                                false,
                            )
                        }
                    }

                    // NOTA pose: el [POSE:] que BottomControlBar appendea al
                    // final del prompt se reubica al INICIO en KieService
                    // (antes del cap genérico) — ahí cubre también prompts
                    // guardados y el path de edición, sin duplicarse aquí.

                    // Sliders de curvas (busto/glúteos/muslos 1-5): SOLO para
                    // providers con trait `permissive` — si el modelo no lo
                    // es, la frase NO viaja (petición explícita del usuario).
                    // Canal: bodyEmphasis → anclas i2i Seedream/Wan/FLUX.2;
                    // nunca entra al [BODY:] genérico que ven Gemini/nano.
                    const curvesEmphasis = isPermissiveProvider
                        ? buildCurvesEmphasis(measurements)
                        : ''
                    const baseBodyEmphasis = measurements?.waist
                        ? `${describeBody(measurements)} (bust ${measurements.bust}cm, waist ${measurements.waist}cm, hips ${measurements.hips}cm — hip-to-waist ratio ${(measurements.hips / measurements.waist).toFixed(2)})`
                        : describeBody(measurements)

                    if (isKieAsyncImageModel(kieModel)) {
                        // ASYNC submit + browser poll (see pollKieImageTask).
                        const polled = await pollKieImageTask({
                            prompt: kiePrompt,
                            referenceImage: kieSingleRef,
                            referenceImages: kieRefsToSend,
                            aspectRatio,
                            model: kieModel,
                            // Concrete body descriptors for the Seedream/Wan
                            // i2i anchor — Pro ignores body text that isn't in
                            // the anchor's early tokens (kept rendering her
                            // slim). Los cm + ratio explícitos anclan mejor que
                            // solo adjetivos (Ana 90/60/100 salía slim en Wan).
                            bodyEmphasis: deepfakeActive
                                ? undefined
                                : curvesEmphasis
                                  ? `${baseBodyEmphasis}; emphasized curves: ${curvesEmphasis}`
                                  : baseBodyEmphasis,
                            deepfakeMode: deepfakeActive,
                            // Color de pelo DENTRO del ancla i2i: como "brown
                            // hair" en el [BODY:] tardío, Seedream/Wan seguían
                            // el tono del ref/escena (reporte: MiaUltra salía
                            // más clara en playa). Solo generación — en EDIT el
                            // usuario puede estar recoloreando a propósito.
                            hairEmphasis: deepfakeActive
                                ? undefined
                                : getHairColorDescription(
                                      measurements?.hairColor,
                                  ) || undefined,
                            eyeEmphasis: deepfakeActive
                                ? undefined
                                : getEyeColorDescription(
                                      measurements?.eyeColor,
                                  ) || undefined,
                            // Escala la cláusula de fidelidad facial del
                            // ancla (port condensado del identity harness).
                            identityWeight,
                        })
                        resultUrl = polled.url
                        apiPrompt = polled.fullApiPrompt
                    } else {
                        const result = await generateImageKie({
                            prompt: kiePrompt,
                            referenceImage: kieSingleRef,
                            referenceImages: kieRefsToSend,
                            aspectRatio,
                            model:
                                activeProvider.model ||
                                'flux-kontext/text-to-image',
                        })
                        if (!result.success) {
                            throw new Error(result.error)
                        }
                        resultUrl = result.url
                        apiPrompt = result.fullApiPrompt
                    }
                } else if (activeProvider?.type === 'GATEWAY') {
                    // Vercel AI Gateway — unified hub. fullPrompt already carries
                    // [BODY:]/[FACE:] descriptors (identity via text in this spike).
                    const result = await generateImageViaGateway({
                        prompt: fullPrompt,
                        aspectRatio,
                        modelName: activeProvider.model,
                    })

                    if (!result.success) {
                        throw new Error(result.error)
                    }

                    resultUrl = result.url
                    apiPrompt = result.fullApiPrompt
                } else {
                    // Gemini — with auto-retry and optional MiniMax fallback on safety block
                    const result = await generateAvatar({
                        prompt: fullPrompt,
                        avatarReferences: optimizedPayload.generalRefs,
                        assetReferences: optimizedPayload.assetImages,
                        sceneReference: optimizedPayload.sceneImage,
                        faceRefImage: optimizedPayload.faceRef,
                        bodyRefImage: optimizedPayload.bodyRef,
                        angleRefImage: optimizedAngleRef,
                        poseRefImage: optimizedPoseRef,
                        placeRefImage: optimizedPlaceRef,
                        aspectRatio,
                        cameraShot,
                        cameraAngle,
                        cinemaLens,
                        cinemaFocalLength,
                        cinemaAperture,
                        identityWeight,
                        styleWeight: 50,
                        measurements,
                        faceDescription,
                        modelName: activeProvider?.model,
                        allowFallback: geminiAutoFallback,
                    })

                    if (!result.success) {
                        throw new Error(result.error)
                    }

                    resultUrl = result.url
                    apiPrompt = result.fullApiPrompt
                }
            } else {
                // VIDEO mode - check provider type
                const isKlingProvider = activeProvider?.type === 'KLING'
                const isMinimaxProvider = activeProvider?.type === 'MINIMAX'

                // Debug logging
                console.log('[AvatarStudio] Active Provider:', activeProvider)
                console.log(
                    '[AvatarStudio] Provider Type:',
                    activeProvider?.type,
                )
                console.log(
                    '[AvatarStudio] Is Kling Provider:',
                    isKlingProvider,
                )
                console.log(
                    '[AvatarStudio] Is MiniMax Provider:',
                    isMinimaxProvider,
                )

                if (videoSubMode === 'SPEAK') {
                    // Talking-head: audio ya generado (Voice Studio) O texto → TTS
                    // con la voz clonada del avatar; luego el motor elegido.
                    const presetAudioUrl =
                        useAvatarStudioStore.getState().speakAudioUrl
                    // El guion vive en videoDialogue (diálogo del botón 🎤), NO en el
                    // prompt principal — así Img→Prompt no puede sobreescribirlo. El
                    // prompt principal queda como descripción visual opcional.
                    const script = useAvatarStudioStore
                        .getState()
                        .videoDialogue.trim()
                    if (!presetAudioUrl && !avatarDefaultVoice) {
                        throw new Error(
                            'This avatar has no main voice. Clone one in Voice Studio and set it as main.',
                        )
                    }
                    if (!presetAudioUrl && !script) {
                        throw new Error(
                            'Add a script first — click the 🎤 microphone button next to the prompt box',
                        )
                    }
                    const visualPrompt = useAvatarStudioStore
                        .getState()
                        .prompt.trim()

                    // La imagen que habla: si hay una imagen cargada en el dropzone
                    // (galería/upload) gana sobre las refs del avatar — permite el
                    // flujo "imagen + guion → talking video". Sin imagen cargada,
                    // se usa la face ref del avatar.
                    let speakImage =
                        optimizedPayload.faceRef ||
                        optimizedPayload.generalRefs[0]
                    if (videoInputImage?.base64) {
                        const optimizedSpeakInput = await optimizeImage(
                            {
                                base64: videoInputImage.base64,
                                mimeType: videoInputImage.mimeType,
                            },
                            'API_FULL',
                        )
                        if (optimizedSpeakInput)
                            speakImage = optimizedSpeakInput
                    }
                    if (!speakImage) {
                        throw new Error(
                            'Add avatar references (a face photo) or load an image before generating a talking video',
                        )
                    }

                    // 1. Audio: reusar el ya generado en Voice Studio (salta el TTS)
                    // o sintetizar al vuelo con la voz principal del avatar.
                    let audioUrl: string
                    let durationMs: number | undefined
                    if (presetAudioUrl) {
                        audioUrl = presetAudioUrl
                        // Duración real del mp3 (dimensiona el video de Kling).
                        durationMs = await new Promise<number | undefined>(
                            (resolve) => {
                                const probe = new Audio(presetAudioUrl)
                                probe.onloadedmetadata = () =>
                                    resolve(
                                        Number.isFinite(probe.duration)
                                            ? probe.duration * 1000
                                            : undefined,
                                    )
                                probe.onerror = () => resolve(undefined)
                            },
                        )
                    } else {
                        const langMap: Record<string, string> = {
                            es: 'Spanish',
                            en: 'English',
                            pt: 'Portuguese',
                            fr: 'French',
                        }
                        // Entrega guardada de la voz (speed/pitch/emotion/acento,
                        // ajustada en Voice Studio → Audio Preview). El guard de
                        // arriba garantiza que hay voz cuando no hay preset audio.
                        const voice = avatarDefaultVoice!
                        const voiceSettings = voice.tts_settings ?? {}
                        const ttsRes = await fetch('/api/voice/tts-file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                text: script,
                                voiceId: voice.provider_voice_id,
                                // 'auto' deja mandar el acento de la muestra clonada.
                                language: voiceSettings.useAutoAccent
                                    ? 'auto'
                                    : (langMap[voice.language] ??
                                      voice.language),
                                ...voiceSettings,
                            }),
                        })
                        if (!ttsRes.ok) {
                            const { error: ttsError } = await ttsRes.json()
                            throw new Error(
                                ttsError || 'Voice generation (TTS) failed',
                            )
                        }
                        const ttsJson = await ttsRes.json()
                        audioUrl = ttsJson.audioUrl
                        durationMs = ttsJson.durationMs
                    }

                    // 2. Talking-head con el motor elegido (InfiniteTalk / OmniHuman /
                    // Kling 3.0 con audio element) — submit async + poll desde el
                    // navegador, los jobs tardan 10-20 min.
                    // Kling necesita 2-4 imágenes del personaje para su element —
                    // pero SOLO del personaje que habla: si hay imagen cargada en
                    // el dropzone, ella es la única identidad (mezclar las refs
                    // del avatar mete una segunda persona al video); sin imagen
                    // cargada, el personaje es el avatar y sus refs aplican.
                    const speakElementImages = videoInputImage?.base64
                        ? []
                        : [
                              optimizedPayload.faceRef,
                              ...optimizedPayload.generalRefs,
                          ].filter(
                              (r): r is { base64: string; mimeType: string } =>
                                  !!r,
                          )

                    try {
                        const speakModel =
                            useAvatarStudioStore.getState().speakModel
                        resultUrl = await pollKieTalkingVideoTask({
                            image: speakImage,
                            audioUrl,
                            prompt: visualPrompt || undefined,
                            resolution: '720p',
                            model: speakModel,
                            elementImages: speakElementImages,
                            durationSec: durationMs
                                ? durationMs / 1000
                                : undefined,
                        })

                        // Kling genera gran video pero IGNORA el audio del element
                        // (verificado: la pista sale casi en silencio). Paso 2:
                        // re-sincronizar labios con el mismo TTS vía Volcengine.
                        if (speakModel === 'kling') {
                            const lipsyncSub = await submitLipsyncVideoKieTask({
                                videoUrl: resultUrl,
                                audioUrl,
                            })
                            if (!lipsyncSub.success) {
                                throw new Error(
                                    `Lipsync step failed to start: ${lipsyncSub.error}. Silent Kling video was generated: ${resultUrl}`,
                                )
                            }
                            const lipsyncDeadline = Date.now() + 30 * 60 * 1000
                            let lipsyncedUrl: string | null = null
                            while (Date.now() < lipsyncDeadline) {
                                await new Promise((r) => setTimeout(r, 5000))
                                const st = await checkKieVideoTask(
                                    lipsyncSub.taskId,
                                )
                                if (st.status === 'done') {
                                    lipsyncedUrl = st.url
                                    break
                                }
                                if (st.status === 'failed') {
                                    throw new Error(
                                        `Lipsync step failed: ${st.error}. Silent Kling video was generated: ${resultUrl}`,
                                    )
                                }
                            }
                            if (!lipsyncedUrl) {
                                throw new Error(
                                    `Lipsync step timed out (>30 min). Silent Kling video was generated: ${resultUrl}`,
                                )
                            }
                            resultUrl = lipsyncedUrl
                        }
                    } catch (speakErr) {
                        // El audio ya quedó generado y persistido; que el error lo diga
                        // para no perder ese contexto (sin fallbacks silenciosos).
                        const msg =
                            speakErr instanceof Error
                                ? speakErr.message
                                : String(speakErr)
                        throw new Error(
                            `Talking video failed: ${msg}. The audio was generated: ${audioUrl}`,
                        )
                    }
                } else if (videoSubMode === 'ANIMATE') {
                    if (!videoInputImage || !videoInputImage.base64) {
                        throw new Error('Please upload an image to animate')
                    }
                    // First frame drives the whole clip's quality — keep full
                    // resolution (API_FULL) instead of the 1024px API preset,
                    // otherwise continued videos come out visibly softer.
                    const optimizedVideoInput = await optimizeImage(
                        {
                            base64: videoInputImage.base64,
                            mimeType: videoInputImage.mimeType,
                        },
                        'API_FULL',
                    )

                    if (!optimizedVideoInput) {
                        throw new Error('Failed to optimize video input image')
                    }

                    // Continue Video with avatar identity → Veo 3.1, Kling
                    // Omni or Seedance. The user picks via the model
                    // selector inside the Continue dialog. Whichever
                    // upstream provider the user had selected up top is
                    // overridden because most models in our integration
                    // don't support first_frame + multi-image refs at once.
                    if (continueUseAvatarIdentity) {
                        const identityRefs = [
                            optimizedPayload.faceRef,
                            ...optimizedPayload.generalRefs,
                        ].filter(
                            (r): r is { base64: string; mimeType: string } =>
                                !!r,
                        )

                        if (identityRefs.length === 0) {
                            throw new Error(
                                'No avatar references available for identity-preserving continue',
                            )
                        }

                        console.log('[AvatarStudio] Continue with identity', {
                            model: continueIdentityModel,
                            refCount: identityRefs.length,
                            originalProvider: activeProvider?.type,
                        })

                        if (continueIdentityModel === 'veo-3-1') {
                            // Veo on the Gemini Developer API CANNOT combine a
                            // first frame with `referenceImages` (asset/identity
                            // refs) — that returns 400 "Unsupported video
                            // generation request" (the combined mode is Vertex
                            // AI-only). For "Continue Video" the first frame is
                            // inherently present, so we do NOT send identity
                            // refs here: the first frame is the continuity +
                            // appearance anchor. Identity lock is therefore
                            // approximate on Veo. For STRONG identity
                            // preservation the user should pick kling-omni or
                            // seedance below, which support first_frame +
                            // multi-ref via non-Gemini APIs.
                            resultUrl = await genVideoGemini({
                                prompt: fullPrompt,
                                imageInput: optimizedVideoInput,
                                aspectRatio,
                                resolution: videoResolution,
                                cameraMotion,
                                subjectAction,
                                dialogue: videoDialogue,
                                voiceStyle,
                                noMusic,
                                noBackgroundEffects,
                                modelName: 'veo-3.1-generate-preview',
                            })
                        } else if (continueIdentityModel === 'kling-omni') {
                            resultUrl = await generateVideoOmniKling({
                                prompt: fullPrompt,
                                firstFrameImage: optimizedVideoInput,
                                referenceImages: identityRefs,
                                aspectRatio,
                                duration: String(videoDuration) as '5' | '10',
                                modelName: 'kling-v3-omni',
                            })
                        } else {
                            resultUrl = await genVideoKie({
                                prompt: fullPrompt,
                                firstFrameImage: optimizedVideoInput,
                                referenceImages: identityRefs,
                                model: 'bytedance/seedance-2',
                                aspectRatio,
                                duration: videoDuration,
                                resolution: videoResolution,
                            })
                        }
                    } else if (isKlingProvider) {
                        // Check if Motion Control is enabled (v2.6+ only)
                        if (
                            klingMotionControlEnabled &&
                            (klingMotionVideoBase64 ||
                                klingMotionVideoUrl ||
                                klingPresetMotion)
                        ) {
                            console.log(
                                '[AvatarStudio] Using Motion Control generation',
                            )
                            console.log(
                                '[AvatarStudio] Preset:',
                                klingPresetMotion,
                            )
                            console.log(
                                '[AvatarStudio] Has uploaded video:',
                                !!klingMotionVideoBase64,
                            )
                            console.log(
                                '[AvatarStudio] Has URL video:',
                                !!klingMotionVideoUrl,
                            )

                            resultUrl = await generateMotionControlKling({
                                characterImage: optimizedVideoInput,
                                motionVideo: klingMotionVideoBase64
                                    ? {
                                          base64: klingMotionVideoBase64,
                                          mimeType: 'video/mp4',
                                      }
                                    : undefined,
                                motionVideoUrl:
                                    klingMotionVideoUrl || undefined,
                                presetMotion: klingPresetMotion || undefined,
                                motionOrientation: klingMotionOrientation,
                                keepOriginalSound: klingKeepOriginalSound,
                                duration: klingMotionDuration,
                                prompt: fullPrompt,
                                mode: 'std',
                                modelName:
                                    (activeProvider?.model as 'kling-v2-6') ||
                                    'kling-v2-6',
                            })
                        } else {
                            // Standard Kling video generation
                            resultUrl = await generateVideoKling({
                                prompt: fullPrompt,
                                imageInput: optimizedVideoInput,
                                aspectRatio,
                                duration: String(videoDuration) as '5' | '10',
                                modelName:
                                    activeProvider?.model || 'kling-v1-6',
                            })
                        }
                    } else if (isMinimaxProvider) {
                        // MiniMax Hailuo image-to-video. Identity preservation
                        // is handled upstream by the Seedance-2 branch, so
                        // this path stays focused on the literal first-frame
                        // case.
                        resultUrl = await generateVideoMiniMax({
                            mode: 'image',
                            prompt: fullPrompt,
                            firstFrameImage: optimizedVideoInput,
                            model:
                                (activeProvider?.model as MiniMaxVideoModel) ||
                                'MiniMax-Hailuo-2.3',
                            resolution: videoResolution,
                        })
                    } else if (activeProvider?.type === 'KIE') {
                        const isKieKling =
                            activeProvider.model === 'kling-3.0/video'
                        const hasMotionVideo = !!(
                            klingMotionVideoBase64 || klingMotionVideoUrl
                        )
                        if (
                            isKieKling &&
                            klingMotionControlEnabled &&
                            hasMotionVideo
                        ) {
                            // KIE Kling 3.0 motion-control (v2v)
                            resultUrl = await genMotionControlKie({
                                characterImage: optimizedVideoInput,
                                motionVideoUrl:
                                    klingMotionVideoUrl || undefined,
                                motionVideoBase64:
                                    klingMotionVideoBase64 || undefined,
                                prompt: fullPrompt,
                                resolution: videoResolution,
                                characterOrientation: klingMotionOrientation,
                            })
                        } else {
                            // KIE aggregator — plain video (Kling 3.0 / Seedance / Wan / Veo)
                            resultUrl = await genVideoKie({
                                prompt: fullPrompt,
                                firstFrameImage: optimizedVideoInput,
                                model:
                                    activeProvider.model ||
                                    'veo-3.1/text-to-video',
                                aspectRatio,
                                duration: videoDuration,
                                resolution: videoResolution,
                                sound: isKieKling
                                    ? klingNativeAudioEnabled
                                    : undefined,
                            })
                        }
                    } else {
                        // Use Gemini Service (default)
                        resultUrl = await genVideoGemini({
                            prompt: fullPrompt,
                            imageInput: optimizedVideoInput,
                            aspectRatio,
                            resolution: videoResolution,
                            cameraMotion,
                            subjectAction,
                            dialogue: videoDialogue,
                            voiceStyle,
                            noMusic,
                            noBackgroundEffects,
                            modelName: activeProvider?.model,
                        })
                    }
                } else {
                    // AVATAR mode - use already optimized references
                    if (isKlingProvider) {
                        // For Kling AVATAR mode, use face ref or first general ref as input
                        const avatarInput =
                            optimizedPayload.faceRef ||
                            optimizedPayload.generalRefs[0]
                        if (!avatarInput) {
                            throw new Error(
                                'Please add avatar references for Kling video generation',
                            )
                        }

                        // Check if Motion Control is enabled (v2.6+ only)
                        if (
                            klingMotionControlEnabled &&
                            (klingMotionVideoBase64 ||
                                klingMotionVideoUrl ||
                                klingPresetMotion)
                        ) {
                            console.log(
                                '[AvatarStudio] AVATAR mode: Using Motion Control generation',
                            )
                            resultUrl = await generateMotionControlKling({
                                characterImage: avatarInput,
                                motionVideo: klingMotionVideoBase64
                                    ? {
                                          base64: klingMotionVideoBase64,
                                          mimeType: 'video/mp4',
                                      }
                                    : undefined,
                                motionVideoUrl:
                                    klingMotionVideoUrl || undefined,
                                presetMotion: klingPresetMotion || undefined,
                                motionOrientation: klingMotionOrientation,
                                keepOriginalSound: klingKeepOriginalSound,
                                duration: klingMotionDuration,
                                prompt: fullPrompt,
                                mode: 'std',
                                modelName:
                                    (activeProvider?.model as 'kling-v2-6') ||
                                    'kling-v2-6',
                            })
                        } else {
                            // Standard Kling avatar video generation
                            resultUrl = await generateAvatarVideoKling({
                                prompt: fullPrompt,
                                avatarImage: avatarInput,
                                aspectRatio,
                                duration: String(videoDuration) as '5' | '10',
                                modelName:
                                    activeProvider?.model || 'kling-v1-6',
                            })
                        }
                    } else if (isMinimaxProvider) {
                        // MiniMax Hailuo with subject_reference (avatar lock)
                        const refs = [
                            optimizedPayload.faceRef,
                            optimizedPayload.bodyRef,
                            ...optimizedPayload.generalRefs,
                        ].filter(
                            (r): r is { base64: string; mimeType: string } =>
                                !!r,
                        )

                        if (refs.length === 0) {
                            throw new Error(
                                'Please add avatar references for MiniMax video generation',
                            )
                        }

                        resultUrl = await generateVideoMiniMax({
                            mode: 'subject',
                            prompt: fullPrompt,
                            characterImages: refs,
                            model:
                                (activeProvider?.model as MiniMaxVideoModel) ||
                                'MiniMax-Hailuo-2.3',
                            resolution: videoResolution,
                        })
                    } else if (activeProvider?.type === 'KIE') {
                        // KIE aggregator — single reference image as first frame (no native subject_reference)
                        const firstRef =
                            optimizedPayload.faceRef ??
                            optimizedPayload.bodyRef ??
                            optimizedPayload.generalRefs[0] ??
                            null
                        const isKieKling =
                            activeProvider.model === 'kling-3.0/video'
                        const hasMotionVideo = !!(
                            klingMotionVideoBase64 || klingMotionVideoUrl
                        )

                        if (
                            isKieKling &&
                            klingMotionControlEnabled &&
                            hasMotionVideo &&
                            firstRef
                        ) {
                            // KIE Kling 3.0 motion-control (v2v)
                            resultUrl = await genMotionControlKie({
                                characterImage: firstRef,
                                motionVideoUrl:
                                    klingMotionVideoUrl || undefined,
                                motionVideoBase64:
                                    klingMotionVideoBase64 || undefined,
                                prompt: fullPrompt,
                                resolution: videoResolution,
                                characterOrientation: klingMotionOrientation,
                            })
                        } else {
                            resultUrl = await genVideoKie({
                                prompt: fullPrompt,
                                firstFrameImage: firstRef,
                                model:
                                    activeProvider.model ||
                                    'veo-3.1/text-to-video',
                                aspectRatio,
                                duration: videoDuration,
                                resolution: videoResolution,
                                sound: isKieKling
                                    ? klingNativeAudioEnabled
                                    : undefined,
                            })
                        }
                    } else {
                        // Use Gemini Service (default)
                        resultUrl = await genVideoGemini({
                            prompt: fullPrompt,
                            imageInput: null,
                            avatarReferences: optimizedPayload.generalRefs,
                            faceRefImage: optimizedPayload.faceRef,
                            bodyRefImage: optimizedPayload.bodyRef,
                            sceneReference: optimizedPayload.sceneImage,
                            aspectRatio,
                            resolution: videoResolution,
                            cameraMotion,
                            subjectAction,
                            dialogue: videoDialogue,
                            voiceStyle,
                            noMusic,
                            noBackgroundEffects,
                            modelName: activeProvider?.model,
                        })
                    }
                }
            }

            const newMedia: GeneratedMedia = {
                id: crypto.randomUUID(),
                url: resultUrl,
                // Store the raw user prompt so Re-use restores the editable text.
                // The fully-tagged prompt goes in fullApiPrompt for debugging.
                prompt: prompt.trim() || fullPrompt,
                aspectRatio,
                timestamp: Date.now(),
                mediaType: generationMode,
                avatarId: avatarId ?? null,
                avatarInfo: {
                    name: avatarName || 'Unnamed',
                    thumbnailUrl: faceRef?.url || generalReferences[0]?.url,
                },
                fullApiPrompt: apiPrompt ?? fullPrompt,
                providerName: activeProvider?.name,
            }

            addToGallery(newMedia)
            // Fire-and-forget: persist to the gallery in the background so the
            // inline gallery IS the history and the item becomes postable.
            void persistGeneration(newMedia)
            if (backgroundedRunsRef.current.has(runId)) {
                // Run "en espera": no toca el appState del run actual — solo
                // retira su card pendiente y avisa que ya está en la galería.
                backgroundedRunsRef.current.delete(runId)
                removePendingGeneration(runId)
                toast.push(
                    <Notification type="success" title="Generación en espera lista">
                        {`${activeProvider?.name ?? 'La tarea'} terminó — el resultado ya está en la galería.`}
                    </Notification>,
                )
            } else {
                setAppState(AppState.SUCCESS)
            }
        } catch (error: unknown) {
            // warn, NOT error: this failure is fully handled below (banner +
            // toast). console.error pops the Next dev overlay, which pushed the
            // user to hard-reload the page — wiping gallery search/session state.
            console.warn('Generation failed:', error)
            const errorMessage =
                error instanceof Error ? error.message : 'Generation failed'
            if (backgroundedRunsRef.current.has(runId)) {
                // Run "en espera" falló: toast informativo sin ensuciar el
                // banner de error del run que el usuario tenga en curso.
                backgroundedRunsRef.current.delete(runId)
                removePendingGeneration(runId)
                toast.push(
                    <Notification type="danger" title="Generación en espera falló">
                        {errorMessage}
                    </Notification>,
                )
            } else {
                setAppState(AppState.ERROR)
                setErrorMsg(errorMessage)
                toast.push(
                    <Notification type="danger" title="Generation Failed">
                        {errorMessage}
                    </Notification>,
                )
            }
        } finally {
            // Solo el run que sigue en PRIMER plano puede liberar la UI — un
            // run backgroundeado que termina tarde no debe pisar el
            // isGenerating/flags del run nuevo.
            if (foregroundRunIdRef.current === runId) {
                foregroundRunIdRef.current = null
                setIsGenerating(false)
                // Always clear the Continue-with-Identity flags so a follow-up
                // standalone Animate doesn't accidentally inherit them.
                setContinueUseAvatarIdentity(false)
                setContinueIdentityModel('veo-3-1')
            }
        }
    }, [
        isGenerating,
        isLoadingReferences,
        avatarId,
        avatarName,
        prompt,
        generationMode,
        videoSubMode,
        avatarDefaultVoice,
        generalReferences,
        assetImages,
        sceneImage,
        faceRef,
        bodyRef,
        angleRef,
        poseImage,
        cloneImage,
        deepfakeImage,
        placeImage,
        bustRef,
        glutesRef,
        videoInputImage,
        aspectRatio,
        videoDuration,
        cameraShot,
        cameraAngle,
        cinemaLens,
        cinemaFocalLength,
        cinemaAperture,
        identityWeight,
        measurements,
        faceDescription,
        videoResolution,
        cameraMotion,
        subjectAction,
        videoDialogue,
        voiceStyle,
        noMusic,
        noBackgroundEffects,
        klingMotionControlEnabled,
        klingMotionVideoBase64,
        klingMotionVideoUrl,
        klingPresetMotion,
        klingMotionOrientation,
        klingKeepOriginalSound,
        klingMotionDuration,
        klingNativeAudioEnabled,
        geminiAutoFallback,
        getActiveProvider,
        getFullPrompt,
        addToGallery,
        persistGeneration,
        removePendingGeneration,
        setAppState,
        setErrorMsg,
        setIsGenerating,
        prepareAvatarPayload,
        optimizeImage,
        continueUseAvatarIdentity,
        continueIdentityModel,
        setContinueUseAvatarIdentity,
        setContinueIdentityModel,
    ])

    // "Dejar en espera": manda el run en curso a segundo plano y libera la UI
    // para generar otra cosa. La tarea en KIE NO se cancela (su API no lo
    // soporta) — el poll sigue en su closure; si triunfa entra a la galería
    // (toast), si falla solo avisa. Waiting/fail cobran 0 créditos en KIE.
    const handleSendToBackground = useCallback(() => {
        const runId = foregroundRunIdRef.current
        if (!runId) return
        const provider = getActiveProvider()
        backgroundedRunsRef.current.add(runId)
        addPendingGeneration({
            id: runId,
            label: provider?.name ?? 'KIE',
            mediaType: generationMode,
            avatarName: avatarName || undefined,
            startedAt: Date.now(),
        })
        foregroundRunIdRef.current = null
        setIsGenerating(false)
        setAppState(AppState.IDLE)
    }, [
        getActiveProvider,
        generationMode,
        avatarName,
        addPendingGeneration,
        setIsGenerating,
        setAppState,
    ])

    // Enhance Prompt Handler
    const handleEnhancePrompt = useCallback(async () => {
        if (!prompt.trim()) return

        setIsEnhancingPrompt(true)
        try {
            // Find a valid context image with base64 data
            const contextImage = faceRef?.base64
                ? faceRef
                : generalReferences.find(
                      (r) => r.base64 && r.base64.length > 0,
                  ) || null

            const enhanced = await enhancePrompt(
                prompt,
                contextImage
                    ? {
                          base64: contextImage.base64,
                          mimeType: contextImage.mimeType,
                      }
                    : null,
            )
            setPrompt(enhanced)
        } catch (error) {
            console.error('Enhance failed:', error)
        } finally {
            setIsEnhancingPrompt(false)
        }
    }, [prompt, faceRef, generalReferences, setPrompt, setIsEnhancingPrompt])

    // Safety Check Handler
    const handleSafetyCheck = useCallback(async () => {
        if (!prompt.trim()) return

        setIsAnalyzing(true)
        try {
            const result = await analyzePromptSafety(prompt)
            setSafetyAnalysis(result)
            if (result.isSafe) {
                toast.push(
                    <Notification type="success" title="Prompt is Safe">
                        No risky terms detected in your prompt.
                    </Notification>,
                )
            }
        } catch (error) {
            console.error('Safety check failed:', error)
            toast.push(
                <Notification type="danger" title="Safety Check Failed">
                    Could not analyze prompt safety.
                </Notification>,
            )
        } finally {
            setIsAnalyzing(false)
        }
    }, [prompt, setIsAnalyzing, setSafetyAnalysis])

    // Describe Image Handler (Image to Prompt)
    const handleDescribeImage = useCallback(
        async (image: { base64: string; mimeType: string }) => {
            setIsDescribingImage(true)
            try {
                // Resize to ~1024px BEFORE sending. A full-res photo's base64
                // easily exceeds Vercel's ~4.5MB server-action body limit and
                // gets rejected with 413 (Content Too Large) before reaching the
                // function — next.config's 50mb bodySizeLimit can't override the
                // platform cap. optimizeImage runs in the browser (canvas).
                const optimized = (await optimizeImage(image)) ?? image
                const description = await describeImageForPrompt({
                    id: crypto.randomUUID(),
                    url: `data:${optimized.mimeType};base64,${optimized.base64}`,
                    base64: optimized.base64,
                    mimeType: optimized.mimeType,
                })
                if (description) {
                    // Set prompt and analyze for contaminating terms
                    setPromptAndAnalyze(description)
                    toast.push(
                        <Notification type="success" title="Image Analyzed">
                            Prompt generated - check tags for removable terms
                        </Notification>,
                    )
                } else {
                    // Vacío = Gemini se rehusó incluso tras el reintento
                    // clínico (bloqueo duro con contenido explícito). Antes
                    // esto no hacía NADA en silencio.
                    toast.push(
                        <Notification type="warning" title="Sin descripción">
                            Gemini no pudo describir esta imagen (contenido explícito — su bloqueo duro no es configurable). Escribe el prompt a mano o usa la imagen como Clone Ref (viaja tal cual a los modelos i2i).
                        </Notification>,
                    )
                }
            } catch (error) {
                console.error('Image description failed:', error)
                toast.push(
                    <Notification type="danger" title="Analysis Failed">
                        Could not generate prompt from image
                    </Notification>,
                )
            } finally {
                setIsDescribingImage(false)
            }
        },
        [setIsDescribingImage, setPromptAndAnalyze, optimizeImage],
    )

    // Animate Image Handler
    const handleAnimateImage = useCallback(
        async (media: GeneratedMedia) => {
            // Fetch the image and convert to base64
            const response = await fetch(media.url)
            const blob = await response.blob()
            const reader = new FileReader()

            reader.onload = (e) => {
                const result = e.target?.result as string
                const matches = result.match(/^data:(.+);base64,(.+)$/)
                if (matches) {
                    const refImg: ReferenceImage = {
                        id: `animate-${media.id}`,
                        url: result,
                        mimeType: matches[1],
                        base64: matches[2],
                        type: 'general',
                    }
                    setVideoInputImage(refImg)
                    setGenerationMode('VIDEO')
                    setVideoSubMode('ANIMATE')
                    setPrompt('Cinematic movement, slow motion, high quality.')
                    // Do NOT auto-generate. "Animate" only OPENS the video config
                    // (switches to VIDEO/ANIMATE with the image loaded + a starter
                    // prompt) so the user can edit the prompt, pick the model and
                    // review BEFORE clicking "Generar". (Continue Video keeps its
                    // own auto-fire via pendingAutoGenerateRef.)
                }
            }
            reader.readAsDataURL(blob)
        },
        [setVideoInputImage, setGenerationMode, setVideoSubMode, setPrompt],
    )

    // Edit Image Handler
    const handleEditImage = useCallback(
        async (
            media: GeneratedMedia,
            editPrompt: string,
            maskBase64: string | null,
            editAspectRatio?: AspectRatio,
            editAssets?: Array<{
                id: string
                url: string
                base64: string
                mimeType: string
            }>,
            editProviderId?: string,
        ) => {
            setIsGenerating(true)
            setAppState(AppState.GENERATING)

            const targetAspectRatio =
                editAspectRatio || media.aspectRatio || '1:1'

            const referenceAssets = editAssets?.map((asset) => ({
                base64: asset.base64,
                mimeType: asset.mimeType,
            }))

            // Resolve which provider to use for this edit (override > active default)
            const resolvedProvider = editProviderId
                ? providers.find((p) => p.id === editProviderId)
                : getActiveProvider()

            try {
                let resultUrl: string

                // Normalize the source to base64 FIRST — `media.url` can be a
                // data: URL (session items), blob: (uploads) or an https
                // signed URL (persisted gallery items). Providers need bytes:
                // passing a signed URL straight to Gemini 400s with "Base64
                // decoding failed". fetch() handles all three URL kinds.
                const res = await fetch(media.url)
                if (!res.ok) {
                    throw new Error(
                        `Failed to fetch source image (${res.status})`,
                    )
                }
                const blob = await res.blob()
                const sourceBase64 = await new Promise<string>(
                    (resolve, reject) => {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                            const result = reader.result as string
                            resolve(result.split(',')[1])
                        }
                        reader.onerror = () => reject(reader.error)
                        reader.readAsDataURL(blob)
                    },
                )
                const sourceMime = blob.type || 'image/png'

                if (!resolvedProvider || resolvedProvider.type === 'GOOGLE') {
                    // Gemini retains its native edit endpoint with mask + multiple references
                    resultUrl = await editImage(
                        `data:${sourceMime};base64,${sourceBase64}`,
                        editPrompt,
                        maskBase64,
                        targetAspectRatio,
                        referenceAssets,
                    )
                } else {
                    // Non-Gemini providers don't have a true "edit" — we re-render
                    // image-to-image using the source as reference.
                    if (resolvedProvider.type === 'KLING') {
                        const r = await generateImageKling({
                            prompt: editPrompt,
                            referenceImage: {
                                base64: sourceBase64,
                                mimeType: sourceMime,
                            },
                            aspectRatio: targetAspectRatio,
                            modelName: resolvedProvider.model || 'kling-v2-1',
                        })
                        if (!r.success) throw new Error(r.error)
                        resultUrl = r.url
                    } else if (resolvedProvider.type === 'MINIMAX') {
                        const r = await generateImageMiniMax({
                            prompt: editPrompt,
                            aspectRatio: targetAspectRatio,
                            faceReferenceUrl: `data:${sourceMime};base64,${sourceBase64}`,
                        })
                        if (!r.success) throw new Error(r.error)
                        resultUrl = r.url
                    } else if (resolvedProvider.type === 'KIE') {
                        let editModel =
                            resolvedProvider.model ||
                            'flux-kontext/text-to-image'
                        const editRef = {
                            base64: sourceBase64,
                            mimeType: sourceMime,
                        }
                        // Text-to-image-ONLY KIE models (Z-Image, Ideogram) can't
                        // consume the source image: their generic createTask flow
                        // drops the reference, so "editing" with them ignores the
                        // input and hallucinates a brand-new subject (a random man
                        // replaced Ana). Re-route to FLUX.2 image-to-image —
                        // permissive AND it actually transforms THIS photo (identity
                        // rides on the image itself, not on the text instruction).
                        // Seedream is NOT in this list anymore: KieService swaps it
                        // to its real i2i variant (4.5-edit / 5-lite-image-to-image).
                        // Nano Banana 2 / 2 Lite tampoco: KieService les manda la
                        // foto vía image_input[] (mismo patrón que nano-banana-pro).
                        const isT2IOnlyEdit =
                            editModel === 'z-image' ||
                            editModel.startsWith('ideogram/')
                        if (isT2IOnlyEdit) {
                            toast.push(
                                <Notification
                                    type="info"
                                    title="Editado con FLUX.2"
                                >
                                    {`${resolvedProvider?.name ?? 'Ese modelo'} solo genera desde texto (no edita imágenes). Usé FLUX.2 image-to-image para editar esta foto.`}
                                </Notification>,
                            )
                            editModel = 'flux-2/pro-text-to-image'
                        }
                        if (isKieAsyncImageModel(editModel)) {
                            // Same async submit+poll as handleGenerate — otherwise the
                            // edit path falls back to the retired 600s sync poll that
                            // abandons slow nano-banana/gpt-image-2 tasks (phantom dupes).
                            const polled = await pollKieImageTask({
                                prompt: editPrompt,
                                referenceImage: editRef,
                                aspectRatio: targetAspectRatio,
                                model: editModel,
                            })
                            resultUrl = polled.url
                        } else {
                            const r = await generateImageKie({
                                prompt: editPrompt,
                                referenceImage: editRef,
                                aspectRatio: targetAspectRatio,
                                model: editModel,
                            })
                            if (!r.success) {
                                throw new Error(r.error)
                            }
                            resultUrl = r.url
                        }
                    } else {
                        // Unknown provider type — fall back to Gemini
                        resultUrl = await editImage(
                            media.url,
                            editPrompt,
                            maskBase64,
                            targetAspectRatio,
                            referenceAssets,
                        )
                    }
                }

                const newMedia: GeneratedMedia = {
                    id: crypto.randomUUID(),
                    url: resultUrl,
                    prompt: `Edit (${resolvedProvider?.name ?? 'Gemini'}): ${editPrompt}`,
                    aspectRatio: targetAspectRatio,
                    timestamp: Date.now(),
                    mediaType: 'IMAGE',
                    // Edited copies belong to the SOURCE's avatar (fallback: studio's).
                    avatarId: media.avatarId ?? avatarId ?? null,
                    avatarInfo: media.avatarInfo,
                    providerName:
                        resolvedProvider?.name ?? 'Gemini 3 Pro Image',
                }

                addToGallery(newMedia)
                // Auto-persist the edited result too, so it survives reload and
                // its Post button (gated on saveState === 'saved') becomes usable.
                void persistGeneration(newMedia)
                setAppState(AppState.SUCCESS)
            } catch (error: unknown) {
                // warn, NOT error — handled below; see handleGenerate's catch.
                console.warn('Edit failed:', error)
                setAppState(AppState.ERROR)
                const errorMessage =
                    error instanceof Error ? error.message : 'Edit failed'
                setErrorMsg(errorMessage)
            } finally {
                setIsGenerating(false)
            }
        },
        [
            providers,
            avatarId,
            getActiveProvider,
            addToGallery,
            persistGeneration,
            setAppState,
            setErrorMsg,
            setIsGenerating,
        ],
    )

    // Create Variant Handler
    const handleCreateVariant = useCallback(
        async (media: GeneratedMedia) => {
            const response = await fetch(media.url)
            const blob = await response.blob()
            const reader = new FileReader()

            reader.onload = (e) => {
                const result = e.target?.result as string
                const matches = result.match(/^data:(.+);base64,(.+)$/)
                if (matches) {
                    const refImg: ReferenceImage = {
                        id: `variant-${media.id}`,
                        url: result,
                        mimeType: matches[1],
                        base64: matches[2],
                        type: 'general',
                    }
                    useAvatarStudioStore.getState().setCloneImage(refImg)
                    setPrompt(media.prompt)
                    // Trigger generation with clone image for variance
                    handleGenerate()
                }
            }
            reader.readAsDataURL(blob)
        },
        [setPrompt, handleGenerate],
    )

    // Save to Gallery Handler
    const handleSaveToGallery = useCallback(
        async (media: GeneratedMedia) => {
            // avatar_id is nullable by design (auto-save works pre-avatar);
            // requiring an avatar here used to DEADLOCK with the Assign-avatar
            // button (which needs saveState 'saved'). Save first, assign after.
            if (!userId) return
            if (media.saveState === 'saved' && media.generationId) {
                toast.push(
                    <Notification type="info" title="Already saved">
                        This media is already in your gallery
                    </Notification>,
                )
                return
            }

            try {
                // Download the media into the browser, then PUT it straight to
                // Supabase via a signed URL — routing the file through a server
                // action 413s past ~4.5MB (Vercel cap), which every video hits.
                const response = await fetch(media.url)
                const blob = await response.blob()
                const contentType =
                    media.mediaType === 'VIDEO' ? 'video/mp4' : 'image/jpeg'

                const path = await uploadGenerationWithRetry(
                    media.mediaType,
                    blob,
                    contentType,
                )

                const row = await apiSaveGeneration({
                    user_id: userId,
                    // Inherit the media's own avatar (crops/edits of another
                    // avatar's photo stay theirs); fall back to the studio's.
                    avatar_id: media.avatarId ?? avatarId ?? null,
                    media_type: media.mediaType,
                    storage_path: path,
                    prompt: media.prompt,
                    aspect_ratio: media.aspectRatio,
                    // Persist providerName inside metadata so the model tag
                    // survives a reload (it's otherwise a session-only field).
                    metadata: {
                        ...((media.metadata as Record<string, unknown>) ?? {}),
                        ...(media.providerName
                            ? { providerName: media.providerName }
                            : {}),
                    } as typeof media.metadata,
                })

                // Reflect the save on the item so Post/Assign unlock immediately.
                updateGalleryItem(media.id, {
                    saveState: 'saved',
                    generationId: row.id,
                    avatarId: media.avatarId ?? avatarId ?? null,
                    publicUrl: getStoragePublicUrl('generations', path),
                })

                toast.push(
                    <Notification type="success" title="Saved">
                        Generation saved to gallery
                    </Notification>,
                )
            } catch (error) {
                console.error('Failed to save:', error)
                toast.push(
                    <Notification type="danger" title="Error">
                        Failed to save generation
                    </Notification>,
                )
            }
        },
        [userId, avatarId, updateGalleryItem],
    )

    // Continue Video Handler
    const handleContinueVideo = useCallback(
        (
            frameBase64: string,
            promptSuggestion: string,
            dialogue: string,
            originalAspectRatio: AspectRatio,
            useAvatarIdentity: boolean,
            identityModel: 'seedance' | 'kling-omni' | 'veo-3-1',
        ) => {
            const refImg: ReferenceImage = {
                id: `continue-${Date.now()}`,
                url: frameBase64,
                // Extracted frames are PNG data URIs; derive instead of assuming JPEG
                mimeType: frameBase64.startsWith('data:')
                    ? frameBase64.slice(5, frameBase64.indexOf(';'))
                    : 'image/png',
                base64: frameBase64.split(',')[1] || frameBase64,
                type: 'general',
            }
            console.log(
                '[AvatarStudio] handleContinueVideo: frame captured, queueing auto-generate',
                {
                    hasBase64: !!refImg.base64,
                    base64Length: refImg.base64.length,
                    useAvatarIdentity,
                    identityModel,
                },
            )
            // Persist both flags BEFORE the auto-generate effect fires so
            // handleGenerate can read them. Both reset to defaults in
            // handleGenerate's finally so a follow-up standalone Animate
            // doesn't inherit them.
            setContinueUseAvatarIdentity(useAvatarIdentity)
            setContinueIdentityModel(identityModel)
            setVideoInputImage(refImg)
            setGenerationMode('VIDEO')
            setVideoSubMode('ANIMATE')
            setPrompt(promptSuggestion)
            setVideoDialogue(dialogue)
            setAspectRatio(originalAspectRatio)

            // Mark for auto-generation after state updates
            pendingAutoGenerateRef.current = true
        },
        [
            setVideoInputImage,
            setGenerationMode,
            setVideoSubMode,
            setPrompt,
            setVideoDialogue,
            setAspectRatio,
            setContinueUseAvatarIdentity,
            setContinueIdentityModel,
        ],
    )

    // Keep a ref to the latest handleGenerate so the auto-generate effect can
    // call it without depending on its identity. handleGenerate's useCallback
    // deps include several pieces of state that handleContinueVideo updates in
    // the same tick, which used to make this effect fire twice — once with the
    // stale ref and once after, with the cleanup of the first run cancelling
    // the timer of the second.
    const handleGenerateRef = useRef(handleGenerate)
    useEffect(() => {
        handleGenerateRef.current = handleGenerate
    })

    // Auto-generate when videoInputImage changes and pendingAutoGenerate is true.
    // Intentionally does NOT depend on handleGenerate — see ref above.
    useEffect(() => {
        if (!pendingAutoGenerateRef.current) return
        if (!videoInputImage?.base64) return
        pendingAutoGenerateRef.current = false
        console.log('[AvatarStudio] auto-generate fired with videoInputImage')
        const timer = setTimeout(() => {
            handleGenerateRef.current()
        }, 100)
        return () => clearTimeout(timer)
    }, [videoInputImage])

    // Re-use Handler - copies prompt and sets image as clone reference
    const handleReuse = useCallback(
        async (media: GeneratedMedia) => {
            // Uploaded images have placeholder prompts (e.g. "Uploaded: foo.jpg")
            // that describe nothing. Clear the prompt so the user writes a real one.
            const isUploadedPlaceholder = /^Uploaded:\s/i.test(media.prompt)

            // Stored prompts may include [BODY: ...] / [FACE: ...] tags injected by
            // getFullPrompt(). Strip them so we don't duplicate tags on re-generation.
            const cleanedPrompt = isUploadedPlaceholder
                ? ''
                : media.prompt
                      .replace(/\[BODY:[^\]]*\]\s*/gi, '')
                      .replace(/\[FACE:[^\]]*\]\s*/gi, '')
                      .trim()

            setPrompt(cleanedPrompt)

            if (media.aspectRatio) {
                setAspectRatio(media.aspectRatio)
            }

            // Set the image as clone reference
            if (media.mediaType === 'IMAGE') {
                try {
                    const response = await fetch(media.url)
                    const blob = await response.blob()
                    const reader = new FileReader()
                    reader.onload = (e) => {
                        const result = e.target?.result as string
                        const matches = result.match(/^data:(.+);base64,(.+)$/)
                        if (matches) {
                            const refImg: ReferenceImage = {
                                id: `reuse-${Date.now()}`,
                                url: result,
                                mimeType: matches[1],
                                base64: matches[2],
                                type: 'general',
                            }
                            setCloneImage(refImg)
                        }
                    }
                    reader.readAsDataURL(blob)
                } catch (error) {
                    console.error('Failed to set clone reference:', error)
                }
            }

            toast.push(
                <Notification
                    type={isUploadedPlaceholder ? 'info' : 'success'}
                    title={
                        isUploadedPlaceholder
                            ? 'Image loaded as reference'
                            : 'Re-using Generation'
                    }
                >
                    {isUploadedPlaceholder
                        ? 'Uploaded image set as clone reference. Describe the scene you want to generate.'
                        : 'Prompt and clone reference loaded'}
                </Notification>,
            )
        },
        [setPrompt, setCloneImage, setAspectRatio],
    )

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden">
            {/* Header actions (Prompts / Upload / Tools) are portaled UP into the
                StudioTabs tab-bar row to reclaim a whole header row. The title +
                subtitle are dropped: the active tab already reads "Avatar Studio"
                and the avatar being edited shows in the control bar below. */}
            {headerSlot &&
                createPortal(
                    <>
                        {/* Toggle de la barra de búsqueda+filtros de la galería:
                            vive en el header (que ya existe) para que la barra
                            NO ocupe una fila cuando no se usa. Punto azul si hay
                            un filtro/búsqueda activo con la barra cerrada. */}
                        <button
                            type="button"
                            onClick={() => setGalleryBarOpen(!galleryBarOpen)}
                            title="Buscar / filtrar galería"
                            className={`relative p-1.5 rounded-lg transition-colors ${
                                galleryBarOpen
                                    ? 'text-primary bg-primary/10'
                                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                        >
                            <HiOutlineSearch className="w-5 h-5" />
                            {galleryFiltersActive && !galleryBarOpen && (
                                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-blue-500" />
                            )}
                        </button>
                        {/* En móvil solo iconos: con texto, estos tres botones
                            comprimían el TabList y el tab Flow Editor
                            desaparecía de la fila. */}
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlineBookOpen />}
                            onClick={() => setIsPromptLibraryOpen(true)}
                        >
                            <span className="hidden sm:inline">Prompts</span>
                        </Button>
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlineUpload />}
                            onClick={() =>
                                galleryUploadInputRef.current?.click()
                            }
                        >
                            <span className="hidden sm:inline">Upload</span>
                        </Button>
                        <Dropdown
                            placement="bottom-end"
                            renderTitle={
                                <Button
                                    size="sm"
                                    variant="plain"
                                    icon={<HiOutlineCog />}
                                >
                                    <span className="hidden sm:inline">Tools</span>
                                </Button>
                            }
                        >
                            <Dropdown.Item
                                eventKey="voice"
                                onClick={openVoiceTool}
                            >
                                🎙 Voice Studio
                            </Dropdown.Item>
                            <Dropdown.Item
                                eventKey="remix"
                                onClick={() => setActiveTool('remix')}
                            >
                                🎞 Reel Remix
                            </Dropdown.Item>
                            <Dropdown.Item
                                eventKey="downloader"
                                onClick={() => setActiveTool('downloader')}
                            >
                                ⬇️ Reel Downloader
                            </Dropdown.Item>
                            {avatarId && (
                                <Dropdown.Item
                                    eventKey="agent"
                                    onClick={() =>
                                        window.location.assign(
                                            `/concepts/avatar-forge/agent/${avatarId}`,
                                        )
                                    }
                                >
                                    🤖 AI Agent
                                </Dropdown.Item>
                            )}
                        </Dropdown>
                    </>,
                    headerSlot,
                )}

            {/* Error Banner */}
            {errorMsg && (
                <div className="px-6 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 shrink-0 flex items-center justify-between gap-4">
                    <p className="text-sm text-red-600 dark:text-red-400 flex-1">
                        {errorMsg}
                    </p>
                    <button
                        onClick={() => setErrorMsg(null)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 transition-colors shrink-0 p-1"
                        aria-label="Dismiss error"
                    >
                        <HiX className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Gallery - Full Width */}
            <div className="flex-1 overflow-hidden">
                <GalleryPanel
                    userId={userId}
                    uploadInputRef={galleryUploadInputRef}
                    onCreateVariant={handleCreateVariant}
                    onSaveToGallery={handleSaveToGallery}
                    onPost={(m: GeneratedMedia) => setPostMedia(m)}
                    onUploaded={persistGeneration}
                    onSendToBackground={handleSendToBackground}
                />
            </div>

            {/* Bottom Control Bar - Sticky, collapsible.
                A center handle toggles it; when collapsed the panel is CSS-hidden
                (not unmounted) so the typed prompt and picked refs survive, and
                the gallery above expands into the freed space. */}
            <div className="shrink-0 relative">
                {isCreationCollapsed ? (
                    // Collapsed: a normal centered pill in its OWN short bar so it's
                    // always fully visible. The floating -top handle got clipped at
                    // the viewport's bottom edge once the panel below was hidden.
                    <div className="flex justify-center py-2 border-t border-gray-200 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={() => setIsCreationCollapsed((c) => !c)}
                            title="Show creation panel"
                            className="flex items-center gap-1 px-4 h-8 rounded-full bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-200 text-xs font-medium shadow-md ring-1 ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-primary transition-colors"
                        >
                            <HiChevronUp /> Create
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setIsCreationCollapsed((c) => !c)}
                        title="Hide creation panel"
                        className="absolute left-1/2 -translate-x-1/2 -top-3.5 z-20 flex items-center gap-1 px-4 h-7 rounded-full bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-200 text-xs font-medium shadow-md ring-1 ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-primary transition-colors"
                    >
                        <HiChevronDown />
                    </button>
                )}
                {/* Cap the creation panel + let it scroll internally so it can
                    never steal the gallery's height (VIDEO mode makes it tall,
                    which used to collapse the gallery and clip its Upload row). */}
                <div
                    className={
                        isCreationCollapsed
                            ? 'hidden'
                            : 'max-h-[50vh] overflow-y-auto'
                    }
                >
                    <BottomControlBar
                        onGenerate={handleGenerate}
                        onChangeAvatar={() => setIsAvatarSelectorOpen(true)}
                        onDeselectAvatar={() => {
                            setAvatarId(null)
                            setAvatarName('')
                            setCurrentAvatar(null)
                            clearAvatarReferences()
                            unlockAvatar()
                            setAvatarDefaultVoice(null)
                        }}
                        onEditAvatar={() => setIsAvatarEditOpen(true)}
                        onEnhancePrompt={handleEnhancePrompt}
                        onDescribeImage={handleDescribeImage}
                        onSafetyCheck={handleSafetyCheck}
                    />
                </div>
            </div>

            {/* Preview Modal — the single image editor (onEdit has the Provider selector) */}
            <ImagePreviewModal
                userId={userId}
                onCropped={(m: GeneratedMedia) => void persistGeneration(m)}
                onEdit={handleEditImage}
                onAnimate={handleAnimateImage}
                onVariant={handleCreateVariant}
                onSave={handleSaveToGallery}
                onContinueVideo={handleContinueVideo}
                onReuse={handleReuse}
                onPost={(m: GeneratedMedia) => setPostMedia(m)}
                onEditVideo={(m: GeneratedMedia) => setVideoEditorMedia(m)}
                onLipsync={(m: GeneratedMedia) => setLipsyncMedia(m)}
            />

            {/* Unified Post modal (social + Fanvue) */}
            <PostModal
                media={postMedia}
                fallbackAvatarId={avatarId ?? null}
                onClose={() => setPostMedia(null)}
            />

            {/* Lipsync — gallery video + Voice Studio audio */}
            <LipsyncDialog
                media={lipsyncMedia}
                userId={userId}
                onClose={() => setLipsyncMedia(null)}
                onOpenVoiceStudio={openVoiceTool}
            />

            {/* Video Editor — opens in-place instead of navigating to /video-editor */}
            <ToolModal
                isOpen={!!videoEditorMedia}
                onClose={() => setVideoEditorMedia(null)}
            >
                {videoEditorMedia && (
                    <VideoEditorMain
                        key={videoEditorMedia.id}
                        userId={userId}
                        initialVideoUrl={videoEditorMedia.url}
                    />
                )}
            </ToolModal>

            {/* Consolidated tools — Voice Studio / Reel Remix / Reel Downloader */}
            <ToolModal
                isOpen={activeTool === 'voice'}
                onClose={() => setActiveTool(null)}
            >
                {activeTool === 'voice' &&
                    userId &&
                    (toolAvatars ? (
                        <VoiceStudioTool
                            userId={userId}
                            avatars={toolAvatars}
                            onSentToAvatarStudio={() => {
                                // Speak mode is already set in the store — just
                                // hand the studio back (navigating would wipe
                                // the in-memory gallery).
                                setActiveTool(null)
                            }}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-64">
                            <Spinner size={40} />
                        </div>
                    ))}
            </ToolModal>
            <ToolModal
                isOpen={activeTool === 'remix'}
                onClose={() => setActiveTool(null)}
            >
                {activeTool === 'remix' && <ReelRemixTool />}
            </ToolModal>
            <ToolModal
                isOpen={activeTool === 'downloader'}
                onClose={() => setActiveTool(null)}
            >
                {activeTool === 'downloader' && <ReelDownloaderTool />}
            </ToolModal>

            {/* Avatar Selector Modal */}
            {userId && (
                <AvatarSelector
                    userId={userId}
                    isOpen={isAvatarSelectorOpen}
                    onClose={() => setIsAvatarSelectorOpen(false)}
                />
            )}

            {/* Avatar Edit Drawer */}
            <AvatarEditDrawer
                isOpen={isAvatarEditOpen}
                onClose={() => setIsAvatarEditOpen(false)}
                onSaveAvatar={handleSaveAvatar}
                onAnalyzeFace={handleAnalyzeFace}
            />

            {/* Prompt Library Drawer */}
            <PromptLibraryDrawer userId={userId} />

            {/* Provider Manager Drawer */}
            <ProviderManagerDrawer />
        </div>
    )
}

export default AvatarStudioMain
