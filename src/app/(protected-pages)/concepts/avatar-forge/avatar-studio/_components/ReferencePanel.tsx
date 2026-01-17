'use client'

import { useRef, useCallback, useState } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Slider from '@/components/ui/Slider'
import Card from '@/components/ui/Card'
import ScrollBar from '@/components/ui/ScrollBar'
import { HiOutlineUpload, HiOutlineX, HiOutlineLockClosed, HiOutlineLockOpen, HiOutlineSave, HiOutlineUser } from 'react-icons/hi'
import type { ReferenceImage } from '../types'
import { createThumbnail } from '@/utils/imageOptimization'

interface ReferencePanelProps {
    onSaveAvatar?: (name: string) => Promise<void>
    onAnalyzeFace?: () => Promise<void>
}

const ReferencePanel = ({ onSaveAvatar, onAnalyzeFace }: ReferencePanelProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const faceInputRef = useRef<HTMLInputElement>(null)
    const angleInputRef = useRef<HTMLInputElement>(null)
    const bodyInputRef = useRef<HTMLInputElement>(null)

    const [showSaveInput, setShowSaveInput] = useState(false)
    const [saveAvatarName, setSaveAvatarName] = useState('')
    const [isAnalyzingFace, setIsAnalyzingFace] = useState(false)

    const {
        generalReferences,
        faceRef,
        angleRef,
        bodyRef,
        identityWeight,
        measurements,
        faceDescription,
        isAvatarLocked,
        avatarName,
        isSavingAvatar,
        addGeneralReference,
        removeGeneralReference,
        setFaceRef,
        setAngleRef,
        setBodyRef,
        setIdentityWeight,
        setMeasurements,
        setFaceDescription,
        lockAvatar,
        unlockAvatar,
        hasAvatarRefs,
    } = useAvatarStudioStore()

    const processFile = useCallback(
        async (file: File, type: 'general' | 'face' | 'angle' | 'body') => {
            if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(file.type)) {
                return
            }

            const reader = new FileReader()
            reader.onload = async (e) => {
                const result = e.target?.result as string
                const matches = result.match(/^data:(.+);base64,(.+)$/)
                if (matches) {
                    // Create optimized thumbnail for UI display (200x200)
                    let thumbnailUrl = result
                    try {
                        thumbnailUrl = await createThumbnail(matches[2], 'THUMBNAIL')
                    } catch {
                        // Fallback to original if thumbnail creation fails
                    }

                    const newImage: ReferenceImage = {
                        id: crypto.randomUUID(),
                        url: result, // Keep original for full-res display when needed
                        mimeType: matches[1],
                        base64: matches[2],
                        type,
                        thumbnailUrl, // Optimized thumbnail for grid display
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
                        case 'body':
                            setBodyRef(newImage)
                            break
                    }
                }
            }
            reader.readAsDataURL(file)
        },
        [addGeneralReference, setFaceRef, setAngleRef, setBodyRef]
    )

    const handleFileChange = (
        event: React.ChangeEvent<HTMLInputElement>,
        type: 'general' | 'face' | 'angle' | 'body'
    ) => {
        const files = event.target.files
        if (!files) return

        Array.from(files).forEach((file) => processFile(file, type))
        event.target.value = ''
    }

    const handleLockToggle = () => {
        if (isAvatarLocked) {
            unlockAvatar()
        } else if (hasAvatarRefs()) {
            lockAvatar()
        }
    }

    const handleSave = async () => {
        if (!saveAvatarName.trim() || !onSaveAvatar) return
        await onSaveAvatar(saveAvatarName.trim())
        setShowSaveInput(false)
        setSaveAvatarName('')
    }

    const handleAnalyzeFace = async () => {
        if (!onAnalyzeFace) return
        setIsAnalyzingFace(true)
        try {
            await onAnalyzeFace()
        } finally {
            setIsAnalyzingFace(false)
        }
    }

    const ReferenceSlot = ({
        title,
        subtitle,
        image,
        onUpload,
        onRemove,
        onDrop,
    }: {
        title: string
        subtitle: string
        image: ReferenceImage | null
        onUpload: () => void
        onRemove: () => void
        onDrop: (file: File) => void
    }) => {
        const [isDragOver, setIsDragOver] = useState(false)

        const handleDragOver = (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            if (!isAvatarLocked) {
                setIsDragOver(true)
            }
        }

        const handleDragLeave = (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(false)
        }

        const handleDrop = (e: React.DragEvent) => {
            e.preventDefault()
            e.stopPropagation()
            setIsDragOver(false)

            if (isAvatarLocked) return

            const files = e.dataTransfer.files
            if (files.length > 0) {
                onDrop(files[0])
            }
        }

        return (
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
                            src={image.thumbnailUrl || image.url}
                            alt={title}
                            className="w-full h-24 object-cover rounded-lg"
                        />
                        {!isAvatarLocked && (
                            <button
                                onClick={onRemove}
                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <HiOutlineX className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={onUpload}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        disabled={isAvatarLocked}
                        className={`w-full h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            isDragOver
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-gray-300 dark:border-gray-600 text-gray-400 hover:border-primary hover:text-primary'
                        }`}
                    >
                        <HiOutlineUpload className="w-5 h-5 mb-1" />
                        <span className="text-xs">{isDragOver ? 'Drop here' : 'Upload'}</span>
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className="w-80 h-full flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <HiOutlineUser className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold">Avatar References</h3>
                    </div>
                    <Button
                        size="xs"
                        variant={isAvatarLocked ? 'solid' : 'plain'}
                        color={isAvatarLocked ? 'green' : 'gray'}
                        icon={isAvatarLocked ? <HiOutlineLockClosed /> : <HiOutlineLockOpen />}
                        onClick={handleLockToggle}
                        disabled={!hasAvatarRefs() && !isAvatarLocked}
                    >
                        {isAvatarLocked ? 'Locked' : 'Lock'}
                    </Button>
                </div>

                {avatarName && (
                    <div className="text-sm text-primary font-medium mb-2">
                        Editing: {avatarName}
                    </div>
                )}

                {/* Save/Save As */}
                {hasAvatarRefs() && (
                    <div className="space-y-2">
                        {showSaveInput ? (
                            <div className="flex gap-2">
                                <Input
                                    size="sm"
                                    placeholder="Avatar name"
                                    value={saveAvatarName}
                                    onChange={(e) => setSaveAvatarName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                />
                                <Button size="sm" onClick={handleSave} loading={isSavingAvatar}>
                                    Save
                                </Button>
                                <Button
                                    size="sm"
                                    variant="plain"
                                    onClick={() => setShowSaveInput(false)}
                                >
                                    Cancel
                                </Button>
                            </div>
                        ) : (
                            <Button
                                size="sm"
                                variant="solid"
                                icon={<HiOutlineSave />}
                                onClick={() => setShowSaveInput(true)}
                                block
                            >
                                Save Avatar
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Reference Slots */}
            <ScrollBar className="flex-1">
            <div className="p-4 space-y-4">
                {/* General References */}
                <Card className="p-3">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium">General Identity</h4>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isAvatarLocked}
                            className="text-xs text-primary hover:underline disabled:opacity-50"
                        >
                            + Add
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
                        <div className="grid grid-cols-3 gap-2">
                            {generalReferences.map((ref) => (
                                <div key={ref.id} className="relative group">
                                    <img
                                        src={ref.thumbnailUrl || ref.url}
                                        alt="Reference"
                                        className="w-full aspect-square object-cover rounded"
                                    />
                                    {!isAvatarLocked && (
                                        <button
                                            onClick={() => removeGeneralReference(ref.id)}
                                            className="absolute top-0.5 right-0.5 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <HiOutlineX className="w-2.5 h-2.5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 text-center py-4">
                            Add photos of your avatar
                        </p>
                    )}
                </Card>

                {/* Specific References */}
                <Card className="p-3 space-y-3">
                    <h4 className="text-sm font-medium">Specific References</h4>

                    <ReferenceSlot
                        title="Face"
                        subtitle="Close-up face shot"
                        image={faceRef}
                        onUpload={() => faceInputRef.current?.click()}
                        onRemove={() => setFaceRef(null)}
                        onDrop={(file) => processFile(file, 'face')}
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
                        subtitle="Multiple angles for 3D structure"
                        image={angleRef}
                        onUpload={() => angleInputRef.current?.click()}
                        onRemove={() => setAngleRef(null)}
                        onDrop={(file) => processFile(file, 'angle')}
                    />
                    <input
                        ref={angleInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileChange(e, 'angle')}
                    />

                    <ReferenceSlot
                        title="Body"
                        subtitle="Full body reference"
                        image={bodyRef}
                        onUpload={() => bodyInputRef.current?.click()}
                        onRemove={() => setBodyRef(null)}
                        onDrop={(file) => processFile(file, 'body')}
                    />
                    <input
                        ref={bodyInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileChange(e, 'body')}
                    />
                </Card>

                {/* Identity Weight */}
                <Card className="p-3">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium">Identity Weight</h4>
                        <span className="text-xs font-mono text-primary">{identityWeight}%</span>
                    </div>
                    <Slider
                        value={identityWeight}
                        onChange={(val) => setIdentityWeight(val as number)}
                        min={0}
                        max={100}
                        disabled={isAvatarLocked}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        {identityWeight > 85 ? 'Deepfake-level' : identityWeight > 50 ? 'High consistency' : 'Flexible'}
                    </p>
                </Card>

                {/* Physical Attributes */}
                <Card className="p-3">
                    <h4 className="text-sm font-medium mb-3">Physical Attributes</h4>
                    <div className="space-y-3">
                        {/* Body Type Selector */}
                        <div>
                            <label className="text-xs text-gray-500 mb-1 block">Body Type</label>
                            <div className="flex flex-wrap gap-1.5">
                                {(['petite', 'slim', 'athletic', 'average', 'curvy', 'hourglass', 'plus-size'] as const).map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => setMeasurements({ ...measurements, bodyType: type })}
                                        disabled={isAvatarLocked}
                                        className={`px-2 py-1 text-xs rounded-md border transition-colors capitalize ${
                                            measurements.bodyType === type
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary'
                                        } disabled:opacity-50`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Age and Height */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-gray-500">Age</label>
                                <Input
                                    size="sm"
                                    type="number"
                                    value={measurements.age}
                                    onChange={(e) =>
                                        setMeasurements({
                                            ...measurements,
                                            age: parseInt(e.target.value) || 25,
                                        })
                                    }
                                    disabled={isAvatarLocked}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Height (cm)</label>
                                <Input
                                    size="sm"
                                    type="number"
                                    value={measurements.height}
                                    onChange={(e) =>
                                        setMeasurements({
                                            ...measurements,
                                            height: parseInt(e.target.value) || 165,
                                        })
                                    }
                                    disabled={isAvatarLocked}
                                />
                            </div>
                        </div>

                        {/* Measurements */}
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <label className="text-xs text-gray-500">Bust</label>
                                <Input
                                    size="sm"
                                    type="number"
                                    value={measurements.bust}
                                    onChange={(e) =>
                                        setMeasurements({
                                            ...measurements,
                                            bust: parseInt(e.target.value) || 90,
                                        })
                                    }
                                    disabled={isAvatarLocked}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Waist</label>
                                <Input
                                    size="sm"
                                    type="number"
                                    value={measurements.waist}
                                    onChange={(e) =>
                                        setMeasurements({
                                            ...measurements,
                                            waist: parseInt(e.target.value) || 60,
                                        })
                                    }
                                    disabled={isAvatarLocked}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Hips</label>
                                <Input
                                    size="sm"
                                    type="number"
                                    value={measurements.hips}
                                    onChange={(e) =>
                                        setMeasurements({
                                            ...measurements,
                                            hips: parseInt(e.target.value) || 90,
                                        })
                                    }
                                    disabled={isAvatarLocked}
                                />
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Face Description */}
                <Card className="p-3">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium">Face Description</h4>
                        {(faceRef || generalReferences.length > 0) && (
                            <button
                                onClick={handleAnalyzeFace}
                                disabled={isAvatarLocked || isAnalyzingFace}
                                className="text-xs text-primary hover:underline disabled:opacity-50"
                            >
                                {isAnalyzingFace ? 'Analyzing...' : 'Auto-Analyze'}
                            </button>
                        )}
                    </div>
                    <textarea
                        value={faceDescription}
                        onChange={(e) => setFaceDescription(e.target.value)}
                        placeholder="Describe facial features for consistency..."
                        rows={3}
                        disabled={isAvatarLocked}
                        className="w-full text-sm p-2 border rounded-lg bg-transparent resize-none disabled:opacity-50"
                    />
                </Card>
            </div>
            </ScrollBar>
        </div>
    )
}

export default ReferencePanel
