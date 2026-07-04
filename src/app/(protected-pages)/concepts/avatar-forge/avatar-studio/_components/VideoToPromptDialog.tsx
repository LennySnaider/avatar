'use client'

import { useRef, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { supabase } from '@/lib/supabase'
import { createMotionVideoUploadUrl } from '@/services/KieService'
import { analyzeVideoForPrompt } from '@/services/GeminiService'
import {
    HiOutlineFilm,
    HiOutlineUpload,
    HiOutlineLink,
    HiOutlineSparkles,
    HiOutlineX,
} from 'react-icons/hi'

interface VideoToPromptDialogProps {
    isOpen: boolean
    onClose: () => void
}

type SourceTab = 'upload' | 'url'

const VideoToPromptDialog = ({ isOpen, onClose }: VideoToPromptDialogProps) => {
    const setPrompt = useAvatarStudioStore((s) => s.setPrompt)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [activeTab, setActiveTab] = useState<SourceTab>('upload')
    const [urlInput, setUrlInput] = useState('')
    const [videoUrl, setVideoUrl] = useState<string | null>(null)
    const [videoDuration, setVideoDuration] = useState<number | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [resultPrompt, setResultPrompt] = useState('')
    const [suggestedDuration, setSuggestedDuration] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setUrlInput('')
        setVideoUrl(null)
        setVideoDuration(null)
        setIsUploading(false)
        setIsAnalyzing(false)
        setResultPrompt('')
        setSuggestedDuration(null)
        setError(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleClose = () => {
        reset()
        onClose()
    }

    // Straight-to-Supabase upload via signed URL (dodges Vercel's 4.5MB cap)
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('video/')) {
            setError('Please select a video file')
            return
        }
        if (file.size > 50 * 1024 * 1024) {
            setError('Video file must be less than 50MB')
            return
        }
        setError(null)
        setIsUploading(true)
        try {
            const ticket = await createMotionVideoUploadUrl(file.type)
            const { error: upErr } = await supabase.storage
                .from('generations')
                .uploadToSignedUrl(ticket.path, ticket.token, file, {
                    contentType: file.type,
                })
            if (upErr) throw new Error(upErr.message)
            setVideoUrl(ticket.publicUrl)
        } catch (err) {
            setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
        } finally {
            setIsUploading(false)
        }
    }

    const handleUrlSubmit = () => {
        if (!urlInput.trim()) return
        setError(null)
        setVideoUrl(urlInput.trim())
    }

    const handleAnalyze = async () => {
        if (!videoUrl) return
        setIsAnalyzing(true)
        setError(null)
        try {
            const result = await analyzeVideoForPrompt(videoUrl)
            if (!result.success || !result.prompt) {
                setError(result.error || 'Analysis failed')
                return
            }
            setResultPrompt(result.prompt)
            setSuggestedDuration(result.suggestedDurationSeconds ?? videoDuration)
        } finally {
            setIsAnalyzing(false)
        }
    }

    const handleUsePrompt = () => {
        setPrompt(resultPrompt.trim())
        handleClose()
    }

    return (
        <Dialog isOpen={isOpen} onClose={handleClose} width={640} closable>
            <div className="flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
                    <div className="p-2 bg-purple-100 dark:bg-purple-500/20 rounded-lg">
                        <HiOutlineFilm className="w-5 h-5 text-purple-600 dark:text-purple-300" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Prompt from Video
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Analyze a reference video and build a detailed prompt that imitates it
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* Source tabs */}
                    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-900/50 rounded-lg">
                        <button
                            onClick={() => setActiveTab('upload')}
                            className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                                activeTab === 'upload'
                                    ? 'bg-purple-600 text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <HiOutlineUpload className="w-3 h-3" />
                            Upload
                        </button>
                        <button
                            onClick={() => setActiveTab('url')}
                            className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                                activeTab === 'url'
                                    ? 'bg-purple-600 text-white'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                            }`}
                        >
                            <HiOutlineLink className="w-3 h-3" />
                            URL
                        </button>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        onChange={handleFileUpload}
                        className="hidden"
                    />

                    {/* Source: upload */}
                    {activeTab === 'upload' && !videoUrl && (
                        <div
                            onClick={() => !isUploading && fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                                isUploading
                                    ? 'border-purple-500'
                                    : 'border-gray-300 dark:border-gray-600 cursor-pointer hover:border-purple-500'
                            }`}
                        >
                            <HiOutlineUpload
                                className={`w-8 h-8 mx-auto mb-2 ${isUploading ? 'text-purple-400 animate-pulse' : 'text-gray-400'}`}
                            />
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {isUploading ? 'Uploading video…' : 'Click to upload a reference video'}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                Any framing works — selfies, close-ups, b-roll. Max 20MB for analysis.
                            </p>
                        </div>
                    )}

                    {/* Source: URL */}
                    {activeTab === 'url' && !videoUrl && (
                        <div className="flex gap-2">
                            <Input
                                type="url"
                                placeholder="https://example.com/video.mp4"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                className="flex-1"
                                size="sm"
                            />
                            <Button size="sm" variant="solid" onClick={handleUrlSubmit} disabled={!urlInput.trim()}>
                                Set
                            </Button>
                        </div>
                    )}

                    {/* Preview + analyze */}
                    {videoUrl && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-gray-500 dark:text-gray-400">
                                    Reference video{videoDuration ? ` · ~${Math.round(videoDuration)}s` : ''}
                                </label>
                                <Button size="xs" variant="plain" onClick={reset} icon={<HiOutlineX />}>
                                    Remove
                                </Button>
                            </div>
                            <div className="rounded-lg overflow-hidden bg-black">
                                <video
                                    src={videoUrl}
                                    className="w-full max-h-52 object-contain"
                                    controls
                                    onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration)}
                                />
                            </div>
                            <Button
                                block
                                variant="solid"
                                onClick={handleAnalyze}
                                loading={isAnalyzing}
                                icon={<HiOutlineSparkles />}
                            >
                                {isAnalyzing ? 'Analyzing video…' : 'Analyze video'}
                            </Button>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Result */}
                    {resultPrompt && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-gray-500 dark:text-gray-400">
                                    Generated prompt (editable)
                                </label>
                                {suggestedDuration && (
                                    <span className="text-xs text-purple-500 dark:text-purple-300">
                                        Reference ≈ {Math.round(suggestedDuration)}s — pick the closest duration
                                    </span>
                                )}
                            </div>
                            <textarea
                                value={resultPrompt}
                                onChange={(e) => setResultPrompt(e.target.value)}
                                rows={8}
                                className="w-full text-sm p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <Button variant="plain" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        color="purple"
                        onClick={handleUsePrompt}
                        disabled={!resultPrompt.trim()}
                    >
                        Use prompt
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default VideoToPromptDialog
