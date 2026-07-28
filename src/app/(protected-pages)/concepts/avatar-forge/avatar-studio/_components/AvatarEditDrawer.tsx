'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
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
import { sameBodyShape } from '@/utils/bodySheetPrompt'
import { generateBodySheetPair } from '@/utils/bodySheetGenerate'
import { urlToDataUrl } from '@/utils/imageStitch'
import {
    apiGetAvatarReferences,
    getSignedUrl,
} from '@/services/AvatarForgeService'
import { getBodyLabModels } from '../../_shared/providerCatalog'
import { cleanRefWatermarkInBackground } from '@/utils/refWatermarkClean'
import type { ReferenceImage } from '../types'
import type { PhysicalMeasurements } from '@/@types/supabase'
import { createThumbnail } from '@/utils/imageOptimization'
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
    isUnpersistedRef,
    measuresKey,
    refKey,
} from '@/utils/unsavedFingerprint'
import { deriveShapeFromMeasurements } from '@/utils/bodyShapes'

interface AvatarEditDrawerProps {
    isOpen: boolean
    onClose: () => void
    onSaveAvatar?: (name: string) => Promise<void>
    onAnalyzeFace?: () => Promise<void>
}

const AvatarEditDrawer = ({
    isOpen,
    onClose,
    onSaveAvatar,
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
    const [previewImage, setPreviewImage] = useState<ReferenceImage | null>(
        null,
    )
    const [bodySheet, setBodySheet] = useState<ReferenceImage | null>(null)
    // Hoja NUDE recién generada (aún sin fijar) — se fija junto con la vestida.
    const [bodySheetNude, setBodySheetNude] = useState<ReferenceImage | null>(
        null,
    )
    const [bodySheetModel, setBodySheetModel] = useState('')
    // Hojas que la BD dice tener pero cuyo archivo no se pudo cargar.
    const [missingSheets, setMissingSheets] = useState<
        ('body' | 'body_nsfw')[]
    >([])
    // Snapshot de las medidas con que se generó/cargó el sheet mostrado — para
    // detectar si el usuario cambió atributos (→ sheet "desactualizado").
    const [sheetMeasurements, setSheetMeasurements] =
        useState<PhysicalMeasurements | null>(null)
    const [isGeneratingBody, setIsGeneratingBody] = useState(false)
    const [selectedBodyModel, setSelectedBodyModel] = useState('')

    // Local editing state (copy from store when drawer opens)
    const [localGeneralRefs, setLocalGeneralRefs] = useState<ReferenceImage[]>(
        [],
    )
    // Limpieza de marca de agua en curso por slot (face/angle): overlay en el
    // thumbnail + Save bloqueado (evita guardar la versión CON marca antes del
    // swap — la limpieza tarda ~15s).
    const [cleaningRefs, setCleaningRefs] = useState<{
        face?: boolean
        angle?: boolean
    }>({})
    const [localFaceRef, setLocalFaceRef] = useState<ReferenceImage | null>(
        null,
    )
    const [localAngleRef, setLocalAngleRef] = useState<ReferenceImage | null>(
        null,
    )
    const [localIdentityWeight, setLocalIdentityWeight] = useState(85)
    const [localMeasurements, setLocalMeasurements] =
        useState<PhysicalMeasurements>({
            age: 25,
            height: 165,
            bodyType: 'average',
            bust: 90,
            waist: 60,
            hips: 90,
            skinTone: 5,
            hairColor: 'brown',
        })
    const [localFaceDescription, setLocalFaceDescription] = useState('')

    const {
        generalReferences,
        faceRef,
        angleRef,
        identityWeight,
        measurements,
        faceDescription,
        avatarName,
        avatarId,
        isSavingAvatar,
        isLoadingReferences,
        providers,
        setGeneralReferences,
        setFaceRef,
        setAngleRef,
        setIdentityWeight,
        setMeasurements,
        setFaceDescription,
        bodyRef,
        bodyRefNsfw,
        setBodyRef,
        setBodyRefNsfw,
    } = useAvatarStudioStore()

    /**
     * Huella del formulario para el guard de cambios sin guardar. El CUERPO se
     * deja fuera a propósito: lo mutan fuerzas que no son el usuario (la
     * hidratación desde la BD y el auto-fijado del Body Lab, que escribe al
     * store al terminar de generar). Se evalúa aparte, por "ref no persistida".
     */
    const fingerprintOf = useCallback(
        (d: {
            name: string
            generalReferences: ReferenceImage[]
            faceRef: ReferenceImage | null
            angleRef: ReferenceImage | null
            identityWeight: number
            measurements: PhysicalMeasurements
            faceDescription: string
        }) =>
            fingerprint({
                name: d.name.trim(),
                generalReferences: d.generalReferences.map(refKey),
                faceRef: refKey(d.faceRef),
                angleRef: refKey(d.angleRef),
                identityWeight: d.identityWeight,
                measurements: measuresKey(d.measurements),
                faceDescription: d.faceDescription,
            }),
        [],
    )
    const baselineRef = useRef('')

    /**
     * Sincroniza el estado local desde el store AL ABRIR.
     *
     * Antes dependía de la IDENTIDAD de los valores del store, y eso rompía las
     * dos direcciones (2026-07-28):
     *  · Reabrir con el store igual NO re-ejecutaba el efecto → las ediciones
     *    que acababas de descartar reaparecían intactas.
     *  · Cualquier escritura al store con el drawer abierto (p.ej. el auto-
     *    fijado del Body Lab) revertía en silencio lo que estabas editando.
     * Leer el store de forma imperativa con `getState()` y depender solo de la
     * apertura arregla ambas. `avatarId` se queda en deps para que cambiar de
     * avatar con el drawer abierto siga re-sincronizando.
     *
     * Aquí también se limpian las hojas del Body Lab: el drawer vive SIEMPRE
     * montado y no se reseteaban nunca, así que sobrevivían entre aperturas y
     * entre avatares.
     */
    useEffect(() => {
        if (!isOpen) return
        const s = useAvatarStudioStore.getState()
        setLocalGeneralRefs([...s.generalReferences])
        setLocalFaceRef(s.faceRef)
        setLocalAngleRef(s.angleRef)
        setLocalIdentityWeight(s.identityWeight)
        const synced = s.measurements.shape
            ? { ...s.measurements }
            : {
                  ...s.measurements,
                  shape: deriveShapeFromMeasurements(s.measurements),
              }
        setLocalMeasurements(synced)
        setSheetMeasurements(synced) // el cuerpo guardado coincide al abrir
        setLocalFaceDescription(s.faceDescription)
        setSaveAvatarName(s.avatarName || '')
        setBodySheet(null)
        setBodySheetNude(null)
        setBodySheetModel('')
        baselineRef.current = fingerprintOf({
            name: s.avatarName || '',
            generalReferences: s.generalReferences,
            faceRef: s.faceRef,
            angleRef: s.angleRef,
            identityWeight: s.identityWeight,
            measurements: synced,
            faceDescription: s.faceDescription,
        })
    }, [isOpen, avatarId, fingerprintOf])

    // Re-hidrata el body ref FRESCO de la BD al abrir el drawer. El Provider
    // solo hidrata una vez ([avatar?.id]); si el cuerpo se guardó DESPUÉS (p.ej.
    // desde My Avatars) el store queda desactualizado y no se veía aquí. Esto lo
    // trae fresco en cada apertura (como hace My Avatars).
    useEffect(() => {
        if (!isOpen || !avatarId) return
        let cancelled = false
        // Se recalcula por apertura/avatar: un aviso de "hoja perdida" heredado
        // de otro avatar sería peor que no avisar.
        setMissingSheets([])
        // Las DOS hojas se hidratan INDEPENDIENTES (2026-07-26). Antes la nude
        // vivía anidada dentro de los early-return de la vestida, así que el
        // caso normal —vestida ya fresca en el store→ return— saltaba la nude
        // para siempre: estaba guardada en la BD y el drawer la pintaba como
        // inexistente. Acoplar dos cargas independientes hace que el atajo de
        // una cancele la otra.
        const hydrate = async (
            type: 'body' | 'body_nsfw',
            current: typeof bodyRef,
            apply: (ref: NonNullable<typeof bodyRef>) => void,
        ) => {
            // Una salida sin pintar la hoja SOLO es normal si la BD dice que no
            // hay ninguna. En cuanto hay fila, no pintarla es una pérdida que
            // hay que NOMBRAR: si no, el panel queda igual que "nunca se
            // generó" y no se distingue un guardado fallido de un archivo que
            // ya no está (caso real: las hojas del 26-jul se quedaron en el
            // proyecto viejo — la fila viajó, los bytes no).
            let rowExists = false
            const lost = () => {
                if (rowExists && !cancelled)
                    setMissingSheets((prev) =>
                        prev.includes(type) ? prev : [...prev, type],
                    )
            }
            try {
                const rows = await apiGetAvatarReferences(avatarId, type)
                const row = rows?.[0]
                if (!row?.storage_path) return
                rowExists = true
                // No pisar: (a) una selección FRESCA sin guardar (sin
                // storagePath), ni (b) si ya está fresco (mismo storagePath).
                if (
                    current &&
                    (!current.storagePath ||
                        current.storagePath === row.storage_path)
                )
                    return
                const signed = await getSignedUrl('avatars', row.storage_path)
                if (!signed) return lost()
                const dataUrl = await urlToDataUrl(signed)
                const m = dataUrl.match(/^data:(.+);base64,(.+)$/)
                if (cancelled) return
                if (!m) return lost()
                apply({
                    id: row.id,
                    url: dataUrl,
                    mimeType: m[1],
                    base64: m[2],
                    type,
                    storagePath: row.storage_path,
                })
            } catch {
                // La fila existía (si no, ya habríamos salido arriba): esto es
                // un fallo de carga real, no un avatar sin hoja.
                lost()
            }
        }
        void Promise.all([
            hydrate('body', bodyRef, setBodyRef),
            hydrate('body_nsfw', bodyRefNsfw, setBodyRefNsfw),
        ])
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, avatarId])

    const handlePreviewClose = useCallback(() => {
        setPreviewImage(null)
    }, [])

    // Process file upload
    const processFile = useCallback(
        async (
            file: File,
            type: 'general' | 'face' | 'angle' | 'body',
        ) => {
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

                    const newImage: ReferenceImage = {
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
                        // Note: 'body' type is now handled as a session tool in BottomControlBar
                    }

                    // Marca de agua (cara/angles): overlays/logos meten ruido
                    // en varios modelos i2i. Limpieza en 2º plano — el slot se
                    // swapea al terminar, con guard por id (si re-subió otra
                    // imagen, el swap viejo no la pisa).
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
                                const cleanedRef: ReferenceImage = {
                                    ...newImage,
                                    url: img.url,
                                    mimeType: img.mimeType,
                                    base64: img.base64,
                                    thumbnailUrl: thumb,
                                }
                                const swap = (prev: ReferenceImage | null) =>
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

    // ── Guard de cambios sin guardar ──────────────────────────────────────
    // El cuerpo se evalúa por "ref sin persistir": las hidratadas desde la BD
    // siempre traen `storagePath` y las recién generadas nunca. Es lo único que
    // sobrevive al auto-fijado, que ya escribió la hoja al store antes de que
    // el usuario guarde.
    const hasFreshBodySheet =
        !!bodySheet ||
        !!bodySheetNude ||
        isUnpersistedRef(bodyRef) ||
        isUnpersistedRef(bodyRefNsfw)
    const isDirty =
        hasFreshBodySheet ||
        fingerprintOf({
            name: saveAvatarName,
            generalReferences: localGeneralRefs,
            faceRef: localFaceRef,
            angleRef: localAngleRef,
            identityWeight: localIdentityWeight,
            measurements: localMeasurements,
            faceDescription: localFaceDescription,
        }) !== baselineRef.current
    const guardHook = useUnsavedChangesGuard({ isDirty })
    const guardedClose = guardHook.guard(onClose)

    const lostItems = (): string[] => {
        const items: string[] = []
        if (hasFreshBodySheet) items.push('La hoja de cuerpo sin guardar')
        if (saveAvatarName.trim() !== (avatarName || '').trim()) {
            items.push('El nombre del avatar')
        }
        if (measuresKey(localMeasurements) !== measuresKey(measurements)) {
            items.push('Los atributos físicos y de apariencia')
        }
        if (
            localGeneralRefs.map(refKey).join() !==
                generalReferences.map(refKey).join() ||
            refKey(localFaceRef) !== refKey(faceRef) ||
            refKey(localAngleRef) !== refKey(angleRef)
        ) {
            items.push('Las imágenes de referencia')
        }
        if (
            localIdentityWeight !== identityWeight ||
            localFaceDescription !== faceDescription
        ) {
            items.push('El peso de identidad y la descripción facial')
        }
        return items.length > 0 ? items : ['Los cambios del formulario']
    }

    const isCleaningRefs = cleaningRefs.face || cleaningRefs.angle
    const canSave = !!saveAvatarName.trim() && !isCleaningRefs
    const saveBlockedReason = !saveAvatarName.trim()
        ? 'No se puede guardar todavía: ponle un nombre al avatar.'
        : isCleaningRefs
          ? 'Espera unos segundos: se está limpiando la marca de agua de una referencia.'
          : undefined

    const handleDiscard = () => {
        notifyDiscarded(lostItems(), hasFreshBodySheet)
        // La hoja YA fijada en el store NO se revierte: es un activo que KIE
        // cobró, y un botón llamado "Descartar" no debería destruirlo. Sigue
        // disponible en esta sesión del Studio y se puede guardar reabriendo
        // el drawer. Se descartan las ediciones del formulario.
        guardHook.proceed()
    }

    const handleKeepEditing = () => {
        guardHook.dismiss()
        if (!saveAvatarName.trim()) {
            requestAnimationFrame(() => nameInputRef.current?.focus())
        }
    }

    // Apply changes to store
    const handleSave = async () => {
        setGeneralReferences(localGeneralRefs)
        setFaceRef(localFaceRef)
        setAngleRef(localAngleRef)
        // SE GUARDA LO QUE SE VE: generar (ya cobrado en KIE), verlo en
        // pantalla y darle a Guardar descartaba la hoja en silencio. Desde que
        // la generación fija el cuerpo sola esto es red de seguridad —
        // idempotente, apuntan al mismo objeto— y no el mecanismo.
        if (bodySheet) setBodyRef(bodySheet)
        if (bodySheetNude) setBodyRefNsfw(bodySheetNude)
        setIdentityWeight(localIdentityWeight)
        setMeasurements(localMeasurements)
        setFaceDescription(localFaceDescription)

        if (onSaveAvatar && saveAvatarName.trim()) {
            await onSaveAvatar(saveAvatarName.trim())
            // El guard no debe preguntar por un cierre que viene JUSTO de
            // guardar: `isDirty` todavía no propagó cuando esto corre.
            guardHook.bypassOnce()
            // Cerrar al guardar: era lo que hacia «Apply Changes», y guardar
            // es el final natural de editar. Sin esto el drawer se quedaba
            // abierto sin nada mas que hacer.
            onClose()
        }
    }

    /**
     * "Guardar y salir" del diálogo. Si el guardado falla, el diálogo se queda
     * abierto: cerrar igual perdería el trabajo justo cuando no se pudo poner
     * a salvo. Depende de que `onSaveAvatar` re-lance (ver AvatarStudioMain).
     */
    const handleSaveAndExit = async () => {
        try {
            await handleSave()
            guardHook.proceedIgnoringDirty()
        } catch {
            // El host ya avisó con su toast; se mantiene el diálogo.
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
            const description = await analyzeFaceFromImages(
                validRefs.map((img) => ({
                    base64: img.base64,
                    mimeType: img.mimeType,
                })),
            )
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
            const newAngleImage: ReferenceImage = {
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

    // Normalizes a KIE result (http(s) URL or data URL) into a ReferenceImage
    // with base64 + thumbnail, ready to save/persist.
    const toReferenceImage = async (
        url: string,
        type: ReferenceImage['type'],
    ): Promise<ReferenceImage> => {
        // data URL directo; http(s) vía urlToDataUrl, que cae al servidor si el
        // host no manda CORS (R2 público, MuleRouter).
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

    // Generate the Body Angle Sheet (3-view mini-bikini reference) via a
    // permissive KIE model, anchored to the face ref + curves emphasis.
    const handleGenerateBody = async (
        only?: 'clothed' | 'nude',
    ) => {
        if (!selectedBodyModel) return
        setIsGeneratingBody(true)
        try {
            // Las DOS variantes de un golpe (vestida + nude): la vestida va a
            // todos los motores y la nude solo a los permisivos en runs NSFW.
            // Al refrescar SOLO la vestida, se hereda el cuerpo de la nude que
            // el avatar ya tiene — si no, la hoja nueva diverge de la guardada.
            const nudeExistente = bodySheetNude ?? bodyRefNsfw
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
                ? await toReferenceImage(pair.url, 'body')
                : null
            if (sheet) setBodySheet(sheet)
            const nudeSheet = pair.nudeUrl
                ? await toReferenceImage(pair.nudeUrl, 'body_nsfw')
                : null
            // Solo pisa la nude si se pidió (refresh selectivo).
            if (nudeSheet || only !== 'clothed') setBodySheetNude(nudeSheet)
            // FIJADO AUTOMÁTICO (2026-07-28): lo que se generó ES el cuerpo del
            // avatar. Antes había que pulsar "Usar como cuerpo" y, si no se
            // pulsaba, la hoja —ya pagada— se perdía al cerrar el drawer.
            // Se asigna SOLO lo que salió: una nude que rebotó no puede borrar
            // la que el avatar ya tenía guardada.
            if (sheet) setBodyRef(sheet)
            if (nudeSheet) setBodyRefNsfw(nudeSheet)
            setSheetMeasurements(localMeasurements) // sheet ↔ medidas actuales
            const selName =
                bodyLabModels.find((p) => p.model === selectedBodyModel)
                    ?.name || selectedBodyModel
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

    const bodyLabModels = getBodyLabModels(providers)

    // ¿El sheet mostrado quedó desactualizado vs los atributos actuales?
    const shownBody = bodySheet || bodyRef
    // Ignora los campos de apariencia que el sheet no dibuja (pezones) — cambiarlos
    // no altera el cuerpo, así que NO debe pedir regenerar (gasto de tokens).
    const bodyStale =
        !!shownBody &&
        !!sheetMeasurements &&
        !sameBodyShape(localMeasurements, sheetMeasurements)

    // Default: primer modelo permisivo (los face:true ya vienen primero).
    useEffect(() => {
        if (!selectedBodyModel && bodyLabModels.length > 0) {
            setSelectedBodyModel(bodyLabModels[0].model)
        }
    }, [bodyLabModels, selectedBodyModel])

    // Reference Slot Component (same as AvatarCreatorMain)
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
        busy,
    }: {
        title: string
        subtitle: string
        image: ReferenceImage | null
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
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-gray-500">{subtitle}</p>
                </div>
            </div>
            {image ? (
                <div className="relative group">
                    <img
                        src={
                            image.thumbnailUrl || image.url || image.storagePath
                        }
                        alt={title}
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
                        <span>Edit Avatar</span>
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
                // pasaba, asi que ESC no hacia nada. Ahora cierra, pero pasando
                // por el guard. El click en el backdrop se deja DESACTIVADO a
                // proposito: un panel de 480px lleno de sliders al lado de un
                // backdrop enorme es un iman de clicks perdidos.
                onRequestClose={guardedClose}
                shouldCloseOnOverlayClick={false}
                placement="right"
                width={480}
            >
                <div className="h-full flex flex-col">
                    {/* Scrollable Content */}
                    <ScrollBar className="flex-1">
                        <div className="p-3 space-y-2 relative">
                            {isLoadingReferences && (
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
                                        title="Face Close-up"
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
                                        title="Angle Sheet"
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
                                    models={bodyLabModels.map((p) => ({
                                        id: p.id,
                                        name: p.name,
                                        model: p.model,
                                    }))}
                                    selectedModel={selectedBodyModel}
                                    onSelectModel={setSelectedBodyModel}
                                    isGenerating={isGeneratingBody}
                                    sheet={bodySheet || bodyRef}
                                    sheetModel={
                                        bodySheet
                                            ? bodySheetModel
                                            : bodyRef
                                              ? 'Cuerpo guardado'
                                              : undefined
                                    }
                                    onGenerate={handleGenerateBody}
                                    onRegenerate={(only) =>
                                        handleGenerateBody(only)
                                    }
                                    onPreview={() => {
                                        const s = bodySheet || bodyRef
                                        if (s) setPreviewImage(s)
                                    }}
                                    stale={bodyStale}
                                    nudeSheet={bodySheetNude || bodyRefNsfw}
                                    onPreviewNude={() => {
                                        const n = bodySheetNude || bodyRefNsfw
                                        if (n) setPreviewImage(n)
                                    }}
                                    disabledReason={
                                        bodyLabModels.length === 0
                                            ? 'No hay modelos KIE de imagen disponibles. Actívalos en AI Providers.'
                                            : undefined
                                    }
                                    missingSheetNotice={
                                        // Una hoja recién generada ya resuelve
                                        // el hueco: avisar entonces sería
                                        // alarmar por algo ya arreglado.
                                        bodySheet || bodySheetNude
                                            ? undefined
                                            : buildMissingSheetNotice(
                                                  missingSheets,
                                              )
                                    }
                                />
                            </Card>
                        </div>
                    </ScrollBar>

                    {/* Footer: UN solo boton (2026-07-26). Habia dos —«Apply
                        Changes» (solo memoria) y «Save to Database» (persistia)—
                        y la diferencia no se leia: los cambios «aplicados» se
                        perdian al recargar sin que nada lo advirtiera. Como
                        guardar YA aplicaba al store ademas de persistir, el
                        azul era un subconjunto del verde. Queda el que no
                        pierde trabajo. */}
                    <div className="shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                        <Input
                            ref={nameInputRef}
                            placeholder="Nombre del avatar..."
                            value={saveAvatarName}
                            onChange={(e) => setSaveAvatarName(e.target.value)}
                            onKeyDown={(e) =>
                                e.key === 'Enter' && handleSaveClick()
                            }
                        />
                        <div className="flex gap-2">
                            <Button
                                variant="solid"
                                icon={<HiOutlineSave />}
                                onClick={handleSaveClick}
                                loading={isSavingAvatar}
                                className="flex-1"
                                disabled={
                                    !saveAvatarName.trim() ||
                                    // No guardar la version CON marca de agua
                                    // mientras se esta limpiando.
                                    cleaningRefs.face ||
                                    cleaningRefs.angle
                                }
                            >
                                {cleaningRefs.face || cleaningRefs.angle
                                    ? 'Limpiando marca…'
                                    : 'Save Avatar'}
                            </Button>
                            <Button variant="plain" onClick={guardedClose}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            </Drawer>

            {/* Image Preview Lightbox (grande + zoom + arrastrar) */}
            <ImageLightbox
                imageUrl={
                    previewImage
                        ? previewImage.url ||
                          previewImage.thumbnailUrl ||
                          previewImage.storagePath ||
                          null
                        : null
                }
                // Toggle vestida ↔ NSFW dentro del visor (solo si el
                // avatar tiene las dos hojas y se está viendo una de ellas).
                variants={(() => {
                    const c = bodySheet || bodyRef
                    const n = bodySheetNude || bodyRefNsfw
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
                isSaving={isSavingAvatar}
                onSaveAndExit={handleSaveAndExit}
                onDiscard={handleDiscard}
                onKeepEditing={handleKeepEditing}
            />
        </>
    )
}

export default AvatarEditDrawer
