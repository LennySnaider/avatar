'use client'

import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Switcher from '@/components/ui/Switcher'
import type { ReelFrame } from '../_utils/reelFrameExtractor'
import type { ReelMode } from '../_utils/reelPromptAssembler'

interface ReelAnalysisPanelProps {
    frames: ReelFrame[]
    keyFrameIndex: number
    mode: ReelMode
    recipe: string
    onRecipeChange: (value: string) => void
    caption?: string
    /** True when a CDN video is available to pass as a motion reference. */
    hasVideo: boolean
    motionTransfer: boolean
    onMotionTransferChange: (value: boolean) => void
    onSend: () => void
    onReset: () => void
    isSending: boolean
}

const ReelAnalysisPanel = (props: ReelAnalysisPanelProps) => {
    const {
        frames,
        keyFrameIndex,
        mode,
        recipe,
        onRecipeChange,
        caption,
        hasVideo,
        motionTransfer,
        onMotionTransferChange,
        onSend,
        onReset,
        isSending,
    } = props

    return (
        <Card className="w-full">
            <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                    <h5>Extracted recipe</h5>
                    <span className="rounded-full bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary">
                        {mode === 'REEL' ? 'Video · full Reel' : 'Image · look'}
                    </span>
                </div>

                {/* Extracted frames */}
                <div className="flex flex-wrap gap-3">
                    {frames.map((frame, index) => (
                        <div
                            key={index}
                            className={`relative h-40 w-[90px] overflow-hidden rounded-lg border-2 ${
                                index === keyFrameIndex
                                    ? 'border-primary'
                                    : 'border-transparent'
                            }`}
                        >
                            <img
                                src={frame.dataUrl}
                                alt={`Reel frame ${index + 1}`}
                                className="h-full w-full object-cover"
                            />
                            {index === keyFrameIndex && (
                                <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                    Key frame
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                {caption && (
                    <p className="text-xs text-gray-500">
                        <span className="font-semibold">Caption:</span> {caption}
                    </p>
                )}

                {/* Editable recipe */}
                <div>
                    <label className="mb-1 block text-sm font-semibold">
                        Prompt (editable)
                    </label>
                    <Input
                        textArea
                        value={recipe}
                        onChange={(e) => onRecipeChange(e.target.value)}
                        rows={5}
                        placeholder="The extracted scene, style and motion…"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        This becomes the Clone Ref prompt in Avatar Studio. Tweak
                        it before sending if you want.
                    </p>
                </div>

                {/* Motion transfer — only meaningful for video with a CDN clip */}
                {mode === 'REEL' && hasVideo && (
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-600">
                        <div>
                            <p className="text-sm font-semibold">
                                Use Reel as motion reference
                            </p>
                            <p className="text-xs text-gray-500">
                                Pass the original clip to Kling for closer motion
                                transfer.
                            </p>
                        </div>
                        <Switcher
                            checked={motionTransfer}
                            onChange={(checked) => onMotionTransferChange(checked)}
                        />
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button onClick={onReset} disabled={isSending}>
                        Start over
                    </Button>
                    <Button
                        variant="solid"
                        loading={isSending}
                        disabled={isSending || !recipe.trim()}
                        onClick={onSend}
                    >
                        Send to Avatar Studio →
                    </Button>
                </div>
            </div>
        </Card>
    )
}

export default ReelAnalysisPanel
