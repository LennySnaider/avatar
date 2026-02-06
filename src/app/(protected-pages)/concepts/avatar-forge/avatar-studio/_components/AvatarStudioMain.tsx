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
    generateVideo as generateVideoGemini,
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
} from '@/services/KlingService'
import { HiOutlineCog, HiOutlineBookOpen, HiX } from 'react-icons/hi'
import { AppState } from '../types'
import type { GeneratedMedia, ReferenceImage } from '../types'
import type { AspectRatio } from '@/@types/supabase'
import { useImageOptimization } from '../_hooks/useImageOptimization'

interface AvatarStudioMainProps {
    userId?: string
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
        videoInputImage,
        identityWeight,
        measurements,
        faceDescription,
        prompt,
        generationMode,
        videoSubMode,
        aspectRatio,
        videoResolution,
        cameraMotion,
        cameraShot,
        cameraAngle,
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
        activeProviderId,
        providers,
        errorMsg,
        isGenerating,
        isLoadingReferences,

        // Actions
        setAvatarId,
        setAvatarName,
        setFaceDescription,
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
            const description = await analyzeFaceFromImages(
                validRefs.map((img) => ({
                    base64: img.base64,
                    mimeType: img.mimeType,
                }))
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
    }, [faceRef, generalReferences, setFaceDescription])

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

            let apiPrompt: string | undefined

            if (generationMode === 'IMAGE') {
                // Pose and Clone descriptions are now added directly to the prompt input (editable by user)
                // No need to append them here - they're already in fullPrompt if user added them

                const result = await generateAvatar({
                    prompt: fullPrompt,
                    avatarReferences: optimizedPayload.generalRefs,
                    assetReferences: optimizedPayload.assetImages,
                    sceneReference: optimizedPayload.sceneImage, // Scene Composite - literally places avatar in this scene
                    faceRefImage: optimizedPayload.faceRef,
                    bodyRefImage: optimizedPayload.bodyRef,
                    angleRefImage: optimizedAngleRef,
                    poseRefImage: null, // Pose description is now in prompt as text
                    aspectRatio,
                    cameraShot,
                    cameraAngle,
                    identityWeight,
                    styleWeight: 50, // Default value, not used with Clone Ref
                    measurements,
                    faceDescription,
                    modelName: activeProvider?.model,
                })
                resultUrl = result.url
                apiPrompt = result.fullApiPrompt
            } else {
                // VIDEO mode - check provider type
                const isKlingProvider = activeProvider?.type === 'KLING'

                // Debug logging
                console.log('[AvatarStudio] Active Provider:', activeProvider)
                console.log('[AvatarStudio] Provider Type:', activeProvider?.type)
                console.log('[AvatarStudio] Is Kling Provider:', isKlingProvider)

                if (videoSubMode === 'ANIMATE') {
                    if (!videoInputImage || !videoInputImage.base64) {
                        throw new Error('Please upload an image to animate')
                    }
                    // Optimize video input image
                    const optimizedVideoInput = await optimizeImage({
                        base64: videoInputImage.base64,
                        mimeType: videoInputImage.mimeType,
                    })

                    if (!optimizedVideoInput) {
                        throw new Error('Failed to optimize video input image')
                    }

                    if (isKlingProvider) {
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
                                duration: '5',
                                modelName: activeProvider?.model || 'kling-v1-6',
                            })
                        }
                    } else {
                        // Use Gemini Service (default)
                        resultUrl = await generateVideoGemini({
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
                                duration: '5',
                                modelName: activeProvider?.model || 'kling-v1-6',
                            })
                        }
                    } else {
                        // Use Gemini Service (default)
                        resultUrl = await generateVideoGemini({
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
                prompt: fullPrompt,
                aspectRatio,
                timestamp: Date.now(),
                mediaType: generationMode,
                avatarInfo: {
                    name: avatarName || 'Unnamed',
                    thumbnailUrl: faceRef?.url || generalReferences[0]?.url,
                },
                fullApiPrompt: apiPrompt,
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
        }
    }, [
        isGenerating,
        isLoadingReferences,
        generationMode,
        videoSubMode,
        generalReferences,
        assetImages,
        sceneImage,
        faceRef,
        bodyRef,
        angleRef,
        videoInputImage,
        aspectRatio,
        cameraShot,
        cameraAngle,
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
        getActiveProvider,
        getFullPrompt,
        addToGallery,
        setAppState,
        setErrorMsg,
        setIsGenerating,
        prepareAvatarPayload,
        optimizeImage,
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
                const description = await describeImageForPrompt({
                    id: crypto.randomUUID(),
                    url: `data:${image.mimeType};base64,${image.base64}`,
                    base64: image.base64,
                    mimeType: image.mimeType,
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
        [setIsDescribingImage, setPromptAndAnalyze]
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
            editAssets?: Array<{ id: string; url: string; base64: string; mimeType: string }>
        ) => {
            setIsGenerating(true)
            setAppState(AppState.GENERATING)

            const targetAspectRatio = editAspectRatio || media.aspectRatio || '1:1'

            // Convert edit assets to the format expected by editImage
            const referenceAssets = editAssets?.map((asset) => ({
                base64: asset.base64,
                mimeType: asset.mimeType,
            }))

            try {
                const resultUrl = await editImage(
                    media.url,
                    editPrompt,
                    maskBase64,
                    targetAspectRatio,
                    referenceAssets
                )

                const newMedia: GeneratedMedia = {
                    id: crypto.randomUUID(),
                    url: resultUrl,
                    prompt: `Edit: ${editPrompt}`,
                    aspectRatio: targetAspectRatio,
                    timestamp: Date.now(),
                    mediaType: 'IMAGE',
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
        [getActiveProvider, addToGallery, setAppState, setErrorMsg, setIsGenerating]
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
        (frameBase64: string, promptSuggestion: string) => {
            const refImg: ReferenceImage = {
                id: `continue-${Date.now()}`,
                url: frameBase64,
                mimeType: 'image/jpeg',
                base64: frameBase64.split(',')[1] || frameBase64,
                type: 'general',
            }
            setVideoInputImage(refImg)
            setGenerationMode('VIDEO')
            setVideoSubMode('ANIMATE')
            setPrompt(promptSuggestion)

            // Mark for auto-generation after state updates
            pendingAutoGenerateRef.current = true
        },
        [setVideoInputImage, setGenerationMode, setVideoSubMode, setPrompt]
    )

    // Auto-generate when videoInputImage changes and pendingAutoGenerate is true
    useEffect(() => {
        if (pendingAutoGenerateRef.current && videoInputImage?.base64) {
            pendingAutoGenerateRef.current = false
            // Small delay to ensure all state updates have propagated
            const timer = setTimeout(() => {
                handleGenerate()
            }, 50)
            return () => clearTimeout(timer)
        }
    }, [videoInputImage, handleGenerate])

    // Re-use Handler - copies prompt and sets image as clone reference
    const handleReuse = useCallback(
        async (media: GeneratedMedia) => {
            // Set the prompt
            setPrompt(media.prompt)

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
                <Notification type="success" title="Re-using Generation">
                    Prompt and clone reference loaded
                </Notification>
            )
        },
        [setPrompt, setCloneImage]
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
                    {/* Provider Badge */}
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
