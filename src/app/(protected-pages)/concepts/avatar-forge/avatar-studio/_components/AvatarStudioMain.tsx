'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import AvatarEditDrawer from './AvatarEditDrawer'
import BottomControlBar from './BottomControlBar'
import GalleryPanel from './GalleryPanel'
import ImagePreviewModal from './ImagePreviewModal'
import ImageEditorPanel from './ImageEditorPanel'
import AvatarSelector from './AvatarSelector'
import PromptLibraryDrawer from './PromptLibraryDrawer'
import ProviderManagerDrawer, { DEFAULT_PROVIDERS } from './ProviderManagerDrawer'
import Button from '@/components/ui/Button'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    apiCreateAvatar,
    apiUpdateAvatar,
    apiUploadReference,
    apiSaveGenerationWithFile,
} from '@/services/AvatarForgeService'
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
import { generateImageKie, generateVideoKieSafe, generateMotionControlKieSafe, submitKieImageTask, checkKieImageTask, submitTalkingVideoKieTask, submitLipsyncVideoKieTask, checkKieVideoTask } from '@/services/KieService'
import { generateImageViaGateway } from '@/services/GatewayService'
import { buildAvatarPrompt, buildLeanIdentityPrompt, stripHarnessForFaceSwap, type RefRole } from '@/utils/avatarPromptBuilder'
import { HiOutlineCog, HiOutlineBookOpen, HiX } from 'react-icons/hi'
import { AppState } from '../types'
import type { GeneratedMedia, ReferenceImage } from '../types'
import type { AspectRatio } from '@/@types/supabase'
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
    const sub = await submitKieImageTask(params)
    if (!sub.success) {
        throw new Error(sub.error)
    }
    const deadlineMs = Date.now() + 18 * 60 * 1000
    while (Date.now() < deadlineMs) {
        await new Promise((r) => setTimeout(r, 5000))
        const st = await checkKieImageTask(sub.taskId)
        if (st.status === 'done') {
            return { url: st.url, fullApiPrompt: sub.fullApiPrompt }
        }
        if (st.status === 'failed') {
            throw new Error(st.error)
        }
    }
    throw new Error('KIE tardó demasiado (>18 min). Intenta de nuevo.')
}

/** KIE models that use the unified async createTask + client-poll flow. */
const KIE_ASYNC_MODELS = ['nano-banana-pro', 'gpt-image-2-text-to-image']

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
    throw new Error(`KIE tardó demasiado (>30 min). El job ${sub.taskId} puede seguir corriendo en kie.ai/logs.`)
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
 * Client unwrap for generateVideoKieSafe / generateMotionControlKieSafe. The
 * server returns the KIE error as DATA (a thrown 'use server' error is masked as
 * a generic 500 in prod); we re-throw the REAL message HERE so handleGenerate's
 * catch shows it. Mirrors genVideoGemini.
 */
async function genVideoKie(
    params: Parameters<typeof generateVideoKieSafe>[0],
): Promise<string> {
    const r = await generateVideoKieSafe(params)
    if (!r.success) {
        throw new Error(r.error)
    }
    return r.url as string
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

const AvatarStudioMain = ({ userId }: AvatarStudioMainProps) => {
    const [isAvatarSelectorOpen, setIsAvatarSelectorOpen] = useState(false)
    const [isAvatarEditOpen, setIsAvatarEditOpen] = useState(false)
    const pendingAutoGenerateRef = useRef(false)

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
        videoInputImage,
        identityWeight,
        measurements,
        faceDescription,
        prompt,
        generationMode,
        videoSubMode,
        speakModel,
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
        addToGallery,
        setIsEnhancingPrompt,
        setShowProviderManager,
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
    } = useAvatarStudioStore()

    // Image optimization hook for API calls
    const { prepareAvatarPayload, optimizeImage } = useImageOptimization()

    // Initialize providers on mount and update when mode changes
    useEffect(() => {
        // Always ensure providers are set
        if (providers.length === 0) {
            setProviders(DEFAULT_PROVIDERS)
        }

        // Set appropriate default provider when mode changes or on mount
        const currentProvider = providers.find(p => p.id === activeProviderId)
        const isProviderValidForMode = currentProvider
            ? (generationMode === 'IMAGE' ? currentProvider.supports_image : currentProvider.supports_video)
            : false

        if (!activeProviderId || !isProviderValidForMode) {
            const availableProviders = (providers.length > 0 ? providers : DEFAULT_PROVIDERS)
            const defaultProvider = availableProviders.find(p =>
                generationMode === 'IMAGE' ? p.supports_image : p.supports_video
            )
            if (defaultProvider) {
                setActiveProviderId(defaultProvider.id)
            }
        }
    }, [generationMode, providers, activeProviderId, setProviders, setActiveProviderId])

    // Check for imported image from Gallery on mount
    useEffect(() => {
        const importData = sessionStorage.getItem('studioImport')
        if (importData) {
            try {
                const { url, prompt: importPrompt, mediaType, mode } = JSON.parse(importData)
                sessionStorage.removeItem('studioImport')

                if (url && mediaType === 'IMAGE') {
                    // Always convert URL to base64 first (required for edit/animate operations)
                    fetch(url)
                        .then((res) => res.blob())
                        .then((blob) => {
                            const reader = new FileReader()
                            reader.onloadend = () => {
                                const base64DataUrl = reader.result as string

                                // Create a GeneratedMedia object with base64 URL
                                const importedMedia: GeneratedMedia = {
                                    id: crypto.randomUUID(),
                                    url: base64DataUrl, // Use base64 dataURL, not HTTP URL
                                    prompt: importPrompt || '',
                                    aspectRatio: '1:1',
                                    timestamp: Date.now(),
                                    mediaType: 'IMAGE',
                                }

                                // Add to gallery
                                addToGallery(importedMedia)

                                if (mode === 'animate') {
                                    // Set up for video generation
                                    const matches = base64DataUrl.match(/data:([^;]+);base64,(.+)/)
                                    if (matches) {
                                        const refImg: ReferenceImage = {
                                            id: crypto.randomUUID(),
                                            url: base64DataUrl,
                                            mimeType: matches[1],
                                            base64: matches[2],
                                            type: 'general',
                                        }
                                        setVideoInputImage(refImg)
                                        setGenerationMode('VIDEO')
                                        setVideoSubMode('ANIMATE')
                                        setPrompt(importPrompt || 'Cinematic movement, slow motion, high quality.')
                                    }
                                } else {
                                    // Edit mode - open the preview modal
                                    setTimeout(() => {
                                        const store = useAvatarStudioStore.getState()
                                        store.setPreviewMedia(importedMedia)
                                    }, 100)
                                }
                            }
                            reader.readAsDataURL(blob)
                        })
                        .catch(console.error)
                }
            } catch (err) {
                console.error('Failed to import from gallery:', err)
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Save Avatar Handler
    const handleSaveAvatar = useCallback(
        async (name: string) => {
            if (!userId) {
                toast.push(
                    <Notification type="danger" title="Error">
                        You must be logged in to save avatars
                    </Notification>
                )
                return
            }

            setIsSavingAvatar(true)
            try {
                let savedAvatarId = avatarId

                // Create or update avatar
                if (avatarId) {
                    await apiUpdateAvatar(avatarId, {
                        name,
                        identity_weight: identityWeight,
                        face_description: faceDescription,
                        measurements,
                    })
                } else {
                    const newAvatar = await apiCreateAvatar({
                        name,
                        user_id: userId,
                        identity_weight: identityWeight,
                        face_description: faceDescription,
                        measurements,
                    })
                    savedAvatarId = newAvatar.id
                    setAvatarId(newAvatar.id)
                }

                // Upload references
                if (savedAvatarId) {
                    const allRefs = [
                        ...generalReferences.map((r) => ({ ...r, type: 'general' as const })),
                        ...(faceRef ? [{ ...faceRef, type: 'face' as const }] : []),
                        ...(angleRef ? [{ ...angleRef, type: 'angle' as const }] : []),
                        ...(bodyRef ? [{ ...bodyRef, type: 'body' as const }] : []),
                    ]

                    for (const ref of allRefs) {
                        if (!ref.storagePath) {
                            // Upload new reference
                            const blob = await fetch(ref.url).then((r) => r.blob())
                            const file = new File([blob], `${ref.type}-${Date.now()}.jpg`, {
                                type: ref.mimeType,
                            })
                            await apiUploadReference(savedAvatarId, userId, file, ref.type)
                        }
                    }
                }

                setAvatarName(name)
                toast.push(
                    <Notification type="success" title="Saved">
                        Avatar saved successfully
                    </Notification>
                )
            } catch (error) {
                console.error('Failed to save avatar:', error)
                toast.push(
                    <Notification type="danger" title="Error">
                        Failed to save avatar
                    </Notification>
                )
            } finally {
                setIsSavingAvatar(false)
            }
        },
        [
            userId,
            avatarId,
            identityWeight,
            faceDescription,
            measurements,
            generalReferences,
            faceRef,
            angleRef,
            bodyRef,
            setAvatarId,
            setAvatarName,
            setIsSavingAvatar,
        ]
    )

    // Analyze Face Handler
    const handleAnalyzeFace = useCallback(async () => {
        // Filter for images with valid base64
        const validRefs = faceRef?.base64
            ? [faceRef]
            : generalReferences.filter((r) => r.base64 && r.base64.length > 0).slice(0, 3)

        if (validRefs.length === 0) {
            toast.push(
                <Notification type="warning" title="No Images">
                    Please add reference images first
                </Notification>
            )
            return
        }

        try {
            // Resize each ref to ~1024px before sending — full-res photos blow
            // past Vercel's ~4.5MB server-action body cap (413). Browser canvas.
            const optimizedRefs = (
                await Promise.all(
                    validRefs.map((img) =>
                        optimizeImage({ base64: img.base64, mimeType: img.mimeType }),
                    ),
                )
            ).filter((r): r is { base64: string; mimeType: string } => !!r)
            const description = await analyzeFaceFromImages(
                (optimizedRefs.length > 0 ? optimizedRefs : validRefs).map((img) => ({
                    base64: img.base64,
                    mimeType: img.mimeType,
                })),
            )
            if (description) {
                setFaceDescription(description)
            }
        } catch (error) {
            console.error('Face analysis failed:', error)
            toast.push(
                <Notification type="danger" title="Error">
                    Failed to analyze face
                </Notification>
            )
        }
    }, [faceRef, generalReferences, setFaceDescription, optimizeImage])

    // Generate Handler
    const handleGenerate = useCallback(async () => {
        if (isGenerating) return
        if (isLoadingReferences) {
            toast.push(
                <Notification type="warning" title="Please Wait">
                    Avatar references are still loading...
                </Notification>
            )
            return
        }
        const fullPrompt = getFullPrompt()
        if (!fullPrompt.trim()) {
            toast.push(
                <Notification type="warning" title="Missing Prompt">
                    Please enter a prompt
                </Notification>
            )
            return
        }

        const activeProvider = getActiveProvider()

        setIsGenerating(true)
        setAppState(AppState.GENERATING)
        setErrorMsg(null)

        // Filter out references without valid base64
        const validGeneralRefs = generalReferences.filter((r) => r.base64 && r.base64.length > 0)
        const validAssetRefs = assetImages.filter((r) => r.base64 && r.base64.length > 0)

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
                ? await optimizeImage({ base64: angleRef.base64, mimeType: angleRef.mimeType })
                : null

            // Optimize pose ref (session tool) — drives body position. Gemini
            // already handles poseRefImage; we also forward it to KIE multi-ref.
            const optimizedPoseRef = poseImage?.base64
                ? await optimizeImage({ base64: poseImage.base64, mimeType: poseImage.mimeType })
                : null

            // Optimize the Clone Ref IMAGE (the original to replicate). Image
            // models like GPT Image 2 can't clone body/outfit/pose from text —
            // they need the actual image (as you did in ChatGPT: face + scene).
            const optimizedCloneRef = cloneImage?.base64
                ? await optimizeImage({ base64: cloneImage.base64, mimeType: cloneImage.mimeType })
                : null

            // All reference images for providers that accept multiple inputs
            // (Nano Banana Pro / GPT Image 2 via KIE). Each carries a `role` so
            // KieService can label it in the prompt ("Image 1 is the face…") —
            // without labels the model blends them and loses identity.
            const kieReferenceImages = [
                optimizedPayload.faceRef && { ...optimizedPayload.faceRef, role: 'face' },
                optimizedAngleRef && { ...optimizedAngleRef, role: 'angle' },
                optimizedPayload.bodyRef && { ...optimizedPayload.bodyRef, role: 'body' },
                optimizedPoseRef && { ...optimizedPoseRef, role: 'pose' },
                optimizedPayload.sceneImage && { ...optimizedPayload.sceneImage, role: 'scene' },
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
                        optimizedPayload.faceRef ?? optimizedPayload.generalRefs[0] ?? null
                    const faceReferenceUrl = subjectRef
                        ? `data:${subjectRef.mimeType};base64,${subjectRef.base64}`
                        : undefined

                    // MiniMax only gets text + one reference, so fold faceDescription
                    // into the prompt to compensate for the missing Gemini-only fields.
                    const miniMaxPrompt = faceDescription?.trim()
                        ? `[FACE: ${faceDescription.trim()}] ${fullPrompt}`
                        : fullPrompt

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
                        klingModel === 'kling-v3-omni' && optimizedCloneRef && referenceImage
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
                    let refRoles = kieReferenceImages.map((r) => r.role as RefRole)
                    let kiePrompt = fullPrompt
                    let kieRefsToSend = kieReferenceImages
                    // The single ref passed to the sync adapters (flux-kontext /
                    // gpt-4o / generic). Defaults to the face; flux-kontext edit
                    // mode overrides it to the Clone (the canvas to edit).
                    let kieSingleRef = referenceImage

                    // Nano Banana Pro ONLY: feed the Clone Ref IMAGE (not just the
                    // [CLONE:] text) so it clones the EXACT pose/outfit/framing/scene
                    // — same lever that fixed GPT Image 2. Appended LAST so
                    // FACE_ANCHOR stays slot 1 (high-fidelity identity) and the
                    // image_input order == refRoles order for the prompt's mapping.
                    // Guarded on kieReferenceImages.length so we never send a lone
                    // clone with no FACE_ANCHOR image to back the [FACE_ANCHOR] label.
                    if (
                        kieModel === 'nano-banana-pro' &&
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
                        (kieModel.startsWith('flux-kontext') && optimizedCloneRef)
                    ) {
                        // Flux is single-input (edit on the Clone canvas) so it can run
                        // with ONLY a clone and no avatar ref images; the others need
                        // their ref array, hence the length>0 path above.
                        if (kieModel === 'nano-banana-pro') {
                            const { systemPreamble, finalPrompt } = buildAvatarPrompt({
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
                        } else if (kieModel === 'gpt-image-2-text-to-image') {
                            // Face-swap EDIT, mirroring how ChatGPT processes it:
                            // Clone/original FIRST (the canvas to recreate exactly)
                            // + face SECOND (swap in the avatar's face). 2 refs,
                            // light enough to avoid the KIE 500. No angle-sheet.
                            const faceOnly = kieReferenceImages.filter((r) => r.role === 'face')
                            const faceRefs = faceOnly.length > 0 ? faceOnly : [kieReferenceImages[0]]
                            if (optimizedCloneRef) {
                                kieRefsToSend = [
                                    { ...optimizedCloneRef, role: 'scene' as const },
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
                                kiePrompt = buildLeanIdentityPrompt(fullPrompt, ['face'])
                            }
                        } else if (kieModel.startsWith('flux-kontext') && optimizedCloneRef) {
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

                    if (KIE_ASYNC_MODELS.includes(kieModel)) {
                        // ASYNC submit + browser poll (see pollKieImageTask).
                        const polled = await pollKieImageTask({
                            prompt: kiePrompt,
                            referenceImage: kieSingleRef,
                            referenceImages: kieRefsToSend,
                            aspectRatio,
                            model: kieModel,
                        })
                        resultUrl = polled.url
                        apiPrompt = polled.fullApiPrompt
                    } else {
                        const result = await generateImageKie({
                            prompt: kiePrompt,
                            referenceImage: kieSingleRef,
                            referenceImages: kieRefsToSend,
                            aspectRatio,
                            model: activeProvider.model || 'flux-kontext/text-to-image',
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
                console.log('[AvatarStudio] Provider Type:', activeProvider?.type)
                console.log('[AvatarStudio] Is Kling Provider:', isKlingProvider)
                console.log('[AvatarStudio] Is MiniMax Provider:', isMinimaxProvider)

                if (videoSubMode === 'SPEAK') {
                    // Talking-head: audio ya generado (Voice Studio) O texto → TTS
                    // con la voz clonada del avatar; luego el motor elegido.
                    const presetAudioUrl = useAvatarStudioStore.getState().speakAudioUrl
                    // El guion vive en videoDialogue (diálogo del botón 🎤), NO en el
                    // prompt principal — así Img→Prompt no puede sobreescribirlo. El
                    // prompt principal queda como descripción visual opcional.
                    const script = useAvatarStudioStore.getState().videoDialogue.trim()
                    if (!presetAudioUrl && !avatarDefaultVoice) {
                        throw new Error('This avatar has no main voice. Clone one in Voice Studio and set it as main.')
                    }
                    if (!presetAudioUrl && !script) {
                        throw new Error('Add a script first — click the 🎤 microphone button next to the prompt box')
                    }
                    const visualPrompt = useAvatarStudioStore.getState().prompt.trim()

                    // La imagen que habla: si hay una imagen cargada en el dropzone
                    // (galería/upload) gana sobre las refs del avatar — permite el
                    // flujo "imagen + guion → talking video". Sin imagen cargada,
                    // se usa la face ref del avatar.
                    let speakImage = optimizedPayload.faceRef || optimizedPayload.generalRefs[0]
                    if (videoInputImage?.base64) {
                        const optimizedSpeakInput = await optimizeImage(
                            {
                                base64: videoInputImage.base64,
                                mimeType: videoInputImage.mimeType,
                            },
                            'API_FULL',
                        )
                        if (optimizedSpeakInput) speakImage = optimizedSpeakInput
                    }
                    if (!speakImage) {
                        throw new Error('Add avatar references (a face photo) or load an image before generating a talking video')
                    }

                    // 1. Audio: reusar el ya generado en Voice Studio (salta el TTS)
                    // o sintetizar al vuelo con la voz principal del avatar.
                    let audioUrl: string
                    let durationMs: number | undefined
                    if (presetAudioUrl) {
                        audioUrl = presetAudioUrl
                        // Duración real del mp3 (dimensiona el video de Kling).
                        durationMs = await new Promise<number | undefined>((resolve) => {
                            const probe = new Audio(presetAudioUrl)
                            probe.onloadedmetadata = () =>
                                resolve(Number.isFinite(probe.duration) ? probe.duration * 1000 : undefined)
                            probe.onerror = () => resolve(undefined)
                        })
                    } else {
                        const langMap: Record<string, string> = {
                            es: 'Spanish', en: 'English', pt: 'Portuguese', fr: 'French',
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
                                    : langMap[voice.language] ?? voice.language,
                                ...voiceSettings,
                            }),
                        })
                        if (!ttsRes.ok) {
                            const { error: ttsError } = await ttsRes.json()
                            throw new Error(ttsError || 'Voice generation (TTS) failed')
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
                          ].filter((r): r is { base64: string; mimeType: string } => !!r)

                    try {
                        const speakModel = useAvatarStudioStore.getState().speakModel
                        resultUrl = await pollKieTalkingVideoTask({
                            image: speakImage,
                            audioUrl,
                            prompt: visualPrompt || undefined,
                            resolution: '720p',
                            model: speakModel,
                            elementImages: speakElementImages,
                            durationSec: durationMs ? durationMs / 1000 : undefined,
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
                                throw new Error(`Lipsync step failed to start: ${lipsyncSub.error}. Silent Kling video was generated: ${resultUrl}`)
                            }
                            const lipsyncDeadline = Date.now() + 30 * 60 * 1000
                            let lipsyncedUrl: string | null = null
                            while (Date.now() < lipsyncDeadline) {
                                await new Promise((r) => setTimeout(r, 5000))
                                const st = await checkKieVideoTask(lipsyncSub.taskId)
                                if (st.status === 'done') {
                                    lipsyncedUrl = st.url
                                    break
                                }
                                if (st.status === 'failed') {
                                    throw new Error(`Lipsync step failed: ${st.error}. Silent Kling video was generated: ${resultUrl}`)
                                }
                            }
                            if (!lipsyncedUrl) {
                                throw new Error(`Lipsync step timed out (>30 min). Silent Kling video was generated: ${resultUrl}`)
                            }
                            resultUrl = lipsyncedUrl
                        }
                    } catch (speakErr) {
                        // El audio ya quedó generado y persistido; que el error lo diga
                        // para no perder ese contexto (sin fallbacks silenciosos).
                        const msg = speakErr instanceof Error ? speakErr.message : String(speakErr)
                        throw new Error(`Talking video failed: ${msg}. The audio was generated: ${audioUrl}`)
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
                        ].filter((r): r is { base64: string; mimeType: string } => !!r)

                        if (identityRefs.length === 0) {
                            throw new Error('No avatar references available for identity-preserving continue')
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
                        if (klingMotionControlEnabled && (klingMotionVideoBase64 || klingMotionVideoUrl || klingPresetMotion)) {
                            console.log('[AvatarStudio] Using Motion Control generation')
                            console.log('[AvatarStudio] Preset:', klingPresetMotion)
                            console.log('[AvatarStudio] Has uploaded video:', !!klingMotionVideoBase64)
                            console.log('[AvatarStudio] Has URL video:', !!klingMotionVideoUrl)

                            resultUrl = await generateMotionControlKling({
                                characterImage: optimizedVideoInput,
                                motionVideo: klingMotionVideoBase64 ? {
                                    base64: klingMotionVideoBase64,
                                    mimeType: 'video/mp4',
                                } : undefined,
                                motionVideoUrl: klingMotionVideoUrl || undefined,
                                presetMotion: klingPresetMotion || undefined,
                                motionOrientation: klingMotionOrientation,
                                keepOriginalSound: klingKeepOriginalSound,
                                duration: klingMotionDuration,
                                prompt: fullPrompt,
                                mode: 'std',
                                modelName: (activeProvider?.model as 'kling-v2-6') || 'kling-v2-6',
                            })
                        } else {
                            // Standard Kling video generation
                            resultUrl = await generateVideoKling({
                                prompt: fullPrompt,
                                imageInput: optimizedVideoInput,
                                aspectRatio,
                                duration: String(videoDuration) as '5' | '10',
                                modelName: activeProvider?.model || 'kling-v1-6',
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
                            model: (activeProvider?.model as MiniMaxVideoModel) || 'MiniMax-Hailuo-2.3',
                            resolution: videoResolution,
                        })
                    } else if (activeProvider?.type === 'KIE') {
                        const isKieKling = activeProvider.model === 'kling-3.0/video'
                        const hasMotionVideo = !!(klingMotionVideoBase64 || klingMotionVideoUrl)
                        if (isKieKling && klingMotionControlEnabled && hasMotionVideo) {
                            // KIE Kling 3.0 motion-control (v2v)
                            resultUrl = await genMotionControlKie({
                                characterImage: optimizedVideoInput,
                                motionVideoUrl: klingMotionVideoUrl || undefined,
                                motionVideoBase64: klingMotionVideoBase64 || undefined,
                                prompt: fullPrompt,
                                resolution: videoResolution,
                                characterOrientation: klingMotionOrientation,
                            })
                        } else {
                            // KIE aggregator — plain video (Kling 3.0 / Seedance / Wan / Veo)
                            resultUrl = await genVideoKie({
                                prompt: fullPrompt,
                                firstFrameImage: optimizedVideoInput,
                                model: activeProvider.model || 'veo-3.1/text-to-video',
                                aspectRatio,
                                duration: videoDuration,
                                resolution: videoResolution,
                                sound: isKieKling ? klingNativeAudioEnabled : undefined,
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
                        const avatarInput = optimizedPayload.faceRef || optimizedPayload.generalRefs[0]
                        if (!avatarInput) {
                            throw new Error('Please add avatar references for Kling video generation')
                        }

                        // Check if Motion Control is enabled (v2.6+ only)
                        if (klingMotionControlEnabled && (klingMotionVideoBase64 || klingMotionVideoUrl || klingPresetMotion)) {
                            console.log('[AvatarStudio] AVATAR mode: Using Motion Control generation')
                            resultUrl = await generateMotionControlKling({
                                characterImage: avatarInput,
                                motionVideo: klingMotionVideoBase64 ? {
                                    base64: klingMotionVideoBase64,
                                    mimeType: 'video/mp4',
                                } : undefined,
                                motionVideoUrl: klingMotionVideoUrl || undefined,
                                presetMotion: klingPresetMotion || undefined,
                                motionOrientation: klingMotionOrientation,
                                keepOriginalSound: klingKeepOriginalSound,
                                duration: klingMotionDuration,
                                prompt: fullPrompt,
                                mode: 'std',
                                modelName: (activeProvider?.model as 'kling-v2-6') || 'kling-v2-6',
                            })
                        } else {
                            // Standard Kling avatar video generation
                            resultUrl = await generateAvatarVideoKling({
                                prompt: fullPrompt,
                                avatarImage: avatarInput,
                                aspectRatio,
                                duration: String(videoDuration) as '5' | '10',
                                modelName: activeProvider?.model || 'kling-v1-6',
                            })
                        }
                    } else if (isMinimaxProvider) {
                        // MiniMax Hailuo with subject_reference (avatar lock)
                        const refs = [
                            optimizedPayload.faceRef,
                            optimizedPayload.bodyRef,
                            ...optimizedPayload.generalRefs,
                        ].filter((r): r is { base64: string; mimeType: string } => !!r)

                        if (refs.length === 0) {
                            throw new Error('Please add avatar references for MiniMax video generation')
                        }

                        resultUrl = await generateVideoMiniMax({
                            mode: 'subject',
                            prompt: fullPrompt,
                            characterImages: refs,
                            model: (activeProvider?.model as MiniMaxVideoModel) || 'MiniMax-Hailuo-2.3',
                            resolution: videoResolution,
                        })
                    } else if (activeProvider?.type === 'KIE') {
                        // KIE aggregator — single reference image as first frame (no native subject_reference)
                        const firstRef =
                            optimizedPayload.faceRef ??
                            optimizedPayload.bodyRef ??
                            optimizedPayload.generalRefs[0] ??
                            null
                        const isKieKling = activeProvider.model === 'kling-3.0/video'
                        const hasMotionVideo = !!(klingMotionVideoBase64 || klingMotionVideoUrl)

                        if (isKieKling && klingMotionControlEnabled && hasMotionVideo && firstRef) {
                            // KIE Kling 3.0 motion-control (v2v)
                            resultUrl = await genMotionControlKie({
                                characterImage: firstRef,
                                motionVideoUrl: klingMotionVideoUrl || undefined,
                                motionVideoBase64: klingMotionVideoBase64 || undefined,
                                prompt: fullPrompt,
                                resolution: videoResolution,
                                characterOrientation: klingMotionOrientation,
                            })
                        } else {
                            resultUrl = await genVideoKie({
                                prompt: fullPrompt,
                                firstFrameImage: firstRef,
                                model: activeProvider.model || 'veo-3.1/text-to-video',
                                aspectRatio,
                                duration: videoDuration,
                                resolution: videoResolution,
                                sound: isKieKling ? klingNativeAudioEnabled : undefined,
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
                avatarInfo: {
                    name: avatarName || 'Unnamed',
                    thumbnailUrl: faceRef?.url || generalReferences[0]?.url,
                },
                fullApiPrompt: apiPrompt ?? fullPrompt,
                providerName: activeProvider?.name,
            }

            addToGallery(newMedia)
            setAppState(AppState.SUCCESS)
        } catch (error: unknown) {
            console.error('Generation failed:', error)
            setAppState(AppState.ERROR)
            const errorMessage = error instanceof Error ? error.message : 'Generation failed'
            setErrorMsg(errorMessage)
            toast.push(
                <Notification type="danger" title="Generation Failed">
                    {errorMessage}
                </Notification>
            )
        } finally {
            setIsGenerating(false)
            // Always clear the Continue-with-Identity flags so a follow-up
            // standalone Animate doesn't accidentally inherit them.
            setContinueUseAvatarIdentity(false)
            setContinueIdentityModel('veo-3-1')
        }
    }, [
        isGenerating,
        isLoadingReferences,
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

    // Enhance Prompt Handler
    const handleEnhancePrompt = useCallback(async () => {
        if (!prompt.trim()) return

        setIsEnhancingPrompt(true)
        try {
            // Find a valid context image with base64 data
            const contextImage = faceRef?.base64
                ? faceRef
                : generalReferences.find((r) => r.base64 && r.base64.length > 0) || null

            const enhanced = await enhancePrompt(
                prompt,
                contextImage ? { base64: contextImage.base64, mimeType: contextImage.mimeType } : null
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
                    </Notification>
                )
            }
        } catch (error) {
            console.error('Safety check failed:', error)
            toast.push(
                <Notification type="danger" title="Safety Check Failed">
                    Could not analyze prompt safety.
                </Notification>
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
                        </Notification>
                    )
                }
            } catch (error) {
                console.error('Image description failed:', error)
                toast.push(
                    <Notification type="danger" title="Analysis Failed">
                        Could not generate prompt from image
                    </Notification>
                )
            } finally {
                setIsDescribingImage(false)
            }
        },
        [setIsDescribingImage, setPromptAndAnalyze, optimizeImage]
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
        [setVideoInputImage, setGenerationMode, setVideoSubMode, setPrompt]
    )

    // Edit Image Handler
    const handleEditImage = useCallback(
        async (
            media: GeneratedMedia,
            editPrompt: string,
            maskBase64: string | null,
            editAspectRatio?: AspectRatio,
            editAssets?: Array<{ id: string; url: string; base64: string; mimeType: string }>,
            editProviderId?: string,
        ) => {
            setIsGenerating(true)
            setAppState(AppState.GENERATING)

            const targetAspectRatio = editAspectRatio || media.aspectRatio || '1:1'

            const referenceAssets = editAssets?.map((asset) => ({
                base64: asset.base64,
                mimeType: asset.mimeType,
            }))

            // Resolve which provider to use for this edit (override > active default)
            const resolvedProvider = editProviderId
                ? providers.find(p => p.id === editProviderId)
                : getActiveProvider()

            try {
                let resultUrl: string

                if (!resolvedProvider || resolvedProvider.type === 'GOOGLE') {
                    // Gemini retains its native edit endpoint with mask + multiple references
                    resultUrl = await editImage(
                        media.url,
                        editPrompt,
                        maskBase64,
                        targetAspectRatio,
                        referenceAssets,
                    )
                } else {
                    // Non-Gemini providers don't have a true "edit" — we re-render
                    // image-to-image using the source as reference. Fetch the source
                    // and convert to base64 client-side first.
                    const res = await fetch(media.url)
                    if (!res.ok) {
                        throw new Error(`Failed to fetch source image (${res.status})`)
                    }
                    const blob = await res.blob()
                    const sourceBase64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader()
                        reader.onloadend = () => {
                            const result = reader.result as string
                            resolve(result.split(',')[1])
                        }
                        reader.onerror = () => reject(reader.error)
                        reader.readAsDataURL(blob)
                    })
                    const sourceMime = blob.type || 'image/png'

                    if (resolvedProvider.type === 'KLING') {
                        const r = await generateImageKling({
                            prompt: editPrompt,
                            referenceImage: { base64: sourceBase64, mimeType: sourceMime },
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
                        const editModel = resolvedProvider.model || 'flux-kontext/text-to-image'
                        const editRef = { base64: sourceBase64, mimeType: sourceMime }
                        if (KIE_ASYNC_MODELS.includes(editModel)) {
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
                    providerName: resolvedProvider?.name ?? 'Gemini 3 Pro Image',
                }

                addToGallery(newMedia)
                setAppState(AppState.SUCCESS)
            } catch (error: unknown) {
                console.error('Edit failed:', error)
                setAppState(AppState.ERROR)
                const errorMessage = error instanceof Error ? error.message : 'Edit failed'
                setErrorMsg(errorMessage)
            } finally {
                setIsGenerating(false)
            }
        },
        [providers, getActiveProvider, addToGallery, setAppState, setErrorMsg, setIsGenerating]
    )

    // Editor Edit Handler (with assets support)
    const handleEditorEdit = useCallback(
        async (
            media: GeneratedMedia,
            editPrompt: string,
            maskBase64: string | null,
            editAspectRatio: AspectRatio,
            assets: ReferenceImage[]
        ) => {
            setIsGenerating(true)
            setAppState(AppState.GENERATING)

            try {
                const resultUrl = await editImage(
                    media.url,
                    editPrompt,
                    maskBase64,
                    editAspectRatio,
                    assets.length > 0 ? assets : undefined
                )

                const newMedia: GeneratedMedia = {
                    id: crypto.randomUUID(),
                    url: resultUrl,
                    prompt: `Edit: ${editPrompt}`,
                    aspectRatio: editAspectRatio,
                    timestamp: Date.now(),
                    mediaType: 'IMAGE',
                    providerName: getActiveProvider()?.name,
                }

                addToGallery(newMedia)
                setAppState(AppState.SUCCESS)
                toast.push(
                    <Notification type="success" title="Edit Complete">
                        Image edited successfully
                    </Notification>
                )
            } catch (error: unknown) {
                console.error('Editor edit failed:', error)
                setAppState(AppState.ERROR)
                const errorMessage = error instanceof Error ? error.message : 'Edit failed'
                setErrorMsg(errorMessage)
                toast.push(
                    <Notification type="danger" title="Edit Failed">
                        {errorMessage}
                    </Notification>
                )
            } finally {
                setIsGenerating(false)
            }
        },
        [addToGallery, setAppState, setErrorMsg, setIsGenerating]
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
        [setPrompt, handleGenerate]
    )

    // Save to Gallery Handler
    const handleSaveToGallery = useCallback(
        async (media: GeneratedMedia) => {
            if (!userId || !avatarId) {
                toast.push(
                    <Notification type="warning" title="Save Avatar First">
                        Please save your avatar before saving generations
                    </Notification>
                )
                return
            }

            try {
                // Convert URL to blob and upload
                const response = await fetch(media.url)
                const blob = await response.blob()
                const file = new File([blob], `generation-${Date.now()}.${media.mediaType === 'VIDEO' ? 'mp4' : 'jpg'}`, {
                    type: media.mediaType === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
                })

                await apiSaveGenerationWithFile(userId, avatarId, file, {
                    prompt: media.prompt,
                    media_type: media.mediaType,
                    aspect_ratio: media.aspectRatio,
                    metadata: media.metadata,
                })

                toast.push(
                    <Notification type="success" title="Saved">
                        Generation saved to gallery
                    </Notification>
                )
            } catch (error) {
                console.error('Failed to save:', error)
                toast.push(
                    <Notification type="danger" title="Error">
                        Failed to save generation
                    </Notification>
                )
            }
        },
        [userId, avatarId]
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
            console.log('[AvatarStudio] handleContinueVideo: frame captured, queueing auto-generate', {
                hasBase64: !!refImg.base64,
                base64Length: refImg.base64.length,
                useAvatarIdentity,
                identityModel,
            })
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
        [setVideoInputImage, setGenerationMode, setVideoSubMode, setPrompt, setVideoDialogue, setAspectRatio, setContinueUseAvatarIdentity, setContinueIdentityModel]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                    title={isUploadedPlaceholder ? 'Image loaded as reference' : 'Re-using Generation'}
                >
                    {isUploadedPlaceholder
                        ? 'Uploaded image set as clone reference. Describe the scene you want to generate.'
                        : 'Prompt and clone reference loaded'}
                </Notification>
            )
        },
        [setPrompt, setCloneImage, setAspectRatio]
    )

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <div>
                    <h1 className="text-lg font-bold">Avatar Studio</h1>
                    <p className="text-xs text-gray-500">
                        {avatarName ? `Editing: ${avatarName}` : 'Create consistent avatars with AI'}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Provider Badge — en modo Speak el proveedor seleccionado NO
                        genera: se muestra el motor real de talking-head (KIE). El ×
                        sale de Speak y restaura el selector de proveedor (antes el
                        badge era estático y no había forma visible de salir). */}
                    {generationMode === 'VIDEO' && videoSubMode === 'SPEAK' ? (
                        <span className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 rounded-lg">
                            <span className="w-2 h-2 rounded-full bg-purple-500" />
                            <span className="text-xs font-medium text-purple-500">
                                Speak · {
                                    speakModel === 'omnihuman'
                                        ? 'OmniHuman 1.5'
                                        : speakModel === 'kling'
                                          ? 'Kling 3.0 + Lipsync'
                                          : 'InfiniteTalk'
                                } · KIE
                            </span>
                            <button
                                type="button"
                                onClick={() => setVideoSubMode('ANIMATE')}
                                title="Exit Speak mode — back to video providers"
                                className="ml-1 p-0.5 rounded-full text-purple-400 hover:text-white hover:bg-purple-500 transition-colors"
                            >
                                <HiX className="w-3.5 h-3.5" />
                            </button>
                        </span>
                    ) : (
                        <button
                            onClick={() => setShowProviderManager(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                            <span
                                className={`w-2 h-2 rounded-full ${
                                    activeProviderId ? 'bg-green-500' : 'bg-gray-400'
                                }`}
                            />
                            <span className="text-xs font-medium">
                                {activeProviderId
                                    ? providers.find((p) => p.id === activeProviderId)?.name
                                    : 'Default Provider'}
                            </span>
                            <HiOutlineCog className="w-4 h-4" />
                        </button>
                    )}

                    {/* Prompt Library */}
                    <Button
                        size="sm"
                        variant="plain"
                        icon={<HiOutlineBookOpen />}
                        onClick={() => setIsPromptLibraryOpen(true)}
                    >
                        Prompts
                    </Button>
                </div>
            </div>

            {/* Error Banner */}
            {errorMsg && (
                <div className="px-6 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 shrink-0 flex items-center justify-between gap-4">
                    <p className="text-sm text-red-600 dark:text-red-400 flex-1">{errorMsg}</p>
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
                    onAnimateImage={handleAnimateImage}
                    onCreateVariant={handleCreateVariant}
                    onSaveToGallery={handleSaveToGallery}
                />
            </div>

            {/* Bottom Control Bar - Sticky */}
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

            {/* Preview Modal */}
            <ImagePreviewModal
                onEdit={handleEditImage}
                onAnimate={handleAnimateImage}
                onVariant={handleCreateVariant}
                onSave={handleSaveToGallery}
                onContinueVideo={handleContinueVideo}
                onReuse={handleReuse}
            />

            {/* Image Editor Panel */}
            <ImageEditorPanel onEdit={handleEditorEdit} />

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
