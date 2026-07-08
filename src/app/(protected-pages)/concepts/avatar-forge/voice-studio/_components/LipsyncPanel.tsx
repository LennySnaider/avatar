'use client'

import { useCallback, useEffect, useState } from 'react'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import { apiGetGenerations, getStorageUrl, apiSaveGeneration } from '@/services/AvatarForgeService'
import { submitLipsyncVideoKieTask, checkKieVideoTask } from '@/services/KieService'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { HiOutlineRefresh } from 'react-icons/hi'

interface LipsyncPanelProps {
    userId: string
}

interface GalleryVideo {
    id: string
    url: string
    prompt: string
}

/**
 * Lipsync real (Volcengine via KIE): elige un video de tu galería + el audio
 * generado con tu voz clonada, y re-sincroniza los labios al audio.
 * Sustituye al viejo "Merge Audio + Video" (mux ffmpeg sin lipsync).
 */
export default function LipsyncPanel({ userId }: LipsyncPanelProps) {
    const {
        previewAudioUrl,
        selectedVideoUrl, setSelectedVideoUrl,
        lipsyncedVideoUrl, setLipsyncedVideoUrl,
        isLipsyncing, setIsLipsyncing,
        currentTitle,
    } = useVoiceStudioStore()

    const [videos, setVideos] = useState<GalleryVideo[]>([])
    const [loadingVideos, setLoadingVideos] = useState(true)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [galleryWarning, setGalleryWarning] = useState<string | null>(null)

    const loadVideos = useCallback(async () => {
        setLoadingVideos(true)
        try {
            const generations = await apiGetGenerations(userId, {
                mediaType: 'VIDEO',
                limit: 24,
            })
            const resolved = await Promise.all(
                generations.map(async (g) => ({
                    id: g.id,
                    prompt: g.prompt,
                    url: g.storage_path.startsWith('http')
                        ? g.storage_path
                        : await getStorageUrl('generations', g.storage_path),
                })),
            )
            setVideos(resolved)
            setErrorMsg(null)
        } catch (err) {
            console.error('Failed to load gallery videos:', err)
            setErrorMsg('Could not load your gallery videos')
        } finally {
            setLoadingVideos(false)
        }
    }, [userId])

    useEffect(() => {
        loadVideos()
    }, [loadVideos])

    const handleLipsync = async () => {
        if (!selectedVideoUrl || !previewAudioUrl) return
        setIsLipsyncing(true)
        setErrorMsg(null)
        setGalleryWarning(null)
        try {
            // Submit async + poll desde el navegador: los jobs de lipsync pueden
            // tardar >10 min y un server action con poll síncrono los abandonaría.
            const sub = await submitLipsyncVideoKieTask({
                videoUrl: selectedVideoUrl,
                audioUrl: previewAudioUrl,
            })
            if (!sub.success) {
                throw new Error(sub.error)
            }
            const deadlineMs = Date.now() + 30 * 60 * 1000
            let resultUrl: string | null = null
            while (Date.now() < deadlineMs) {
                await new Promise((r) => setTimeout(r, 5000))
                const st = await checkKieVideoTask(sub.taskId)
                if (st.status === 'done') {
                    resultUrl = st.url
                    break
                }
                if (st.status === 'failed') {
                    throw new Error(st.error)
                }
            }
            if (!resultUrl) {
                throw new Error(`Lipsync timed out (>30 min). Job ${sub.taskId} may still be running on kie.ai/logs.`)
            }
            const result = { url: resultUrl }
            setLipsyncedVideoUrl(result.url)

            // Registrar el resultado en la galería (el mp4 ya quedó en el
            // bucket generations vía persistToSupabase — guardamos el path).
            // Un fallo aquí NO es un fallo del lipsync: el video ya se generó
            // y se muestra abajo — solo avisamos que no quedó en la galería.
            try {
                const storagePath = result.url.split('/object/public/generations/')[1] ?? result.url
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
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Lipsync failed'
            console.error('Lipsync failed:', err)
            setErrorMsg(message)
        } finally {
            setIsLipsyncing(false)
        }
    }

    return (
        <Card>
            <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">Lipsync Video</h3>
                    <Button
                        size="xs"
                        variant="plain"
                        loading={loadingVideos}
                        icon={<HiOutlineRefresh />}
                        onClick={loadVideos}
                        title="Reload the latest videos from your gallery"
                    >
                        Sync gallery
                    </Button>
                </div>
                <p className="text-sm text-gray-500">
                    Pick a video from your gallery — the lips will be re-animated to
                    match your generated audio.
                </p>

                {!previewAudioUrl && (
                    <p className="text-sm text-amber-500">Generate audio first (Audio Preview).</p>
                )}

                {loadingVideos && <p className="text-sm text-gray-500">Loading your videos…</p>}
                {!loadingVideos && videos.length === 0 && (
                    <p className="text-sm text-gray-500">
                        No videos in your gallery yet. Generate one in Avatar Studio.
                    </p>
                )}

                {videos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2 max-h-80 overflow-y-auto">
                        {videos.map((video) => (
                            <button
                                key={video.id}
                                type="button"
                                title={video.prompt}
                                onClick={() => setSelectedVideoUrl(video.url)}
                                className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                                    selectedVideoUrl === video.url
                                        ? 'border-primary'
                                        : 'border-transparent hover:border-gray-300'
                                }`}
                            >
                                <video src={video.url} muted playsInline preload="metadata" className="w-full h-28 object-cover" />
                            </button>
                        ))}
                    </div>
                )}

                <Button
                    onClick={handleLipsync}
                    loading={isLipsyncing}
                    disabled={!selectedVideoUrl || !previewAudioUrl || isLipsyncing}
                    variant="solid"
                    block
                >
                    {isLipsyncing ? 'Syncing lips… (this can take a few minutes)' : 'Lipsync Video'}
                </Button>

                {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}

                {galleryWarning && <p className="text-sm text-amber-500">{galleryWarning}</p>}

                {lipsyncedVideoUrl && (
                    <div className="flex flex-col gap-2">
                        <video controls src={lipsyncedVideoUrl} className="w-full rounded-lg" />
                        <a
                            href={lipsyncedVideoUrl}
                            download
                            className="text-sm text-primary underline text-center"
                        >
                            Download lipsynced video
                        </a>
                    </div>
                )}
            </div>
        </Card>
    )
}
