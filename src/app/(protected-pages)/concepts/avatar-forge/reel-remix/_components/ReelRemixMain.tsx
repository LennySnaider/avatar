'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    analyzeImageForClone,
    analyzePoseFromImage,
    analyzeReelMotion,
} from '@/services/GeminiService'
import ReelInputPanel from './ReelInputPanel'
import ReelAnalysisPanel from './ReelAnalysisPanel'
import { extractFrames, type ReelFrame } from '../_utils/reelFrameExtractor'
import {
    assembleReelRecipe,
    recipeToStudioPrompt,
    type ReelMode,
} from '../_utils/reelPromptAssembler'
import { useAvatarStudioStore } from '../../avatar-studio/_store/avatarStudioStore'
import type { ReferenceImage } from '../../avatar-studio/types'

type Status = 'idle' | 'extracting' | 'analyzing' | 'sending'

interface ExtractResponse {
    videoUrl?: string
    thumbnailUrl?: string
    thumbnailBase64?: string
    thumbnailMimeType?: string
    caption?: string
    needsUpload: boolean
    reason?: string
    error?: string
}

const AVATAR_STUDIO_PATH = '/concepts/avatar-forge/avatar-studio'

const ReelRemixMain = () => {
    const router = useRouter()

    const [mode, setMode] = useState<ReelMode>('LOOK')
    const [url, setUrl] = useState('')
    const [status, setStatus] = useState<Status>('idle')
    const [error, setError] = useState<string | null>(null)
    const [needsUpload, setNeedsUpload] = useState(false)
    const [uploadReason, setUploadReason] = useState<string | undefined>()

    // Result of a successful extraction + analysis
    const [frames, setFrames] = useState<ReelFrame[]>([])
    const [sceneDescription, setSceneDescription] = useState('')
    const [recipe, setRecipe] = useState('')
    const [caption, setCaption] = useState<string | undefined>()
    const [videoUrlForMotion, setVideoUrlForMotion] = useState<string | undefined>()
    const [motionTransfer, setMotionTransfer] = useState(true)

    const busy = status === 'extracting' || status === 'analyzing'
    const busyLabel =
        status === 'extracting'
            ? 'Fetching Reel…'
            : status === 'analyzing'
              ? 'Analyzing…'
              : ''
    const hasResult = frames.length > 0
    const keyFrameIndex = hasResult ? Math.floor(frames.length / 2) : 0

    const notifyError = (title: string, message: string) => {
        toast.push(
            <Notification type="danger" title={title}>
                {message}
            </Notification>,
        )
    }

    const clearResult = () => {
        setFrames([])
        setSceneDescription('')
        setRecipe('')
        setCaption(undefined)
        setVideoUrlForMotion(undefined)
    }

    const resetAll = () => {
        clearResult()
        setError(null)
        setNeedsUpload(false)
        setUploadReason(undefined)
        setStatus('idle')
    }

    const handleModeChange = (next: ReelMode) => {
        setMode(next)
        // A result is mode-specific; drop it so the user re-extracts for the
        // new mode rather than seeing a stale recipe.
        if (hasResult) clearResult()
        setNeedsUpload(false)
        setUploadReason(undefined)
    }

    /** Run Gemini analyses on the captured frames and assemble the recipe. */
    const analyzeAndFinish = async (
        captured: ReelFrame[],
        useMode: ReelMode,
    ) => {
        if (!captured.length) {
            throw new Error('No frames were captured from the Reel')
        }
        setStatus('analyzing')
        const keyFrame = captured[Math.floor(captured.length / 2)]
        const keyImage = { base64: keyFrame.base64, mimeType: keyFrame.mimeType }

        // Scene is required; pose + motion are best-effort so a single failure
        // doesn't sink the whole extraction.
        const scene = await analyzeImageForClone(keyImage)
        const [poseRes, motionRes] = await Promise.allSettled([
            analyzePoseFromImage(keyImage),
            useMode === 'REEL' && captured.length > 1
                ? analyzeReelMotion(
                      captured.map((f) => ({
                          base64: f.base64,
                          mimeType: f.mimeType,
                      })),
                  )
                : Promise.resolve(undefined),
        ])

        const pose = poseRes.status === 'fulfilled' ? poseRes.value : undefined
        const motion =
            motionRes.status === 'fulfilled' ? motionRes.value : undefined

        const assembled = assembleReelRecipe(
            {
                sceneDescription: scene,
                poseDescription: pose,
                motionDescription: motion ?? undefined,
            },
            useMode,
        )

        setSceneDescription(scene)
        setRecipe(assembled)
        setFrames(captured)
        setStatus('idle')
    }

    const handleExtract = async () => {
        setError(null)
        setNeedsUpload(false)
        setUploadReason(undefined)
        clearResult()
        setStatus('extracting')

        try {
            const res = await fetch('/api/instagram/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            })
            const data = (await res.json()) as ExtractResponse

            if (!res.ok) {
                setError(data?.error || 'Could not extract this Reel')
                setStatus('idle')
                return
            }

            if (data.needsUpload) {
                setNeedsUpload(true)
                setUploadReason(data.reason)
                setStatus('idle')
                return
            }

            const canUseThumb = mode === 'LOOK' && Boolean(data.thumbnailBase64)
            const canUseVideo = Boolean(data.videoUrl)

            // REEL needs actual video to read motion; a cover frame isn't enough.
            if (mode === 'REEL' && !canUseVideo) {
                setNeedsUpload(true)
                setUploadReason(
                    'To recreate the motion I need the video. Upload the .mp4 or switch to "Recreate look".',
                )
                setStatus('idle')
                return
            }

            if (!canUseThumb && !canUseVideo) {
                setNeedsUpload(true)
                setUploadReason(
                    data.reason ||
                        'Could not load media from this Reel. Upload the file instead.',
                )
                setStatus('idle')
                return
            }

            let captured: ReelFrame[]
            if (canUseThumb && data.thumbnailBase64) {
                // Cover frame already fetched server-side — skip canvas entirely.
                const mime = data.thumbnailMimeType || 'image/jpeg'
                captured = [
                    {
                        base64: data.thumbnailBase64,
                        mimeType: mime,
                        dataUrl: `data:${mime};base64,${data.thumbnailBase64}`,
                    },
                ]
            } else {
                const count = mode === 'REEL' ? 3 : 1
                captured = await extractFrames({ videoUrl: data.videoUrl }, count)
            }

            setCaption(data.caption)
            setVideoUrlForMotion(data.videoUrl)
            await analyzeAndFinish(captured, mode)
        } catch (e) {
            const message =
                e instanceof Error ? e.message : 'Reel extraction failed'
            setError(message)
            setStatus('idle')
        }
    }

    const handleUpload = async (file: File) => {
        setError(null)
        setStatus('extracting')
        try {
            const count = mode === 'REEL' ? 3 : 1
            const captured = await extractFrames({ file }, count)
            setNeedsUpload(false)
            setUploadReason(undefined)
            setCaption(undefined)
            // An uploaded file has no CDN URL, so motion-transfer-by-URL is off;
            // the motion description in the prompt still drives the video model.
            setVideoUrlForMotion(undefined)
            await analyzeAndFinish(captured, mode)
        } catch (e) {
            const message =
                e instanceof Error ? e.message : 'Could not read the video'
            setError(message)
            setStatus('idle')
        }
    }

    const handleSend = () => {
        if (!hasResult) return
        setStatus('sending')
        try {
            const store = useAvatarStudioStore.getState()
            const keyFrame = frames[keyFrameIndex]

            const cloneRef: ReferenceImage = {
                id: crypto.randomUUID(),
                url: keyFrame.dataUrl,
                mimeType: keyFrame.mimeType,
                base64: keyFrame.base64,
                type: 'general',
            }

            // Reuse the studio's Clone Ref pipeline exactly as a manual upload
            // would: clone image + clone description + a [CLONE: …] prompt.
            store.setCloneImage(cloneRef)
            store.setCloneDescription(sceneDescription)
            store.setPrompt(recipeToStudioPrompt(recipe))
            store.setGenerationMode(mode === 'REEL' ? 'VIDEO' : 'IMAGE')

            if (mode === 'REEL' && motionTransfer && videoUrlForMotion) {
                store.setKlingMotionControlEnabled(true)
                store.setKlingMotionVideoUrl(videoUrlForMotion)
            }

            toast.push(
                <Notification type="success" title="Sent to Avatar Studio">
                    Your Reel recipe is loaded. Pick an avatar and generate.
                </Notification>,
            )
            router.push(AVATAR_STUDIO_PATH)
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Could not send'
            setStatus('idle')
            notifyError('Could not send to Avatar Studio', message)
        }
    }

    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-5 py-2">
            <div>
                <h3 className="mb-1">Reel Remix</h3>
                <p className="text-gray-500">
                    Turn a viral Instagram Reel into a prompt your avatar can
                    recreate. Extract the scene, style and motion, then send it
                    straight to Avatar Studio.
                </p>
            </div>

            {hasResult ? (
                <ReelAnalysisPanel
                    frames={frames}
                    keyFrameIndex={keyFrameIndex}
                    mode={mode}
                    recipe={recipe}
                    onRecipeChange={setRecipe}
                    caption={caption}
                    hasVideo={Boolean(videoUrlForMotion)}
                    motionTransfer={motionTransfer}
                    onMotionTransferChange={setMotionTransfer}
                    onSend={handleSend}
                    onReset={resetAll}
                    isSending={status === 'sending'}
                />
            ) : (
                <ReelInputPanel
                    url={url}
                    onUrlChange={setUrl}
                    mode={mode}
                    onModeChange={handleModeChange}
                    onExtract={handleExtract}
                    onUpload={handleUpload}
                    isBusy={busy}
                    busyLabel={busyLabel}
                    needsUpload={needsUpload}
                    uploadReason={uploadReason}
                    error={error}
                />
            )}
        </div>
    )
}

export default ReelRemixMain
