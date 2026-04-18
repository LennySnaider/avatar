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

type OverlayPosition =
    | 'top-center'
    | 'center'
    | 'bottom-center'
    | 'bottom-left'
    | 'bottom-right'

export const textOverlay: VideoNodeHandler = async (node, inputs) => {
    const imageUrl = inputs.imageUrl as string | undefined
    const videoUrl = inputs.videoUrl as string | undefined
    const mediaUrl = imageUrl ?? videoUrl

    if (!mediaUrl) throw new Error('No media for text overlay')

    const text = (node.data.config.text as string) ?? ''
    const position = (node.data.config.position as OverlayPosition) ?? 'bottom-center'
    const fontSize = (node.data.config.fontSize as number) ?? 24
    const color = (node.data.config.color as string) ?? '#ffffff'

    // Images: render overlay client-side via canvas and return a data URL.
    // Videos: would require ffmpeg — not yet implemented, so we pass through
    // the URL with the overlay config so downstream nodes/UI can handle it.
    if (imageUrl && typeof window !== 'undefined') {
        try {
            const outputUrl = await renderTextOnImage({
                imageUrl,
                text,
                position,
                fontSize,
                color,
            })
            return { output: { outputUrl } }
        } catch (err) {
            console.warn('[text-overlay] canvas render failed, passing through:', err)
        }
    }

    return {
        output: {
            outputUrl: mediaUrl,
            overlayConfig: { text, position, fontSize, color },
        },
    }
}

async function renderTextOnImage(params: {
    imageUrl: string
    text: string
    position: OverlayPosition
    fontSize: number
    color: string
}): Promise<string> {
    const { imageUrl, text, position, fontSize, color } = params

    const img = await loadImage(imageUrl)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')

    ctx.drawImage(img, 0, 0)

    if (text) {
        const scaledFontSize = Math.round((fontSize * canvas.height) / 600)
        ctx.font = `bold ${scaledFontSize}px system-ui, -apple-system, sans-serif`
        ctx.fillStyle = color
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.lineWidth = Math.max(2, scaledFontSize / 12)
        ctx.textBaseline = 'middle'

        const { x, y, align } = getPositionCoords(position, canvas.width, canvas.height, scaledFontSize)
        ctx.textAlign = align
        ctx.strokeText(text, x, y)
        ctx.fillText(text, x, y)
    }

    return canvas.toDataURL('image/png')
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
        img.src = url
    })
}

function getPositionCoords(
    position: OverlayPosition,
    width: number,
    height: number,
    fontSize: number,
): { x: number; y: number; align: CanvasTextAlign } {
    const margin = fontSize
    switch (position) {
        case 'top-center':
            return { x: width / 2, y: margin * 1.5, align: 'center' }
        case 'center':
            return { x: width / 2, y: height / 2, align: 'center' }
        case 'bottom-left':
            return { x: margin, y: height - margin * 1.5, align: 'left' }
        case 'bottom-right':
            return { x: width - margin, y: height - margin * 1.5, align: 'right' }
        case 'bottom-center':
        default:
            return { x: width / 2, y: height - margin * 1.5, align: 'center' }
    }
}
