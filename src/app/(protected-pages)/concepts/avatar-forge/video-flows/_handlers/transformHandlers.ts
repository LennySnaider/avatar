import type { VideoNodeHandler } from '../_engine/types'
import * as VideoStitchService from '@/services/VideoStitchService'

export const stitch: VideoNodeHandler = async (_node, inputs) => {
    const videoUrls = (inputs.videoUrls as string[]) ?? []
    const singleUrl = inputs.videoUrl as string
    const allUrls = singleUrl ? [...videoUrls, singleUrl] : videoUrls

    if (allUrls.length < 2) throw new Error('Need at least 2 videos to stitch')

    const stitchedVideoUrl = await VideoStitchService.stitchVideos(allUrls)

    return {
        output: { stitchedVideoUrl },
    }
}

export const textOverlay: VideoNodeHandler = async (node, inputs) => {
    const mediaUrl =
        (inputs.imageUrl as string) ??
        (inputs.videoUrl as string) ??
        ''
    if (!mediaUrl) throw new Error('No media for text overlay')

    return {
        output: {
            outputUrl: mediaUrl,
            overlayConfig: {
                text: node.data.config.text ?? '',
                position: node.data.config.position ?? 'bottom-center',
                fontSize: node.data.config.fontSize ?? 24,
                color: node.data.config.color ?? '#ffffff',
            },
        },
    }
}
