'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Slider from '@/components/ui/Slider'
import ContinueVideoDialog from './ContinueVideoDialog'
import ExtractFrameDialog from './ExtractFrameDialog'
import {
    HiOutlineDownload,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineFilm,
    HiOutlinePencil,
    HiOutlineDuplicate,
    HiOutlineTrash,
    HiOutlineSave,
    HiOutlinePlay,
    HiOutlinePause,
    HiOutlineRefresh,
    HiOutlineZoomIn,
    HiOutlineZoomOut,
    HiOutlineClipboardCopy,
    HiOutlineUser,
    HiOutlineCode,
    HiOutlinePhotograph,
    HiOutlineX,
    HiOutlineCamera,
    HiOutlineRewind,
    HiOutlineFastForward,
    HiOutlineChevronDoubleLeft,
    HiOutlineChevronDoubleRight,
} from 'react-icons/hi'
import { HiOutlineArrowUturnLeft, HiOutlineArrowUturnRight } from 'react-icons/hi2'
import Tooltip from '@/components/ui/Tooltip'
import type { GeneratedMedia } from '../types'
import type { AspectRatio } from '@/@types/supabase'

// Edit asset for reference during editing
interface EditAsset {
    id: string
    url: string
    base64: string
    mimeType: string
}

interface ImagePreviewModalProps {
    onEdit?: (media: GeneratedMedia, editPrompt: string, maskBase64: string | null, aspectRatio: AspectRatio, editAssets: EditAsset[], editProviderId?: string) => Promise<void>
    onAnimate?: (media: GeneratedMedia) => void
    onVariant?: (media: GeneratedMedia) => void
    onSave?: (media: GeneratedMedia) => Promise<void>
    onContinueVideo?: (frameBase64: string, promptSuggestion: string, dialogue: string, aspectRatio: AspectRatio) => void
    onReuse?: (media: GeneratedMedia) => void
}

const ImagePreviewModal = ({
    onEdit,
    onAnimate,
    onVariant,
    onSave,
    onContinueVideo,
    onReuse,
}: ImagePreviewModalProps) => {
    const { gallery, previewMedia, setPreviewMedia, removeFromGallery, addToGallery, videoDialogue, providers, activeProviderId } = useAvatarStudioStore()

    // Image-supporting providers available for editing override
    const imageProviders = providers.filter(p => p.supports_image)

    const [isEditing, setIsEditing] = useState(false)
    const [editPrompt, setEditPrompt] = useState('')
    const [isDrawingMask, setIsDrawingMask] = useState(false)
    const [maskCanvas, setMaskCanvas] = useState<string | null>(null)
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const [videoCurrentTime, setVideoCurrentTime] = useState(0)
    const [videoDuration, setVideoDuration] = useState(0)
    const [brushSize, setBrushSize] = useState(30)
    const [editAspectRatio, setEditAspectRatio] = useState<AspectRatio>('1:1')
    const [editProviderId, setEditProviderId] = useState<string | null>(null)
    const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 })
    const [cropScale, setCropScale] = useState(100) // Percentage 30-100
    const [isDraggingCrop, setIsDraggingCrop] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [zoomLevel, setZoomLevel] = useState(1)
    const [panPosition, setPanPosition] = useState({ x: 0, y: 0 })
    const [isPanning, setIsPanning] = useState(false)
    const [panStart, setPanStart] = useState({ x: 0, y: 0 })
    const [isPromptExpanded, setIsPromptExpanded] = useState(false)
    const [showApiPrompt, setShowApiPrompt] = useState(false)
    const [editAssets, setEditAssets] = useState<EditAsset[]>([])
    const [showContinueDialog, setShowContinueDialog] = useState(false)
    const [showFrameExtractor, setShowFrameExtractor] = useState(false)
    const [capturedFrame, setCapturedFrame] = useState<string | null>(null)

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const editAssetInputRef = useRef<HTMLInputElement>(null)
    const imageRef = useRef<HTMLImageElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const mediaContainerRef = useRef<HTMLDivElement>(null)
    const isDrawingRef = useRef(false)
    const lastPosRef = useRef({ x: 0, y: 0 })
    const [canvasSize, setCanvasSize] = useState({ width: 500, height: 500 })

    // Brush cursor preview — follows the mouse so the user sees the brush radius.
    const [cursorPreview, setCursorPreview] = useState<{ x: number; y: number } | null>(null)

    // Undo/redo history for the mask canvas. ImageData snapshots are kept in a
    // ref (heavy, no re-render needed); the index lives in state so the
    // disabled state of the buttons re-renders correctly.
    const historyRef = useRef<ImageData[]>([])
    const [historyIndex, setHistoryIndex] = useState(-1)
    const canUndo = historyIndex > 0
    const canRedo = historyIndex >= 0 && historyIndex < historyRef.current.length - 1

    const currentIndex = previewMedia
        ? gallery.findIndex((m) => m.id === previewMedia.id)
        : -1

    const hasNext = currentIndex < gallery.length - 1
    const hasPrev = currentIndex > 0

    const handleNext = useCallback(() => {
        if (hasNext) {
            setPreviewMedia(gallery[currentIndex + 1])
        }
    }, [hasNext, currentIndex, gallery, setPreviewMedia])

    const handlePrev = useCallback(() => {
        if (hasPrev) {
            setPreviewMedia(gallery[currentIndex - 1])
        }
    }, [hasPrev, currentIndex, gallery, setPreviewMedia])

    const handleClose = useCallback(() => {
        setPreviewMedia(null)
        setIsEditing(false)
        setEditPrompt('')
        setMaskCanvas(null)
        setIsDrawingMask(false)
        setZoomLevel(1)
        setPanPosition({ x: 0, y: 0 })
        setEditAssets([])
    }, [setPreviewMedia])

    // Handle edit asset upload
    const handleEditAssetUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        Array.from(files).forEach((file) => {
            if (editAssets.length >= 3) return // Max 3 assets

            const reader = new FileReader()
            reader.onload = (event) => {
                const result = event.target?.result as string
                const matches = result.match(/^data:(.+);base64,(.+)$/)
                if (matches) {
                    setEditAssets((prev) => {
                        if (prev.length >= 3) return prev
                        return [...prev, {
                            id: crypto.randomUUID(),
                            url: result,
                            base64: matches[2],
                            mimeType: matches[1],
                        }]
                    })
                }
            }
            reader.readAsDataURL(file)
        })

        e.target.value = ''
    }, [editAssets.length])

    // Remove edit asset
    const removeEditAsset = useCallback((id: string) => {
        setEditAssets((prev) => prev.filter((a) => a.id !== id))
    }, [])

    // Zoom handlers
    const handleZoomIn = useCallback(() => {
        setZoomLevel(prev => Math.min(prev + 0.25, 3))
    }, [])

    const handleZoomOut = useCallback(() => {
        setZoomLevel(prev => {
            const newZoom = Math.max(prev - 0.25, 1)
            if (newZoom === 1) setPanPosition({ x: 0, y: 0 })
            return newZoom
        })
    }, [])

    const handleResetZoom = useCallback(() => {
        setZoomLevel(1)
        setPanPosition({ x: 0, y: 0 })
    }, [])

    // Mouse wheel zoom — use native listener with { passive: false }
    // so preventDefault() works (React's onWheel is passive by default in modern browsers)
    useEffect(() => {
        const el = mediaContainerRef.current
        if (!el) return
        const onWheel = (e: WheelEvent) => {
            if (isEditing) return
            e.preventDefault()
            if (e.deltaY < 0) {
                handleZoomIn()
            } else {
                handleZoomOut()
            }
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [isEditing, handleZoomIn, handleZoomOut, previewMedia])

    // Pan handlers for zoomed image
    const handlePanStart = useCallback((e: React.MouseEvent) => {
        if (zoomLevel <= 1 || isEditing) return
        e.preventDefault()
        setIsPanning(true)
        setPanStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y })
    }, [zoomLevel, isEditing, panPosition])

    const handlePanMove = useCallback((e: MouseEvent) => {
        if (!isPanning) return
        const maxPan = (zoomLevel - 1) * 200
        const newX = Math.max(-maxPan, Math.min(e.clientX - panStart.x, maxPan))
        const newY = Math.max(-maxPan, Math.min(e.clientY - panStart.y, maxPan))
        setPanPosition({ x: newX, y: newY })
    }, [isPanning, panStart, zoomLevel])

    const handlePanEnd = useCallback(() => {
        setIsPanning(false)
    }, [])

    useEffect(() => {
        if (isPanning) {
            window.addEventListener('mousemove', handlePanMove)
            window.addEventListener('mouseup', handlePanEnd)
            return () => {
                window.removeEventListener('mousemove', handlePanMove)
                window.removeEventListener('mouseup', handlePanEnd)
            }
        }
    }, [isPanning, handlePanMove, handlePanEnd])

    const handleDownload = async () => {
        if (!previewMedia) return
        try {
            // For external URLs (like Kling), fetch and download as blob
            const response = await fetch(previewMedia.url)
            const blob = await response.blob()
            const blobUrl = window.URL.createObjectURL(blob)

            const link = document.createElement('a')
            link.href = blobUrl
            link.download = `avatar-${previewMedia.mediaType.toLowerCase()}-${Date.now()}.${
                previewMedia.mediaType === 'VIDEO' ? 'mp4' : 'jpg'
            }`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)

            // Clean up blob URL
            window.URL.revokeObjectURL(blobUrl)
        } catch (error) {
            console.error('Download failed:', error)
            // Fallback: open in new tab
            window.open(previewMedia.url, '_blank')
        }
    }

    const handleDelete = () => {
        if (!previewMedia) return
        removeFromGallery(previewMedia.id)
        handleClose()
    }

    const handleStartEdit = () => {
        setIsEditing(true)
        setEditPrompt('')
        setMaskCanvas(null)
    }

    const handleSubmitEdit = async () => {
        if (!previewMedia) return

        const hasEditInstruction = editPrompt.trim().length > 0
        const hasCrop = cropScale < 100

        if (!hasEditInstruction && !hasCrop) return // Need at least one

        setIsSubmittingEdit(true)

        try {
            if (hasEditInstruction) {
                // AI Edit - send to backend with reference assets
                if (!onEdit) return
                await onEdit(previewMedia, editPrompt, maskCanvas, editAspectRatio, editAssets, editProviderId ?? activeProviderId ?? undefined)
                handleClose()
            } else {
                // Local Crop - process in browser
                await performLocalCrop()
            }
        } finally {
            setIsSubmittingEdit(false)
        }
    }

    // Perform crop locally without AI
    const performLocalCrop = async () => {
        if (!previewMedia || !imageRef.current) return

        const crop = getCropDimensions()
        if (!crop) return

        // Get the actual image dimensions
        const img = new Image()
        img.crossOrigin = 'anonymous'

        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = reject
            img.src = previewMedia.url
        })

        // Calculate the ratio between displayed size and actual image size
        const displayedWidth = imageRef.current.clientWidth
        const displayedHeight = imageRef.current.clientHeight
        const scaleX = img.naturalWidth / displayedWidth
        const scaleY = img.naturalHeight / displayedHeight

        // Convert displayed crop coordinates to actual image coordinates
        const actualCropX = crop.x * scaleX
        const actualCropY = crop.y * scaleY
        const actualCropWidth = crop.width * scaleX
        const actualCropHeight = crop.height * scaleY

        // Create canvas and draw cropped region
        const canvas = document.createElement('canvas')
        canvas.width = actualCropWidth
        canvas.height = actualCropHeight
        const ctx = canvas.getContext('2d')

        if (!ctx) return

        ctx.drawImage(
            img,
            actualCropX, actualCropY, actualCropWidth, actualCropHeight,
            0, 0, actualCropWidth, actualCropHeight
        )

        // Convert to data URL
        const croppedUrl = canvas.toDataURL('image/jpeg', 0.95)

        // Add cropped image to gallery
        const croppedMedia: GeneratedMedia = {
            id: `crop-${Date.now()}`,
            url: croppedUrl,
            prompt: `Cropped: ${previewMedia.prompt}`,
            aspectRatio: editAspectRatio,
            timestamp: Date.now(),
            mediaType: 'IMAGE',
        }

        addToGallery(croppedMedia)
        setPreviewMedia(croppedMedia)
        setIsEditing(false)
        setEditPrompt('')
        setCropScale(100)
        setCropPosition({ x: 0, y: 0 })
    }

    const handleToggleMask = () => {
        setIsDrawingMask(!isDrawingMask)
        if (!isDrawingMask && canvasRef.current) {
            // Clear canvas when starting mask mode
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
            }
            setMaskCanvas(null)
        }
        // Reset history on every toggle — the empty initial state will be
        // captured on the first stroke.
        historyRef.current = []
        setHistoryIndex(-1)
        setCursorPreview(null)
    }

    // Update canvas size to match displayed image dimensions
    const updateCanvasSize = useCallback(() => {
        if (imageRef.current) {
            const rect = imageRef.current.getBoundingClientRect()
            setCanvasSize({ width: rect.width, height: rect.height })
        }
    }, [])

    // Update canvas size when image loads or editing starts
    useEffect(() => {
        if (isEditing && imageRef.current) {
            // Small delay to ensure image is fully rendered
            const timer = setTimeout(() => {
                updateCanvasSize()
            }, 50)
            // Also listen for resize
            window.addEventListener('resize', updateCanvasSize)
            return () => {
                clearTimeout(timer)
                window.removeEventListener('resize', updateCanvasSize)
            }
        }
    }, [isEditing, updateCanvasSize])

    // Get coordinates for canvas drawing (1:1 since canvas matches display size)
    const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return { x: 0, y: 0 }
        const rect = canvasRef.current.getBoundingClientRect()
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        }
    }

    // Canvas drawing handlers
    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawingMask || !canvasRef.current) return
        isDrawingRef.current = true
        lastPosRef.current = getCanvasCoordinates(e)

        // Snapshot the empty canvas as the first history entry so the user can
        // undo all the way back to a blank mask.
        if (historyRef.current.length === 0) {
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) {
                const empty = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)
                historyRef.current = [empty]
                setHistoryIndex(0)
            }
        }
    }

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return
        const coords = getCanvasCoordinates(e)
        setCursorPreview(coords)

        if (!isDrawingRef.current || !isDrawingMask) return

        const ctx = canvasRef.current.getContext('2d')
        if (!ctx) return

        // Paint at full alpha; CSS opacity on the canvas element provides the
        // see-through effect, while the exported mask data stays clean.
        ctx.beginPath()
        ctx.strokeStyle = 'rgb(138, 43, 226)'
        ctx.fillStyle = 'rgb(138, 43, 226)'
        ctx.lineWidth = brushSize
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
        ctx.lineTo(coords.x, coords.y)
        ctx.stroke()

        lastPosRef.current = coords
    }

    const stopDrawing = () => {
        if (isDrawingRef.current && canvasRef.current) {
            isDrawingRef.current = false
            const canvas = canvasRef.current
            setMaskCanvas(canvas.toDataURL('image/png'))

            const ctx = canvas.getContext('2d')
            if (!ctx) return
            const snap = ctx.getImageData(0, 0, canvas.width, canvas.height)
            setHistoryIndex(prev => {
                const newIdx = prev + 1
                historyRef.current = historyRef.current.slice(0, newIdx)
                historyRef.current.push(snap)
                return newIdx
            })
        }
    }

    const handleCanvasMouseLeave = () => {
        setCursorPreview(null)
        stopDrawing()
    }

    const handleUndo = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas || historyIndex <= 0) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const newIdx = historyIndex - 1
        ctx.putImageData(historyRef.current[newIdx], 0, 0)
        setHistoryIndex(newIdx)
        setMaskCanvas(canvas.toDataURL('image/png'))
    }, [historyIndex])

    const handleRedo = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas || historyIndex >= historyRef.current.length - 1) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const newIdx = historyIndex + 1
        ctx.putImageData(historyRef.current[newIdx], 0, 0)
        setHistoryIndex(newIdx)
        setMaskCanvas(canvas.toDataURL('image/png'))
    }, [historyIndex])

    // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z = redo
    useEffect(() => {
        if (!isDrawingMask) return
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return
            if (e.key.toLowerCase() !== 'z') return
            e.preventDefault()
            if (e.shiftKey) {
                handleRedo()
            } else {
                handleUndo()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isDrawingMask, handleUndo, handleRedo])

    // Calculate crop dimensions based on aspect ratio and scale
    const getCropDimensions = useCallback(() => {
        if (!canvasSize.width || !canvasSize.height) return null

        const aspectRatios: Record<AspectRatio, number> = {
            '1:1': 1,
            '16:9': 16 / 9,
            '9:16': 9 / 16,
            '4:3': 4 / 3,
            '3:4': 3 / 4,
        }

        const targetRatio = aspectRatios[editAspectRatio]
        const imageRatio = canvasSize.width / canvasSize.height

        let maxCropWidth: number
        let maxCropHeight: number

        if (targetRatio > imageRatio) {
            // Target is wider - fit to width
            maxCropWidth = canvasSize.width
            maxCropHeight = canvasSize.width / targetRatio
        } else {
            // Target is taller - fit to height
            maxCropHeight = canvasSize.height
            maxCropWidth = canvasSize.height * targetRatio
        }

        // Apply scale (30% to 100%)
        const scale = cropScale / 100
        const cropWidth = maxCropWidth * scale
        const cropHeight = maxCropHeight * scale

        // Constrain position
        const maxX = canvasSize.width - cropWidth
        const maxY = canvasSize.height - cropHeight
        const constrainedX = Math.max(0, Math.min(cropPosition.x, maxX))
        const constrainedY = Math.max(0, Math.min(cropPosition.y, maxY))

        return {
            width: cropWidth,
            height: cropHeight,
            x: constrainedX,
            y: constrainedY,
            maxX,
            maxY,
        }
    }, [canvasSize, editAspectRatio, cropPosition, cropScale])

    // Reset crop position and scale when aspect ratio changes
    useEffect(() => {
        setCropPosition({ x: 0, y: 0 })
        setCropScale(100)
    }, [editAspectRatio])

    // Crop drag handlers
    const handleCropMouseDown = (e: React.MouseEvent) => {
        if (!isEditing || isDrawingMask) return
        e.preventDefault()
        setIsDraggingCrop(true)
        setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y })
    }

    const handleCropMouseMove = useCallback((e: MouseEvent) => {
        if (!isDraggingCrop) return
        const crop = getCropDimensions()
        if (!crop) return

        const newX = Math.max(0, Math.min(e.clientX - dragStart.x, crop.maxX))
        const newY = Math.max(0, Math.min(e.clientY - dragStart.y, crop.maxY))
        setCropPosition({ x: newX, y: newY })
    }, [isDraggingCrop, dragStart, getCropDimensions])

    const handleCropMouseUp = useCallback(() => {
        setIsDraggingCrop(false)
    }, [])

    useEffect(() => {
        if (isDraggingCrop) {
            window.addEventListener('mousemove', handleCropMouseMove)
            window.addEventListener('mouseup', handleCropMouseUp)
            return () => {
                window.removeEventListener('mousemove', handleCropMouseMove)
                window.removeEventListener('mouseup', handleCropMouseUp)
            }
        }
    }, [isDraggingCrop, handleCropMouseMove, handleCropMouseUp])

    // Video playback toggle
    const togglePlayback = () => {
        if (!videoRef.current) return
        if (isPlaying) {
            videoRef.current.pause()
        } else {
            videoRef.current.play()
        }
        setIsPlaying(!isPlaying)
    }

    // Video transport: scrub, step (1/30s ≈ one frame at 30fps), jump.
    const VIDEO_FRAME_STEP = 1 / 30
    const formatVideoTime = (seconds: number) => {
        if (!isFinite(seconds)) return '0:00'
        const m = Math.floor(seconds / 60)
        const s = Math.floor(seconds % 60).toString().padStart(2, '0')
        return `${m}:${s}`
    }
    const handleVideoScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
        const t = Number(e.target.value)
        if (videoRef.current) videoRef.current.currentTime = t
        setVideoCurrentTime(t)
    }
    const stepVideoFrame = (direction: -1 | 1) => {
        const v = videoRef.current
        if (!v || !videoDuration) return
        if (!v.paused) {
            v.pause()
            setIsPlaying(false)
        }
        const next = Math.max(0, Math.min(videoDuration, v.currentTime + direction * VIDEO_FRAME_STEP))
        v.currentTime = next
        setVideoCurrentTime(next)
    }
    const jumpVideoTo = (time: number) => {
        const v = videoRef.current
        if (!v) return
        if (!v.paused) {
            v.pause()
            setIsPlaying(false)
        }
        v.currentTime = time
        setVideoCurrentTime(time)
    }
    const handleVideoLoadedMetadata = () => {
        const v = videoRef.current
        if (!v) return
        setVideoDuration(v.duration)
        setVideoCurrentTime(v.currentTime)
    }
    const handleVideoTimeUpdate = () => {
        setVideoCurrentTime(videoRef.current?.currentTime ?? 0)
    }

    // Open the frame extractor — user picks the exact frame they want before
    // we open the Continue dialog. The previous behaviour of grabbing the
    // currently-paused frame was unreliable for users who never paused at the
    // moment they actually wanted as the seed.
    const captureFrame = useCallback(() => {
        if (!previewMedia || !onContinueVideo) return
        if (!videoRef.current?.paused) {
            videoRef.current?.pause()
            setIsPlaying(false)
        }
        setShowFrameExtractor(true)
    }, [previewMedia, onContinueVideo])

    // Called when the extractor returns a captured frame.
    const handleFrameExtracted = useCallback((frameBase64: string) => {
        setCapturedFrame(frameBase64)
        setShowFrameExtractor(false)
        setShowContinueDialog(true)
    }, [])

    // Capture current frame and download as image
    const captureFrameAsImage = useCallback(() => {
        const video = videoRef.current
        if (!video) return

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.drawImage(video, 0, 0)
        canvas.toBlob((blob) => {
            if (!blob) return
            const blobUrl = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = blobUrl
            link.download = `avatar-frame-${Date.now()}.jpg`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(blobUrl)
        }, 'image/jpeg', 0.95)
    }, [])

    // Handle confirm continue from dialog
    const handleConfirmContinue = useCallback((prompt: string, dialogue: string, aspectRatio: AspectRatio) => {
        if (!capturedFrame || !previewMedia || !onContinueVideo) return
        onContinueVideo(capturedFrame, prompt, dialogue, aspectRatio)
        setShowContinueDialog(false)
        setCapturedFrame(null)
        handleClose()
    }, [capturedFrame, previewMedia, onContinueVideo, handleClose])

    // Handle cancel continue from dialog
    const handleCancelContinue = useCallback(() => {
        setShowContinueDialog(false)
        setCapturedFrame(null)
    }, [])

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!previewMedia) return
            if (e.key === 'ArrowLeft') handlePrev()
            if (e.key === 'ArrowRight') handleNext()
            if (e.key === 'Escape') handleClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [previewMedia, handlePrev, handleNext, handleClose])

    if (!previewMedia) return null

    return (
        <>
        <Dialog
            isOpen={!!previewMedia}
            onClose={handleClose}
            width={900}
            className="p-0! bg-white! dark:bg-gray-900!"
        >
            <div className="flex flex-col h-[80vh]">
                {/* Header */}
                <div className="flex items-center gap-4 p-4 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                    <span
                        className={`px-2 py-1 text-xs font-bold rounded ${
                            previewMedia.mediaType === 'VIDEO'
                                ? 'bg-purple-500 text-white'
                                : 'bg-blue-500 text-white'
                        }`}
                    >
                        {previewMedia.mediaType}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                        {currentIndex + 1} / {gallery.length}
                    </span>

                    {previewMedia.providerName && (
                        <span className="px-2 py-1 text-xs font-medium rounded bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                            {previewMedia.providerName}
                        </span>
                    )}

                    {/* Zoom Controls */}
                    {previewMedia.mediaType === 'IMAGE' && !isEditing && (
                        <div className="flex items-center gap-2 ml-auto">
                            <button
                                onClick={handleZoomOut}
                                disabled={zoomLevel <= 1}
                                className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Zoom Out"
                            >
                                <HiOutlineZoomOut className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleResetZoom}
                                className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white min-w-12 text-center"
                                title="Reset Zoom"
                            >
                                {Math.round(zoomLevel * 100)}%
                            </button>
                            <button
                                onClick={handleZoomIn}
                                disabled={zoomLevel >= 3}
                                className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Zoom In"
                            >
                                <HiOutlineZoomIn className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Media Content */}
                <div className="flex-1 relative flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    {/* Navigation Arrows */}
                    {hasPrev && (
                        <button
                            onClick={handlePrev}
                            className="absolute left-4 p-3 bg-white/90 text-gray-700 rounded-full hover:bg-white dark:bg-gray-800/90 dark:text-gray-200 dark:hover:bg-gray-800 shadow-lg transition-colors z-10"
                        >
                            <HiOutlineChevronLeft className="w-6 h-6" />
                        </button>
                    )}
                    {hasNext && (
                        <button
                            onClick={handleNext}
                            className="absolute right-4 p-3 bg-white/90 text-gray-700 rounded-full hover:bg-white shadow-lg transition-colors z-10"
                        >
                            <HiOutlineChevronRight className="w-6 h-6" />
                        </button>
                    )}

                    {/* Media Display */}
                    <div
                        ref={mediaContainerRef}
                        className="relative max-h-full max-w-full"
                    >
                        {previewMedia.mediaType === 'VIDEO' ? (
                            <div className="flex flex-col items-center gap-3">
                                <div className="relative">
                                    <video
                                        ref={videoRef}
                                        src={previewMedia.url}
                                        crossOrigin="anonymous"
                                        className="max-h-[55vh] rounded-lg"
                                        controls={false}
                                        loop
                                        onClick={togglePlayback}
                                        onLoadedMetadata={handleVideoLoadedMetadata}
                                        onTimeUpdate={handleVideoTimeUpdate}
                                        onPlay={() => setIsPlaying(true)}
                                        onPause={() => setIsPlaying(false)}
                                        onEnded={() => setIsPlaying(false)}
                                    />
                                    <button
                                        onClick={togglePlayback}
                                        className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
                                    >
                                        {isPlaying ? (
                                            <HiOutlinePause className="w-16 h-16 text-white" />
                                        ) : (
                                            <HiOutlinePlay className="w-16 h-16 text-white" />
                                        )}
                                    </button>
                                </div>

                                {/* Transport controls */}
                                <div className="flex items-center gap-2 w-full max-w-[700px] px-2">
                                    <button
                                        onClick={() => jumpVideoTo(0)}
                                        title="Jump to start"
                                        className="p-2 rounded-lg hover:bg-white/10 text-gray-300"
                                    >
                                        <HiOutlineChevronDoubleLeft className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => stepVideoFrame(-1)}
                                        title="Previous frame"
                                        className="p-2 rounded-lg hover:bg-white/10 text-gray-300"
                                    >
                                        <HiOutlineRewind className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={togglePlayback}
                                        title={isPlaying ? 'Pause' : 'Play'}
                                        className="w-10 h-10 rounded-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 flex items-center justify-center"
                                    >
                                        {isPlaying ? <HiOutlinePause className="w-5 h-5" /> : <HiOutlinePlay className="w-5 h-5" />}
                                    </button>
                                    <button
                                        onClick={() => stepVideoFrame(1)}
                                        title="Next frame"
                                        className="p-2 rounded-lg hover:bg-white/10 text-gray-300"
                                    >
                                        <HiOutlineFastForward className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => jumpVideoTo(Math.max(0, videoDuration - VIDEO_FRAME_STEP))}
                                        title="Jump to end"
                                        className="p-2 rounded-lg hover:bg-white/10 text-gray-300"
                                    >
                                        <HiOutlineChevronDoubleRight className="w-5 h-5" />
                                    </button>
                                    <input
                                        type="range"
                                        min={0}
                                        max={videoDuration || 0}
                                        step={0.01}
                                        value={Math.min(videoCurrentTime, videoDuration || 0)}
                                        onChange={handleVideoScrub}
                                        className="flex-1 accent-purple-500"
                                        disabled={!videoDuration}
                                    />
                                    <span className="text-xs text-gray-300 tabular-nums w-20 text-right">
                                        {formatVideoTime(videoCurrentTime)} / {formatVideoTime(videoDuration)}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div
                                className="relative inline-block"
                                style={{
                                    transform: isEditing ? 'none' : `translate(${panPosition.x}px, ${panPosition.y}px)`,
                                    transition: isPanning ? 'none' : 'transform 0.2s ease-out',
                                    cursor: zoomLevel > 1 && !isEditing ? (isPanning ? 'grabbing' : 'grab') : 'default',
                                }}
                                onMouseDown={handlePanStart}
                            >
                                <img
                                    ref={imageRef}
                                    src={previewMedia.url}
                                    alt={previewMedia.prompt}
                                    className="rounded-lg block select-none"
                                    style={{
                                        maxHeight: `${60 * zoomLevel}vh`,
                                        maxWidth: isEditing ? '100%' : `${100 * zoomLevel}%`,
                                        transition: isPanning ? 'none' : 'max-height 0.2s ease-out, max-width 0.2s ease-out',
                                    }}
                                    onLoad={updateCanvasSize}
                                    draggable={false}
                                />
                                {/* Drawing Canvas Overlay */}
                                {isEditing && isDrawingMask && (
                                    <>
                                        <canvas
                                            ref={canvasRef}
                                            width={canvasSize.width}
                                            height={canvasSize.height}
                                            className="absolute inset-0"
                                            style={{
                                                width: canvasSize.width,
                                                height: canvasSize.height,
                                                opacity: 0.5,
                                                cursor: 'none',
                                            }}
                                            onMouseDown={startDrawing}
                                            onMouseMove={draw}
                                            onMouseUp={stopDrawing}
                                            onMouseLeave={handleCanvasMouseLeave}
                                        />
                                        {/* Brush size cursor preview — sits on top of the canvas
                                            but doesn't capture events so drawing still works. */}
                                        {cursorPreview && (
                                            <div
                                                className="absolute pointer-events-none rounded-full border-2 border-white"
                                                style={{
                                                    left: cursorPreview.x - brushSize / 2,
                                                    top: cursorPreview.y - brushSize / 2,
                                                    width: brushSize,
                                                    height: brushSize,
                                                    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(0, 0, 0, 0.7)',
                                                    mixBlendMode: 'difference',
                                                }}
                                            />
                                        )}
                                    </>
                                )}
                                {/* Crop Overlay */}
                                {isEditing && !isDrawingMask && (() => {
                                    const crop = getCropDimensions()
                                    if (!crop || (crop.width === canvasSize.width && crop.height === canvasSize.height)) return null
                                    return (
                                        <div
                                            className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg"
                                        >
                                            {/* Crop area with box-shadow to darken outside */}
                                            <div
                                                className="absolute bg-transparent border-2 border-dashed border-primary cursor-move pointer-events-auto"
                                                style={{
                                                    left: crop.x,
                                                    top: crop.y,
                                                    width: crop.width,
                                                    height: crop.height,
                                                    boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.7)`,
                                                }}
                                                onMouseDown={handleCropMouseDown}
                                            >
                                                {/* Corner indicators */}
                                                <div className="absolute -top-1 -left-1 w-3 h-3 bg-primary rounded-full" />
                                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                                                <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary rounded-full" />
                                                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                                                {/* Center label */}
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
                                                        {editAspectRatio} - Drag to move
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })()}
                            </div>
                        )}
                    </div>
                </div>

                {/* Edit Mode Panel */}
                {isEditing && previewMedia.mediaType === 'IMAGE' && (
                    <div className="p-4 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                        <div className="flex gap-3 items-end">
                            <div className="flex-1">
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                                    Edit Instruction
                                </label>
                                <Input
                                    value={editPrompt}
                                    onChange={(e) => setEditPrompt(e.target.value)}
                                    placeholder="Describe the edit (e.g., 'change hair to blonde')"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                                    Aspect Ratio
                                </label>
                                <select
                                    value={editAspectRatio}
                                    onChange={(e) => setEditAspectRatio(e.target.value as AspectRatio)}
                                    className="h-10 px-3 text-sm border rounded-lg bg-white border-gray-300 text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
                                >
                                    <option value="1:1">1:1</option>
                                    <option value="16:9">16:9</option>
                                    <option value="9:16">9:16</option>
                                    <option value="4:3">4:3</option>
                                    <option value="3:4">3:4</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                                    Provider
                                </label>
                                <select
                                    value={editProviderId ?? activeProviderId ?? ''}
                                    onChange={(e) => setEditProviderId(e.target.value || null)}
                                    className="h-10 px-3 text-sm border rounded-lg bg-white border-gray-300 text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 max-w-45"
                                    title="Override provider for this edit (useful when default blocks the prompt)"
                                >
                                    {imageProviders.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <Button
                                variant={isDrawingMask ? 'solid' : 'plain'}
                                color={isDrawingMask ? 'purple' : 'gray'}
                                onClick={handleToggleMask}
                                icon={<HiOutlinePencil />}
                            >
                                <span>{isDrawingMask ? 'Drawing...' : 'Draw Mask'}</span>
                            </Button>
                            <Button
                                variant="solid"
                                onClick={handleSubmitEdit}
                                loading={isSubmittingEdit}
                                disabled={!editPrompt.trim() && cropScale >= 100}
                            >
                                {editPrompt.trim() ? 'Apply Edit' : 'Apply Crop'}
                            </Button>
                            <Button variant="plain" onClick={() => setIsEditing(false)}>
                                Cancel
                            </Button>
                        </div>
                        {isDrawingMask ? (
                            <div className="mt-3 space-y-2">
                                <div className="flex items-center gap-4">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 w-20">Brush Size</span>
                                    <div className="flex-1">
                                        <Slider
                                            value={brushSize}
                                            onChange={(val) => setBrushSize(val as number)}
                                            min={5}
                                            max={100}
                                        />
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">{brushSize}px</span>
                                    <Tooltip title="Undo (⌘Z)">
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            shape="circle"
                                            icon={<HiOutlineArrowUturnLeft />}
                                            onClick={handleUndo}
                                            disabled={!canUndo}
                                        />
                                    </Tooltip>
                                    <Tooltip title="Redo (⌘⇧Z)">
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            shape="circle"
                                            icon={<HiOutlineArrowUturnRight />}
                                            onClick={handleRedo}
                                            disabled={!canRedo}
                                        />
                                    </Tooltip>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Draw on the image to highlight the area you want to edit
                                </p>
                            </div>
                        ) : (
                            <div className="mt-3">
                                <div className="flex items-center gap-4">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 w-20">Crop Size</span>
                                    <div className="flex-1">
                                        <Slider
                                            value={cropScale}
                                            onChange={(val) => setCropScale(val as number)}
                                            min={30}
                                            max={100}
                                        />
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 w-10">{cropScale}%</span>
                                </div>
                            </div>
                        )}

                        {/* Reference Assets for Edit */}
                        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-2">
                                <HiOutlinePhotograph className="w-4 h-4 text-purple-500" />
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Reference Assets</span>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">({editAssets.length}/3)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Existing assets */}
                                {editAssets.map((asset) => (
                                    <div key={asset.id} className="relative group">
                                        <img
                                            src={asset.url}
                                            alt="Reference"
                                            className="w-12 h-12 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                                        />
                                        <button
                                            onClick={() => removeEditAsset(asset.id)}
                                            className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <HiOutlineX className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                {/* Add button */}
                                {editAssets.length < 3 && (
                                    <Tooltip title="Add reference image for the edit">
                                        <button
                                            onClick={() => editAssetInputRef.current?.click()}
                                            className="w-12 h-12 border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-lg flex items-center justify-center hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors"
                                        >
                                            <HiOutlinePhotograph className="w-5 h-5 text-purple-400" />
                                        </button>
                                    </Tooltip>
                                )}
                                <input
                                    ref={editAssetInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleEditAssetUpload}
                                />
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 ml-2">
                                    Add images to guide the edit (e.g., style reference, outfit example)
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer Actions */}
                {!isEditing && (
                    <div className="p-4 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                        {/* Avatar Info + Prompt */}
                        <div className="flex gap-3 mb-4">
                            {/* Avatar Thumbnail - shows avatar used to CREATE this image */}
                            {previewMedia.avatarInfo && (
                                <div className="flex items-start gap-2 shrink-0">
                                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                        {previewMedia.avatarInfo.thumbnailUrl ? (
                                            <img
                                                src={previewMedia.avatarInfo.thumbnailUrl}
                                                alt={previewMedia.avatarInfo.name}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <HiOutlineUser className="w-5 h-5 text-gray-400" />
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">Avatar</span>
                                        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{previewMedia.avatarInfo.name}</span>
                                    </div>
                                </div>
                            )}

                            {/* Prompt with Copy Button */}
                            <div className="flex-1 relative">
                                <div
                                    className={`${isPromptExpanded ? 'max-h-60' : 'max-h-16'} overflow-y-auto pr-10 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 transition-all duration-200`}
                                >
                                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap wrap-break-word">
                                        {previewMedia.prompt}
                                    </p>
                                </div>
                                <div className="absolute top-0 right-0 flex gap-1">
                                    <button
                                        onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                                        title={isPromptExpanded ? 'Collapse' : 'Expand'}
                                    >
                                        <svg className={`w-4 h-4 transition-transform ${isPromptExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(previewMedia.prompt)
                                        }}
                                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                                        title="Copy prompt"
                                    >
                                        <HiOutlineClipboardCopy className="w-4 h-4" />
                                    </button>
                                    {previewMedia.fullApiPrompt && (
                                        <button
                                            onClick={() => setShowApiPrompt(!showApiPrompt)}
                                            className={`p-1.5 rounded transition-colors ${showApiPrompt ? 'text-primary bg-primary/10' : 'text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                            title="Ver API Prompt completo"
                                        >
                                            <HiOutlineCode className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                            <Button variant="solid" onClick={handleDownload} icon={<HiOutlineDownload />}>
                                <span>Download</span>
                            </Button>

                            {previewMedia.mediaType === 'IMAGE' && (
                                <>
                                    {onEdit && (
                                        <Button variant="plain" onClick={handleStartEdit} icon={<HiOutlinePencil />}>
                                            <span>Edit</span>
                                        </Button>
                                    )}
                                    {onAnimate && (
                                        <Button
                                            variant="plain"
                                            color="purple"
                                            onClick={() => {
                                                onAnimate(previewMedia)
                                                handleClose()
                                            }}
                                            icon={<HiOutlineFilm />}
                                        >
                                            <span>Animate</span>
                                        </Button>
                                    )}
                                    {onVariant && (
                                        <Button
                                            variant="plain"
                                            onClick={() => {
                                                onVariant(previewMedia)
                                                handleClose()
                                            }}
                                            icon={<HiOutlineDuplicate />}
                                        >
                                            <span>Variant</span>
                                        </Button>
                                    )}
                                    {onReuse && (
                                        <Button
                                            variant="plain"
                                            color="green"
                                            onClick={() => {
                                                onReuse(previewMedia)
                                                handleClose()
                                            }}
                                            icon={<HiOutlineRefresh />}
                                        >
                                            <span>Re-use</span>
                                        </Button>
                                    )}
                                </>
                            )}

                            {previewMedia.mediaType === 'VIDEO' && (
                                <Button variant="plain" onClick={captureFrameAsImage} icon={<HiOutlineCamera />}>
                                    <span>Frame</span>
                                </Button>
                            )}

                            {previewMedia.mediaType === 'VIDEO' && onContinueVideo && (
                                <Button variant="plain" color="purple" onClick={captureFrame} icon={<HiOutlineFilm />}>
                                    <span>Continue</span>
                                </Button>
                            )}

                            {onSave && (
                                <Button
                                    variant="plain"
                                    onClick={() => {
                                        onSave(previewMedia)
                                    }}
                                    icon={<HiOutlineSave />}
                                >
                                    <span>Save</span>
                                </Button>
                            )}

                            <div className="flex-1" />

                            <Button variant="plain" color="red" onClick={handleDelete} icon={<HiOutlineTrash />}>
                                <span>Delete</span>
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Dialog>

            {/* API Prompt Dialog */}
            <Dialog
                isOpen={showApiPrompt}
                onClose={() => setShowApiPrompt(false)}
                width={700}
                className="!p-0"
            >
                <div className="flex flex-col max-h-[80vh]">
                    <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900">
                        <h3 className="text-lg font-semibold text-white">API Prompt Completo</h3>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(previewMedia?.fullApiPrompt || '')
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors"
                            title="Copy API prompt"
                        >
                            <HiOutlineClipboardCopy className="w-4 h-4" />
                            <span>Copiar</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 bg-gray-900">
                        <pre className="text-sm text-green-400 whitespace-pre-wrap wrap-break-word font-mono leading-relaxed">
                            {previewMedia?.fullApiPrompt}
                        </pre>
                    </div>
                </div>
            </Dialog>

            {/* Frame Extractor — runs before the Continue dialog */}
            <ExtractFrameDialog
                isOpen={showFrameExtractor}
                videoUrl={previewMedia?.url || ''}
                onClose={() => setShowFrameExtractor(false)}
                onCapture={handleFrameExtracted}
            />

            {/* Continue Video Dialog */}
            <ContinueVideoDialog
                isOpen={showContinueDialog}
                frameBase64={capturedFrame || ''}
                originalPrompt={previewMedia?.prompt || ''}
                originalDialogue={videoDialogue}
                originalAspectRatio={previewMedia?.aspectRatio}
                onClose={handleCancelContinue}
                onConfirm={handleConfirmContinue}
            />
        </>
    )
}

export default ImagePreviewModal
