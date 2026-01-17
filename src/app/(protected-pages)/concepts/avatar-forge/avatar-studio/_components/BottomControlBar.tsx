'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { analyzePoseFromImage, analyzeImageForClone, analyzeImageForPlace } from '@/services/GeminiService'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import Tooltip from '@/components/ui/Tooltip'
import Dropdown from '@/components/ui/Dropdown'
import Checkbox from '@/components/ui/Checkbox'
import {
    HiOutlineUser,
    HiOutlinePencil,
    HiOutlineSparkles,
    HiOutlinePhotograph,
    HiOutlineVideoCamera,
    HiOutlineUpload,
    HiOutlineX,
    HiOutlineCog,
    HiOutlineBookOpen,
    HiOutlineShieldCheck,
    HiOutlineExclamation,
    HiOutlineTrash,
    HiOutlineCheck,
} from 'react-icons/hi'
import { PiLightningFill } from 'react-icons/pi'
import { MODEL_ACTION_PRESETS } from '../_constants/modelActionPresets'
import {
    ASPECT_RATIOS,
    CAMERA_MOTIONS,
    CAMERA_SHOTS,
    SUBJECT_ACTIONS,
    QUICK_STYLES,
    STYLE_CATEGORIES,
} from '../types'
import type { AspectRatio, CameraMotion, CameraShot, SubjectAction, VideoResolution } from '../types'
import PromptTextareaWithTags from './PromptTextareaWithTags'
import KlingVoiceControls from './KlingVoiceControls'
import KlingMotionControlEditor from './KlingMotionControlEditor'
import KlingCameraControls from './KlingCameraControls'
import KlingMotionBrushEditor from './KlingMotionBrushEditor'

// Aspect Ratio Icon Component - renders visual representation of each ratio
const AspectRatioIcon = ({ ratio, isSelected }: { ratio: string; isSelected: boolean }) => {
    const baseClass = `border-2 rounded-sm ${isSelected ? 'border-primary bg-primary/20' : 'border-gray-400 dark:border-gray-500'}`

    switch (ratio) {
        case '1:1':
            return <span className={`${baseClass} w-3.5 h-3.5`} />
        case '16:9':
            return <span className={`${baseClass} w-5 h-3`} />
        case '9:16':
            return <span className={`${baseClass} w-3 h-5`} />
        case '4:3':
            return <span className={`${baseClass} w-4 h-3`} />
        case '3:4':
            return <span className={`${baseClass} w-3 h-4`} />
        default:
            return <span className={`${baseClass} w-3.5 h-3.5`} />
    }
}

const VIDEO_RESOLUTIONS: { value: VideoResolution; label: string }[] = [
    { value: '480p', label: '480p' },
    { value: '720p', label: '720p' },
    { value: '1080p', label: '1080p' },
]

interface BottomControlBarProps {
    onGenerate: () => void
    onChangeAvatar: () => void
    onEditAvatar: () => void
    onEnhancePrompt: () => void
    onDescribeImage: (image: { base64: string; mimeType: string }) => void
    onSafetyCheck: () => void
}

// Dropzone component for image uploads
const ImageDropzone = ({
    image,
    onUpload,
    onRemove,
    label,
    icon,
    accept = 'image/*',
    dragOverClass = 'ring-primary',
}: {
    image: { url: string } | null
    onUpload: (file: File) => void
    onRemove: () => void
    label: string
    icon?: React.ReactNode
    accept?: string
    dragOverClass?: string
}) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const [isDragOver, setIsDragOver] = useState(false)

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)
        const file = e.dataTransfer.files[0]
        if (file && file.type.startsWith('image/')) {
            onUpload(file)
        }
    }, [onUpload])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) onUpload(file)
        e.target.value = ''
    }

    return (
        <div className="flex flex-col items-center gap-0.5">
            {image ? (
                <div className="relative group">
                    <img
                        src={image.url}
                        alt={label}
                        className="w-11 h-11 object-cover rounded-lg cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                        onClick={() => inputRef.current?.click()}
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove() }}
                        className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <HiOutlineX className="w-3 h-3" />
                    </button>
                </div>
            ) : (
                <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`w-11 h-11 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer transition-all ${
                        isDragOver
                            ? `${dragOverClass} bg-primary/5 border-primary`
                            : 'border-gray-300 dark:border-gray-600 hover:border-primary hover:text-primary'
                    }`}
                >
                    {icon || <HiOutlineUpload className="w-4 h-4 text-gray-400" />}
                </div>
            )}
            <span className="text-[9px] text-gray-500 whitespace-nowrap">{label}</span>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={handleChange}
            />
        </div>
    )
}

const BottomControlBar = ({
    onGenerate,
    onChangeAvatar,
    onEditAvatar,
    onEnhancePrompt,
    onDescribeImage,
    onSafetyCheck,
}: BottomControlBarProps) => {
    const videoInputRef = useRef<HTMLInputElement>(null)
    const [hasMounted, setHasMounted] = useState(false)
    const [isDescribing, setIsDescribing] = useState(false)
    const [isAnalyzingPose, setIsAnalyzingPose] = useState(false)
    const [isAnalyzingClone, setIsAnalyzingClone] = useState(false)
    const [isAnalyzingPlace, setIsAnalyzingPlace] = useState(false)
    const [describeInputImage, setDescribeInputImage] = useState<string | null>(null) // URL for visual preview

    // Prevent hydration mismatch with FloatingUI-generated IDs
    useEffect(() => {
        setHasMounted(true)
    }, [])

    const {
        avatarId,
        avatarName,
        generalReferences,
        faceRef,
        prompt,
        setPrompt,
        generationMode,
        setGenerationMode,
        videoSubMode,
        setVideoSubMode,
        aspectRatio,
        setAspectRatio,
        videoResolution,
        setVideoResolution,
        cameraMotion,
        setCameraMotion,
        cameraShot,
        setCameraShot,
        cameraAngle,
        setCameraAngle,
        subjectAction,
        setSubjectAction,
        videoDialogue,
        setVideoDialogue,
        noMusic,
        setNoMusic,
        noBackgroundEffects,
        setNoBackgroundEffects,
        cloneImage,
        setCloneImage,
        cloneDescription,
        setCloneDescription,
        poseImage,
        setPoseImage,
        poseDescription,
        setPoseDescription,
        placeImage,
        setPlaceImage,
        placeDescription,
        setPlaceDescription,
        sceneImage,
        setSceneImage,
        bodyRef,
        setBodyRef,
        videoInputImage,
        setVideoInputImage,
        assetImages,
        addAssetImage,
        removeAssetImage,
        isGenerating,
        isEnhancingPrompt,
        isAnalyzing,
        identityWeight,
        pinnedActionIds,
        safetyAnalysis,
        setSafetyAnalysis,
        setIsPromptLibraryOpen,
        clearDetectedTerms,
        getActiveProvider,
    } = useAvatarStudioStore()

    // Get avatar thumbnail
    const thumbnail = faceRef?.thumbnailUrl || faceRef?.url ||
        generalReferences[0]?.thumbnailUrl || generalReferences[0]?.url

    // Check if current provider is Kling
    const activeProvider = getActiveProvider()
    const isKlingProvider = activeProvider?.type === 'KLING'
    const isKlingV26 = isKlingProvider && activeProvider?.model === 'kling-v2-6'

    // Calculate refs count
    const refsCount = generalReferences.length + (faceRef ? 1 : 0)
    const hasAvatar = avatarId || refsCount > 0

    // Handle quick style click - uses label + description for better prompts
    const handleQuickStyle = (styleValue: string) => {
        const style = QUICK_STYLES.find(s => s.value === styleValue)
        if (style) {
            const styleText = `${style.label} style (${style.description})`
            const newPrompt = prompt ? `${prompt}, ${styleText}` : styleText
            setPrompt(newPrompt)
        }
    }

    // Handle quick action click
    const handleQuickAction = (actionId: string) => {
        const preset = MODEL_ACTION_PRESETS.find((p) => p.id === actionId)
        if (preset) {
            const newPrompt = prompt ? `${prompt}, ${preset.text}` : preset.text
            setPrompt(newPrompt)
        }
    }

    // Process image file to base64
    const processFileToBase64 = (file: File): Promise<{ base64: string; mimeType: string; url: string }> => {
        return new Promise((resolve) => {
            const reader = new FileReader()
            reader.onload = (e) => {
                const result = e.target?.result as string
                const matches = result.match(/^data:(.+);base64,(.+)$/)
                if (matches) {
                    resolve({ base64: matches[2], mimeType: matches[1], url: result })
                }
            }
            reader.readAsDataURL(file)
        })
    }

    // Handle image-to-prompt upload
    const handleImageToPrompt = async (file: File) => {
        // Show image preview immediately using object URL
        const previewUrl = URL.createObjectURL(file)
        setDescribeInputImage(previewUrl)
        setIsDescribing(true)

        try {
            const { base64, mimeType } = await processFileToBase64(file)
            await onDescribeImage({ base64, mimeType })
        } catch (error) {
            console.error('Failed to describe image:', error)
        } finally {
            setIsDescribing(false)
            // Image stays visible until user removes it manually
        }
    }

    // Handle clone reference upload - analyzes image and extracts everything except face/body type
    const handleCloneRefUpload = async (file: File) => {
        const { base64, mimeType, url } = await processFileToBase64(file)

        // Save image for visual reference
        setCloneImage({
            id: crypto.randomUUID(),
            url,
            mimeType,
            base64,
            type: 'general',
        })

        // Analyze image and extract clone description
        setIsAnalyzingClone(true)
        try {
            const description = await analyzeImageForClone({ base64, mimeType })
            setCloneDescription(description)

            // Add clone description to prompt so user can edit it
            if (description) {
                const currentPrompt = useAvatarStudioStore.getState().prompt
                const cloneText = `[CLONE: ${description}]`
                setPrompt(currentPrompt ? `${currentPrompt} ${cloneText}` : cloneText)
            }
        } catch (error) {
            console.error('Failed to analyze clone image:', error)
            setCloneDescription('')
        } finally {
            setIsAnalyzingClone(false)
        }
    }

    // Handle pose reference upload - analyzes image and extracts pose description
    const handlePoseRefUpload = async (file: File) => {
        const { base64, mimeType, url } = await processFileToBase64(file)

        // Save image for visual reference
        setPoseImage({
            id: crypto.randomUUID(),
            url,
            mimeType,
            base64,
            type: 'pose',
        })

        // Analyze pose from image and extract text description
        setIsAnalyzingPose(true)
        try {
            const description = await analyzePoseFromImage({ base64, mimeType })
            setPoseDescription(description)

            // Add pose description to prompt so user can edit it
            // Use getState() to get current prompt value (avoids stale closure)
            if (description) {
                const currentPrompt = useAvatarStudioStore.getState().prompt
                const poseText = `[POSE: ${description}]`
                setPrompt(currentPrompt ? `${currentPrompt} ${poseText}` : poseText)
            }
        } catch (error) {
            console.error('Failed to analyze pose:', error)
            // Keep the image but without description
            setPoseDescription('')
        } finally {
            setIsAnalyzingPose(false)
        }
    }

    // Handle place reference upload - analyzes image and extracts location/scene description
    const handlePlaceRefUpload = async (file: File) => {
        const { base64, mimeType, url } = await processFileToBase64(file)

        // Save image for visual reference
        setPlaceImage({
            id: crypto.randomUUID(),
            url,
            mimeType,
            base64,
            type: 'general',
        })

        // Analyze place from image and extract text description
        setIsAnalyzingPlace(true)
        try {
            const description = await analyzeImageForPlace({ base64, mimeType })
            setPlaceDescription(description)

            // Add place description to prompt so user can edit it
            if (description) {
                const currentPrompt = useAvatarStudioStore.getState().prompt
                const placeText = `[PLACE: ${description}]`
                setPrompt(currentPrompt ? `${currentPrompt} ${placeText}` : placeText)
            }
        } catch (error) {
            console.error('Failed to analyze place:', error)
            setPlaceDescription('')
        } finally {
            setIsAnalyzingPlace(false)
        }
    }

    // Handle scene composite upload - image is used directly for compositing (no analysis)
    const handleSceneUpload = async (file: File) => {
        const { base64, mimeType, url } = await processFileToBase64(file)
        setSceneImage({
            id: crypto.randomUUID(),
            url,
            mimeType,
            base64,
            type: 'general',
        })
    }

    // Handle body reference upload
    const handleBodyRefUpload = async (file: File) => {
        const { base64, mimeType, url } = await processFileToBase64(file)
        setBodyRef({
            id: crypto.randomUUID(),
            url,
            mimeType,
            base64,
            type: 'body',
        })
    }

    // Handle asset upload
    const handleAssetUpload = async (file: File) => {
        const { base64, mimeType, url } = await processFileToBase64(file)
        addAssetImage({
            id: crypto.randomUUID(),
            url,
            mimeType,
            base64,
            type: 'general',
        })
    }

    // Video input image upload
    const handleVideoInputUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files
        if (!files || files.length === 0) return
        const file = files[0]
        const reader = new FileReader()
        reader.onload = (e) => {
            const result = e.target?.result as string
            const matches = result.match(/^data:(.+);base64,(.+)$/)
            if (matches) {
                setVideoInputImage({
                    id: crypto.randomUUID(),
                    url: result,
                    mimeType: matches[1],
                    base64: matches[2],
                    type: 'general',
                })
            }
        }
        reader.readAsDataURL(file)
        event.target.value = ''
    }

    const canGenerate = () => {
        if (!prompt.trim()) return false
        if (generationMode === 'VIDEO' && videoSubMode === 'ANIMATE' && !videoInputImage) {
            return false
        }
        return true
    }

    return (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pb-6">
            {/* Row 1: Avatar + Prompt + Dropzones + Generate */}
            <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                {/* Avatar Section */}
                <div className="flex items-center gap-2 shrink-0">
                    {hasAvatar ? (
                        <div className="flex items-center gap-2">
                            <div
                                className="w-11 h-11 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                onClick={onChangeAvatar}
                            >
                                {thumbnail ? (
                                    <img src={thumbnail} alt={avatarName || 'Avatar'} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <HiOutlineUser className="w-5 h-5 text-gray-400" />
                                    </div>
                                )}
                            </div>
                            <div className="hidden sm:block">
                                <p className="text-xs font-medium truncate max-w-[80px]">{avatarName || 'Avatar'}</p>
                                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                    <span>{refsCount} refs</span>
                                    <span className="text-primary">{identityWeight}%</span>
                                </div>
                                <button
                                    onClick={onEditAvatar}
                                    className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                                >
                                    <HiOutlinePencil className="w-2.5 h-2.5" />
                                    Edit
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={onChangeAvatar}
                            className="w-11 h-11 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center hover:border-primary hover:text-primary transition-colors"
                        >
                            <HiOutlineUser className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Mode Toggle */}
                <div className="flex flex-col bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 shrink-0">
                    <button
                        onClick={() => setGenerationMode('IMAGE')}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md flex items-center gap-1 transition-colors ${
                            generationMode === 'IMAGE'
                                ? 'bg-white dark:bg-gray-600 text-primary shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <HiOutlinePhotograph className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Image</span>
                    </button>
                    <button
                        onClick={() => setGenerationMode('VIDEO')}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md flex items-center gap-1 transition-colors ${
                            generationMode === 'VIDEO'
                                ? 'bg-white dark:bg-gray-600 text-purple-500 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <HiOutlineVideoCamera className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Video</span>
                    </button>
                </div>

                {/* Prompt Input with Integrated Tags */}
                <div className="flex-1">
                    <PromptTextareaWithTags
                        value={prompt}
                        onChange={setPrompt}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && canGenerate()) {
                                e.preventDefault()
                                onGenerate()
                            }
                        }}
                        placeholder={generationMode === 'VIDEO' ? 'Describe the scene and action...' : 'Describe the image you want to generate...'}
                        rows={6}
                        rightContent={
                            <div className="grid grid-cols-2 gap-1">
                                <Tooltip title="Prompt Library">
                                    <button
                                        onClick={() => setIsPromptLibraryOpen(true)}
                                        className="p-1.5 text-gray-400 hover:text-primary transition-colors border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                    >
                                        <HiOutlineBookOpen className="w-4 h-4" />
                                    </button>
                                </Tooltip>
                                <Tooltip title="Check prompt safety">
                                    <button
                                        onClick={onSafetyCheck}
                                        disabled={!prompt.trim() || isAnalyzing}
                                        className={`p-1.5 transition-colors disabled:opacity-50 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 ${
                                            safetyAnalysis && !safetyAnalysis.isSafe
                                                ? 'text-amber-500'
                                                : 'text-gray-400 hover:text-green-500'
                                        }`}
                                    >
                                        {isAnalyzing ? (
                                            <Spinner size={16} />
                                        ) : safetyAnalysis && !safetyAnalysis.isSafe ? (
                                            <HiOutlineExclamation className="w-4 h-4" />
                                        ) : (
                                            <HiOutlineShieldCheck className="w-4 h-4" />
                                        )}
                                    </button>
                                </Tooltip>
                                <Tooltip title="Enhance prompt with AI">
                                    <button
                                        onClick={onEnhancePrompt}
                                        disabled={!prompt.trim() || isEnhancingPrompt}
                                        className="p-1.5 text-gray-400 hover:text-primary transition-colors disabled:opacity-50 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                    >
                                        {isEnhancingPrompt ? (
                                            <Spinner size={16} />
                                        ) : (
                                            <HiOutlineSparkles className="w-4 h-4" />
                                        )}
                                    </button>
                                </Tooltip>
                                <Tooltip title="Clear prompt">
                                    <button
                                        onClick={() => {
                                            setPrompt('')
                                            clearDetectedTerms()
                                            setSafetyAnalysis(null)
                                        }}
                                        disabled={!prompt.trim()}
                                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                    >
                                        <HiOutlineTrash className="w-4 h-4" />
                                    </button>
                                </Tooltip>
                            </div>
                        }
                    />
                </div>

                {/* Dropzones - Tools Grid 2x3 */}
                <div className="grid grid-cols-3 gap-1.5 shrink-0">
                    {/* Image to Prompt Dropzone */}
                    <div className="flex flex-col items-center gap-0.5">
                        {describeInputImage ? (
                            <div className="relative group">
                                <img
                                    src={describeInputImage}
                                    alt="Analyzing"
                                    className={`w-11 h-11 object-cover rounded-lg ${isDescribing ? 'opacity-50' : ''}`}
                                />
                                {/* Loading overlay */}
                                {isDescribing && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                                        <Spinner size={16} />
                                    </div>
                                )}
                                {/* Success indicator */}
                                {!isDescribing && (
                                    <div className="absolute -bottom-1 -right-1 p-0.5 bg-green-500 text-white rounded-full">
                                        <HiOutlineCheck className="w-2.5 h-2.5" />
                                    </div>
                                )}
                                <button
                                    onClick={() => setDescribeInputImage(null)}
                                    className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <HiOutlineX className="w-3 h-3" />
                                </button>
                            </div>
                        ) : (
                            <ImageDropzone
                                image={null}
                                onUpload={handleImageToPrompt}
                                onRemove={() => {}}
                                label="Img→Prompt"
                                icon={<HiOutlinePhotograph className="w-4 h-4 text-blue-500" />}
                                dragOverClass="ring-blue-500"
                            />
                        )}
                        {describeInputImage && <span className="text-[9px] text-gray-500">{isDescribing ? 'Analyzing...' : 'Done!'}</span>}
                    </div>

                    {/* Clone Reference Dropzone (IMAGE mode only) */}
                    {generationMode === 'IMAGE' && (
                        <div className="flex flex-col items-center gap-0.5">
                            {cloneImage ? (
                                <Tooltip
                                    title={cloneDescription ? cloneDescription.slice(0, 200) + '...' : 'Analyzing...'}
                                    placement="top"
                                >
                                    <div className="relative group">
                                        <img
                                            src={cloneImage.url}
                                            alt="Clone"
                                            className={`w-11 h-11 object-cover rounded-lg ${isAnalyzingClone ? 'opacity-50' : ''}`}
                                        />
                                        {/* Loading overlay */}
                                        {isAnalyzingClone && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                                                <Spinner size={16} />
                                            </div>
                                        )}
                                        {/* Success indicator */}
                                        {!isAnalyzingClone && cloneDescription && (
                                            <div className="absolute -bottom-1 -right-1 p-0.5 bg-green-500 text-white rounded-full">
                                                <HiOutlineCheck className="w-2.5 h-2.5" />
                                            </div>
                                        )}
                                        <button
                                            onClick={() => setCloneImage(null)}
                                            className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <HiOutlineX className="w-3 h-3" />
                                        </button>
                                    </div>
                                </Tooltip>
                            ) : (
                                <ImageDropzone
                                    image={null}
                                    onUpload={handleCloneRefUpload}
                                    onRemove={() => {}}
                                    label="Clone Ref"
                                    icon={<HiOutlinePhotograph className="w-4 h-4 text-purple-500" />}
                                    dragOverClass="ring-purple-500"
                                />
                            )}
                            {cloneImage && <span className="text-[9px] text-gray-500">{isAnalyzingClone ? 'Analyzing...' : 'Clone Ref'}</span>}
                        </div>
                    )}

                    {/* Pose Reference Dropzone (IMAGE mode only) */}
                    {generationMode === 'IMAGE' && (
                        <div className="flex flex-col items-center gap-0.5">
                            {poseImage ? (
                                <Tooltip
                                    title={poseDescription || 'Analyzing pose...'}
                                    placement="top"
                                >
                                    <div className="relative group">
                                        <img
                                            src={poseImage.url}
                                            alt="Pose"
                                            className={`w-11 h-11 object-cover rounded-lg ${isAnalyzingPose ? 'opacity-50' : ''}`}
                                        />
                                        {/* Loading overlay */}
                                        {isAnalyzingPose && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                                                <Spinner size={16} />
                                            </div>
                                        )}
                                        {/* Success indicator */}
                                        {!isAnalyzingPose && poseDescription && (
                                            <div className="absolute -bottom-1 -right-1 p-0.5 bg-green-500 text-white rounded-full">
                                                <HiOutlineCheck className="w-2.5 h-2.5" />
                                            </div>
                                        )}
                                        <button
                                            onClick={() => setPoseImage(null)}
                                            className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <HiOutlineX className="w-3 h-3" />
                                        </button>
                                    </div>
                                </Tooltip>
                            ) : (
                                <ImageDropzone
                                    image={null}
                                    onUpload={handlePoseRefUpload}
                                    onRemove={() => {}}
                                    label="Pose Ref"
                                    icon={<HiOutlineUser className="w-4 h-4 text-cyan-500" />}
                                    dragOverClass="ring-cyan-500"
                                />
                            )}
                            {poseImage && <span className="text-[9px] text-gray-500">{isAnalyzingPose ? 'Analyzing...' : 'Pose Ref'}</span>}
                        </div>
                    )}

                    {/* Body Reference Dropzone (IMAGE mode only) */}
                    {generationMode === 'IMAGE' && (
                        <div className="flex flex-col items-center gap-0.5">
                            {bodyRef ? (
                                <div className="relative group">
                                    <img
                                        src={bodyRef.url}
                                        alt="Body"
                                        className="w-11 h-11 object-cover rounded-lg"
                                    />
                                    <button
                                        onClick={() => setBodyRef(null)}
                                        className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <HiOutlineX className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <ImageDropzone
                                    image={null}
                                    onUpload={handleBodyRefUpload}
                                    onRemove={() => {}}
                                    label="Body Ref"
                                    icon={<HiOutlineUser className="w-4 h-4 text-orange-500" />}
                                    dragOverClass="ring-orange-500"
                                />
                            )}
                            {bodyRef && <span className="text-[9px] text-gray-500">Body Ref</span>}
                        </div>
                    )}

                    {/* Assets Dropzone (IMAGE mode only) - max 3 */}
                    {generationMode === 'IMAGE' && (
                        <div className="flex flex-col items-center gap-0.5">
                            {assetImages.length > 0 ? (
                                <Tooltip title={`${assetImages.length}/3 assets - Drag or click to add more`} placement="top">
                                    <div
                                        className="relative group cursor-pointer"
                                        onClick={() => assetImages.length < 3 && document.getElementById('asset-input')?.click()}
                                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                                        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation() }}
                                        onDrop={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            if (assetImages.length >= 3) return
                                            const file = e.dataTransfer.files[0]
                                            if (file && file.type.startsWith('image/')) {
                                                handleAssetUpload(file)
                                            }
                                        }}
                                    >
                                        {assetImages.length === 1 ? (
                                            <img
                                                src={assetImages[0].url}
                                                alt="Asset"
                                                className="w-11 h-11 rounded-lg object-cover"
                                            />
                                        ) : (
                                            <div className="w-11 h-11 relative">
                                                {assetImages.slice(0, 2).map((asset, i) => (
                                                    <img
                                                        key={asset.id}
                                                        src={asset.url}
                                                        alt="Asset"
                                                        className="w-8 h-8 rounded-lg object-cover border-2 border-white dark:border-gray-800 absolute"
                                                        style={{
                                                            zIndex: 2 - i,
                                                            top: i * 6,
                                                            left: i * 6,
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {/* Counter badge */}
                                        <span className="absolute -bottom-1 -right-1 text-[8px] bg-green-600 text-white px-1 rounded font-medium">
                                            {assetImages.length}/3
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); assetImages.forEach(a => removeAssetImage(a.id)) }}
                                            className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <HiOutlineX className="w-2.5 h-2.5" />
                                        </button>
                                    </div>
                                </Tooltip>
                            ) : (
                                <ImageDropzone
                                    image={null}
                                    onUpload={handleAssetUpload}
                                    onRemove={() => {}}
                                    label="Assets"
                                    icon={<HiOutlineUpload className="w-4 h-4 text-green-500" />}
                                    dragOverClass="ring-green-500"
                                />
                            )}
                            <input
                                id="asset-input"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file) handleAssetUpload(file)
                                    e.target.value = ''
                                }}
                            />
                            {assetImages.length > 0 && <span className="text-[9px] text-gray-500">Assets</span>}
                        </div>
                    )}

                    {/* Place Reference Dropzone (IMAGE mode only) */}
                    {generationMode === 'IMAGE' && (
                        <div className="flex flex-col items-center gap-0.5">
                            {placeImage ? (
                                <Tooltip
                                    title={placeDescription || 'Analyzing place...'}
                                    placement="top"
                                >
                                    <div className="relative group">
                                        <img
                                            src={placeImage.url}
                                            alt="Place"
                                            className={`w-11 h-11 object-cover rounded-lg ${isAnalyzingPlace ? 'opacity-50' : ''}`}
                                        />
                                        {/* Loading overlay */}
                                        {isAnalyzingPlace && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                                                <Spinner size={16} />
                                            </div>
                                        )}
                                        {/* Success indicator */}
                                        {!isAnalyzingPlace && placeDescription && (
                                            <div className="absolute -bottom-1 -right-1 p-0.5 bg-green-500 text-white rounded-full">
                                                <HiOutlineCheck className="w-2.5 h-2.5" />
                                            </div>
                                        )}
                                        <button
                                            onClick={() => setPlaceImage(null)}
                                            className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <HiOutlineX className="w-3 h-3" />
                                        </button>
                                    </div>
                                </Tooltip>
                            ) : (
                                <ImageDropzone
                                    image={null}
                                    onUpload={handlePlaceRefUpload}
                                    onRemove={() => {}}
                                    label="Place Ref"
                                    icon={<HiOutlinePhotograph className="w-4 h-4 text-teal-500" />}
                                    dragOverClass="ring-teal-500"
                                />
                            )}
                            {placeImage && <span className="text-[9px] text-gray-500">{isAnalyzingPlace ? 'Analyzing...' : 'Place Ref'}</span>}
                        </div>
                    )}

                    {/* Scene Composite Dropzone (IMAGE mode only) - literally places avatar in this scene */}
                    {generationMode === 'IMAGE' && (
                        <div className="flex flex-col items-center gap-0.5">
                            {sceneImage ? (
                                <Tooltip
                                    title="Avatar will be composited into this scene"
                                    placement="top"
                                >
                                    <div className="relative group">
                                        <img
                                            src={sceneImage.url}
                                            alt="Scene"
                                            className="w-11 h-11 object-cover rounded-lg ring-2 ring-rose-500"
                                        />
                                        <button
                                            onClick={() => setSceneImage(null)}
                                            className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <HiOutlineX className="w-3 h-3" />
                                        </button>
                                    </div>
                                </Tooltip>
                            ) : (
                                <ImageDropzone
                                    image={null}
                                    onUpload={handleSceneUpload}
                                    onRemove={() => {}}
                                    label="Scene"
                                    icon={<HiOutlinePhotograph className="w-4 h-4 text-rose-500" />}
                                    dragOverClass="ring-rose-500"
                                />
                            )}
                            {sceneImage && <span className="text-[9px] text-rose-500 font-medium">Scene</span>}
                        </div>
                    )}

                    {/* Video Input Image (VIDEO ANIMATE mode) */}
                    {generationMode === 'VIDEO' && videoSubMode === 'ANIMATE' && (
                        <div className="flex flex-col items-center gap-0.5">
                            {videoInputImage ? (
                                <div className="relative group">
                                    <img
                                        src={videoInputImage.url}
                                        alt="Input"
                                        className="w-11 h-11 rounded-lg object-cover ring-2 ring-purple-500"
                                    />
                                    <button
                                        onClick={() => setVideoInputImage(null)}
                                        className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <HiOutlineX className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => videoInputRef.current?.click()}
                                    className="w-11 h-11 border-2 border-dashed border-purple-400 rounded-lg flex items-center justify-center cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"
                                >
                                    <HiOutlineVideoCamera className="w-4 h-4 text-purple-500" />
                                </div>
                            )}
                            <span className="text-[9px] text-purple-500 font-medium">Input*</span>
                            <input
                                ref={videoInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleVideoInputUpload}
                            />
                        </div>
                    )}
                </div>

                {/* Generate Button */}
                <Button
                    variant="solid"
                    color={generationMode === 'VIDEO' ? 'purple' : 'blue'}
                    onClick={onGenerate}
                    loading={isGenerating}
                    disabled={!canGenerate()}
                    className="shrink-0 h-11"
                >
                    {isGenerating ? 'Generating...' : 'Generate'}
                </Button>
            </div>

            {/* Row 2: Contextual Controls - Only render after mount to prevent hydration mismatch */}
            {hasMounted && (
            <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto">
                {/* Aspect Ratio */}
                <Dropdown
                    placement="top-start"
                    renderTitle={
                        <button className="px-2.5 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 border border-gray-200 dark:border-gray-600">
                            <AspectRatioIcon ratio={aspectRatio} isSelected={true} />
                            <span className="font-medium">
                                {ASPECT_RATIOS.find(r => r.value === aspectRatio)?.label || aspectRatio}
                            </span>
                        </button>
                    }
                >
                    {ASPECT_RATIOS.map((r) => (
                        <Dropdown.Item
                            key={r.value}
                            eventKey={r.value}
                            onClick={() => setAspectRatio(r.value as AspectRatio)}
                            className="flex items-center gap-2.5"
                        >
                            <AspectRatioIcon ratio={r.value} isSelected={aspectRatio === r.value} />
                            <span className={aspectRatio === r.value ? 'text-primary font-medium' : ''}>
                                {r.label}
                            </span>
                        </Dropdown.Item>
                    ))}
                </Dropdown>

                {/* Framing (IMAGE mode only) */}
                {generationMode === 'IMAGE' && (
                    <Dropdown
                        placement="top-start"
                        renderTitle={
                            <button className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1">
                                <span className="text-gray-500">Framing:</span>
                                <span>{CAMERA_SHOTS.find(s => s.value === cameraShot)?.label || 'Auto'}</span>
                            </button>
                        }
                    >
                        {CAMERA_SHOTS.filter(s => s.category === 'framing').map((shot) => (
                            <Dropdown.Item
                                key={shot.value}
                                eventKey={shot.value}
                                onClick={() => setCameraShot(shot.value as CameraShot)}
                                className={`flex flex-col items-start ${cameraShot === shot.value ? 'bg-primary/10' : ''}`}
                            >
                                <span className={cameraShot === shot.value ? 'text-primary font-medium' : ''}>
                                    {shot.label}
                                </span>
                                <span className="text-[10px] text-gray-400">{shot.description}</span>
                            </Dropdown.Item>
                        ))}
                    </Dropdown>
                )}

                {/* Camera Angle (IMAGE mode only) */}
                {generationMode === 'IMAGE' && (
                    <Dropdown
                        placement="top-start"
                        renderTitle={
                            <button className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1">
                                <span className="text-gray-500">Angle:</span>
                                <span>{cameraAngle ? CAMERA_SHOTS.find(s => s.value === cameraAngle)?.label : 'Auto'}</span>
                            </button>
                        }
                    >
                        <Dropdown.Item
                            eventKey="auto"
                            onClick={() => setCameraAngle(null)}
                            className={`flex flex-col items-start ${cameraAngle === null ? 'bg-primary/10' : ''}`}
                        >
                            <span className={cameraAngle === null ? 'text-primary font-medium' : ''}>
                                Auto
                            </span>
                            <span className="text-[10px] text-gray-400">AI decides best angle</span>
                        </Dropdown.Item>
                        {CAMERA_SHOTS.filter(s => s.category === 'angle').map((shot) => (
                            <Dropdown.Item
                                key={shot.value}
                                eventKey={shot.value}
                                onClick={() => setCameraAngle(shot.value as CameraShot)}
                                className={`flex flex-col items-start ${cameraAngle === shot.value ? 'bg-primary/10' : ''}`}
                            >
                                <span className={cameraAngle === shot.value ? 'text-primary font-medium' : ''}>
                                    {shot.label}
                                </span>
                                <span className="text-[10px] text-gray-400">{shot.description}</span>
                            </Dropdown.Item>
                        ))}
                    </Dropdown>
                )}

                {/* VIDEO MODE CONTROLS */}
                {generationMode === 'VIDEO' && (
                    <>
                        {/* Video Sub-Mode */}
                        <div className="flex bg-gray-100 dark:bg-gray-700 rounded p-0.5">
                            <button
                                onClick={() => setVideoSubMode('ANIMATE')}
                                className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                                    videoSubMode === 'ANIMATE'
                                        ? 'bg-purple-500 text-white'
                                        : 'text-gray-500'
                                }`}
                            >
                                Animate
                            </button>
                            <button
                                onClick={() => setVideoSubMode('AVATAR')}
                                className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                                    videoSubMode === 'AVATAR'
                                        ? 'bg-purple-500 text-white'
                                        : 'text-gray-500'
                                }`}
                            >
                                Avatar
                            </button>
                        </div>

                        {/* Resolution */}
                        <Dropdown
                            placement="top-start"
                            renderTitle={
                                <button className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                    {videoResolution}
                                </button>
                            }
                        >
                            {VIDEO_RESOLUTIONS.map((r) => (
                                <Dropdown.Item
                                    key={r.value}
                                    eventKey={r.value}
                                    onClick={() => setVideoResolution(r.value)}
                                    className={videoResolution === r.value ? 'bg-primary/10 text-primary' : ''}
                                >
                                    {r.label}
                                </Dropdown.Item>
                            ))}
                        </Dropdown>

                        {/* Camera Motion */}
                        <Dropdown
                            placement="top-start"
                            renderTitle={
                                <button className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1">
                                    <span className="text-gray-500">Cam:</span>
                                    <span>{cameraMotion || 'None'}</span>
                                </button>
                            }
                        >
                            {CAMERA_MOTIONS.map((m) => (
                                <Dropdown.Item
                                    key={m.value}
                                    eventKey={m.value}
                                    onClick={() => setCameraMotion(m.value as CameraMotion)}
                                    className={cameraMotion === m.value ? 'bg-primary/10 text-primary' : ''}
                                >
                                    {m.label}
                                </Dropdown.Item>
                            ))}
                        </Dropdown>

                        {/* Subject Action */}
                        <Dropdown
                            placement="top-start"
                            renderTitle={
                                <button className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1">
                                    <span className="text-gray-500">Action:</span>
                                    <span>{subjectAction || 'None'}</span>
                                </button>
                            }
                        >
                            {SUBJECT_ACTIONS.map((a) => (
                                <Dropdown.Item
                                    key={a.value}
                                    eventKey={a.value}
                                    onClick={() => setSubjectAction(a.value as SubjectAction)}
                                    className={subjectAction === a.value ? 'bg-primary/10 text-primary' : ''}
                                >
                                    {a.label}
                                </Dropdown.Item>
                            ))}
                        </Dropdown>

                        {/* More Video Options */}
                        <Dropdown
                            placement="top-start"
                            renderTitle={
                                <button className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1">
                                    <HiOutlineCog className="w-3 h-3" />
                                    <span>More</span>
                                </button>
                            }
                        >
                            <div className="p-3 min-w-[200px]">
                                <div className="mb-3">
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Dialogue</label>
                                    <input
                                        type="text"
                                        value={videoDialogue}
                                        onChange={(e) => setVideoDialogue(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        placeholder="What should they say?"
                                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-gray-800"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Checkbox
                                        checked={noMusic}
                                        onChange={(val) => setNoMusic(val)}
                                    >
                                        <span className="text-xs">No background music</span>
                                    </Checkbox>
                                    <Checkbox
                                        checked={noBackgroundEffects}
                                        onChange={(val) => setNoBackgroundEffects(val)}
                                    >
                                        <span className="text-xs">No background effects</span>
                                    </Checkbox>
                                </div>
                            </div>
                        </Dropdown>

                        {/* Kling AI Controls - Only show when Kling provider is active */}
                        {isKlingProvider && (
                            <Dropdown
                                placement="top-start"
                                renderTitle={
                                    <button className="px-2 py-1 text-xs bg-gradient-to-r from-cyan-600 to-purple-600 text-white rounded hover:from-cyan-500 hover:to-purple-500 transition-colors flex items-center gap-1">
                                        <span className="font-medium">Kling AI</span>
                                        {isKlingV26 && (
                                            <span className="text-[8px] bg-white/20 px-1 rounded">v2.6</span>
                                        )}
                                    </button>
                                }
                            >
                                <div className="p-3 min-w-[320px] max-h-[400px] overflow-y-auto">
                                    {/* Voice Controls - Only for v2.6+ */}
                                    {isKlingV26 && (
                                        <div className="mb-3">
                                            <KlingVoiceControls disabled={isGenerating} />
                                        </div>
                                    )}

                                    {/* Motion Control - Only for v2.6+ */}
                                    {isKlingV26 && (
                                        <div className="mb-3">
                                            <KlingMotionControlEditor disabled={isGenerating} />
                                        </div>
                                    )}

                                    {/* Camera Controls - Available for all Kling versions */}
                                    <div className="mb-3">
                                        <KlingCameraControls disabled={isGenerating} />
                                    </div>

                                    {/* Motion Brush - Available for v1.6+ */}
                                    {(activeProvider?.model === 'kling-v1-6' || isKlingV26) && (
                                        <div>
                                            <KlingMotionBrushEditor disabled={isGenerating} />
                                        </div>
                                    )}
                                </div>
                            </Dropdown>
                        )}
                    </>
                )}

                {/* Safety Analysis - Individual Term Buttons */}
                {safetyAnalysis && !safetyAnalysis.isSafe && (
                    <>
                        {safetyAnalysis.corrections.map((correction, idx) => (
                            <Dropdown
                                key={idx}
                                placement="top-start"
                                renderTitle={
                                    <button className="px-2 py-1 text-[10px] bg-amber-600/80 hover:bg-amber-600 text-white font-medium rounded-full flex items-center gap-1 transition-colors">
                                        <HiOutlineExclamation className="w-3 h-3" />
                                        {correction.term}
                                    </button>
                                }
                            >
                                <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase">
                                    Replace with:
                                </div>
                                {(correction.alternatives || []).map((alt, i) => (
                                    <Dropdown.Item
                                        key={i}
                                        eventKey={alt}
                                        onClick={() => {
                                            setPrompt(
                                                prompt.replace(
                                                    new RegExp(correction.term, 'gi'),
                                                    alt
                                                )
                                            )
                                            const remaining = safetyAnalysis.corrections.filter(
                                                (c) => c.term !== correction.term
                                            )
                                            if (remaining.length === 0) {
                                                setSafetyAnalysis(null)
                                            } else {
                                                setSafetyAnalysis({
                                                    ...safetyAnalysis,
                                                    corrections: remaining,
                                                })
                                            }
                                        }}
                                    >
                                        {alt}
                                    </Dropdown.Item>
                                ))}
                                {(!correction.alternatives || correction.alternatives.length === 0) && (
                                    <Dropdown.Item
                                        eventKey="remove"
                                        onClick={() => {
                                            setPrompt(prompt.replace(new RegExp(correction.term, 'gi'), ''))
                                            const remaining = safetyAnalysis.corrections.filter(
                                                (c) => c.term !== correction.term
                                            )
                                            if (remaining.length === 0) {
                                                setSafetyAnalysis(null)
                                            } else {
                                                setSafetyAnalysis({
                                                    ...safetyAnalysis,
                                                    corrections: remaining,
                                                })
                                            }
                                        }}
                                    >
                                        <span className="text-red-500">Remove term</span>
                                    </Dropdown.Item>
                                )}
                            </Dropdown>
                        ))}
                        {/* Use Safe Version Button - uses AI-rewritten prompt */}
                        {safetyAnalysis.optimizedPrompt && safetyAnalysis.optimizedPrompt !== prompt && (
                            <button
                                onClick={() => {
                                    setPrompt(safetyAnalysis.optimizedPrompt)
                                    setSafetyAnalysis(null)
                                }}
                                className="px-2 py-1 text-[10px] bg-green-600 text-white font-medium rounded hover:bg-green-700 transition-colors"
                            >
                                Use Safe Version
                            </button>
                        )}
                        {/* Auto-Fix All Button */}
                        <button
                            onClick={() => {
                                let newPrompt = prompt
                                safetyAnalysis.corrections.forEach((c) => {
                                    if (c.alternatives && c.alternatives.length > 0) {
                                        newPrompt = newPrompt.replace(
                                            new RegExp(c.term, 'gi'),
                                            c.alternatives[0]
                                        )
                                    } else {
                                        // Remove the term if no alternatives
                                        newPrompt = newPrompt.replace(new RegExp(c.term, 'gi'), '')
                                    }
                                })
                                // Clean up double spaces
                                newPrompt = newPrompt.replace(/\s+/g, ' ').trim()
                                setPrompt(newPrompt)
                                setSafetyAnalysis(null)
                            }}
                            className="px-2 py-1 text-[10px] bg-amber-600 text-white font-medium rounded hover:bg-amber-700 transition-colors"
                        >
                            Auto-Fix All
                        </button>
                    </>
                )}

                {/* Divider */}
                <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 shrink-0" />

                {/* Pinned Quick Actions */}
                {pinnedActionIds.length > 0 && (
                    <div className="flex items-center gap-1 shrink-0">
                        <PiLightningFill className="w-3 h-3 text-amber-500" />
                        {pinnedActionIds.slice(0, 3).map((actionId) => {
                            const preset = MODEL_ACTION_PRESETS.find((p) => p.id === actionId)
                            if (!preset) return null
                            return (
                                <button
                                    key={actionId}
                                    onClick={() => handleQuickAction(actionId)}
                                    className="px-2 py-0.5 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-colors whitespace-nowrap"
                                >
                                    {preset.name}
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* Style Category Dropdowns - Individual buttons for each category */}
                {STYLE_CATEGORIES.map((category) => (
                    <Dropdown
                        key={category.value}
                        placement="top-start"
                        renderTitle={
                            <button className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1">
                                <HiOutlineSparkles className={`w-3 h-3 ${
                                    category.value === 'lighting' ? 'text-yellow-500' :
                                    category.value === 'mood' ? 'text-purple-500' :
                                    category.value === 'film' ? 'text-amber-500' :
                                    category.value === 'quality' ? 'text-blue-500' :
                                    category.value === 'art' ? 'text-pink-500' :
                                    category.value === 'makeup' ? 'text-rose-500' :
                                    'text-green-500'
                                }`} />
                                <span>{category.label}</span>
                            </button>
                        }
                    >
                        <div className="max-h-80 overflow-y-auto">
                            {QUICK_STYLES.filter(s => s.category === category.value).map((style) => (
                                <Dropdown.Item
                                    key={style.value}
                                    eventKey={style.value}
                                    onClick={() => handleQuickStyle(style.value)}
                                    className="flex flex-col items-start"
                                >
                                    <span className="font-medium">{style.label}</span>
                                    <span className="text-[10px] text-gray-400">{style.description}</span>
                                </Dropdown.Item>
                            ))}
                        </div>
                    </Dropdown>
                ))}
            </div>
            )}
        </div>
    )
}

export default BottomControlBar
