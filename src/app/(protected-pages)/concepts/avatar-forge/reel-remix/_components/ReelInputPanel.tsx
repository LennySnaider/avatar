'use client'

import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Segment from '@/components/ui/Segment'
import Upload from '@/components/ui/Upload'
import Alert from '@/components/ui/Alert'
import Spinner from '@/components/ui/Spinner'
import type { ReelMode } from '../_utils/reelPromptAssembler'

interface ReelInputPanelProps {
    url: string
    onUrlChange: (value: string) => void
    mode: ReelMode
    onModeChange: (mode: ReelMode) => void
    onExtract: () => void
    onUpload: (file: File) => void
    isBusy: boolean
    busyLabel: string
    needsUpload: boolean
    uploadReason?: string
    error?: string | null
}

const MODE_HINT: Record<ReelMode, string> = {
    LOOK: 'Recreate the look as a still image — outfit, scene and lighting from one key frame.',
    REEL: 'Recreate the full Reel as a video — also captures motion, transitions and pacing.',
}

const ReelInputPanel = (props: ReelInputPanelProps) => {
    const {
        url,
        onUrlChange,
        mode,
        onModeChange,
        onExtract,
        onUpload,
        isBusy,
        busyLabel,
        needsUpload,
        uploadReason,
        error,
    } = props

    const handleBeforeUpload = (files: FileList | null) => {
        if (!files || files.length === 0) return false
        const file = files[0]
        if (!file.type.startsWith('video/')) {
            return 'Please upload a video file (.mp4, .mov, .webm)'
        }
        // Keep the browser blob load reasonable — Reels are short clips.
        if (file.size > 100 * 1024 * 1024) {
            return 'Video is too large (max 100MB)'
        }
        return true
    }

    return (
        <Card className="w-full">
            <div className="flex flex-col gap-4">
                <div>
                    <h5 className="mb-1">Source Reel</h5>
                    <p className="text-sm text-gray-500">
                        Paste a public Instagram Reel link, or upload the video
                        file if Instagram blocks the link.
                    </p>
                </div>

                {/* Mode toggle */}
                <div>
                    <Segment
                        value={mode}
                        onChange={(value) => onModeChange(value as ReelMode)}
                    >
                        <Segment.Item value="LOOK">Recreate look</Segment.Item>
                        <Segment.Item value="REEL">
                            Recreate full Reel
                        </Segment.Item>
                    </Segment>
                    <p className="mt-2 text-xs text-gray-500">
                        {MODE_HINT[mode]}
                    </p>
                </div>

                {/* URL + extract */}
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                        placeholder="https://www.instagram.com/reel/..."
                        disabled={isBusy}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isBusy) onExtract()
                        }}
                    />
                    <Button
                        variant="solid"
                        loading={isBusy}
                        disabled={isBusy || !url.trim()}
                        onClick={onExtract}
                        className="shrink-0"
                    >
                        {isBusy ? busyLabel : 'Extract Reel'}
                    </Button>
                </div>

                {error && (
                    <Alert type="danger" showIcon>
                        {error}
                    </Alert>
                )}

                {/* Fallback upload — shown when the link can't be resolved */}
                {needsUpload && (
                    <div className="flex flex-col gap-2">
                        <Alert type="warning" showIcon>
                            {uploadReason ||
                                'Could not fetch the Reel automatically. Upload the video file instead.'}
                        </Alert>
                        <Upload
                            draggable
                            accept="video/*"
                            showList={false}
                            beforeUpload={handleBeforeUpload}
                            onChange={(files) => {
                                if (files[0]) onUpload(files[0])
                            }}
                            disabled={isBusy}
                        >
                            <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                                {isBusy ? (
                                    <Spinner size={32} />
                                ) : (
                                    <span className="text-4xl">🎬</span>
                                )}
                                <p className="font-semibold">
                                    {isBusy
                                        ? busyLabel
                                        : 'Drop the Reel video here or click to browse'}
                                </p>
                                <p className="text-xs text-gray-500">
                                    MP4, MOV or WEBM · up to 100MB
                                </p>
                            </div>
                        </Upload>
                    </div>
                )}
            </div>
        </Card>
    )
}

export default ReelInputPanel
