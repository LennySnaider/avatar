'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAvatarCreatorStore } from '../_store/avatarCreatorStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Slider from '@/components/ui/Slider'
import Card from '@/components/ui/Card'
import ScrollBar from '@/components/ui/ScrollBar'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tooltip from '@/components/ui/Tooltip'
import Dialog from '@/components/ui/Dialog'
import {
    apiCreateAvatar,
    apiUpdateAvatar,
    apiUploadReference,
} from '@/services/AvatarForgeService'
import { analyzeFaceFromImages, generateAvatar } from '@/services/GeminiService'
import {
    HiOutlineUpload,
    HiOutlineX,
    HiOutlineSave,
    HiOutlineUser,
    HiOutlineSparkles,
    HiOutlineArrowRight,
    HiOutlineZoomIn,
    HiOutlineZoomOut,
} from 'react-icons/hi'
import type { ReferenceImage, AvatarWithReferences } from '../types'

interface AvatarCreatorMainProps {
    userId: string
    existingAvatar?: AvatarWithReferences | null
}

const AvatarCreatorMain = ({ userId, existingAvatar }: AvatarCreatorMainProps) => {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const faceInputRef = useRef<HTMLInputElement>(null)
    const angleInputRef = useRef<HTMLInputElement>(null)
    const [isGeneratingAngle, setIsGeneratingAngle] = useState(false)
    const [previewImage, setPreviewImage] = useState<ReferenceImage | null>(null)
    const [previewZoom, setPreviewZoom] = useState(1)

    const handlePreviewClose = useCallback(() => {
        setPreviewImage(null)
        setPreviewZoom(1)
    }, [])

    const handlePreviewZoomIn = useCallback(() => {
        setPreviewZoom(prev => Math.min(prev + 0.25, 3))
    }, [])

    const handlePreviewZoomOut = useCallback(() => {
        setPreviewZoom(prev => Math.max(prev - 0.25, 1))
    }, [])

    const handlePreviewWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault()
        if (e.deltaY < 0) {
            setPreviewZoom(prev => Math.min(prev + 0.25, 3))
        } else {
            setPreviewZoom(prev => Math.max(prev - 0.25, 1))
        }
    }, [])

    const {
        avatarId,
        avatarName,
        generalReferences,
        faceRef,
        angleRef,
        identityWeight,
        measurements,
        faceDescription,
        isSaving,
        isAnalyzing,
        addGeneralReference,
        removeGeneralReference,
        setFaceRef,
        setAngleRef,
        setAvatarId,
        setAvatarName,
        setIdentityWeight,
        setMeasurements,
        setFaceDescription,
        setIsSaving,
        setIsAnalyzing,
        setIsDirty,
        hasReferences,
        loadAvatar,
        reset,
    } = useAvatarCreatorStore()

    // Load existing avatar data
    useEffect(() => {
        if (existingAvatar) {
            const refs: ReferenceImage[] = existingAvatar.avatar_references.map((ref) => ({
                id: ref.id,
                url: '', // Will be loaded from storage
                mimeType: ref.mime_type,
                base64: '',
                type: ref.type as 'general' | 'face' | 'angle' | 'body',
                storagePath: ref.storage_path,
            }))

            loadAvatar({
                id: existingAvatar.id,
                name: existingAvatar.name,
                identityWeight: existingAvatar.identity_weight || 85,
                measurements: (existingAvatar.measurements as typeof measurements) || {
                    age: 25,
                    bust: 0,
                    waist: 0,
                    hips: 0,
                },
                faceDescription: existingAvatar.face_description || '',
                references: refs,
            })
        } else {
            reset()
        }
    }, [existingAvatar, loadAvatar, reset])

    const processFile = useCallback(
        (file: File, type: 'general' | 'face' | 'angle') => {
            if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(file.type)) {
                toast.push(
                    <Notification type="warning" title="Invalid File">
                        Please upload JPG, PNG, or WebP images
                    </Notification>
                )
                return
            }

            const reader = new FileReader()
            reader.onload = (e) => {
                const result = e.target?.result as string
                const matches = result.match(/^data:(.+);base64,(.+)$/)
                if (matches) {
                    const newImage: ReferenceImage = {
                        id: crypto.randomUUID(),
                        url: result,
                        mimeType: matches[1],
                        base64: matches[2],
                        type,
                    }

                    switch (type) {
                        case 'general':
                            addGeneralReference(newImage)
                            break
                        case 'face':
                            setFaceRef(newImage)
                            break
                        case 'angle':
                            setAngleRef(newImage)
                            break
                    }
                }
            }
            reader.readAsDataURL(file)
        },
        [addGeneralReference, setFaceRef, setAngleRef]
    )

    const handleFileChange = (
        event: React.ChangeEvent<HTMLInputElement>,
        type: 'general' | 'face' | 'angle'
    ) => {
        const files = event.target.files
        if (!files) return
        Array.from(files).forEach((file) => processFile(file, type))
        event.target.value = ''
    }

    const handleAnalyzeFace = async () => {
        const imagesToAnalyze = [
            ...(faceRef ? [{ base64: faceRef.base64, mimeType: faceRef.mimeType }] : []),
            ...generalReferences.slice(0, 3).map((r) => ({ base64: r.base64, mimeType: r.mimeType })),
        ]

        if (imagesToAnalyze.length === 0) {
            toast.push(
                <Notification type="warning" title="No Images">
                    Upload face or general references first
                </Notification>
            )
            return
        }

        setIsAnalyzing(true)
        try {
            const description = await analyzeFaceFromImages(imagesToAnalyze)

            if (!description || description.trim().length === 0) {
                throw new Error('Empty description returned')
            }

            setFaceDescription(description)
            toast.push(
                <Notification type="success" title="Analysis Complete">
                    Face description generated successfully
                </Notification>
            )
        } catch (error) {
            console.error('Face analysis failed:', error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            toast.push(
                <Notification type="danger" title="Analysis Failed">
                    {errorMessage.includes('API') || errorMessage.includes('key')
                        ? 'API configuration error. Please check settings.'
                        : 'Could not analyze face features. Please try again.'}
                </Notification>
            )
        } finally {
            setIsAnalyzing(false)
        }
    }

    // Generate angle reference from face
    const handleGenerateAngle = async () => {
        if (!faceRef) return

        setIsGeneratingAngle(true)
        try {
            const result = await generateAvatar({
                prompt: 'Face angle reference sheet, 9 images in a 3x3 grid showing the same person from different angles: front view smiling, 3/4 left view, 3/4 right view, profile left, profile right, looking up, looking down, front serious expression, extreme close-up of eyes. No frames, no text, no borders between images, seamless grid layout, ultra high quality, studio lighting, neutral background',
                avatarReferences: generalReferences.map(ref => ({ base64: ref.base64, mimeType: ref.mimeType })),
                assetReferences: [],
                sceneReference: null,
                faceRefImage: { base64: faceRef.base64, mimeType: faceRef.mimeType },
                bodyRefImage: null, // Body ref is now a session tool in the Studio
                angleRefImage: null,
                poseRefImage: null,
                aspectRatio: '1:1',
                identityWeight: 95,
                measurements,
                faceDescription,
            })
            const dataUrl = result.url

            // Extract mimeType and base64 from the data URL
            const matches = dataUrl.match(/^data:(.+);base64,(.+)$/)
            if (!matches) throw new Error('Invalid image data returned')

            const newAngleImage: ReferenceImage = {
                id: crypto.randomUUID(),
                url: dataUrl,
                mimeType: matches[1],
                base64: matches[2],
                type: 'angle',
            }

            setAngleRef(newAngleImage)
            toast.push(
                <Notification type="success" title="Angle Generated">
                    Angle reference created from face image
                </Notification>
            )
        } catch (error) {
            console.error('Error generating angle:', error)
            toast.push(
                <Notification type="danger" title="Generation Failed">
                    Could not generate angle reference
                </Notification>
            )
        } finally {
            setIsGeneratingAngle(false)
        }
    }

    const handleSave = async () => {
        if (!avatarName.trim()) {
            toast.push(
                <Notification type="warning" title="Name Required">
                    Please enter a name for your avatar
                </Notification>
            )
            return
        }

        if (!hasReferences()) {
            toast.push(
                <Notification type="warning" title="References Required">
                    Please upload at least one reference image
                </Notification>
            )
            return
        }

        setIsSaving(true)
        try {
            let savedAvatarId = avatarId

            // Create or update avatar
            if (savedAvatarId) {
                await apiUpdateAvatar(savedAvatarId, {
                    name: avatarName,
                    identity_weight: identityWeight,
                    face_description: faceDescription,
                    measurements,
                })
            } else {
                const avatar = await apiCreateAvatar({
                    user_id: userId,
                    name: avatarName,
                    identity_weight: identityWeight,
                    face_description: faceDescription,
                    measurements,
                })
                savedAvatarId = avatar.id
                setAvatarId(savedAvatarId)
            }

            // Upload new references (those without storagePath)
            // Note: Body ref is now a session tool in the Studio, not saved with avatar
            const allRefs = [
                ...generalReferences,
                ...(faceRef ? [faceRef] : []),
                ...(angleRef ? [angleRef] : []),
            ]

            for (const ref of allRefs) {
                if (!ref.storagePath && ref.base64) {
                    // Convert base64 to File
                    const byteString = atob(ref.base64)
                    const arrayBuffer = new ArrayBuffer(byteString.length)
                    const uint8Array = new Uint8Array(arrayBuffer)
                    for (let i = 0; i < byteString.length; i++) {
                        uint8Array[i] = byteString.charCodeAt(i)
                    }
                    const blob = new Blob([uint8Array], { type: ref.mimeType })
                    const file = new File([blob], `${ref.type}-${Date.now()}.jpg`, {
                        type: ref.mimeType,
                    })

                    await apiUploadReference(savedAvatarId!, userId, file, ref.type)
                }
            }

            setIsDirty(false)
            toast.push(
                <Notification type="success" title="Avatar Saved">
                    {avatarId ? 'Avatar updated successfully' : 'Avatar created successfully'}
                </Notification>
            )
        } catch (error) {
            console.error('Save failed:', error)
            toast.push(
                <Notification type="danger" title="Save Failed">
                    Could not save avatar
                </Notification>
            )
        } finally {
            setIsSaving(false)
        }
    }

    const handleGoToStudio = () => {
        if (avatarId) {
            router.push(`/concepts/avatar-forge/avatar-studio/${avatarId}`)
        } else {
            toast.push(
                <Notification type="warning" title="Save First">
                    Please save your avatar before going to the studio
                </Notification>
            )
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDrop = (
        e: React.DragEvent,
        type: 'general' | 'face' | 'angle'
    ) => {
        e.preventDefault()
        e.stopPropagation()
        const files = e.dataTransfer.files
        if (files) {
            Array.from(files).forEach((file) => processFile(file, type))
        }
    }

    const ReferenceSlot = ({
        title,
        subtitle,
        image,
        onUpload,
        onRemove,
        dropType,
        onAutoGenerate,
        isGenerating,
        canGenerate,
    }: {
        title: string
        subtitle: string
        image: ReferenceImage | null
        onUpload: () => void
        onRemove: () => void
        dropType: 'face' | 'angle'
        onAutoGenerate?: () => void
        isGenerating?: boolean
        canGenerate?: boolean
    }) => (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-gray-500">{subtitle}</p>
                </div>
            </div>
            {image ? (
                <div className="relative group">
                    <img
                        src={image.url || image.storagePath}
                        alt={title}
                        className="w-full h-32 object-cover rounded-lg cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                        onClick={() => setPreviewImage(image)}
                    />
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove() }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <HiOutlineX className="w-3 h-3" />
                    </button>
                </div>
            ) : isGenerating ? (
                <div className="w-full h-32 border-2 border-primary border-dashed rounded-lg flex flex-col items-center justify-center">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-primary mt-2">Generating...</span>
                </div>
            ) : (
                <div className="space-y-2">
                    <div
                        onClick={onUpload}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, dropType)}
                        className="w-full h-28 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-primary hover:text-primary transition-colors cursor-pointer"
                    >
                        <HiOutlineUpload className="w-6 h-6 mb-1" />
                        <span className="text-sm">Upload</span>
                    </div>
                    {onAutoGenerate && canGenerate && (
                        <Tooltip title="Auto-generate from Face">
                            <button
                                onClick={onAutoGenerate}
                                className="w-full px-2 py-1.5 bg-primary text-white text-xs rounded-lg shadow hover:bg-primary-dark transition-colors flex items-center justify-center gap-1"
                            >
                                <HiOutlineSparkles className="w-3 h-3" />
                                Auto-Generate
                            </button>
                        </Tooltip>
                    )}
                </div>
            )}
        </div>
    )

    return (
        <div className="h-full flex">
            {/* Main Content */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                    <div className="flex items-center gap-3">
                        <HiOutlineUser className="w-6 h-6 text-primary" />
                        <div>
                            <h1 className="text-xl font-bold">
                                {avatarId ? 'Edit Avatar' : 'Create New Avatar'}
                            </h1>
                            <p className="text-xs text-gray-500">
                                Upload reference images and configure your avatar identity
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {avatarId && (
                            <Button
                                variant="solid"
                                color="green"
                                icon={<HiOutlineArrowRight />}
                                onClick={handleGoToStudio}
                            >
                                Go to Studio
                            </Button>
                        )}
                        <Button
                            variant="solid"
                            icon={<HiOutlineSave />}
                            onClick={handleSave}
                            loading={isSaving}
                            disabled={!hasReferences() || !avatarName.trim()}
                        >
                            {avatarId ? 'Update' : 'Save Avatar'}
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <ScrollBar className="flex-1">
                    <div className="p-6 max-w-4xl mx-auto space-y-6">
                        {/* Avatar Name */}
                        <Card className="p-4">
                            <h3 className="text-sm font-semibold mb-3">Avatar Name</h3>
                            <Input
                                placeholder="Enter a name for your avatar..."
                                value={avatarName}
                                onChange={(e) => setAvatarName(e.target.value)}
                            />
                        </Card>

                        {/* General References */}
                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="text-sm font-semibold">General Identity Photos</h3>
                                    <p className="text-xs text-gray-500">
                                        Upload multiple photos of your avatar from different angles
                                    </p>
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-sm text-primary hover:underline"
                                >
                                    + Add Photos
                                </button>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => handleFileChange(e, 'general')}
                            />
                            {generalReferences.length > 0 ? (
                                <div className="grid grid-cols-4 gap-3">
                                    {generalReferences.map((ref) => (
                                        <div key={ref.id} className="relative group">
                                            <img
                                                src={ref.url}
                                                alt="Reference"
                                                className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                                onClick={() => setPreviewImage(ref)}
                                            />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); removeGeneralReference(ref.id) }}
                                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <HiOutlineX className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, 'general')}
                                    className="h-40 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-primary hover:text-primary transition-colors cursor-pointer"
                                >
                                    <HiOutlineUpload className="w-8 h-8 mb-2" />
                                    <span>Click to upload photos</span>
                                    <span className="text-xs">JPG, PNG, WebP supported</span>
                                </div>
                            )}
                        </Card>

                        {/* Specific References */}
                        <Card className="p-4">
                            <h3 className="text-sm font-semibold mb-4">Specific References (Optional)</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <ReferenceSlot
                                    title="Face Close-up"
                                    subtitle="For facial details"
                                    image={faceRef}
                                    onUpload={() => faceInputRef.current?.click()}
                                    onRemove={() => setFaceRef(null)}
                                    dropType="face"
                                />
                                <input
                                    ref={faceInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleFileChange(e, 'face')}
                                />

                                <ReferenceSlot
                                    title="Angle Sheet"
                                    subtitle="Multiple angles"
                                    image={angleRef}
                                    onUpload={() => angleInputRef.current?.click()}
                                    onRemove={() => setAngleRef(null)}
                                    dropType="angle"
                                    onAutoGenerate={handleGenerateAngle}
                                    isGenerating={isGeneratingAngle}
                                    canGenerate={!!faceRef}
                                />
                                <input
                                    ref={angleInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleFileChange(e, 'angle')}
                                />
                            </div>
                            <p className="text-xs text-gray-400 mt-3 italic">
                                Body Ref is available as a session tool in the Studio
                            </p>
                        </Card>

                        {/* Identity Settings */}
                        <div className="grid grid-cols-2 gap-6">
                            <Card className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold">Identity Weight</h3>
                                    <span className="text-sm font-mono text-primary">{identityWeight}%</span>
                                </div>
                                <Slider
                                    value={identityWeight}
                                    onChange={(val) => setIdentityWeight(val as number)}
                                    min={0}
                                    max={100}
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    {identityWeight > 85
                                        ? 'Very high - Deepfake-level consistency'
                                        : identityWeight > 50
                                        ? 'High - Strong identity preservation'
                                        : 'Low - More creative freedom'}
                                </p>
                            </Card>

                            <Card className="p-4">
                                <h3 className="text-sm font-semibold mb-3">Physical Attributes</h3>
                                <div className="space-y-4">
                                    {/* Body Type */}
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Body Type</label>
                                        <div className="flex flex-wrap gap-1">
                                            {(['petite', 'slim', 'athletic', 'average', 'curvy', 'hourglass', 'plus-size'] as const).map((type) => (
                                                <button
                                                    key={type}
                                                    onClick={() => setMeasurements({ ...measurements, bodyType: type })}
                                                    className={`px-2 py-1 text-xs rounded border transition-colors capitalize ${
                                                        measurements.bodyType === type
                                                            ? 'bg-primary text-white border-primary'
                                                            : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary'
                                                    }`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Skin Tone */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label className="text-xs text-gray-500">Skin Tone</label>
                                            <span className="text-xs font-mono text-primary">
                                                {measurements.skinTone === 1 ? 'Very Fair' :
                                                 measurements.skinTone === 2 ? 'Fair' :
                                                 measurements.skinTone === 3 ? 'Light' :
                                                 measurements.skinTone === 4 ? 'Light-Medium' :
                                                 measurements.skinTone === 5 ? 'Medium' :
                                                 measurements.skinTone === 6 ? 'Medium-Tan' :
                                                 measurements.skinTone === 7 ? 'Tan' :
                                                 measurements.skinTone === 8 ? 'Dark' :
                                                 measurements.skinTone === 9 ? 'Very Dark' : 'Medium'}
                                            </span>
                                        </div>
                                        <div className="h-3 rounded-full overflow-hidden flex mb-1">
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((tone) => (
                                                <button
                                                    key={tone}
                                                    onClick={() => setMeasurements({ ...measurements, skinTone: tone as 1|2|3|4|5|6|7|8|9 })}
                                                    className={`flex-1 transition-all ${
                                                        measurements.skinTone === tone ? 'ring-2 ring-primary ring-offset-1 z-10 scale-110' : ''
                                                    }`}
                                                    style={{
                                                        backgroundColor:
                                                            tone === 1 ? '#FFECD2' :
                                                            tone === 2 ? '#FFE4C4' :
                                                            tone === 3 ? '#F5D5B8' :
                                                            tone === 4 ? '#E8C4A0' :
                                                            tone === 5 ? '#D4A574' :
                                                            tone === 6 ? '#C68642' :
                                                            tone === 7 ? '#A0522D' :
                                                            tone === 8 ? '#6B4423' :
                                                            '#3D2314'
                                                    }}
                                                    title={
                                                        tone === 1 ? 'Very Fair' :
                                                        tone === 2 ? 'Fair' :
                                                        tone === 3 ? 'Light' :
                                                        tone === 4 ? 'Light-Medium' :
                                                        tone === 5 ? 'Medium' :
                                                        tone === 6 ? 'Medium-Tan' :
                                                        tone === 7 ? 'Tan' :
                                                        tone === 8 ? 'Dark' :
                                                        'Very Dark'
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Hair Color */}
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Hair Color</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {([
                                                { value: 'black', color: '#0a0a0a', label: 'Black' },
                                                { value: 'dark-brown', color: '#3b2314', label: 'Dark Brown' },
                                                { value: 'brown', color: '#6b4423', label: 'Brown' },
                                                { value: 'light-brown', color: '#a0522d', label: 'Light Brown' },
                                                { value: 'dark-blonde', color: '#b8860b', label: 'Dark Blonde' },
                                                { value: 'blonde', color: '#daa520', label: 'Blonde' },
                                                { value: 'platinum-blonde', color: '#f5f5dc', label: 'Platinum' },
                                                { value: 'red', color: '#8b0000', label: 'Red' },
                                                { value: 'auburn', color: '#a52a2a', label: 'Auburn' },
                                                { value: 'ginger', color: '#ff6347', label: 'Ginger' },
                                                { value: 'gray', color: '#808080', label: 'Gray' },
                                                { value: 'silver', color: '#c0c0c0', label: 'Silver' },
                                                { value: 'white', color: '#f8f8ff', label: 'White' },
                                            ] as const).map((hair) => (
                                                <Tooltip key={hair.value} title={hair.label}>
                                                    <button
                                                        onClick={() => setMeasurements({ ...measurements, hairColor: hair.value })}
                                                        className={`w-5 h-5 rounded-full border transition-all ${
                                                            measurements.hairColor === hair.value
                                                                ? 'ring-2 ring-primary ring-offset-1 scale-110'
                                                                : 'border-gray-300 dark:border-gray-600 hover:scale-105'
                                                        }`}
                                                        style={{ backgroundColor: hair.color }}
                                                    />
                                                </Tooltip>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Measurements */}
                                    <div className="flex gap-2">
                                        <div>
                                            <label className="text-xs text-gray-500">Age</label>
                                            <Input
                                                size="sm"
                                                type="number"
                                                style={{ width: '70px' }}
                                                value={measurements.age}
                                                onChange={(e) =>
                                                    setMeasurements({
                                                        ...measurements,
                                                        age: parseInt(e.target.value) || 25,
                                                    })
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Height</label>
                                            <Input
                                                size="sm"
                                                type="number"
                                                style={{ width: '70px' }}
                                                value={measurements.height}
                                                onChange={(e) =>
                                                    setMeasurements({
                                                        ...measurements,
                                                        height: parseInt(e.target.value) || 165,
                                                    })
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Bust</label>
                                            <Input
                                                size="sm"
                                                type="number"
                                                style={{ width: '70px' }}
                                                value={measurements.bust}
                                                onChange={(e) =>
                                                    setMeasurements({
                                                        ...measurements,
                                                        bust: parseInt(e.target.value) || 90,
                                                    })
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Waist</label>
                                            <Input
                                                size="sm"
                                                type="number"
                                                style={{ width: '70px' }}
                                                value={measurements.waist}
                                                onChange={(e) =>
                                                    setMeasurements({
                                                        ...measurements,
                                                        waist: parseInt(e.target.value) || 60,
                                                    })
                                                }
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500">Hips</label>
                                            <Input
                                                size="sm"
                                                type="number"
                                                style={{ width: '70px' }}
                                                value={measurements.hips}
                                                onChange={(e) =>
                                                    setMeasurements({
                                                        ...measurements,
                                                        hips: parseInt(e.target.value) || 90,
                                                    })
                                                }
                                            />
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Face Description */}
                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="text-sm font-semibold">Face Description</h3>
                                    <p className="text-xs text-gray-500">
                                        Detailed description for consistent facial features
                                    </p>
                                </div>
                                {hasReferences() && (
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        icon={<HiOutlineSparkles />}
                                        onClick={handleAnalyzeFace}
                                        loading={isAnalyzing}
                                    >
                                        Auto-Analyze
                                    </Button>
                                )}
                            </div>
                            <textarea
                                value={faceDescription}
                                onChange={(e) => setFaceDescription(e.target.value)}
                                placeholder="Describe facial features: eye shape, nose, lips, skin tone, distinctive features..."
                                rows={4}
                                className="w-full p-3 border rounded-lg bg-transparent resize-none"
                            />
                        </Card>
                    </div>
                </ScrollBar>
            </div>

            {/* Image Preview Dialog */}
            <Dialog
                isOpen={!!previewImage}
                onClose={handlePreviewClose}
                onRequestClose={handlePreviewClose}
                width={700}
            >
                {previewImage && (
                    <div className="flex flex-col">
                        {/* Zoom Controls */}
                        <div className="flex items-center justify-center gap-2 p-2 border-b">
                            <button
                                onClick={handlePreviewZoomOut}
                                disabled={previewZoom <= 1}
                                className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Zoom Out"
                            >
                                <HiOutlineZoomOut className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPreviewZoom(1)}
                                className="px-3 py-1 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white min-w-14 text-center"
                                title="Reset Zoom"
                            >
                                {Math.round(previewZoom * 100)}%
                            </button>
                            <button
                                onClick={handlePreviewZoomIn}
                                disabled={previewZoom >= 3}
                                className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Zoom In"
                            >
                                <HiOutlineZoomIn className="w-4 h-4" />
                            </button>
                        </div>
                        {/* Image */}
                        <div
                            className="p-2 overflow-auto max-h-[70vh] flex items-center justify-center"
                            onWheel={handlePreviewWheel}
                        >
                            <img
                                src={previewImage.url || previewImage.storagePath}
                                alt="Preview"
                                className="rounded-lg object-contain select-none"
                                style={{
                                    transform: `scale(${previewZoom})`,
                                    transition: 'transform 0.2s ease-out',
                                    maxHeight: previewZoom === 1 ? '65vh' : 'none',
                                }}
                                draggable={false}
                            />
                        </div>
                    </div>
                )}
            </Dialog>
        </div>
    )
}

export default AvatarCreatorMain
