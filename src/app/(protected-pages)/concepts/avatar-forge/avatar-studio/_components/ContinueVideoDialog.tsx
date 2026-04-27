'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { HiOutlineFilm } from 'react-icons/hi'
import { ASPECT_RATIOS } from '../types'
import type { AspectRatio } from '../types'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import {
    getDurationOptionsForProvider,
    clampDurationForProvider,
} from '../_utils/providerCapabilities'

interface ContinueVideoDialogProps {
    isOpen: boolean
    frameBase64: string
    originalPrompt: string
    originalDialogue?: string
    originalAspectRatio?: AspectRatio
    onClose: () => void
    onConfirm: (prompt: string, dialogue: string, aspectRatio: AspectRatio) => void
}

const AspectRatioIcon = ({ ratio, isSelected }: { ratio: string; isSelected: boolean }) => {
    const baseClass = `border-2 rounded-sm ${isSelected ? 'border-purple-500 bg-purple-500/20' : 'border-gray-400 dark:border-gray-500'}`
    switch (ratio) {
        case '1:1': return <span className={`${baseClass} w-3.5 h-3.5`} />
        case '16:9': return <span className={`${baseClass} w-5 h-3`} />
        case '9:16': return <span className={`${baseClass} w-3 h-5`} />
        case '4:3': return <span className={`${baseClass} w-4 h-3`} />
        case '3:4': return <span className={`${baseClass} w-3 h-4`} />
        default: return <span className={`${baseClass} w-3.5 h-3.5`} />
    }
}

const ContinueVideoDialog = ({
    isOpen,
    frameBase64,
    originalPrompt,
    originalDialogue = '',
    originalAspectRatio = '16:9',
    onClose,
    onConfirm,
}: ContinueVideoDialogProps) => {
    const { providers, activeProviderId, setActiveProviderId, videoDuration, setVideoDuration } = useAvatarStudioStore()

    const videoProviders = useMemo(
        () => providers.filter((p) => p.supports_video && p.is_active !== false),
        [providers],
    )

    const [editablePrompt, setEditablePrompt] = useState('')
    const [dialogue, setDialogue] = useState('')
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
    const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
    const [selectedDuration, setSelectedDuration] = useState<number>(5)
    const [showOriginal, setShowOriginal] = useState(false)

    const selectedProvider = useMemo(
        () => videoProviders.find((p) => p.id === selectedProviderId) ?? null,
        [videoProviders, selectedProviderId],
    )
    const durationOptions = useMemo(
        () => getDurationOptionsForProvider(selectedProvider),
        [selectedProvider],
    )

    useEffect(() => {
        if (isOpen) {
            const suggestion = originalPrompt
                ? `${originalPrompt} (Continued)`
                : 'Cinematic movement, continuation of previous scene'
            setEditablePrompt(suggestion)
            setDialogue(originalDialogue)
            setAspectRatio(originalAspectRatio)
            // Default to current active provider if it supports video, otherwise
            // fall back to the first available video provider.
            const activeIsVideo = activeProviderId
                ? videoProviders.some((p) => p.id === activeProviderId)
                : false
            const initialProviderId = activeIsVideo
                ? activeProviderId
                : videoProviders[0]?.id ?? null
            setSelectedProviderId(initialProviderId)
            const initialProvider = initialProviderId
                ? videoProviders.find((p) => p.id === initialProviderId) ?? null
                : null
            setSelectedDuration(clampDurationForProvider(initialProvider, videoDuration))
        } else {
            setEditablePrompt('')
            setDialogue('')
            setShowOriginal(false)
        }
    }, [isOpen, originalPrompt, originalDialogue, originalAspectRatio, activeProviderId, videoProviders, videoDuration])

    // When the user switches provider, snap duration to the closest valid value.
    useEffect(() => {
        setSelectedDuration((prev) => clampDurationForProvider(selectedProvider, prev))
    }, [selectedProvider])

    const handleConfirm = useCallback(() => {
        const cleanPrompt = editablePrompt.trim()
        if (!cleanPrompt) return
        // Commit provider + duration selection to the store BEFORE invoking
        // onConfirm so handleGenerate downstream reads the latest values.
        if (selectedProviderId && selectedProviderId !== activeProviderId) {
            setActiveProviderId(selectedProviderId)
        }
        if (selectedDuration !== videoDuration) {
            setVideoDuration(selectedDuration)
        }
        onConfirm(cleanPrompt, dialogue.trim(), aspectRatio)
    }, [editablePrompt, dialogue, aspectRatio, selectedProviderId, activeProviderId, setActiveProviderId, selectedDuration, videoDuration, setVideoDuration, onConfirm])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleConfirm()
        }
    }, [handleConfirm])

    const canConfirm = editablePrompt.trim().length > 0 && !!selectedProviderId

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            width={550}
            overlayClassName="!z-[60]"
            closable={true}
        >
            <div className="flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
                    <div className="p-2 bg-purple-100 dark:bg-purple-500/20 rounded-lg">
                        <HiOutlineFilm className="w-5 h-5 text-purple-600 dark:text-purple-300" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Continue Video Generation
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Describe what happens next in the scene
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* Frame Preview */}
                    {frameBase64 && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <img
                                src={frameBase64}
                                alt="Last frame"
                                className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-700"
                            />
                            <div className="flex-1">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                                    Frame Captured
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    This will be the starting point for continuation
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Provider Selector */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">
                            Model
                        </label>
                        {videoProviders.length === 0 ? (
                            <p className="text-xs text-amber-600 dark:text-amber-400 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg">
                                No video providers configured. Open the Provider Manager and enable at least one video model.
                            </p>
                        ) : (
                            <select
                                value={selectedProviderId ?? ''}
                                onChange={(e) => setSelectedProviderId(e.target.value || null)}
                                onKeyDown={handleKeyDown}
                                className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-500/40 transition-all"
                            >
                                {videoProviders.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Aspect Ratio Selector */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">
                            Aspect Ratio
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {ASPECT_RATIOS.map((r) => (
                                <button
                                    key={r.value}
                                    onClick={() => setAspectRatio(r.value as AspectRatio)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                                        aspectRatio === r.value
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200 font-medium'
                                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <AspectRatioIcon ratio={r.value} isSelected={aspectRatio === r.value} />
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Duration Selector — options adapt to the selected model. */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">
                            Duration
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {durationOptions.map((d) => (
                                <button
                                    key={d}
                                    onClick={() => setSelectedDuration(d)}
                                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                                        selectedDuration === d
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-200 font-medium'
                                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {d}s
                                </button>
                            ))}
                        </div>
                        {durationOptions.length === 1 && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                This model uses a fixed duration.
                            </p>
                        )}
                    </div>

                    {/* Dialogue Input */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">
                            Dialogue
                        </label>
                        <input
                            type="text"
                            value={dialogue}
                            onChange={(e) => setDialogue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="What should they say?"
                            className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-500/40 transition-all"
                        />
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            Optional — leave empty for no speech
                        </p>
                    </div>

                    {/* Prompt Input */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">
                            Continuation Prompt
                        </label>
                        <textarea
                            value={editablePrompt}
                            onChange={(e) => setEditablePrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Describe what happens next..."
                            rows={4}
                            className="w-full p-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 resize-none text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-500/40 transition-all"
                            autoFocus
                        />
                        <div className="flex items-center justify-between mt-2">
                            <button
                                onClick={() => setShowOriginal(!showOriginal)}
                                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
                            >
                                {showOriginal ? 'Hide' : 'Show'} original prompt
                            </button>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                {editablePrompt.length} characters
                            </span>
                        </div>
                    </div>

                    {/* Original Prompt (collapsible) */}
                    {showOriginal && originalPrompt && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg">
                            <p className="text-xs font-medium text-blue-900 dark:text-blue-200 mb-1">
                                Original Prompt:
                            </p>
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                                {originalPrompt}
                            </p>
                        </div>
                    )}

                    {/* Help Text */}
                    <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg">
                        <div className="text-purple-600 dark:text-purple-300 mt-0.5">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <p className="text-xs text-purple-700 dark:text-purple-200">
                            Tip: Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs text-gray-700 dark:text-gray-200">Cmd/Ctrl + Enter</kbd> to quickly confirm
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <Button
                        variant="plain"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        color="purple"
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        icon={<HiOutlineFilm />}
                    >
                        Continue Generation
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default ContinueVideoDialog
