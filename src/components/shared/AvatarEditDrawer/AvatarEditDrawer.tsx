'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { urlToDataUrl } from '@/utils/imageStitch'
import Drawer from '@/components/ui/Drawer'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Slider from '@/components/ui/Slider'
import Card from '@/components/ui/Card'
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
} from 'react-icons/hi'
import { generateAvatar, analyzeFaceFromImages } from '@/services/GeminiService'
import type { PhysicalMeasurements } from '@/@types/supabase'
import { createThumbnail, resizeBase64Image } from '@/utils/imageOptimization'
import { cleanRefWatermarkInBackground } from '@/utils/refWatermarkClean'
import { sameBodyShape } from '@/utils/bodySheetPrompt'
import { generateBodySheetPair } from '@/utils/bodySheetGenerate'
import {
    DEFAULT_PROVIDERS,
    getBodyLabModels,
} from '@/app/(protected-pages)/concepts/avatar-forge/_shared/providerCatalog'
import PhysicalAttributesEditor from '@/components/shared/PhysicalAttributesEditor'
import AppearanceEditor from '@/components/shared/AppearanceEditor'
import BodyLab, { buildMissingSheetNotice } from '@/components/shared/BodyLab'
import ImageLightbox from '@/components/shared/ImageLightbox'
import UnsavedChangesDialog, {
    notifyDiscarded,
} from '@/components/shared/UnsavedChangesDialog'
import useUnsavedChangesGuard from '@/utils/hooks/useUnsavedChangesGuard'
import {
    fingerprint,
    measuresKey,
    refKey,
} from '@/utils/unsavedFingerprint'
import { deriveShapeFromMeasurements } from '@/utils/bodyShapes'

// Modelos permisivos aptos para el body sheet (Seedream/Wan), del catálogo de
// providers por defecto — este drawer es store-agnóstico y no tiene acceso a
// los providers configurados del usuario. Constante de módulo: se calcula una
// sola vez, no en cada render.
const BODY_LAB_MODELS = getBodyLabModels(DEFAULT_PROVIDERS)

// Reference image interface
export interface AvatarReferenceImage {
    id: string
    url: string
    mimeType: string
    base64: string
    type: 'general' | 'face' | 'angle' | 'body' | 'body_nsfw'
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
    /** Hoja NUDE del Body Lab — se genera en pareja con la vestida y solo
     *  viaja a motores permisivos en runs NSFW. */
    bodyRefNsfw?: AvatarReferenceImage | null
    identityWeight: number
    measurements: PhysicalMeasurements
    faceDescription: string
    /** Hojas que la BD dice tener pero cuyo archivo no se pudo bajar. El host
     *  las detecta al hidratar; sin esto el panel se pinta igual que "nunca se
     *  generó" y no hay forma de saber si el cuerpo viaja a la generación. */
    missingBodySheets?: ('body' | 'body_nsfw')[]
}

interface AvatarEditDrawerProps {
    isOpen: boolean
    onClose: () => void
    title?: string
    avatarName?: string
    initialData?: AvatarEditData
    onSave?: (name: string, data: AvatarEditData) => Promise<void>
    showSaveToDb?: boolean
    isSaving?: boolean
    /** Muestra un overlay de carga mientras el host trae los datos del avatar. */
    isLoading?: boolean
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
    onSave,
    showSaveToDb = true,
    isSaving = false,
    isLoading = false,
}: AvatarEditDrawerProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const faceInputRef = useRef<HTMLInputElement>(null)
    const angleInputRef = useRef<HTMLInputElement>(null)
    // Para enfocar el nombre cuando es lo que impide guardar (ver el diálogo
    // de cambios sin guardar).
    const nameInputRef = useRef<HTMLInputElement>(null)

    const [saveAvatarName, setSaveAvatarName] = useState('')
    const [isAnalyzingFace, setIsAnalyzingFace] = useState(false)
    const [isGeneratingAngle, setIsGeneratingAngle] = useState(false)
    const [previewImage, setPreviewImage] =
        useState<AvatarReferenceImage | null>(null)

    // Local editing state
    const [localGeneralRefs, setLocalGeneralRefs] = useState<
        AvatarReferenceImage[]
    >([])
    // Limpieza de marca de agua en curso por slot (overlay + Save bloqueado).
    const [cleaningRefs, setCleaningRefs] = useState<{
        face?: boolean
        angle?: boolean
    }>({})
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
    const [localBodyRefNsfw, setLocalBodyRefNsfw] =
        useState<AvatarReferenceImage | null>(null)
    const [bodySheetNude, setBodySheetNude] =
        useState<AvatarReferenceImage | null>(null)
    const [bodySheet, setBodySheet] = useState<AvatarReferenceImage | null>(
        null,
    )
    const [bodySheetModel, setBodySheetModel] = useState('')
    const [sheetMeasurements, setSheetMeasurements] =
        useState<PhysicalMeasurements | null>(null)
    const [isGeneratingBody, setIsGeneratingBody] = useState(false)
    const [selectedBodyModel, setSelectedBodyModel] = useState('')

    /**
     * Huella del formulario para detectar cambios sin guardar. Se comparan
     * CADENAS y no objetos: las refs llevan la imagen entera en `base64` y un
     * deep-equal ahí compara megabytes en cada render. Ver `unsavedFingerprint`.
     */
    const fingerprintOf = useCallback(
        (d: Omit<AvatarEditData, 'missingBodySheets'>) =>
            fingerprint({
                name: (d.name ?? '').trim(),
                generalReferences: d.generalReferences.map(refKey),
                faceRef: refKey(d.faceRef),
                angleRef: refKey(d.angleRef),
                bodyRef: refKey(d.bodyRef),
                bodyRefNsfw: refKey(d.bodyRefNsfw),
                identityWeight: d.identityWeight,
                measurements: measuresKey(d.measurements),
                faceDescription: d.faceDescription,
            }),
        [],
    )
    const baselineRef = useRef('')

    // Sync local state from initialData when drawer opens
    useEffect(() => {
        if (isOpen && initialData) {
            setLocalGeneralRefs([...initialData.generalReferences])
            setLocalFaceRef(initialData.faceRef)
            setLocalAngleRef(initialData.angleRef)
            setLocalBodyRef(initialData.bodyRef)
            setLocalBodyRefNsfw(initialData.bodyRefNsfw ?? null)
            setLocalIdentityWeight(initialData.identityWeight)
            const synced = initialData.measurements.shape
                ? { ...initialData.measurements }
                : {
                      ...initialData.measurements,
                      shape: deriveShapeFromMeasurements(
                          initialData.measurements,
                      ),
                  }
            setLocalMeasurements(synced)
            setSheetMeasurements(synced)
            setLocalFaceDescription(initialData.faceDescription)
            setSaveAvatarName(avatarName || initialData.name || '')
            // Línea base del guard de cambios sin guardar. Se toma con `synced`
            // y NO con initialData.measurements: este efecto le inyecta `shape`
            // vía deriveShapeFromMeasurements, así que comparar contra el crudo
            // marcaría como modificado a todo avatar con solo abrirlo.
            baselineRef.current = fingerprintOf({
                name: avatarName || initialData.name || '',
                generalReferences: initialData.generalReferences,
                faceRef: initialData.faceRef,
                angleRef: initialData.angleRef,
                bodyRef: initialData.bodyRef,
                bodyRefNsfw: initialData.bodyRefNsfw ?? null,
                identityWeight: initialData.identityWeight,
                measurements: synced,
                faceDescription: initialData.faceDescription,
            })
        }
    }, [isOpen, initialData, avatarName, fingerprintOf])

    /**
     * Reset de la SESIÓN del Body Lab, en su propio efecto y solo en la
     * transición de apertura.
     *
     * Dos bugs de una (2026-07-28):
     *  · `bodySheetNude` no se reseteaba nunca — el drawer vive SIEMPRE montado,
     *    así que la hoja NSFW de un avatar se filtraba al siguiente que abrías.
     *  · El reset vivía en el efecto de sync, que depende de `initialData`. Ese
     *    prop lo carga el padre de forma asíncrona, así que si llegaba tarde
     *    borraba una hoja recién generada. Con deps `[isOpen]` eso no puede
     *    pasar: solo se limpia al abrir.
     */
    useEffect(() => {
        if (!isOpen) return
        setBodySheet(null)
        setBodySheetNude(null)
        setBodySheetModel('')
    }, [isOpen])

    // Default del selector de modelo del Body Lab (primer permisivo).
    useEffect(() => {
        if (!selectedBodyModel && BODY_LAB_MODELS.length > 0) {
            setSelectedBodyModel(BODY_LAB_MODELS[0].model)
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
        //
        // SE GUARDA LO QUE SE VE (2026-07-28): antes solo viajaba localBodyRef
        // y una hoja recién generada se DESCARTABA al guardar — ya cobrada en
        // KIE, delante del usuario, sin un aviso. Desde que la generación fija
        // el cuerpo sola las dos apuntan a lo mismo, así que esto es una red de
        // seguridad, no el mecanismo: cualquier camino que deje una hoja fresca
        // sin fijar sigue guardándose. Mismo criterio que `shownBody`.
        bodyRef: bodySheet ?? localBodyRef,
        bodyRefNsfw: bodySheetNude ?? localBodyRefNsfw,
        identityWeight: localIdentityWeight,
        measurements: localMeasurements,
        faceDescription: localFaceDescription,
    })

    // ── Guard de cambios sin guardar ──────────────────────────────────────
    // Sin esto, la X y "Cancel" tiraban en silencio una hoja de cuerpo recién
    // generada, que KIE ya cobró y que solo vive en memoria hasta Guardar.
    const hasFreshBodySheet = !!bodySheet || !!bodySheetNude
    const isDirty =
        !!initialData && fingerprintOf(getCurrentData()) !== baselineRef.current
    const guardHook = useUnsavedChangesGuard({ isDirty })
    const guardedClose = guardHook.guard(onClose)

    /** Lo que el usuario perdería, para que el diálogo lo nombre. */
    const lostItems = (): string[] => {
        if (!initialData) return []
        const items: string[] = []
        if (hasFreshBodySheet) items.push('La hoja de cuerpo recién generada')
        if ((saveAvatarName || '').trim() !== (initialData.name ?? '').trim()) {
            items.push('El nombre del avatar')
        }
        if (measuresKey(localMeasurements) !== measuresKey(initialData.measurements)) {
            items.push('Los atributos físicos y de apariencia')
        }
        if (
            localGeneralRefs.map(refKey).join() !==
                initialData.generalReferences.map(refKey).join() ||
            refKey(localFaceRef) !== refKey(initialData.faceRef) ||
            refKey(localAngleRef) !== refKey(initialData.angleRef)
        ) {
            items.push('Las imágenes de referencia')
        }
        return items.length > 0 ? items : ['Los cambios del formulario']
    }

    // Mismas condiciones que deshabilitan el botón Guardar del footer: el
    // diálogo no puede ofrecer un guardado que el drawer rechazaría.
    const isCleaningRefs = cleaningRefs.face || cleaningRefs.angle
    const canSave = !!saveAvatarName.trim() && !isCleaningRefs
    const saveBlockedReason = !saveAvatarName.trim()
        ? 'No se puede guardar todavía: ponle un nombre al avatar.'
        : isCleaningRefs
          ? 'Espera unos segundos: se está limpiando la marca de agua de una referencia.'
          : undefined

    const handleDiscard = () => {
        notifyDiscarded(lostItems(), hasFreshBodySheet)
        guardHook.proceed()
    }

    const handleKeepEditing = () => {
        guardHook.dismiss()
        // Si el bloqueo es el nombre, se enfoca: dejar al usuario delante de un
        // "Guardar" apagado y un "Descartar" rojo es empujarlo a lo destructivo.
        if (!saveAvatarName.trim()) {
            requestAnimationFrame(() => nameInputRef.current?.focus())
        }
    }

    const handlePreviewClose = useCallback(() => {
        setPreviewImage(null)
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

                    // Marca de agua (cara/angles): limpieza en 2º plano con
                    // swap por id (ver @/utils/refWatermarkClean).
                    if (type === 'face' || type === 'angle') {
                        setCleaningRefs((p) => ({ ...p, [type]: true }))
                        void cleanRefWatermarkInBackground({
                            base64: matches[2],
                            mimeType: matches[1],
                            label:
                                type === 'face'
                                    ? 'cara frontal'
                                    : 'hoja de ángulos',
                            onCleaned: async (img) => {
                                let thumb = img.url
                                try {
                                    thumb = await createThumbnail(
                                        img.base64,
                                        'THUMBNAIL',
                                    )
                                } catch {
                                    /* thumbnail fallback: full image */
                                }
                                const cleanedRef: AvatarReferenceImage = {
                                    ...newImage,
                                    url: img.url,
                                    mimeType: img.mimeType,
                                    base64: img.base64,
                                    thumbnailUrl: thumb,
                                }
                                const swap = (
                                    prev: AvatarReferenceImage | null,
                                ) =>
                                    prev?.id === newImage.id
                                        ? cleanedRef
                                        : prev
                                if (type === 'face') setLocalFaceRef(swap)
                                else setLocalAngleRef(swap)
                            },
                        }).finally(() =>
                            setCleaningRefs((p) => ({ ...p, [type]: false })),
                        )
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
    // Save to database
    const handleSave = async () => {
        if (onSave && saveAvatarName.trim()) {
            await onSave(saveAvatarName.trim(), getCurrentData())
            // El guard no debe preguntar por un cierre que viene JUSTO de
            // guardar: `isDirty` todavía no propagó cuando esto corre.
            guardHook.bypassOnce()
            // Guardar es el final natural de editar — antes cerraba «Apply
            // Changes» y el flujo de guardar dejaba el drawer abierto.
            onClose()
        }
    }

    /**
     * "Guardar y salir" del diálogo. Si el guardado FALLA, el diálogo se queda
     * abierto con las otras dos opciones — cerrar igual sería perder el trabajo
     * justo en el momento en que no se pudo poner a salvo. Depende de que
     * `onSave` re-lance el error (ver AvatarCard.handleSaveFromDrawer).
     */
    const handleSaveAndExit = async () => {
        try {
            await handleSave()
            guardHook.proceedIgnoringDirty()
        } catch {
            // El host ya avisó con su propio toast; se mantiene el diálogo.
        }
    }

    /** Guardado desde el botón del footer. `handleSave` ahora propaga el error
     *  (lo necesita el diálogo), así que aquí hay que absorberlo o quedaría una
     *  promesa rechazada sin manejar; el host ya avisó con su toast. */
    const handleSaveClick = () => {
        handleSave().catch(() => {})
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

            const angleId = crypto.randomUUID()
            const newAngleImage: AvatarReferenceImage = {
                id: angleId,
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
            // El sheet sale con la ✦ de Gemini → parche por color (sin
            // re-render que arriesgue las 9 caras). Overlay + swap por id.
            setCleaningRefs((p) => ({ ...p, angle: true }))
            void cleanRefWatermarkInBackground({
                base64: matches[2],
                mimeType: matches[1],
                label: 'hoja de ángulos',
                onCleaned: async (img) => {
                    let thumb = img.url
                    try {
                        thumb = await createThumbnail(img.base64, 'THUMBNAIL')
                    } catch {
                        /* thumbnail fallback: full image */
                    }
                    setLocalAngleRef((prev) =>
                        prev?.id === angleId
                            ? {
                                  ...newAngleImage,
                                  url: img.url,
                                  mimeType: img.mimeType,
                                  base64: img.base64,
                                  thumbnailUrl: thumb,
                              }
                            : prev,
                    )
                },
            }).finally(() =>
                setCleaningRefs((p) => ({ ...p, angle: false })),
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
        type: 'body' | 'body_nsfw' = 'body',
    ): Promise<AvatarReferenceImage> => {
        // CDNs sin CORS (MuleRouter siempre, R2 público y KIE según host) matan
        // el fetch del navegador aunque la URL sirva: urlToDataUrl cae solo al
        // servidor, que no tiene CORS.
        const dataUrl = await urlToDataUrl(url)
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
            type,
            thumbnailUrl,
        }
    }

    // Genera el body angle sheet (3 vistas, mini-bikini) desde los sliders.
    const handleGenerateBody = async (
        only?: 'clothed' | 'nude',
    ) => {
        if (!selectedBodyModel) return
        setIsGeneratingBody(true)
        try {
            // Las DOS variantes de un golpe (vestida + nude) — la vestida va
            // a todos los motores, la nude solo a permisivos en runs NSFW.
            // Al refrescar SOLO la vestida, se hereda el cuerpo de la nude que
            // el avatar ya tiene — si no, la hoja nueva diverge de la guardada.
            const nudeExistente = bodySheetNude ?? localBodyRefNsfw
            const pair = await generateBodySheetPair({
                measurements: localMeasurements,
                model: selectedBodyModel,
                only,
                nudeSheet:
                    nudeExistente?.base64 && nudeExistente.mimeType
                        ? {
                              base64: nudeExistente.base64,
                              mimeType: nudeExistente.mimeType,
                          }
                        : undefined,
            })
            const sheet = pair.url
                ? await toBodyReferenceImage(pair.url, 'body')
                : null
            if (sheet) setBodySheet(sheet)
            const nudeSheet = pair.nudeUrl
                ? await toBodyReferenceImage(pair.nudeUrl, 'body_nsfw')
                : null
            // Solo pisa la nude si se pidió (refresh selectivo).
            if (nudeSheet || only !== 'clothed') setBodySheetNude(nudeSheet)
            // FIJADO AUTOMÁTICO (2026-07-28): lo que se generó ES el cuerpo del
            // avatar. Antes había que pulsar "Usar como cuerpo" y, si no se
            // pulsaba, la hoja —ya pagada— se perdía al cerrar el drawer.
            // Se asigna SOLO lo que salió: una nude que rebotó no puede borrar
            // la que el avatar ya tenía guardada.
            if (sheet) setLocalBodyRef(sheet)
            if (nudeSheet) setLocalBodyRefNsfw(nudeSheet)
            setSheetMeasurements(localMeasurements)
            const selName =
                BODY_LAB_MODELS.find(
                    (p) => p.model === selectedBodyModel,
                )?.name || selectedBodyModel
            setBodySheetModel(
                pair.usedTemplate ? `${selName} · plantilla` : selName,
            )
            toast.push(
                <Notification type="success" title="Cuerpo generado">
                    {nudeSheet
                        ? 'Hoja + variante NSFW listas y fijadas como el cuerpo del avatar. Se guardan al guardar los cambios.'
                        : `Hoja lista y fijada como el cuerpo del avatar — la variante NSFW no se pudo generar${pair.nudeError ? `: ${pair.nudeError}` : ''}. Se guarda al guardar los cambios.`}
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

    const hasLocalRefs =
        localGeneralRefs.length > 0 || localFaceRef || localAngleRef

    // ¿El sheet mostrado quedó desactualizado vs los atributos actuales?
    const shownBody = bodySheet || localBodyRef
    // Ignora los campos de apariencia que el sheet no dibuja (pezones) — cambiarlos
    // no altera el cuerpo, así que NO debe pedir regenerar (gasto de tokens).
    const bodyStale =
        !!shownBody &&
        !!sheetMeasurements &&
        !sameBodyShape(localMeasurements, sheetMeasurements)

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
        busy,
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
        /** Limpieza de marca de agua en curso: overlay + slot bloqueado. */
        busy?: boolean
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
                        onClick={() => {
                            if (!busy) setPreviewImage(image)
                        }}
                    />
                    {busy && (
                        <div className="absolute inset-0 rounded-lg bg-black/60 flex flex-col items-center justify-center gap-1 cursor-wait">
                            <Spinner size={20} />
                            <span className="text-[10px] text-white">
                                Limpiando marca…
                            </span>
                        </div>
                    )}
                    {!busy && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onRemove()
                            }}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <HiOutlineX className="w-3 h-3" />
                        </button>
                    )}
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
                onClose={guardedClose}
                // onRequestClose es lo que react-modal usa para ESC: no se
                // pasaba, así que ESC no hacía nada. Ahora cierra, pero pasando
                // por el guard. El click en el backdrop se deja DESACTIVADO a
                // propósito: un panel de 480px lleno de sliders al lado de un
                // backdrop enorme es un imán de clicks perdidos.
                onRequestClose={guardedClose}
                shouldCloseOnOverlayClick={false}
                placement="right"
                width={480}
            >
                <div className="h-full flex flex-col">
                    {/* Scrollable Content */}
                    <ScrollBar className="flex-1">
                        <div className="p-3 space-y-2 relative">
                            {isLoading && (
                                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-gray-900/60 backdrop-blur-sm rounded-lg">
                                    <Spinner size={40} />
                                    <span className="text-xs text-gray-300">
                                        Cargando avatar…
                                    </span>
                                </div>
                            )}
                            {/* General Identity Photos */}
                            <Card className="p-3">
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

                            {/* Identity Weight */}
                            <Card className="p-3">
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

                            {/* Specific References */}
                            <Card className="p-3">
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
                                        busy={cleaningRefs.face}
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
                                        busy={cleaningRefs.angle}
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

                            {/* Face Description — junto a las referencias de cara */}
                            <Card className="p-3">
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

                            {/* Appearance (piel / pelo / ojos) — junto a la cara */}
                            <Card className="p-3">
                                <h3 className="text-sm font-semibold mb-3">
                                    Appearance
                                </h3>
                                <AppearanceEditor
                                    measurements={localMeasurements}
                                    onChange={setLocalMeasurements}
                                />
                            </Card>

                            {/* Physical Attributes */}
                            <Card className="p-3">
                                <h3 className="text-sm font-semibold mb-3">
                                    Physical Attributes
                                </h3>
                                <PhysicalAttributesEditor
                                    measurements={localMeasurements}
                                    onChange={setLocalMeasurements}
                                />
                            </Card>

                            {/* Body Lab — genera el cuerpo desde los atributos de arriba */}
                            <Card className="p-3">
                                <BodyLab
                                    models={BODY_LAB_MODELS.map((p) => ({
                                        id: p.id,
                                        name: p.name,
                                        model: p.model,
                                    }))}
                                    selectedModel={selectedBodyModel}
                                    onSelectModel={setSelectedBodyModel}
                                    isGenerating={isGeneratingBody}
                                    sheet={bodySheet || localBodyRef}
                                    nudeSheet={
                                        bodySheetNude || localBodyRefNsfw
                                    }
                                    onPreviewNude={() => {
                                        const n =
                                            bodySheetNude || localBodyRefNsfw
                                        if (n) setPreviewImage(n)
                                    }}
                                    sheetModel={
                                        bodySheet
                                            ? bodySheetModel
                                            : localBodyRef
                                              ? 'Cuerpo guardado'
                                              : undefined
                                    }
                                    onGenerate={handleGenerateBody}
                                    onRegenerate={(only) =>
                                        handleGenerateBody(only)
                                    }
                                    onPreview={() => {
                                        const s = bodySheet || localBodyRef
                                        if (s) setPreviewImage(s)
                                    }}
                                    stale={bodyStale}
                                    missingSheetNotice={
                                        // Igual que en el Studio: una hoja
                                        // fresca ya tapa el hueco.
                                        bodySheet || bodySheetNude
                                            ? undefined
                                            : buildMissingSheetNotice(
                                                  initialData?.missingBodySheets ??
                                                      [],
                                              )
                                    }
                                    disabledReason={
                                        BODY_LAB_MODELS.length === 0
                                            ? 'No hay modelos KIE de imagen disponibles.'
                                            : undefined
                                    }
                                />
                            </Card>
                        </div>
                    </ScrollBar>

                    {/* Footer: UN solo boton (2026-07-26). Habia dos —«Apply
                        Changes» (solo memoria) y «Save to Database» (persistia)—
                        y la diferencia no se leia: lo «aplicado» se perdia al
                        recargar sin aviso. Guardar YA aplicaba ademas de
                        persistir, o sea el azul era un subconjunto del verde.
                        Aqui el de Apply ni siquiera llegaba a pintarse: su
                        unico consumidor (AvatarCard) no pasa `onApply`. */}
                    <div className="shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                        {showSaveToDb && onSave && (
                            <>
                                <Input
                                    ref={nameInputRef}
                                    placeholder="Nombre del avatar..."
                                    value={saveAvatarName}
                                    onChange={(e) =>
                                        setSaveAvatarName(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                        e.key === 'Enter' && handleSaveClick()
                                    }
                                />
                                <div className="flex gap-2">
                                    <Button
                                        variant="solid"
                                        icon={<HiOutlineSave />}
                                        onClick={handleSaveClick}
                                        loading={isSaving}
                                        className="flex-1"
                                        disabled={
                                            !saveAvatarName.trim() ||
                                            cleaningRefs.face ||
                                            cleaningRefs.angle
                                        }
                                    >
                                        {cleaningRefs.face || cleaningRefs.angle
                                            ? 'Limpiando marca…'
                                            : 'Save Avatar'}
                                    </Button>
                                    <Button
                                        variant="plain"
                                        onClick={guardedClose}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </Drawer>

            {/* Image Preview Lightbox (grande + zoom + arrastrar) */}
            <ImageLightbox
                imageUrl={
                    previewImage
                        ? previewImage.url || previewImage.storagePath || null
                        : null
                }
                // Toggle vestida ↔ NSFW dentro del visor (solo si el
                // avatar tiene las dos hojas y se está viendo una de ellas).
                variants={(() => {
                    const c = bodySheet || localBodyRef
                    const n = bodySheetNude || localBodyRefNsfw
                    if (!c || !n) return undefined
                    const shown = previewImage?.url
                    if (shown !== c.url && shown !== n.url) return undefined
                    return [
                        { label: 'Vestida', url: c.url },
                        { label: '🌶️ NSFW', url: n.url },
                    ]
                })()}
                onClose={handlePreviewClose}
            />

            <UnsavedChangesDialog
                isOpen={!!guardHook.pending}
                lostItems={lostItems()}
                hasFreshBodySheet={hasFreshBodySheet}
                isBusy={isGeneratingBody}
                canSave={canSave}
                saveBlockedReason={saveBlockedReason}
                isSaving={isSaving}
                onSaveAndExit={handleSaveAndExit}
                onDiscard={handleDiscard}
                onKeepEditing={handleKeepEditing}
            />
        </>
    )
}

export default AvatarEditDrawer
