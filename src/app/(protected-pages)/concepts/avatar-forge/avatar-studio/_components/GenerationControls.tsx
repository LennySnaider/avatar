'use client'

import { useRef } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import Card from '@/components/ui/Card'
import Tooltip from '@/components/ui/Tooltip'
import Dropdown from '@/components/ui/Dropdown'
import {
    ASPECT_RATIOS,
    CAMERA_MOTIONS,
    SUBJECT_ACTIONS,
    QUICK_STYLES,
    STYLE_CATEGORIES,
} from '../types'
import type { AspectRatio, CameraMotion, SubjectAction, VideoResolution } from '../types'
import {
    HiOutlinePhotograph,
    HiOutlineVideoCamera,
    HiOutlineUpload,
    HiOutlineX,
    HiOutlineSparkles,
    HiOutlineCamera,
    HiOutlineBookmarkAlt,
    HiOutlineExclamation,
} from 'react-icons/hi'
import { PiLightningFill } from 'react-icons/pi'
import { MODEL_ACTION_PRESETS } from '../_constants/modelActionPresets'
import PromptTags from './PromptTags'
import KlingVoiceControls from './KlingVoiceControls'
import KlingCameraControls from './KlingCameraControls'
import KlingMotionBrushEditor from './KlingMotionBrushEditor'
import KlingMotionControlEditor from './KlingMotionControlEditor'

const VIDEO_RESOLUTIONS: { value: VideoResolution; label: string }[] = [
    { value: '480p', label: '480p' },
    { value: '720p', label: '720p (Recommended)' },
    { value: '1080p', label: '1080p' },
]

const VOICE_STYLES = [
    'Realistic',
    'Soft Female',
    'Deep Male',
    'Energetic',
    'Whisper',
    'British Accent',
    'American Accent',
    'Robot',
    'Narrator',
]

interface GenerationControlsProps {
    onGenerate: () => Promise<void>
    onEnhancePrompt: () => Promise<void>
    onCheckSafety: () => Promise<void>
    onDescribeImage: (image: { base64: string; mimeType: string }) => Promise<void>
    onSavePrompt: () => void
}

const GenerationControls = ({
    onGenerate,
    onEnhancePrompt,
    onCheckSafety,
    onDescribeImage,
    onSavePrompt,
}: GenerationControlsProps) => {
    const sceneInputRef = useRef<HTMLInputElement>(null)
    const videoInputRef = useRef<HTMLInputElement>(null)
    const assetInputRef = useRef<HTMLInputElement>(null)
    const imageToPromptRef = useRef<HTMLInputElement>(null)

    const {
        prompt,
        generationMode,
        videoSubMode,
        aspectRatio,
        videoResolution,
        cameraMotion,
        subjectAction,
        videoDialogue,
        voiceStyle,
        noMusic,
        noBackgroundEffects,
        cloneImage,
        videoInputImage,
        assetImages,
        isGenerating,
        isEnhancingPrompt,
        isAnalyzing,
        isDescribingImage,
        safetyAnalysis,
        setPrompt,
        setSafetyAnalysis,
        setGenerationMode,
        setVideoSubMode,
        setAspectRatio,
        setVideoResolution,
        setCameraMotion,
        setSubjectAction,
        setVideoDialogue,
        setVoiceStyle,
        setNoMusic,
        setNoBackgroundEffects,
        setCloneImage,
        setVideoInputImage,
        addAssetImage,
        removeAssetImage,
        pinnedActionIds,
        getActiveProvider,
    } = useAvatarStudioStore()

    // Check if current provider is Kling
    const activeProvider = getActiveProvider()
    const isKlingProvider = activeProvider?.type === 'KLING'

    const handleCloneUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files
        if (!files || files.length === 0) return
        const file = files[0]
        const reader = new FileReader()
        reader.onload = (e) => {
            const result = e.target?.result as string
            const matches = result.match(/^data:(.+);base64,(.+)$/)
            if (matches) {
                setCloneImage({
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

    const handleAssetUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files
        if (!files) return
        Array.from(files).forEach((file) => {
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return
            const reader = new FileReader()
            reader.onload = (e) => {
                const result = e.target?.result as string
                const matches = result.match(/^data:(.+);base64,(.+)$/)
                if (matches) {
                    addAssetImage({
                        id: crypto.randomUUID(),
                        url: result,
                        mimeType: matches[1],
                        base64: matches[2],
                        type: 'general',
                    })
                }
            }
            reader.readAsDataURL(file)
        })
        event.target.value = ''
    }

    const handleQuickStyle = (styleValue: string) => {
        const style = QUICK_STYLES.find(s => s.value === styleValue)
        if (style) {
            const styleText = `${style.label} style (${style.description})`
            const newPrompt = prompt ? `${prompt}, ${styleText}` : styleText
            setPrompt(newPrompt)
        }
    }

    const handleQuickAction = (actionId: string) => {
        const preset = MODEL_ACTION_PRESETS.find((p) => p.id === actionId)
        if (preset) {
            const newPrompt = prompt ? `${prompt}, ${preset.text}` : preset.text
            setPrompt(newPrompt)
        }
    }

    const handleImageToPrompt = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files
        if (!files || files.length === 0) return
        const file = files[0]
        const reader = new FileReader()
        reader.onload = async (e) => {
            const result = e.target?.result as string
            const matches = result.match(/^data:(.+);base64,(.+)$/)
            if (matches) {
                await onDescribeImage({ base64: matches[2], mimeType: matches[1] })
            }
        }
        reader.readAsDataURL(file)
        event.target.value = ''
    }

    const handleImageToPromptDrop = async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const files = e.dataTransfer.files
        if (!files || files.length === 0) return
        const file = files[0]
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return

        const reader = new FileReader()
        reader.onload = async (ev) => {
            const result = ev.target?.result as string
            const matches = result.match(/^data:(.+);base64,(.+)$/)
            if (matches) {
                await onDescribeImage({ base64: matches[2], mimeType: matches[1] })
            }
        }
        reader.readAsDataURL(file)
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const canGenerate = () => {
        if (!prompt.trim()) return false
        if (generationMode === 'VIDEO' && videoSubMode === 'ANIMATE' && !videoInputImage) {
            return false
        }
        return true
    }

    return (
        <div className="flex flex-col gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl shadow">
            {/* Mode Selector */}
            <div className="flex items-center gap-2">
                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                    <button
                        onClick={() => setGenerationMode('IMAGE')}
                        className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
                            generationMode === 'IMAGE'
                                ? 'bg-primary text-white shadow'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <HiOutlinePhotograph className="w-4 h-4" />
                        Image
                    </button>
                    <button
                        onClick={() => setGenerationMode('VIDEO')}
                        className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
                            generationMode === 'VIDEO'
                                ? 'bg-purple-600 text-white shadow'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <HiOutlineVideoCamera className="w-4 h-4" />
                        Video
                    </button>
                </div>

                {generationMode === 'VIDEO' && (
                    <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg ml-2">
                        <button
                            onClick={() => setVideoSubMode('ANIMATE')}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                                videoSubMode === 'ANIMATE'
                                    ? 'bg-purple-500 text-white'
                                    : 'text-gray-500'
                            }`}
                        >
                            Animate
                        </button>
                        <button
                            onClick={() => setVideoSubMode('AVATAR')}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                                videoSubMode === 'AVATAR'
                                    ? 'bg-purple-500 text-white'
                                    : 'text-gray-500'
                            }`}
                        >
                            Avatar
                        </button>
                    </div>
                )}
            </div>

            {/* Image to Prompt Dropzone */}
            <div
                onClick={() => imageToPromptRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleImageToPromptDrop}
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
                    isDescribingImage
                        ? 'border-primary bg-primary/10'
                        : 'border-gray-300 dark:border-gray-600 hover:border-primary hover:bg-primary/5'
                }`}
            >
                {isDescribingImage ? (
                    <div className="flex items-center justify-center gap-2 text-primary">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Analyzing image...</span>
                    </div>
                ) : (
                    <>
                        <HiOutlineCamera className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                        <p className="text-sm text-gray-500">Drop image to generate prompt</p>
                        <p className="text-xs text-gray-400">or click to upload</p>
                    </>
                )}
            </div>
            <input
                ref={imageToPromptRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageToPrompt}
            />

            {/* Prompt Input */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Prompt</label>
                    <div className="flex gap-2">
                        <Tooltip title="Enhance with AI">
                            <Button
                                size="xs"
                                variant="plain"
                                icon={<HiOutlineSparkles />}
                                onClick={onEnhancePrompt}
                                loading={isEnhancingPrompt}
                                disabled={!prompt.trim()}
                            />
                        </Tooltip>
                        <Tooltip title="Check Safety">
                            <Button
                                size="xs"
                                variant="plain"
                                onClick={onCheckSafety}
                                loading={isAnalyzing}
                                disabled={!prompt.trim()}
                            >
                                Safety
                            </Button>
                        </Tooltip>
                        <Tooltip title="Save Prompt">
                            <Button
                                size="xs"
                                variant="plain"
                                icon={<HiOutlineBookmarkAlt />}
                                onClick={onSavePrompt}
                                disabled={!prompt.trim()}
                            />
                        </Tooltip>
                    </div>
                </div>

                {/* Prompt Segment Tags */}
                <PromptTags />

                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                        generationMode === 'VIDEO'
                            ? 'Describe the scene and action...'
                            : 'Describe the image you want to generate...'
                    }
                    rows={3}
                    className="w-full p-3 border rounded-lg bg-transparent resize-none text-sm"
                />

                {/* Safety Analysis - Improved UI */}
                {safetyAnalysis && !safetyAnalysis.isSafe && (
                    <Card className="p-4 bg-linear-to-r from-amber-900/30 to-orange-900/30 border border-amber-600/50">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-amber-500/20 rounded">
                                    <HiOutlineExclamation className="w-4 h-4 text-amber-500" />
                                </div>
                                <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                                    Risky Terms Detected
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    size="xs"
                                    variant="solid"
                                    className="bg-amber-600 hover:bg-amber-700 text-white"
                                    onClick={() => {
                                        let newPrompt = prompt
                                        safetyAnalysis.corrections.forEach((c) => {
                                            if (c.alternatives.length > 0) {
                                                newPrompt = newPrompt.replace(
                                                    new RegExp(c.term, 'gi'),
                                                    c.alternatives[0]
                                                )
                                            }
                                        })
                                        setPrompt(newPrompt)
                                        setSafetyAnalysis(null)
                                    }}
                                >
                                    Auto-Fix All
                                </Button>
                                <button
                                    onClick={() => setSafetyAnalysis(null)}
                                    className="p-1 hover:bg-white/10 rounded transition-colors"
                                >
                                    <HiOutlineX className="w-4 h-4 text-gray-400 hover:text-white" />
                                </button>
                            </div>
                        </div>

                        {/* Flagged info */}
                        <p className="text-xs text-gray-400 mb-3">
                            Flagged: {safetyAnalysis.corrections.map((c) => c.term).join(', ')}
                        </p>

                        {/* Tags with dropdowns */}
                        <div className="flex flex-wrap gap-2">
                            {safetyAnalysis.corrections.map((correction, idx) => (
                                <Dropdown
                                    key={idx}
                                    placement="top-start"
                                    renderTitle={
                                        <button className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-medium rounded-full transition-colors">
                                            <HiOutlineExclamation className="w-3 h-3" />
                                            {correction.term}
                                        </button>
                                    }
                                >
                                    <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase">
                                        Replace with:
                                    </div>
                                    {correction.alternatives.map((alt, i) => (
                                        <Dropdown.Item
                                            key={i}
                                            eventKey={alt}
                                            onClick={() => {
                                                // Replace the term in the prompt
                                                setPrompt(
                                                    prompt.replace(
                                                        new RegExp(correction.term, 'gi'),
                                                        alt
                                                    )
                                                )
                                                // Remove this correction from the list
                                                const remainingCorrections = safetyAnalysis.corrections.filter(
                                                    (c) => c.term !== correction.term
                                                )
                                                if (remainingCorrections.length === 0) {
                                                    // All fixed, clear safety analysis
                                                    setSafetyAnalysis(null)
                                                } else {
                                                    // Update with remaining corrections
                                                    setSafetyAnalysis({
                                                        ...safetyAnalysis,
                                                        corrections: remainingCorrections,
                                                    })
                                                }
                                            }}
                                        >
                                            {alt}
                                        </Dropdown.Item>
                                    ))}
                                </Dropdown>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Quick Actions - Pinned from Prompt Library */}
                {pinnedActionIds.length > 0 && (
                    <div className="mb-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <PiLightningFill className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Quick Actions</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {pinnedActionIds.map((actionId) => {
                                const preset = MODEL_ACTION_PRESETS.find((p) => p.id === actionId)
                                if (!preset) return null
                                return (
                                    <button
                                        key={actionId}
                                        onClick={() => handleQuickAction(actionId)}
                                        className="px-2 py-1 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-colors"
                                        title={preset.text}
                                    >
                                        {preset.name}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Quick Styles Dropdown */}
                <Dropdown
                    placement="bottom-start"
                    renderTitle={
                        <button className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5">
                            <HiOutlineSparkles className="w-3.5 h-3.5 text-purple-500" />
                            <span>Quick Styles</span>
                        </button>
                    }
                >
                    <div className="max-h-[350px] overflow-y-auto">
                        {STYLE_CATEGORIES.map((category) => (
                            <div key={category.value}>
                                {/* Category Header */}
                                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase border-b border-gray-200 dark:border-gray-600 sticky top-0 bg-white dark:bg-gray-800">
                                    {category.label}
                                </div>
                                {/* Category Items */}
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
                        ))}
                    </div>
                </Dropdown>
            </div>

            {/* Aspect Ratio */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">
                        Aspect Ratio
                    </label>
                    <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                        className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                    >
                        {ASPECT_RATIOS.map((r) => (
                            <option key={r.value} value={r.value}>
                                {r.label}
                            </option>
                        ))}
                    </select>
                </div>

                {generationMode === 'VIDEO' && (
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">
                            Resolution
                        </label>
                        <select
                            value={videoResolution}
                            onChange={(e) => setVideoResolution(e.target.value as VideoResolution)}
                            className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                        >
                            {VIDEO_RESOLUTIONS.map((r) => (
                                <option key={r.value} value={r.value}>
                                    {r.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Video Controls */}
            {generationMode === 'VIDEO' && (
                <>
                    {videoSubMode === 'ANIMATE' && (
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-500">
                                Input Image (to animate)
                            </label>
                            {videoInputImage ? (
                                <div className="relative inline-block">
                                    <img
                                        src={videoInputImage.url}
                                        alt="Video input"
                                        className="h-24 rounded-lg"
                                    />
                                    <button
                                        onClick={() => setVideoInputImage(null)}
                                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full"
                                    >
                                        <HiOutlineX className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => videoInputRef.current?.click()}
                                    className="w-full h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-primary hover:text-primary transition-colors"
                                >
                                    <HiOutlineUpload className="w-5 h-5 mb-1" />
                                    <span className="text-xs">Upload image to animate</span>
                                </button>
                            )}
                            <input
                                ref={videoInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleVideoInputUpload}
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">
                                Camera Motion
                            </label>
                            <select
                                value={cameraMotion}
                                onChange={(e) => setCameraMotion(e.target.value as CameraMotion)}
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                            >
                                {CAMERA_MOTIONS.map((m) => (
                                    <option key={m.value} value={m.value}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">
                                Subject Action
                            </label>
                            <select
                                value={subjectAction}
                                onChange={(e) => setSubjectAction(e.target.value as SubjectAction)}
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                            >
                                {SUBJECT_ACTIONS.map((a) => (
                                    <option key={a.value} value={a.value}>
                                        {a.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Dialogue */}
                    <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">
                            Dialogue (optional)
                        </label>
                        <Input
                            size="sm"
                            placeholder="What should the character say?"
                            value={videoDialogue}
                            onChange={(e) => setVideoDialogue(e.target.value)}
                        />
                    </div>

                    {videoDialogue && (
                        <div>
                            <label className="text-xs font-medium text-gray-500 mb-1 block">
                                Voice Style
                            </label>
                            <select
                                value={voiceStyle}
                                onChange={(e) => setVoiceStyle(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                            >
                                {VOICE_STYLES.map((v) => (
                                    <option key={v} value={v}>
                                        {v}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <Checkbox
                        checked={noMusic}
                        onChange={(val) => setNoMusic(val)}
                    >
                        <span className="text-sm">No background music</span>
                    </Checkbox>

                    <Checkbox
                        checked={noBackgroundEffects}
                        onChange={(val) => setNoBackgroundEffects(val)}
                    >
                        <span className="text-sm">No background effects/sounds</span>
                    </Checkbox>
                </>
            )}

            {/* Style Reference (for Image mode) */}
            {generationMode === 'IMAGE' && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-500">
                            Clone Reference
                        </label>
                    </div>
                    {cloneImage ? (
                        <div className="relative inline-block">
                            <img
                                src={cloneImage.url}
                                alt="Clone reference"
                                className="h-20 rounded-lg"
                            />
                            <button
                                onClick={() => setCloneImage(null)}
                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full"
                            >
                                <HiOutlineX className="w-3 h-3" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => sceneInputRef.current?.click()}
                            className="px-3 py-2 text-xs border border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-primary hover:text-primary transition-colors"
                        >
                            <HiOutlineUpload className="w-4 h-4 inline mr-1" />
                            Add clone reference
                        </button>
                    )}
                    <input
                        ref={sceneInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCloneUpload}
                    />
                    <p className="text-[10px] text-gray-400 italic">
                        Clones outfit, pose, setting - but uses your avatar&apos;s face and body
                    </p>
                </div>
            )}

            {/* Asset Images */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-500">
                        Assets (props, items)
                    </label>
                    <button
                        onClick={() => assetInputRef.current?.click()}
                        className="text-xs text-primary hover:underline"
                    >
                        + Add
                    </button>
                </div>
                {assetImages.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                        {assetImages.map((asset) => (
                            <div key={asset.id} className="relative">
                                <img
                                    src={asset.url}
                                    alt="Asset"
                                    className="h-12 w-12 object-cover rounded"
                                />
                                <button
                                    onClick={() => removeAssetImage(asset.id)}
                                    className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full"
                                >
                                    <HiOutlineX className="w-2.5 h-2.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <input
                    ref={assetInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleAssetUpload}
                />
            </div>

            {/* Kling AI Controls - Show only when Kling provider is selected in VIDEO mode */}
            {generationMode === 'VIDEO' && isKlingProvider && (
                <div className="space-y-3 pt-4 border-t border-orange-700/50">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded-full bg-linear-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-[10px]">
                            K
                        </div>
                        <span className="text-sm font-medium text-orange-300">Kling Features</span>
                        <span className="text-xs text-gray-500">({activeProvider?.model})</span>
                    </div>
                    {/* Voice and Motion Control only for v2.6+ */}
                    {activeProvider?.model === 'kling-v2-6' && (
                        <>
                            <KlingVoiceControls disabled={isGenerating} />
                            <KlingMotionControlEditor disabled={isGenerating} />
                        </>
                    )}
                    {/* Camera and Motion Brush for all Kling models */}
                    <KlingCameraControls disabled={isGenerating} />
                    <KlingMotionBrushEditor disabled={isGenerating} />
                </div>
            )}

            {/* Generate Button */}
            <Button
                variant="solid"
                color={generationMode === 'VIDEO' ? 'purple' : 'blue'}
                size="lg"
                block
                onClick={onGenerate}
                loading={isGenerating}
                disabled={!canGenerate()}
            >
                {generationMode === 'VIDEO' ? 'Generate Video' : 'Generate Image'}
            </Button>
        </div>
    )
}

export default GenerationControls
