'use client'

import { useEffect, useState } from 'react'
import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import { apiGetGenerations, getStorageUrl, apiSaveGeneration } from '@/services/AvatarForgeService'
import { lipsyncVideoKieSafe } from '@/services/KieService'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

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

    useEffect(() => {
        async function loadVideos() {
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
            } catch (err) {
                console.error('Failed to load gallery videos:', err)
                setErrorMsg('Could not load your gallery videos')
            } finally {
                setLoadingVideos(false)
            }
        }
        loadVideos()
    }, [userId])

    const handleLipsync = async () => {
        if (!selectedVideoUrl || !previewAudioUrl) return
        setIsLipsyncing(true)
        setErrorMsg(null)
        try {
            const result = await lipsyncVideoKieSafe({
                videoUrl: selectedVideoUrl,
                audioUrl: previewAudioUrl,
            })
            if (!result.success || !result.url) {
                throw new Error(result.error || 'Lipsync failed')
            }
            setLipsyncedVideoUrl(result.url)

            // Registrar el resultado en la galería (el mp4 ya quedó en el
            // bucket generations vía persistToSupabase — guardamos el path).
            const storagePath = result.url.split('/object/public/generations/')[1] ?? result.url
            await apiSaveGeneration({
                user_id: userId,
                avatar_id: null,
                media_type: 'VIDEO',
                storage_path: storagePath,
                prompt: `Lipsync: ${currentTitle || 'voice over'}`,
                metadata: { model: 'volcengine/video-to-video-lip-sync' },
            })
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
                <h3 className="font-semibold text-lg">Lipsync Video</h3>
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
                    <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
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
                                <video src={video.url} muted playsInline preload="metadata" className="w-full h-20 object-cover" />
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
