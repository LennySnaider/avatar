'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Slider from '@/components/ui/Slider'
import Card from '@/components/ui/Card'
import ScrollBar from '@/components/ui/ScrollBar'
import {
    HiOutlineZoomIn,
    HiOutlineZoomOut,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlinePencil,
    HiOutlineUpload,
    HiOutlinePhotograph,
    HiOutlineTrash,
    HiOutlineX,
    HiOutlineRefresh,
    HiOutlinePlus,
} from 'react-icons/hi'
import type { GeneratedMedia, ReferenceImage, AspectRatio } from '../types'

interface ImageEditorPanelProps {
    onEdit?: (
        media: GeneratedMedia,
        editPrompt: string,
        maskBase64: string | null,
        aspectRatio: AspectRatio,
        assets: ReferenceImage[]
    ) => Promise<void>
}

const MIN_ZOOM = 25
const MAX_ZOOM = 400
const ZOOM_STEP = 25

const ImageEditorPanel = ({ onEdit }: ImageEditorPanelProps) => {
    const {
        gallery,
        isEditorOpen,
        editorImage,
        editorZoom,
        editorAssets,
        closeEditor,
        setEditorZoom,
        addEditorAsset,
        removeEditorAsset,
        setEditorImage,
    } = useAvatarStudioStore()

    // Local state
    const [editPrompt, setEditPrompt] = useState('')
    const [isDrawingMask, setIsDrawingMask] = useState(false)
    const [maskCanvas, setMaskCanvas] = useState<string | null>(null)
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)
    const [brushSize, setBrushSize] = useState(30)
    const [editAspectRatio, setEditAspectRatio] = useState<AspectRatio>('1:1')
    const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 })
    const [isDraggingCrop, setIsDraggingCrop] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [canvasSize, setCanvasSize] = useState({ width: 500, height: 500 })
    const [panPosition, setPanPosition] = useState({ x: 0, y: 0 })
    const [isPanning, setIsPanning] = useState(false)
    const [panStart, setPanStart] = useState({ x: 0, y: 0 })

    // Refs
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imageRef = useRef<HTMLImageElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const assetInputRef = useRef<HTMLInputElement>(null)
    const isDrawingRef = useRef(false)
    const lastPosRef = useRef({ x: 0, y: 0 })
    const containerRef = useRef<HTMLDivElement>(null)

    // Find current index in gallery
    const currentIndex = editorImage
        ? gallery.findIndex((m) => m.id === editorImage.id)
        : -1
    const hasNext = currentIndex < gallery.length - 1 && currentIndex >= 0
    const hasPrev = currentIndex > 0

    // Navigation
    const handleNext = useCallback(() => {
        if (hasNext) {
            setEditorImage(gallery[currentIndex + 1])
            resetEditState()
        }
    }, [hasNext, currentIndex, gallery, setEditorImage])

    const handlePrev = useCallback(() => {
        if (hasPrev) {
            setEditorImage(gallery[currentIndex - 1])
            resetEditState()
        }
    }, [hasPrev, currentIndex, gallery, setEditorImage])

    const resetEditState = () => {
        setEditPrompt('')
        setMaskCanvas(null)
        setIsDrawingMask(false)
        setCropPosition({ x: 0, y: 0 })
        setPanPosition({ x: 0, y: 0 })
    }

    const handleClose = useCallback(() => {
        closeEditor()
        resetEditState()
    }, [closeEditor])

    // Zoom controls
    const zoomIn = () => setEditorZoom(Math.min(editorZoom + ZOOM_STEP, MAX_ZOOM))
    const zoomOut = () => setEditorZoom(Math.max(editorZoom - ZOOM_STEP, MIN_ZOOM))
    const resetZoom = () => {
        setEditorZoom(100)
        setPanPosition({ x: 0, y: 0 })
    }

    // Mouse wheel zoom
    const handleWheel = useCallback(
        (e: React.WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault()
                const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
                setEditorZoom(Math.max(MIN_ZOOM, Math.min(editorZoom + delta, MAX_ZOOM)))
            }
        },
        [editorZoom, setEditorZoom]
    )

    // Pan handlers (when zoomed in)
    const handlePanStart = (e: React.MouseEvent) => {
        if (editorZoom <= 100 || isDrawingMask) return
        setIsPanning(true)
        setPanStart({ x: e.clientX - panPosition.x, y: e.clientY - panPosition.y })
    }

    const handlePanMove = useCallback(
        (e: MouseEvent) => {
            if (!isPanning) return
            setPanPosition({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y,
            })
        },
        [isPanning, panStart]
    )

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

    // Update canvas size
    const updateCanvasSize = useCallback(() => {
        if (imageRef.current) {
            const rect = imageRef.current.getBoundingClientRect()
            setCanvasSize({ width: rect.width, height: rect.height })
        }
    }, [])

    useEffect(() => {
        if (isEditorOpen && imageRef.current) {
            updateCanvasSize()
            window.addEventListener('resize', updateCanvasSize)
            return () => window.removeEventListener('resize', updateCanvasSize)
        }
    }, [isEditorOpen, updateCanvasSize, editorImage])

    // Canvas drawing
    const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasRef.current) return { x: 0, y: 0 }
        const rect = canvasRef.current.getBoundingClientRect()
        const scaleX = canvasRef.current.width / rect.width
        const scaleY = canvasRef.current.height / rect.height
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        }
    }

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawingMask || !canvasRef.current) return
        isDrawingRef.current = true
        lastPosRef.current = getCanvasCoordinates(e)
    }

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current || !isDrawingMask || !canvasRef.current) return
        const ctx = canvasRef.current.getContext('2d')
        if (!ctx) return

        const coords = getCanvasCoordinates(e)
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(138, 43, 226, 0.6)'
        ctx.fillStyle = 'rgba(138, 43, 226, 0.6)'
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
            setMaskCanvas(canvasRef.current.toDataURL('image/png'))
        }
    }

    const handleToggleMask = () => {
        setIsDrawingMask(!isDrawingMask)
        if (!isDrawingMask && canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
            }
            setMaskCanvas(null)
        }
    }

    const clearMask = () => {
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
            }
            setMaskCanvas(null)
        }
    }

    // Crop dimensions
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

        let cropWidth: number
        let cropHeight: number

        if (targetRatio > imageRatio) {
            cropWidth = canvasSize.width
            cropHeight = canvasSize.width / targetRatio
        } else {
            cropHeight = canvasSize.height
            cropWidth = canvasSize.height * targetRatio
        }

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
    }, [canvasSize, editAspectRatio, cropPosition])

    useEffect(() => {
        setCropPosition({ x: 0, y: 0 })
    }, [editAspectRatio])

    // Crop drag handlers
    const handleCropMouseDown = (e: React.MouseEvent) => {
        if (isDrawingMask) return
        e.preventDefault()
        setIsDraggingCrop(true)
        setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y })
    }

    const handleCropMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isDraggingCrop) return
            const crop = getCropDimensions()
            if (!crop) return
            const newX = Math.max(0, Math.min(e.clientX - dragStart.x, crop.maxX))
            const newY = Math.max(0, Math.min(e.clientY - dragStart.y, crop.maxY))
            setCropPosition({ x: newX, y: newY })
        },
        [isDraggingCrop, dragStart, getCropDimensions]
    )

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

    // File upload handlers
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (event) => {
            const base64 = event.target?.result as string
            const newMedia: GeneratedMedia = {
                id: `upload-${Date.now()}`,
                url: base64,
                prompt: 'Uploaded image',
                aspectRatio: '1:1',
                timestamp: Date.now(),
                mediaType: 'IMAGE',
            }
            setEditorImage(newMedia)
            resetEditState()
        }
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = (event) => {
            const base64 = event.target?.result as string
            const newAsset: ReferenceImage = {
                id: `asset-${Date.now()}`,
                url: base64,
                mimeType: file.type,
                base64: base64.split(',')[1],
                type: 'general',
            }
            addEditorAsset(newAsset)
        }
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    // Submit edit
    const handleSubmitEdit = async () => {
        if (!editorImage || !editPrompt.trim() || !onEdit) return
        setIsSubmittingEdit(true)
        try {
            await onEdit(editorImage, editPrompt, maskCanvas, editAspectRatio, editorAssets)
            handleClose()
        } finally {
            setIsSubmittingEdit(false)
        }
    }

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isEditorOpen) return
            if (e.key === 'ArrowLeft') handlePrev()
            if (e.key === 'ArrowRight') handleNext()
            if (e.key === 'Escape') handleClose()
            if (e.key === '+' || e.key === '=') zoomIn()
            if (e.key === '-') zoomOut()
            if (e.key === '0') resetZoom()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isEditorOpen, handlePrev, handleNext, handleClose])

    if (!isEditorOpen) return null

    return (
        <Dialog isOpen={isEditorOpen} onClose={handleClose} width={1200} className="!p-0 !bg-gray-900">
            <div className="flex flex-col h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-800">
                    <div className="flex items-center gap-4">
                        <h3 className="text-lg font-semibold text-white">Image Editor</h3>
                        {editorImage && currentIndex >= 0 && (
                            <span className="text-sm text-gray-400">
                                {currentIndex + 1} / {gallery.length}
                            </span>
                        )}
                    </div>

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-2">
                        <Button size="xs" variant="plain" onClick={zoomOut} disabled={editorZoom <= MIN_ZOOM}>
                            <HiOutlineZoomOut className="w-5 h-5" />
                        </Button>
                        <span className="text-sm text-white font-mono w-14 text-center">{editorZoom}%</span>
                        <Button size="xs" variant="plain" onClick={zoomIn} disabled={editorZoom >= MAX_ZOOM}>
                            <HiOutlineZoomIn className="w-5 h-5" />
                        </Button>
                        <Button size="xs" variant="plain" onClick={resetZoom}>
                            <HiOutlineRefresh className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Close */}
                    <Button size="xs" variant="plain" onClick={handleClose}>
                        <HiOutlineX className="w-5 h-5" />
                    </Button>
                </div>

                {/* Main Content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Image Area */}
                    <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden" ref={containerRef}>
                        {/* Navigation Arrows */}
                        {hasPrev && (
                            <button
                                onClick={handlePrev}
                                className="absolute left-4 z-20 p-3 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
                            >
                                <HiOutlineChevronLeft className="w-8 h-8" />
                            </button>
                        )}
                        {hasNext && (
                            <button
                                onClick={handleNext}
                                className="absolute right-4 z-20 p-3 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
                            >
                                <HiOutlineChevronRight className="w-8 h-8" />
                            </button>
                        )}

                        {/* Empty State */}
                        {!editorImage && (
                            <div className="flex flex-col items-center justify-center text-gray-400">
                                <HiOutlinePhotograph className="w-16 h-16 mb-4" />
                                <p className="text-lg mb-4">No image selected</p>
                                <Button
                                    variant="solid"
                                    icon={<HiOutlineUpload />}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    Upload Image
                                </Button>
                            </div>
                        )}

                        {/* Image Display */}
                        {editorImage && (
                            <div
                                className="relative"
                                style={{
                                    transform: `scale(${editorZoom / 100}) translate(${panPosition.x}px, ${panPosition.y}px)`,
                                    cursor: editorZoom > 100 && !isDrawingMask ? 'grab' : 'default',
                                }}
                                onWheel={handleWheel}
                                onMouseDown={!isDrawingMask ? handlePanStart : undefined}
                            >
                                <img
                                    ref={imageRef}
                                    src={editorImage.url}
                                    alt={editorImage.prompt}
                                    className="max-h-[60vh] max-w-full rounded-lg"
                                    onLoad={updateCanvasSize}
                                    draggable={false}
                                />

                                {/* Drawing Canvas */}
                                {isDrawingMask && (
                                    <canvas
                                        ref={canvasRef}
                                        width={canvasSize.width}
                                        height={canvasSize.height}
                                        className="absolute inset-0 cursor-crosshair"
                                        style={{ width: canvasSize.width, height: canvasSize.height }}
                                        onMouseDown={startDrawing}
                                        onMouseMove={draw}
                                        onMouseUp={stopDrawing}
                                        onMouseLeave={stopDrawing}
                                    />
                                )}

                                {/* Crop Overlay */}
                                {!isDrawingMask &&
                                    (() => {
                                        const crop = getCropDimensions()
                                        if (!crop || (crop.width === canvasSize.width && crop.height === canvasSize.height))
                                            return null
                                        return (
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{ width: canvasSize.width, height: canvasSize.height }}
                                            >
                                                <div className="absolute inset-0 bg-black/60" />
                                                <div
                                                    className="absolute bg-transparent border-2 border-dashed border-primary cursor-move pointer-events-auto"
                                                    style={{
                                                        left: crop.x,
                                                        top: crop.y,
                                                        width: crop.width,
                                                        height: crop.height,
                                                        boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.6)`,
                                                    }}
                                                    onMouseDown={handleCropMouseDown}
                                                >
                                                    <div className="absolute -top-1 -left-1 w-3 h-3 bg-primary rounded-full" />
                                                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                                                    <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary rounded-full" />
                                                    <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
                                                            {editAspectRatio}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })()}
                            </div>
                        )}
                    </div>

                    {/* Right Panel - Assets & References */}
                    <div className="w-64 border-l border-gray-700 bg-gray-800 flex flex-col">
                        <div className="p-3 border-b border-gray-700">
                            <h4 className="text-sm font-semibold text-white mb-2">Reference Assets</h4>
                            <Button
                                size="xs"
                                variant="solid"
                                className="w-full"
                                icon={<HiOutlinePlus />}
                                onClick={() => assetInputRef.current?.click()}
                            >
                                Add Asset
                            </Button>
                        </div>

                        <ScrollBar className="flex-1">
                            <div className="p-3 space-y-2">
                                {editorAssets.length === 0 ? (
                                    <p className="text-xs text-gray-400 text-center py-4">
                                        Add reference images to guide the edit
                                    </p>
                                ) : (
                                    editorAssets.map((asset) => (
                                        <Card key={asset.id} className="relative group overflow-hidden">
                                            <img
                                                src={asset.url}
                                                alt="Asset"
                                                className="w-full h-24 object-cover"
                                            />
                                            <button
                                                onClick={() => removeEditorAsset(asset.id)}
                                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <HiOutlineTrash className="w-3 h-3" />
                                            </button>
                                        </Card>
                                    ))
                                )}
                            </div>
                        </ScrollBar>

                        {/* Upload Actions */}
                        <div className="p-3 border-t border-gray-700 space-y-2">
                            <Button
                                size="sm"
                                variant="plain"
                                className="w-full"
                                icon={<HiOutlineUpload />}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Upload New Image
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Tools Bar */}
                {editorImage && (
                    <div className="p-3 border-t border-gray-700 bg-gray-800">
                        <div className="flex items-center gap-4">
                            {/* Mask Tools */}
                            <Button
                                size="sm"
                                variant={isDrawingMask ? 'solid' : 'plain'}
                                color={isDrawingMask ? 'purple' : 'gray'}
                                onClick={handleToggleMask}
                                icon={<HiOutlinePencil />}
                            >
                                {isDrawingMask ? 'Drawing...' : 'Draw Mask'}
                            </Button>

                            {isDrawingMask && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">Brush:</span>
                                        <div className="w-24">
                                            <Slider
                                                value={brushSize}
                                                onChange={(val) => setBrushSize(val as number)}
                                                min={5}
                                                max={100}
                                            />
                                        </div>
                                        <span className="text-xs text-gray-400 w-8">{brushSize}px</span>
                                    </div>
                                    <Button size="xs" variant="plain" onClick={clearMask}>
                                        Clear Mask
                                    </Button>
                                </>
                            )}

                            <div className="w-px h-6 bg-gray-600" />

                            {/* Aspect Ratio */}
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">Aspect:</span>
                                <select
                                    value={editAspectRatio}
                                    onChange={(e) => setEditAspectRatio(e.target.value as AspectRatio)}
                                    className="h-8 px-2 text-sm border rounded bg-gray-700 border-gray-600 text-white"
                                >
                                    <option value="1:1">1:1</option>
                                    <option value="16:9">16:9</option>
                                    <option value="9:16">9:16</option>
                                    <option value="4:3">4:3</option>
                                    <option value="3:4">3:4</option>
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit Panel */}
                {editorImage && (
                    <div className="p-4 border-t border-gray-700 bg-gray-900">
                        <div className="flex gap-3 items-end">
                            <div className="flex-1">
                                <label className="text-xs text-gray-400 mb-1 block">Edit Instruction</label>
                                <Input
                                    value={editPrompt}
                                    onChange={(e) => setEditPrompt(e.target.value)}
                                    placeholder="Describe the edit (e.g., 'change hair to blonde', 'add sunglasses')"
                                />
                            </div>
                            <Button
                                variant="solid"
                                onClick={handleSubmitEdit}
                                loading={isSubmittingEdit}
                                disabled={!editPrompt.trim()}
                            >
                                Apply Edit
                            </Button>
                        </div>
                        {editorAssets.length > 0 && (
                            <p className="text-xs text-gray-400 mt-2">
                                {editorAssets.length} reference asset(s) will be used to guide the edit
                            </p>
                        )}
                    </div>
                )}

                {/* Hidden File Inputs */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                />
                <input
                    ref={assetInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAssetUpload}
                />
            </div>
        </Dialog>
    )
}

export default ImageEditorPanel
