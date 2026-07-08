'use client'

import { useEffect, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { HiOutlineMicrophone } from 'react-icons/hi'

interface SpeakScriptDialogProps {
    isOpen: boolean
    onClose: () => void
}

/**
 * Dedicated script editor for Speak mode. The script lives in the store's
 * `videoDialogue` (NOT the main prompt textarea), so Img→Prompt /
 * video-to-prompt filling the prompt box can never overwrite it.
 */
const SpeakScriptDialog = ({ isOpen, onClose }: SpeakScriptDialogProps) => {
    const videoDialogue = useAvatarStudioStore((s) => s.videoDialogue)
    const setVideoDialogue = useAvatarStudioStore((s) => s.setVideoDialogue)
    const setVideoSubMode = useAvatarStudioStore((s) => s.setVideoSubMode)
    const avatarDefaultVoice = useAvatarStudioStore((s) => s.avatarDefaultVoice)
    const speakModel = useAvatarStudioStore((s) => s.speakModel)
    const setSpeakModel = useAvatarStudioStore((s) => s.setSpeakModel)

    const [script, setScript] = useState('')

    // Re-sync from the store each time the dialog opens (the "More" dropdown
    // edits the same field).
    useEffect(() => {
        if (isOpen) setScript(videoDialogue)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0
    // ~150 spoken words per minute → ~2.5 words/second
    const estimatedSeconds = Math.round(wordCount / 2.5)

    const handleUseScript = () => {
        setVideoDialogue(script.trim())
        setVideoSubMode('SPEAK')
        onClose()
    }

    return (
        <Dialog isOpen={isOpen} onClose={onClose} width={560} closable>
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <HiOutlineMicrophone className="w-5 h-5 text-purple-500" />
                    <h5 className="font-semibold">Speak — Script</h5>
                </div>

                {avatarDefaultVoice ? (
                    <span className="self-start px-2 py-1 text-xs rounded bg-purple-500/10 text-purple-500">
                        🎤 Voice: {avatarDefaultVoice.name} ({avatarDefaultVoice.language.toUpperCase()})
                    </span>
                ) : (
                    <a
                        href="/concepts/avatar-forge/voice-studio"
                        className="self-start px-2 py-1 text-xs rounded bg-amber-500/10 text-amber-500 underline"
                    >
                        This avatar has no main voice — clone one in Voice Studio
                    </a>
                )}

                <p className="text-xs text-gray-500">
                    The avatar will speak this script with its cloned voice and synced
                    lips. The main prompt box is only an optional scene description.
                </p>

                <textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="Write what the avatar should say..."
                    rows={6}
                    autoFocus
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                />

                <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{wordCount} words</span>
                    <span>~{estimatedSeconds}s estimated</span>
                </div>

                <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-gray-500">Engine</span>
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded p-0.5 self-start">
                        <button
                            type="button"
                            onClick={() => setSpeakModel('infinitalk')}
                            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                speakModel === 'infinitalk' ? 'bg-purple-500 text-white' : 'text-gray-500'
                            }`}
                        >
                            InfiniteTalk
                        </button>
                        <button
                            type="button"
                            onClick={() => setSpeakModel('omnihuman')}
                            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                                speakModel === 'omnihuman' ? 'bg-purple-500 text-white' : 'text-gray-500'
                            }`}
                        >
                            OmniHuman
                        </button>
                    </div>
                    <span className="text-[10px] text-gray-400">
                        {speakModel === 'infinitalk'
                            ? 'InfiniteTalk: long clips, standard quality.'
                            : 'OmniHuman 1.5: best gestures/quality, ideal for clips under 15s.'}
                    </span>
                    {speakModel === 'omnihuman' && estimatedSeconds > 15 && (
                        <span className="text-[10px] text-amber-500">
                            Script runs ~{estimatedSeconds}s — OmniHuman quality degrades past 15s. Consider shortening it or using InfiniteTalk.
                        </span>
                    )}
                </div>

                <div className="flex justify-end gap-2">
                    <Button size="sm" variant="plain" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        disabled={!script.trim() || !avatarDefaultVoice}
                        onClick={handleUseScript}
                    >
                        Use script
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default SpeakScriptDialog
