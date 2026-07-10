'use client'

import { useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { useVoiceStudioStore } from '../../voice-studio/_store/voiceStudioStore'
import { submitLipsyncVideoKieTask, checkKieVideoTask } from '@/services/KieService'
import { apiSaveGeneration } from '@/services/AvatarForgeService'
import { HiOutlineMicrophone, HiOutlineVolumeUp } from 'react-icons/hi'
import type { GeneratedMedia } from '../types'

interface LipsyncDialogProps {
    media: GeneratedMedia | null
    userId?: string
    onClose: () => void
    /** Opens the Voice Studio ToolModal so the user can generate audio first. */
    onOpenVoiceStudio?: () => void
}

/**
 * Lipsync a gallery VIDEO to the audio generated in Voice Studio. Replaces
 * Voice Studio's old LipsyncPanel (redundant now that Voice Studio lives
 * inside Avatar Studio next to the gallery) — the video is preselected here,
 * the audio comes from voiceStudioStore.previewAudioUrl.
 */
const LipsyncDialog = ({ media, userId, onClose, onOpenVoiceStudio }: LipsyncDialogProps) => {
    const { previewAudioUrl, currentTitle } = useVoiceStudioStore()

    const [isLipsyncing, setIsLipsyncing] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [galleryWarning, setGalleryWarning] = useState<string | null>(null)
    const [resultUrl, setResultUrl] = useState<string | null>(null)

    const videoUrl = media?.publicUrl ?? media?.url ?? null

    const handleClose = () => {
        if (isLipsyncing) return // don't abandon a running job by accident
        setErrorMsg(null)
        setGalleryWarning(null)
        setResultUrl(null)
        onClose()
    }

    const handleLipsync = async () => {
        if (!videoUrl || !previewAudioUrl) return
        setIsLipsyncing(true)
        setErrorMsg(null)
        setGalleryWarning(null)
        try {
            // Submit async + poll from the browser: lipsync jobs can exceed
            // 10 min and a synchronous server action would abandon them.
            const sub = await submitLipsyncVideoKieTask({
                videoUrl,
                audioUrl: previewAudioUrl,
            })
            if (!sub.success) {
                throw new Error(sub.error)
            }
            const deadlineMs = Date.now() + 30 * 60 * 1000
            let url: string | null = null
            while (Date.now() < deadlineMs) {
                await new Promise((r) => setTimeout(r, 5000))
                const st = await checkKieVideoTask(sub.taskId)
                if (st.status === 'done') {
                    url = st.url
                    break
                }
                if (st.status === 'failed') {
                    throw new Error(st.error)
                }
            }
            if (!url) {
                throw new Error(`Lipsync timed out (>30 min). Job ${sub.taskId} may still be running on kie.ai/logs.`)
            }
            setResultUrl(url)

            // Register the result in the gallery (the mp4 is already in the
            // generations bucket). A failure here is NOT a lipsync failure.
            if (userId) {
                try {
                    const storagePath = url.split('/object/public/generations/')[1] ?? url
                    await apiSaveGeneration({
                        user_id: userId,
                        avatar_id: null,
                        media_type: 'VIDEO',
                        storage_path: storagePath,
                        prompt: `Lipsync: ${currentTitle || 'voice over'}`,
                        metadata: { model: 'volcengine/video-to-video-lip-sync' },
                    })
                } catch (saveErr) {
                    console.error('Failed to save lipsynced video to gallery:', saveErr)
                    setGalleryWarning(
                        'Video generated, but it could not be saved to your gallery. Use the download link below.',
                    )
                }
            }
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Lipsync failed')
        } finally {
            setIsLipsyncing(false)
        }
    }

    return (
        <Dialog isOpen={!!media} onClose={handleClose} width={560} closable={!isLipsyncing}>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <HiOutlineMicrophone className="w-5 h-5 text-purple-500" />
                    <h5 className="font-semibold">Lipsync Video</h5>
                </div>

                {media && (
                    <video src={media.url} controls muted className="w-full max-h-64 rounded-lg object-contain bg-black" />
                )}

                {previewAudioUrl ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <HiOutlineVolumeUp className="w-4 h-4 text-purple-400 shrink-0" />
                        <span className="truncate">
                            Audio: {currentTitle || 'Voice Studio audio'} — the lips will be re-animated to match it.
                        </span>
                    </div>
                ) : (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                        <p className="text-sm text-amber-600 dark:text-amber-400 mb-2">
                            No audio yet — generate one in Voice Studio first (clone a voice, write a script, Generate Audio).
                        </p>
                        {onOpenVoiceStudio && (
                            <Button
                                size="sm"
                                variant="solid"
                                onClick={() => {
                                    handleClose()
                                    onOpenVoiceStudio()
                                }}
                            >
                                Open Voice Studio
                            </Button>
                        )}
                    </div>
                )}

                <Button
                    variant="solid"
                    color="purple"
                    block
                    loading={isLipsyncing}
                    disabled={!videoUrl || !previewAudioUrl || isLipsyncing}
                    onClick={handleLipsync}
                >
                    {isLipsyncing ? 'Syncing lips… (this can take a few minutes)' : 'Lipsync with this audio'}
                </Button>

                {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
                {galleryWarning && <p className="text-sm text-amber-500">{galleryWarning}</p>}

                {resultUrl && (
                    <div className="flex flex-col gap-2">
                        <video controls src={resultUrl} className="w-full rounded-lg" />
                        <a href={resultUrl} download className="text-sm text-primary underline text-center">
                            Download lipsynced video
                        </a>
                    </div>
                )}
            </div>
        </Dialog>
    )
}

export default LipsyncDialog
