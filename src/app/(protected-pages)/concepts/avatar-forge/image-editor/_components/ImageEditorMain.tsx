'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Slider from '@/components/ui/Slider'
import ScrollBar from '@/components/ui/ScrollBar'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    HiOutlineZoomIn,
    HiOutlineZoomOut,
    HiOutlineUpload,
    HiOutlinePhotograph,
    HiOutlineTrash,
    HiOutlineRefresh,
    HiOutlinePlus,
    HiOutlinePencil,
    HiOutlineDownload,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
} from 'react-icons/hi'
import { editImage } from '@/services/GeminiService'
import type { AspectRatio } from '@/@types/supabase'

interface ReferenceImage {
    id: string
    url: string
    mimeType: string
    base64: string
}

interface EditedImage {
    id: string
    url: string
    prompt: string
    timestamp: number
}

interface ImageEditorMainProps {
    userId?: string
}

const MIN_ZOOM = 25
const MAX_ZOOM = 400
const ZOOM_STEP = 25

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ImageEditorMain = ({ userId }: ImageEditorMainProps) => {
    // Main image state
    const [mainImage, setMainImage] = useState<ReferenceImage | null>(null)
    const [editedImages, setEditedImages] = useState<EditedImage[]>([])
    const [currentIndex, setCurrentIndex] = useState(-1)

    // Editing state
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

    // Zoom/Pan
    const [zoom, setZoom] = useState(100)
    const [panPosition, setPanPosition] = useState({ x: 0, y: 0 })
    const [isPanning, setIsPanning] = useState(false)
    const [panStart, setPanStart] = useState({ x: 0, y: 0 })

    // Assets
    const [assets, setAssets] = useState<ReferenceImage[]>([])

    // Refs
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const imageRef = useRef<HTMLImageElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const assetInputRef = useRef<HTMLInputElement>(null)
    const isDrawingRef = useRef(false)
    const lastPosRef = useRef({ x: 0, y: 0 })

    // Current display image
    const displayImage = currentIndex >= 0 ? editedImages[currentIndex]?.url : mainImage?.url

    // Navigation
    const hasNext = currentIndex < editedImages.length - 1
    const hasPrev = currentIndex > 0 || (currentIndex === 0 && mainImage)

    const handleNext = () => {
        if (hasNext) {
            setCurrentIndex(currentIndex + 1)
        }
    }

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1)
        } else if (currentIndex === 0 && mainImage) {
            setCurrentIndex(-1)
        }
    }

    // Zoom controls
    const zoomIn = () => setZoom(Math.min(zoom + ZOOM_STEP, MAX_ZOOM))
    const zoomOut = () => setZoom(Math.max(zoom - ZOOM_STEP, MIN_ZOOM))
    const resetZoom = () => {
        setZoom(100)
        setPanPosition({ x: 0, y: 0 })
    }

    // Mouse wheel zoom
    const handleWheel = useCallback(
        (e: React.WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault()
                const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
                setZoom(Math.max(MIN_ZOOM, Math.min(zoom + delta, MAX_ZOOM)))
            }
        },
        [zoom]
    )

    // Pan handlers
    const handlePanStart = (e: React.MouseEvent) => {
        if (zoom <= 100 || isDrawingMask) return
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
        if (displayImage && imageRef.current) {
            updateCanvasSize()
            window.addEventListener('resize', updateCanvasSize)
            return () => window.removeEventListener('resize', updateCanvasSize)
        }
    }, [displayImage, updateCanvasSize])

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
            const matches = base64.match(/^data:(.+);base64,(.+)$/)
            if (matches) {
                setMainImage({
                    id: `main-${Date.now()}`,
                    url: base64,
                    mimeType: matches[1],
                    base64: matches[2],
                })
                setCurrentIndex(-1)
                setEditedImages([])
            }
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
            const matches = base64.match(/^data:(.+);base64,(.+)$/)
            if (matches) {
                const newAsset: ReferenceImage = {
                    id: `asset-${Date.now()}`,
                    url: base64,
                    mimeType: matches[1],
                    base64: matches[2],
                }
                setAssets((prev) => [...prev, newAsset])
            }
        }
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    // Submit edit
    const handleSubmitEdit = async () => {
        if (!displayImage || !editPrompt.trim()) return
        setIsSubmittingEdit(true)

        try {
            const resultUrl = await editImage(
                displayImage,
                editPrompt,
                maskCanvas,
                editAspectRatio,
                assets.length > 0 ? assets : undefined
            )

            const newEditedImage: EditedImage = {
                id: `edit-${Date.now()}`,
                url: resultUrl,
                prompt: editPrompt,
                timestamp: Date.now(),
            }

            setEditedImages((prev) => [...prev, newEditedImage])
            setCurrentIndex(editedImages.length)
            setEditPrompt('')
            setMaskCanvas(null)
            setIsDrawingMask(false)

            toast.push(
                <Notification type="success" title="Edit Complete">
                    Image edited successfully
                </Notification>
            )
        } catch (error: unknown) {
            console.error('Edit failed:', error)
            const errorMessage = error instanceof Error ? error.message : 'Edit failed'
            toast.push(
                <Notification type="danger" title="Edit Failed">
                    {errorMessage}
                </Notification>
            )
        } finally {
            setIsSubmittingEdit(false)
        }
    }

    // Download
    const handleDownload = () => {
        if (!displayImage) return
        const link = document.createElement('a')
        link.href = displayImage
        link.download = `edited-image-${Date.now()}.jpg`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') handlePrev()
            if (e.key === 'ArrowRight') handleNext()
            if (e.key === '+' || e.key === '=') zoomIn()
            if (e.key === '-') zoomOut()
            if (e.key === '0') resetZoom()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [currentIndex, editedImages.length])

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold">Image Editor</h1>
                    {editedImages.length > 0 && (
                        <span className="text-sm text-gray-500">
                            {currentIndex === -1 ? 'Original' : `Edit ${currentIndex + 1} of ${editedImages.length}`}
                        </span>
                    )}
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-2">
                    <Button size="xs" variant="plain" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>
                        <HiOutlineZoomOut className="w-5 h-5" />
                    </Button>
                    <span className="text-sm font-mono w-14 text-center">{zoom}%</span>
                    <Button size="xs" variant="plain" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>
                        <HiOutlineZoomIn className="w-5 h-5" />
                    </Button>
                    <Button size="xs" variant="plain" onClick={resetZoom}>
                        <HiOutlineRefresh className="w-5 h-5" />
                    </Button>
                    {displayImage && (
                        <Button size="xs" variant="plain" onClick={handleDownload}>
                            <HiOutlineDownload className="w-5 h-5" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Image Area */}
                <div className="flex-1 relative flex items-center justify-center bg-gray-100 dark:bg-gray-800 overflow-hidden">
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
                    {!displayImage && (
                        <div className="flex flex-col items-center justify-center text-gray-400">
                            <HiOutlinePhotograph className="w-20 h-20 mb-4" />
                            <p className="text-xl mb-4">Upload an image to edit</p>
                            <Button
                                variant="solid"
                                size="lg"
                                icon={<HiOutlineUpload />}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                Upload Image
                            </Button>
                        </div>
                    )}

                    {/* Image Display */}
                    {displayImage && (
                        <div
                            className="relative"
                            style={{
                                transform: `scale(${zoom / 100}) translate(${panPosition.x}px, ${panPosition.y}px)`,
                                cursor: zoom > 100 && !isDrawingMask ? 'grab' : 'default',
                            }}
                            onWheel={handleWheel}
                            onMouseDown={!isDrawingMask ? handlePanStart : undefined}
                        >
                            <img
                                ref={imageRef}
                                src={displayImage}
                                alt="Edit target"
                                className="max-h-[70vh] max-w-full rounded-lg shadow-lg"
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
                <div className="w-72 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <h4 className="text-sm font-semibold mb-3">Reference Assets</h4>
                        <Button
                            size="sm"
                            variant="solid"
                            className="w-full"
                            icon={<HiOutlinePlus />}
                            onClick={() => assetInputRef.current?.click()}
                        >
                            Add Asset
                        </Button>
                    </div>

                    <ScrollBar className="flex-1">
                        <div className="p-4 space-y-3">
                            {assets.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-4">
                                    Add reference images to guide the AI edit
                                </p>
                            ) : (
                                assets.map((asset) => (
                                    <Card key={asset.id} className="relative group overflow-hidden">
                                        <img
                                            src={asset.url}
                                            alt="Asset"
                                            className="w-full h-24 object-cover"
                                        />
                                        <button
                                            onClick={() => setAssets((prev) => prev.filter((a) => a.id !== asset.id))}
                                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <HiOutlineTrash className="w-3 h-3" />
                                        </button>
                                    </Card>
                                ))
                            )}
                        </div>
                    </ScrollBar>

                    {/* Upload New Image */}
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
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
            {displayImage && (
                <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
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
                                    <span className="text-xs text-gray-500">Brush:</span>
                                    <div className="w-24">
                                        <Slider
                                            value={brushSize}
                                            onChange={(val) => setBrushSize(val as number)}
                                            min={5}
                                            max={100}
                                        />
                                    </div>
                                    <span className="text-xs text-gray-500 w-8">{brushSize}px</span>
                                </div>
                                <Button size="xs" variant="plain" onClick={clearMask}>
                                    Clear
                                </Button>
                            </>
                        )}

                        <div className="w-px h-6 bg-gray-300 dark:bg-gray-600" />

                        {/* Aspect Ratio */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Aspect:</span>
                            <select
                                value={editAspectRatio}
                                onChange={(e) => setEditAspectRatio(e.target.value as AspectRatio)}
                                className="h-8 px-2 text-sm border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
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
            {displayImage && (
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    <div className="flex gap-3 items-end">
                        <div className="flex-1">
                            <label className="text-xs text-gray-500 mb-1 block">Edit Instruction</label>
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
                    {assets.length > 0 && (
                        <p className="text-xs text-gray-400 mt-2">
                            {assets.length} reference asset(s) will be used to guide the edit
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
    )
}

export default ImageEditorMain
