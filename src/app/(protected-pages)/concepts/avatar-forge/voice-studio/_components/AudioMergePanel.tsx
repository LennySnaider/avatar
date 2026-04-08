'use client'

import { useVoiceStudioStore } from '../_store/voiceStudioStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'

export default function AudioMergePanel() {
    const {
        selectedVideoUrl, setSelectedVideoUrl,
        previewAudioUrl,
        mergedVideoUrl, setMergedVideoUrl,
        isMerging, setIsMerging,
    } = useVoiceStudioStore()

    const handleMerge = async () => {
        if (!selectedVideoUrl || !previewAudioUrl) return

        setIsMerging(true)
        try {
            // Extract base64 from data URL
            const base64Match = previewAudioUrl.match(/base64,(.+)/)
            if (!base64Match) throw new Error('Invalid audio format')

            const res = await fetch('/api/audio/merge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoUrl: selectedVideoUrl,
                    audioBase64: base64Match[1],
                }),
            })

            if (!res.ok) throw new Error('Merge failed')
            const { publicUrl } = await res.json()
            setMergedVideoUrl(publicUrl)
        } catch (err) {
            console.error('Merge failed:', err)
        } finally {
            setIsMerging(false)
        }
    }

    return (
        <Card>
            <div className="p-4 flex flex-col gap-3">
                <h3 className="font-semibold text-lg">Merge Audio + Video</h3>

                <Input
                    placeholder="Paste video URL (from gallery or Supabase)"
                    value={selectedVideoUrl || ''}
                    onChange={(e) => setSelectedVideoUrl(e.target.value)}
                />

                <Button
                    onClick={handleMerge}
                    loading={isMerging}
                    disabled={!selectedVideoUrl || !previewAudioUrl || isMerging}
                    variant="solid"
                    block
                >
                    {isMerging ? 'Merging...' : 'Merge Audio + Video'}
                </Button>

                {mergedVideoUrl && (
                    <div className="flex flex-col gap-2">
                        <video
                            controls
                            src={mergedVideoUrl}
                            className="w-full rounded-lg"
                        />
                        <a
                            href={mergedVideoUrl}
                            download
                            className="text-sm text-primary underline text-center"
                        >
                            Download merged video
                        </a>
                    </div>
                )}
            </div>
        </Card>
    )
}
