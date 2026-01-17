'use client'

import { useRef, useState } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Checkbox from '@/components/ui/Checkbox'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { KLING_MOTION_PRESETS } from '@/@types/kling'
import type { KlingMotionOrientation, KlingMotionPreset } from '@/@types/kling'
import { HiOutlineFilm, HiOutlineX, HiOutlineVolumeUp, HiOutlineLink, HiOutlineUpload } from 'react-icons/hi'

interface KlingMotionControlEditorProps {
    disabled?: boolean
}

type MotionSourceTab = 'preset' | 'upload' | 'url'

const KlingMotionControlEditor = ({ disabled = false }: KlingMotionControlEditorProps) => {
    const {
        klingMotionControlEnabled,
        klingMotionVideoBase64,
        klingMotionVideoUrl,
        klingPresetMotion,
        klingMotionOrientation,
        klingKeepOriginalSound,
        klingMotionDuration,
        setKlingMotionControlEnabled,
        setKlingMotionVideoBase64,
        setKlingMotionVideoUrl,
        setKlingPresetMotion,
        setKlingMotionOrientation,
        setKlingKeepOriginalSound,
        setKlingMotionDuration,
    } = useAvatarStudioStore()

    const videoInputRef = useRef<HTMLInputElement>(null)
    const [urlInput, setUrlInput] = useState(klingMotionVideoUrl || '')

    // Determine active tab based on current state
    const getActiveTab = (): MotionSourceTab => {
        if (klingMotionVideoBase64) return 'upload'
        if (klingMotionVideoUrl) return 'url'
        return 'preset'
    }

    const [activeTab, setActiveTab] = useState<MotionSourceTab>(getActiveTab())

    // Handle video file upload
    const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Check file type
        if (!file.type.startsWith('video/')) {
            alert('Please select a video file')
            return
        }

        // Check file size (max 50MB)
        if (file.size > 50 * 1024 * 1024) {
            alert('Video file must be less than 50MB')
            return
        }

        // Convert to base64
        const reader = new FileReader()
        reader.onload = () => {
            const base64 = reader.result as string
            setKlingMotionVideoBase64(base64)
            setKlingPresetMotion(null) // Clear preset when custom video is uploaded
            setUrlInput('') // Clear URL input
        }
        reader.readAsDataURL(file)
    }

    const clearMotionVideo = () => {
        setKlingMotionVideoBase64(null)
        if (videoInputRef.current) {
            videoInputRef.current.value = ''
        }
    }

    const handlePresetSelect = (preset: KlingMotionPreset | null) => {
        setKlingPresetMotion(preset)
        if (preset) {
            setKlingMotionVideoBase64(null) // Clear custom video when preset is selected
            setKlingMotionVideoUrl(null) // Clear URL when preset is selected
            setUrlInput('')
        }
    }

    const handleTabChange = (tab: MotionSourceTab) => {
        setActiveTab(tab)
        if (tab === 'preset') {
            setKlingMotionVideoBase64(null)
            setKlingMotionVideoUrl(null)
            setUrlInput('')
            if (videoInputRef.current) videoInputRef.current.value = ''
        } else if (tab === 'upload') {
            setKlingMotionVideoUrl(null)
            setKlingPresetMotion(null)
            setUrlInput('')
            videoInputRef.current?.click()
        } else if (tab === 'url') {
            setKlingMotionVideoBase64(null)
            setKlingPresetMotion(null)
            if (videoInputRef.current) videoInputRef.current.value = ''
        }
    }

    const handleUrlSubmit = () => {
        if (urlInput.trim()) {
            setKlingMotionVideoUrl(urlInput.trim())
            setKlingMotionVideoBase64(null)
            setKlingPresetMotion(null)
        }
    }

    const clearUrl = () => {
        setKlingMotionVideoUrl(null)
        setUrlInput('')
    }

    const handleOrientationChange = (orientation: KlingMotionOrientation) => {
        setKlingMotionOrientation(orientation)
    }

    // Check if we have any motion source
    const hasMotionSource = klingPresetMotion || klingMotionVideoBase64 || klingMotionVideoUrl

    return (
        <Card className="p-4 bg-gray-800/50 border-gray-700">
            <div className="flex items-center gap-2 mb-4">
                <HiOutlineFilm className="w-5 h-5 text-cyan-400" />
                <span className="font-medium text-white">Motion Control</span>
                <span className="text-xs text-gray-400 ml-auto">(Requires Kling v2.6+)</span>
            </div>

            <div className="space-y-4">
                {/* Enable Motion Control Toggle */}
                <Checkbox
                    checked={klingMotionControlEnabled}
                    onChange={(checked) => setKlingMotionControlEnabled(checked)}
                    disabled={disabled}
                >
                    <span className="text-sm text-gray-300">
                        Enable Motion Control
                    </span>
                </Checkbox>

                {klingMotionControlEnabled && (
                    <>
                        {/* Motion Source Tabs - 3 options */}
                        <div className="flex gap-1 p-1 bg-gray-900/50 rounded-lg">
                            <button
                                onClick={() => handleTabChange('preset')}
                                className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors ${
                                    activeTab === 'preset'
                                        ? 'bg-cyan-600 text-white'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                                disabled={disabled}
                            >
                                Presets
                            </button>
                            <button
                                onClick={() => handleTabChange('upload')}
                                className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                                    activeTab === 'upload'
                                        ? 'bg-cyan-600 text-white'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                                disabled={disabled}
                            >
                                <HiOutlineUpload className="w-3 h-3" />
                                Upload
                            </button>
                            <button
                                onClick={() => handleTabChange('url')}
                                className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                                    activeTab === 'url'
                                        ? 'bg-cyan-600 text-white'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                                disabled={disabled}
                            >
                                <HiOutlineLink className="w-3 h-3" />
                                URL
                            </button>
                        </div>

                        {/* Preset Motion Grid */}
                        {activeTab === 'preset' && (
                            <div>
                                <label className="block text-xs text-gray-400 mb-2">Select Motion Preset</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {KLING_MOTION_PRESETS.map((preset) => (
                                        <button
                                            key={preset.id}
                                            onClick={() => handlePresetSelect(preset.id)}
                                            disabled={disabled}
                                            className={`p-2 rounded-lg border text-center transition-all ${
                                                klingPresetMotion === preset.id
                                                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                                                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                                            }`}
                                            title={preset.description}
                                        >
                                            <span className="text-xs font-medium">{preset.label}</span>
                                        </button>
                                    ))}
                                </div>
                                {klingPresetMotion && (
                                    <p className="text-xs text-cyan-400 mt-2">
                                        Selected: {KLING_MOTION_PRESETS.find(p => p.id === klingPresetMotion)?.description}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Custom Video Upload */}
                        <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/*"
                            onChange={handleVideoUpload}
                            className="hidden"
                        />

                        {activeTab === 'upload' && (
                            <div className="space-y-3">
                                {klingMotionVideoBase64 ? (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs text-gray-400">Custom Motion Video</label>
                                            <Button
                                                size="xs"
                                                variant="plain"
                                                onClick={clearMotionVideo}
                                                disabled={disabled}
                                                icon={<HiOutlineX />}
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                        <div className="relative rounded-lg overflow-hidden bg-gray-900/50 border border-gray-700">
                                            <video
                                                src={klingMotionVideoBase64}
                                                className="w-full max-h-40 object-contain"
                                                controls
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div
                                        onClick={() => videoInputRef.current?.click()}
                                        className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-cyan-500 transition-colors"
                                    >
                                        <HiOutlineUpload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                                        <p className="text-sm text-gray-400">Click to upload video</p>
                                        <p className="text-xs text-gray-500 mt-1">Max 50MB</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* URL Input */}
                        {activeTab === 'url' && (
                            <div className="space-y-3">
                                <label className="block text-xs text-gray-400">
                                    Paste direct video URL (.mp4, .webm)
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        type="url"
                                        placeholder="https://example.com/video.mp4"
                                        value={urlInput}
                                        onChange={(e) => setUrlInput(e.target.value)}
                                        disabled={disabled}
                                        className="flex-1"
                                        size="sm"
                                    />
                                    {klingMotionVideoUrl ? (
                                        <Button
                                            size="sm"
                                            variant="plain"
                                            onClick={clearUrl}
                                            disabled={disabled}
                                            icon={<HiOutlineX />}
                                        />
                                    ) : (
                                        <Button
                                            size="sm"
                                            variant="solid"
                                            onClick={handleUrlSubmit}
                                            disabled={disabled || !urlInput.trim()}
                                        >
                                            Set
                                        </Button>
                                    )}
                                </div>
                                {/* Warning for social media URLs */}
                                {urlInput && (urlInput.includes('tiktok.com') || urlInput.includes('instagram.com') || urlInput.includes('youtube.com') || urlInput.includes('twitter.com') || urlInput.includes('x.com')) && (
                                    <div className="p-2 bg-yellow-900/30 border border-yellow-700 rounded-lg">
                                        <p className="text-xs text-yellow-400">
                                            ⚠️ Social media page URLs don&apos;t work. You need a direct link to the video file (ending in .mp4). Use &quot;Upload&quot; tab instead.
                                        </p>
                                    </div>
                                )}
                                {klingMotionVideoUrl && (
                                    <div className="p-2 bg-green-900/30 border border-green-700 rounded-lg">
                                        <p className="text-xs text-green-400 truncate">
                                            ✓ URL set: {klingMotionVideoUrl}
                                        </p>
                                    </div>
                                )}
                                <div className="text-xs text-gray-500 space-y-1">
                                    <p>✓ Direct video file URLs (CDN, cloud storage)</p>
                                    <p>✗ TikTok, Instagram, YouTube page links won&apos;t work</p>
                                    <p className="text-cyan-400">Tip: Download the video first, then use &quot;Upload&quot;</p>
                                </div>
                            </div>
                        )}

                        {/* Keep Original Sound - Only show when using custom video or URL */}
                        {(klingMotionVideoBase64 || klingMotionVideoUrl) && (
                            <Checkbox
                                checked={klingKeepOriginalSound}
                                onChange={(checked) => setKlingKeepOriginalSound(checked)}
                                disabled={disabled}
                            >
                                <span className="text-sm text-gray-300 flex items-center gap-1">
                                    <HiOutlineVolumeUp className="w-4 h-4" />
                                    Keep original sound from video
                                </span>
                            </Checkbox>
                        )}

                        {/* Orientation Selector */}
                        <div>
                            <label className="block text-xs text-gray-400 mb-2">Character Orientation</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleOrientationChange('video')}
                                    disabled={disabled}
                                    className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${
                                        klingMotionOrientation === 'video'
                                            ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                                    }`}
                                >
                                    Video Orientation
                                </button>
                                <button
                                    onClick={() => handleOrientationChange('image')}
                                    disabled={disabled}
                                    className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${
                                        klingMotionOrientation === 'image'
                                            ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                                    }`}
                                >
                                    Image Orientation
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {klingMotionOrientation === 'video'
                                    ? 'Best for complex body motions and dances'
                                    : 'Best for camera movements and simple poses'}
                            </p>
                        </div>

                        {/* Duration Selector */}
                        <div>
                            <label className="block text-xs text-gray-400 mb-2">Video Duration</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setKlingMotionDuration('5')}
                                    disabled={disabled}
                                    className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${
                                        klingMotionDuration === '5'
                                            ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                                    }`}
                                >
                                    5 seconds
                                </button>
                                <button
                                    onClick={() => setKlingMotionDuration('10')}
                                    disabled={disabled}
                                    className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${
                                        klingMotionDuration === '10'
                                            ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                                    }`}
                                >
                                    10 seconds
                                </button>
                            </div>
                        </div>

                        {/* Status Summary */}
                        <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                            <p className="text-xs text-gray-400 mb-1">Motion Control Summary:</p>
                            <div className="text-xs text-cyan-400 space-y-1">
                                {klingPresetMotion && (
                                    <p>Preset: {KLING_MOTION_PRESETS.find(p => p.id === klingPresetMotion)?.label}</p>
                                )}
                                {klingMotionVideoBase64 && (
                                    <p>Source: Uploaded video {klingKeepOriginalSound ? '(with sound)' : '(muted)'}</p>
                                )}
                                {klingMotionVideoUrl && (
                                    <p>Source: External URL {klingKeepOriginalSound ? '(with sound)' : '(muted)'}</p>
                                )}
                                {!hasMotionSource && (
                                    <p className="text-yellow-400">Select a preset, upload a video, or paste a URL</p>
                                )}
                                <p>Orientation: {klingMotionOrientation === 'video' ? 'Video' : 'Image'}</p>
                                <p>Duration: {klingMotionDuration} seconds</p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </Card>
    )
}

export default KlingMotionControlEditor
