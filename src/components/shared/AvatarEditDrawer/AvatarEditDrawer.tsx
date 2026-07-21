'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import Drawer from '@/components/ui/Drawer'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Slider from '@/components/ui/Slider'
import Card from '@/components/ui/Card'
import Dialog from '@/components/ui/Dialog'
import Spinner from '@/components/ui/Spinner'
import ScrollBar from '@/components/ui/ScrollBar'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tooltip from '@/components/ui/Tooltip'
import {
    HiOutlineUpload,
    HiOutlineX,
    HiOutlineSave,
    HiOutlineUser,
    HiOutlineSparkles,
    HiOutlineZoomIn,
    HiOutlineZoomOut,
} from 'react-icons/hi'
import { generateAvatar, analyzeFaceFromImages } from '@/services/GeminiService'
import { generateImageKie } from '@/services/KieService'
import type { PhysicalMeasurements } from '@/@types/supabase'
import { createThumbnail, resizeBase64Image } from '@/utils/imageOptimization'
import { buildBodySheetPrompt } from '@/utils/bodySheetPrompt'
import { buildCurvesEmphasis } from '@/utils/bodyDescriptors'
import {
    DEFAULT_PROVIDERS,
    getPermissiveBodyModels,
} from '@/app/(protected-pages)/concepts/avatar-forge/_shared/providerCatalog'
import PhysicalAttributesEditor from '@/components/shared/PhysicalAttributesEditor'

// Modelos permisivos aptos para el body sheet (Seedream/Wan), del catálogo de
// providers por defecto — este drawer es store-agnóstico y no tiene acceso a
// los providers configurados del usuario. Constante de módulo: se calcula una
// sola vez, no en cada render.
const PERMISSIVE_BODY_MODELS = getPermissiveBodyModels(DEFAULT_PROVIDERS)

// Reference image interface
export interface AvatarReferenceImage {
    id: string
    url: string
    mimeType: string
    base64: string
    type: 'general' | 'face' | 'angle' | 'body'
    storagePath?: string
    thumbnailUrl?: string
}

// Avatar data for the drawer
export interface AvatarEditData {
    name?: string
    generalReferences: AvatarReferenceImage[]
    faceRef: AvatarReferenceImage | null
    angleRef: AvatarReferenceImage | null
    bodyRef: AvatarReferenceImage | null
    identityWeight: number
    measurements: PhysicalMeasurements
    faceDescription: string
}

interface AvatarEditDrawerProps {
    isOpen: boolean
    onClose: () => void
    title?: string
    avatarName?: string
    initialData?: AvatarEditData
    onApply?: (data: AvatarEditData) => void
    onSave?: (name: string, data: AvatarEditData) => Promise<void>
    showSaveToDb?: boolean
    isSaving?: boolean
}

const defaultMeasurements: PhysicalMeasurements = {
    age: 25,
    height: 165,
    bodyType: 'average',
    bust: 90,
    waist: 60,
    hips: 90,
    skinTone: 5,
    hairColor: 'brown',
}

const AvatarEditDrawer = ({
    isOpen,
    onClose,
    title,
    avatarName,
    initialData,
    onApply,
    onSave,
    showSaveToDb = true,
    isSaving = false,
}: AvatarEditDrawerProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const faceInputRef = useRef<HTMLInputElement>(null)
    const angleInputRef = useRef<HTMLInputElement>(null)

    const [showSaveInput, setShowSaveInput] = useState(false)
    const [saveAvatarName, setSaveAvatarName] = useState('')
    const [isAnalyzingFace, setIsAnalyzingFace] = useState(false)
    const [isGeneratingAngle, setIsGeneratingAngle] = useState(false)
    const [previewImage, setPreviewImage] =
        useState<AvatarReferenceImage | null>(null)
    const [previewZoom, setPreviewZoom] = useState(1)

    // Local editing state
    const [localGeneralRefs, setLocalGeneralRefs] = useState<
        AvatarReferenceImage[]
    >([])
    const [localFaceRef, setLocalFaceRef] =
        useState<AvatarReferenceImage | null>(null)
    const [localAngleRef, setLocalAngleRef] =
        useState<AvatarReferenceImage | null>(null)
    const [localIdentityWeight, setLocalIdentityWeight] = useState(85)
    const [localMeasurements, setLocalMeasurements] =
        useState<PhysicalMeasurements>(defaultMeasurements)
    const [localFaceDescription, setLocalFaceDescription] = useState('')
    // Body Lab: cuerpo canónico persistido (localBodyRef) + sheet recién
    // generado en preview (bodySheet, sin commitear hasta "Usar como cuerpo").
    const [localBodyRef, setLocalBodyRef] =
        useState<AvatarReferenceImage | null>(null)
    const [bodySheet, setBodySheet] = useState<AvatarReferenceImage | null>(
        null,
    )
    const [isGeneratingBody, setIsGeneratingBody] = useState(false)
    const [selectedBodyModel, setSelectedBodyModel] = useState('')

    // Sync local state from initialData when drawer opens
    useEffect(() => {
        if (isOpen && initialData) {
            setLocalGeneralRefs([...initialData.generalReferences])
            setLocalFaceRef(initialData.faceRef)
            setLocalAngleRef(initialData.angleRef)
            setLocalBodyRef(initialData.bodyRef)
            setBodySheet(null)
            setLocalIdentityWeight(initialData.identityWeight)
            setLocalMeasurements({ ...initialData.measurements })
            setLocalFaceDescription(initialData.faceDescription)
            setSaveAvatarName(avatarName || initialData.name || '')
        }
    }, [isOpen, initialData, avatarName])

    // Default del selector de modelo del Body Lab (primer permisivo).
    useEffect(() => {
        if (!selectedBodyModel && PERMISSIVE_BODY_MODELS.length > 0) {
            setSelectedBodyModel(PERMISSIVE_BODY_MODELS[0].model)
        }
    }, [selectedBodyModel])

    // Get current data object
    const getCurrentData = (): AvatarEditData => ({
        name: saveAvatarName,
        generalReferences: localGeneralRefs,
        faceRef: localFaceRef,
        angleRef: localAngleRef,
        // El cuerpo canónico SÍ se guarda: AvatarCard.handleSaveFromDrawer sube
        // data.bodyRef como type:'body' cuando no tiene storagePath.
        bodyRef: localBodyRef,
        identityWeight: localIdentityWeight,
        measurements: localMeasurements,
        faceDescription: localFaceDescription,
    })

    // Preview handlers
    const handlePreviewClose = useCallback(() => {
        setPreviewImage(null)
        setPreviewZoom(1)
    }, [])

    const handlePreviewZoomIn = useCallback(() => {
        setPreviewZoom((prev) => Math.min(prev + 0.25, 3))
    }, [])

    const handlePreviewZoomOut = useCallback(() => {
        setPreviewZoom((prev) => Math.max(prev - 0.25, 1))
    }, [])

    const handlePreviewWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault()
        if (e.deltaY < 0) {
            setPreviewZoom((prev) => Math.min(prev + 0.25, 3))
        } else {
            setPreviewZoom((prev) => Math.max(prev - 0.25, 1))
        }
    }, [])

    // Process file upload
    const processFile = useCallback(
        async (file: File, type: 'general' | 'face' | 'angle' | 'body') => {
            if (
                ![
                    'image/jpeg',
                    'image/png',
                    'image/webp',
                    'image/heic',
                ].includes(file.type)
            ) {
                toast.push(
                    <Notification type="warning" title="Invalid File">
                        Please upload JPG, PNG, or WebP images
                    </Notification>,
                )
                return
            }

            const reader = new FileReader()
            reader.onload = async (e) => {
                const result = e.target?.result as string
                const matches = result.match(/^data:(.+);base64,(.+)$/)
                if (matches) {
                    let thumbnailUrl = result
                    try {
                        thumbnailUrl = await createThumbnail(
                            matches[2],
                            'THUMBNAIL',
                        )
                    } catch {
                        // Fallback to original
                    }

                    const newImage: AvatarReferenceImage = {
                        id: crypto.randomUUID(),
                        url: result,
                        mimeType: matches[1],
                        base64: matches[2],
                        type,
                        thumbnailUrl,
                    }

                    switch (type) {
                        case 'general':
                            setLocalGeneralRefs((prev) => [...prev, newImage])
                            break
                        case 'face':
                            setLocalFaceRef(newImage)
                            break
                        case 'angle':
                            setLocalAngleRef(newImage)
                            break
                        // Note: 'body' type is now handled as a session tool in the generation bar
                    }
                }
            }
            reader.readAsDataURL(file)
        },
        [],
    )

    const handleFileChange = useCallback(
        (
            event: React.ChangeEvent<HTMLInputElement>,
            type: 'general' | 'face' | 'angle' | 'body',
        ) => {
            const files = event.target.files
            if (!files) return
            Array.from(files).forEach((file) => processFile(file, type))
            event.target.value = ''
        },
        [processFile],
    )

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
    }

    const handleDrop = (
        e: React.DragEvent,
        type: 'general' | 'face' | 'angle' | 'body',
    ) => {
        e.preventDefault()
        e.stopPropagation()
        const files = e.dataTransfer.files
        if (files) {
            Array.from(files).forEach((file) => processFile(file, type))
        }
    }

    const handleRemoveGeneralRef = (id: string) => {
        setLocalGeneralRefs((prev) => prev.filter((r) => r.id !== id))
    }

    // Apply changes
    const handleApplyChanges = () => {
        if (onApply) {
            onApply(getCurrentData())
        }
        toast.push(
            <Notification type="success" title="Changes Applied">
                Avatar settings updated
            </Notification>,
        )
        onClose()
    }

    // Save to database
    const handleSave = async () => {
        if (onSave && saveAvatarName.trim()) {
            await onSave(saveAvatarName.trim(), getCurrentData())
            setShowSaveInput(false)
            setSaveAvatarName('')
        }
    }

    // Analyze face from images
    const handleAnalyzeFace = async () => {
        const validRefs = localFaceRef?.base64
            ? [localFaceRef]
            : localGeneralRefs
                  .filter((r) => r.base64 && r.base64.length > 0)
                  .slice(0, 3)

        if (validRefs.length === 0) {
            toast.push(
                <Notification type="warning" title="No Images">
                    Please add reference images first
                </Notification>,
            )
            return
        }

        setIsAnalyzingFace(true)
        try {
            // Resize each ref to ~1024px before sending — full-res photos blow
            // past Vercel's ~4.5MB server-action body cap (413). Browser canvas.
            const optimizedRefs = await Promise.all(
                validRefs.map(async (img) => {
                    try {
                        return {
                            base64: await resizeBase64Image(img.base64, 'API'),
                            mimeType: 'image/jpeg',
                        }
                    } catch {
                        return { base64: img.base64, mimeType: img.mimeType }
                    }
                }),
            )
            const description = await analyzeFaceFromImages(optimizedRefs)
            if (description) {
                setLocalFaceDescription(description)
                toast.push(
                    <Notification type="success" title="Face Analyzed">
                        Face description generated successfully
                    </Notification>,
                )
            }
        } catch (error) {
            console.error('Face analysis failed:', error)
            toast.push(
                <Notification type="danger" title="Analysis Failed">
                    Could not analyze face
                </Notification>,
            )
        } finally {
            setIsAnalyzingFace(false)
        }
    }

    // Generate angle reference from face
    const handleGenerateAngle = async () => {
        if (!localFaceRef) return

        setIsGeneratingAngle(true)
        try {
            const result = await generateAvatar({
                prompt: 'Face angle reference sheet, 9 images in a 3x3 grid showing the same person from different angles: front view smiling, 3/4 left view, 3/4 right view, profile left, profile right, looking up, looking down, front serious expression, extreme close-up of eyes. No frames, no text, no borders between images, seamless grid layout, ultra high quality, studio lighting, neutral background',
                avatarReferences: localGeneralRefs.map((ref) => ({
                    base64: ref.base64,
                    mimeType: ref.mimeType,
                })),
                assetReferences: [],
                sceneReference: null,
                faceRefImage: {
                    base64: localFaceRef.base64,
                    mimeType: localFaceRef.mimeType,
                },
                bodyRefImage: null, // Body ref is now a session tool
                angleRefImage: null,
                poseRefImage: null,
                aspectRatio: '1:1',
                identityWeight: 95,
                measurements: localMeasurements,
                faceDescription: localFaceDescription,
            })

            if (!result.success) {
                throw new Error(result.error)
            }

            const dataUrl = result.url

            const matches = dataUrl.match(/^data:(.+);base64,(.+)$/)
            if (!matches) throw new Error('Invalid image data returned')

            const thumbnailUrl = await createThumbnail(matches[2], 'THUMBNAIL')

            const newAngleImage: AvatarReferenceImage = {
                id: crypto.randomUUID(),
                url: dataUrl,
                mimeType: matches[1],
                base64: matches[2],
                type: 'angle',
                thumbnailUrl,
            }

            setLocalAngleRef(newAngleImage)
            toast.push(
                <Notification type="success" title="Angle Generated">
                    Angle reference sheet created
                </Notification>,
            )
        } catch (error) {
            console.error('Error generating angle:', error)
            toast.push(
                <Notification type="danger" title="Generation Failed">
                    Could not generate angle reference
                </Notification>,
            )
        } finally {
            setIsGeneratingAngle(false)
        }
    }

    // Normaliza una URL (http(s) o data:) a un AvatarReferenceImage con base64,
    // que es lo que necesita el guardado (resizeBase64Image) y el thumbnail.
    const toBodyReferenceImage = async (
        url: string,
    ): Promise<AvatarReferenceImage> => {
        let dataUrl = url
        if (!url.startsWith('data:')) {
            const blob = await fetch(url).then((r) => r.blob())
            dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result as string)
                reader.onerror = reject
                reader.readAsDataURL(blob)
            })
        }
        const matches = dataUrl.match(/^data:(.+);base64,(.+)$/)
        if (!matches) throw new Error('Invalid image data returned')
        let thumbnailUrl = dataUrl
        try {
            thumbnailUrl = await createThumbnail(matches[2], 'THUMBNAIL')
        } catch {
            // fallback al full
        }
        return {
            id: crypto.randomUUID(),
            url: dataUrl,
            mimeType: matches[1],
            base64: matches[2],
            type: 'body',
            thumbnailUrl,
        }
    }

    // Genera el body angle sheet (3 vistas, mini-bikini) desde los sliders.
    const handleGenerateBody = async () => {
        if (!localFaceRef || !selectedBodyModel) return
        setIsGeneratingBody(true)
        try {
            const result = await generateImageKie({
                // La cara va como referenceImage SINGULAR: las rutas KIE
                // (seedream/qwen/wan/flux2) solo activan el manejo de imagen con
                // este campo, y planExtraRefs ignora el rol 'face' (solo procesa
                // body/pose/clone/etc). Sin esto el modelo queda en text-to-image
                // sin imagen → KIE 500 "This field is required".
                prompt: buildBodySheetPrompt(localMeasurements),
                model: selectedBodyModel,
                aspectRatio: '16:9',
                referenceImage: {
                    base64: localFaceRef.base64,
                    mimeType: localFaceRef.mimeType,
                },
                bodyEmphasis: buildCurvesEmphasis(localMeasurements),
            })
            if (!result.success) throw new Error(result.error)
            const sheet = await toBodyReferenceImage(result.url)
            setBodySheet(sheet)
            toast.push(
                <Notification type="success" title="Cuerpo generado">
                    Sheet de 3 vistas listo. Revísalo y pulsa &quot;Usar como
                    cuerpo&quot;.
                </Notification>,
            )
        } catch (error) {
            console.error('Error generating body sheet:', error)
            toast.push(
                <Notification type="danger" title="Falló la generación">
                    No se pudo generar el cuerpo
                </Notification>,
            )
        } finally {
            setIsGeneratingBody(false)
        }
    }

    const handleUseAsBody = () => {
        if (!bodySheet) return
        setLocalBodyRef(bodySheet)
        toast.push(
            <Notification type="success" title="Cuerpo fijado">
                Se guardará como el cuerpo del avatar al guardar los cambios.
            </Notification>,
        )
    }

    const hasLocalRefs =
        localGeneralRefs.length > 0 || localFaceRef || localAngleRef

    // Reference Slot Component
    const ReferenceSlot = ({
        slotTitle,
        subtitle,
        image,
        onUpload,
        onRemove,
        dropType,
        onAutoGenerate,
        isGenerating,
        canGenerate,
    }: {
        slotTitle: string
        subtitle: string
        image: AvatarReferenceImage | null
        onUpload: () => void
        onRemove: () => void
        dropType: 'face' | 'angle' | 'body'
        onAutoGenerate?: () => void
        isGenerating?: boolean
        canGenerate?: boolean
    }) => (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium">{slotTitle}</p>
                    <p className="text-xs text-gray-500">{subtitle}</p>
                </div>
            </div>
            {image ? (
                <div className="relative group">
                    <img
                        src={
                            image.thumbnailUrl || image.url || image.storagePath
                        }
                        alt={slotTitle}
                        className="w-full h-32 object-cover rounded-lg cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                        onClick={() => setPreviewImage(image)}
                    />
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            onRemove()
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <HiOutlineX className="w-3 h-3" />
                    </button>
                </div>
            ) : isGenerating ? (
                <div className="w-full h-32 border-2 border-primary border-dashed rounded-lg flex flex-col items-center justify-center">
                    <Spinner size={24} />
                    <span className="text-xs text-primary mt-2">
                        Generating...
                    </span>
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
        <>
            <Drawer
                title={
                    <div className="flex items-center gap-2">
                        <HiOutlineUser className="w-5 h-5 text-primary" />
                        <span>{title || 'Edit Avatar'}</span>
                        {avatarName && (
                            <span className="text-sm text-primary font-normal">
                                - {avatarName}
                            </span>
                        )}
                    </div>
                }
                isOpen={isOpen}
                onClose={onClose}
                placement="right"
                width={480}
            >
                <div className="h-full flex flex-col">
                    {/* Scrollable Content */}
                    <ScrollBar className="flex-1">
                        <div className="p-4 space-y-4">
                            {/* General Identity Photos */}
                            <Card className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="text-sm font-semibold">
                                            General Identity Photos
                                        </h3>
                                        <p className="text-xs text-gray-500">
                                            Upload multiple photos from
                                            different angles
                                        </p>
                                    </div>
                                    <button
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
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
                                    onChange={(e) =>
                                        handleFileChange(e, 'general')
                                    }
                                />
                                {localGeneralRefs.length > 0 ? (
                                    <div className="grid grid-cols-4 gap-3">
                                        {localGeneralRefs.map((ref) => (
                                            <div
                                                key={ref.id}
                                                className="relative group"
                                            >
                                                <img
                                                    src={
                                                        ref.thumbnailUrl ||
                                                        ref.url
                                                    }
                                                    alt="Reference"
                                                    className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                                                    onClick={() =>
                                                        setPreviewImage(ref)
                                                    }
                                                />
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleRemoveGeneralRef(
                                                            ref.id,
                                                        )
                                                    }}
                                                    className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <HiOutlineX className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, 'general')}
                                        className="h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-primary hover:text-primary transition-colors cursor-pointer"
                                    >
                                        <HiOutlineUpload className="w-8 h-8 mb-2" />
                                        <span>
                                            Click or drag to upload photos
                                        </span>
                                        <span className="text-xs">
                                            JPG, PNG, WebP supported
                                        </span>
                                    </div>
                                )}
                            </Card>

                            {/* Specific References */}
                            <Card className="p-4">
                                <h3 className="text-sm font-semibold mb-4">
                                    Specific References (Optional)
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <ReferenceSlot
                                        slotTitle="Face Close-up"
                                        subtitle="For facial details"
                                        image={localFaceRef}
                                        onUpload={() =>
                                            faceInputRef.current?.click()
                                        }
                                        onRemove={() => setLocalFaceRef(null)}
                                        dropType="face"
                                    />
                                    <input
                                        ref={faceInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) =>
                                            handleFileChange(e, 'face')
                                        }
                                    />

                                    <ReferenceSlot
                                        slotTitle="Angle Sheet"
                                        subtitle="Multiple angles"
                                        image={localAngleRef}
                                        onUpload={() =>
                                            angleInputRef.current?.click()
                                        }
                                        onRemove={() => setLocalAngleRef(null)}
                                        dropType="angle"
                                        onAutoGenerate={handleGenerateAngle}
                                        isGenerating={isGeneratingAngle}
                                        canGenerate={!!localFaceRef}
                                    />
                                    <input
                                        ref={angleInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) =>
                                            handleFileChange(e, 'angle')
                                        }
                                    />
                                </div>
                                <p className="text-xs text-gray-400 mt-3 italic">
                                    Body Ref is available as a session tool in
                                    the generation bar
                                </p>
                            </Card>

                            {/* Identity Weight */}
                            <Card className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold">
                                        Identity Weight
                                    </h3>
                                    <span className="text-sm font-mono text-primary">
                                        {localIdentityWeight}%
                                    </span>
                                </div>
                                <Slider
                                    value={localIdentityWeight}
                                    onChange={(val) =>
                                        setLocalIdentityWeight(val as number)
                                    }
                                    min={0}
                                    max={100}
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    {localIdentityWeight > 85
                                        ? 'Very high - Deepfake-level consistency'
                                        : localIdentityWeight > 50
                                          ? 'High - Strong identity preservation'
                                          : 'Low - More creative freedom'}
                                </p>
                            </Card>

                            {/* Physical Attributes */}
                            <Card className="p-4">
                                <h3 className="text-sm font-semibold mb-3">
                                    Physical Attributes
                                </h3>
                                <PhysicalAttributesEditor
                                    measurements={localMeasurements}
                                    onChange={setLocalMeasurements}
                                    bodyLab={{
                                        models: PERMISSIVE_BODY_MODELS.map(
                                            (p) => ({
                                                id: p.id,
                                                name: p.name,
                                                model: p.model,
                                            }),
                                        ),
                                        selectedModel: selectedBodyModel,
                                        onSelectModel: setSelectedBodyModel,
                                        isGenerating: isGeneratingBody,
                                        sheet: bodySheet || localBodyRef,
                                        onGenerate: handleGenerateBody,
                                        onUseAsBody: handleUseAsBody,
                                        onPreview: () => {
                                            const s = bodySheet || localBodyRef
                                            if (s) setPreviewImage(s)
                                        },
                                        disabledReason: !localFaceRef
                                            ? 'Sube o genera primero una cara (Face Close-up) para el cuerpo.'
                                            : PERMISSIVE_BODY_MODELS.length === 0
                                              ? 'No hay modelo permisivo disponible (Seedream / Wan).'
                                              : undefined,
                                    }}
                                />
                            </Card>

                            {/* Face Description */}
                            <Card className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h3 className="text-sm font-semibold">
                                            Face Description
                                        </h3>
                                        <p className="text-xs text-gray-500">
                                            Detailed description for consistent
                                            facial features
                                        </p>
                                    </div>
                                    {hasLocalRefs && (
                                        <Button
                                            size="sm"
                                            variant="plain"
                                            icon={<HiOutlineSparkles />}
                                            onClick={handleAnalyzeFace}
                                            loading={isAnalyzingFace}
                                        >
                                            Auto-Analyze
                                        </Button>
                                    )}
                                </div>
                                <textarea
                                    value={localFaceDescription}
                                    onChange={(e) =>
                                        setLocalFaceDescription(e.target.value)
                                    }
                                    placeholder="Describe facial features: eye shape, nose, lips, skin tone, distinctive features..."
                                    rows={4}
                                    className="w-full p-3 border rounded-lg bg-transparent resize-none"
                                />
                            </Card>
                        </div>
                    </ScrollBar>

                    {/* Footer Actions */}
                    <div className="shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                        {/* Apply Changes */}
                        {onApply && (
                            <Button
                                variant="solid"
                                className="w-full"
                                onClick={handleApplyChanges}
                            >
                                Apply Changes
                            </Button>
                        )}

                        {/* Save to Database */}
                        {showSaveToDb && onSave && hasLocalRefs && (
                            <>
                                {showSaveInput ? (
                                    <div className="space-y-2">
                                        <Input
                                            placeholder="Avatar name..."
                                            value={saveAvatarName}
                                            onChange={(e) =>
                                                setSaveAvatarName(
                                                    e.target.value,
                                                )
                                            }
                                            onKeyDown={(e) =>
                                                e.key === 'Enter' &&
                                                handleSave()
                                            }
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                variant="solid"
                                                color="green"
                                                icon={<HiOutlineSave />}
                                                onClick={handleSave}
                                                loading={isSaving}
                                                className="flex-1"
                                                disabled={
                                                    !saveAvatarName.trim()
                                                }
                                            >
                                                Save Avatar
                                            </Button>
                                            <Button
                                                variant="plain"
                                                onClick={() =>
                                                    setShowSaveInput(false)
                                                }
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <Button
                                        variant="default"
                                        icon={<HiOutlineSave />}
                                        className="w-full"
                                        onClick={() => setShowSaveInput(true)}
                                    >
                                        Save to Database
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </Drawer>

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
                                src={
                                    previewImage.url || previewImage.storagePath
                                }
                                alt="Preview"
                                className="rounded-lg object-contain select-none"
                                style={{
                                    transform: `scale(${previewZoom})`,
                                    transition: 'transform 0.2s ease-out',
                                    maxHeight:
                                        previewZoom === 1 ? '65vh' : 'none',
                                }}
                                draggable={false}
                            />
                        </div>
                    </div>
                )}
            </Dialog>
        </>
    )
}

export default AvatarEditDrawer
