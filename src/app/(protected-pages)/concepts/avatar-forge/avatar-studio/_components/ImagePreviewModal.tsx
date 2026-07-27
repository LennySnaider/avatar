'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { downloadMediaUrl } from '../../_utils/mediaDownload'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Slider from '@/components/ui/Slider'
import ContinueVideoDialog from './ContinueVideoDialog'
import ExtractFrameDialog from './ExtractFrameDialog'
import { readHiddenIds, sortByUserOrder } from '../../_shared/providerPrefs'
import {
    HiOutlineDownload,
    HiOutlineChevronLeft,
    HiOutlineChevronRight,
    HiOutlineChevronDown,
    HiOutlineChevronUp,
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
    HiOutlineShare,
    HiOutlineFolderAdd,
    HiOutlineVolumeUp,
    HiOutlineUserCircle,
} from 'react-icons/hi'
import AssignAvatarDialog from './AssignAvatarDialog'
import VaultDialog from './VaultDialog'
import { HiOutlineArrowUturnLeft, HiOutlineArrowUturnRight } from 'react-icons/hi2'
import Tooltip from '@/components/ui/Tooltip'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
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
    onContinueVideo?: (
        frameBase64: string,
        promptSuggestion: string,
        dialogue: string,
        aspectRatio: AspectRatio,
        useAvatarIdentity: boolean,
        identityModel: 'seedance' | 'kling-omni' | 'veo-3-1',
    ) => void
    onReuse?: (media: GeneratedMedia) => void
    onPost?: (media: GeneratedMedia) => void
    /** Opens the Video Editor with this video (moved here from the gallery card overlay). */
    onEditVideo?: (media: GeneratedMedia) => void
    /** Opens the Lipsync dialog for this video (audio comes from Voice Studio). */
    onLipsync?: (media: GeneratedMedia) => void
    /** Called with the cropped media so the studio auto-persists it. */
    onCropped?: (media: GeneratedMedia) => void
    /** Needed by the "Assign avatar" action (lists the user's avatars). */
    userId?: string
}

const ImagePreviewModal = ({
    onEdit,
    onAnimate,
    onVariant,
    onSave,
    onContinueVideo,
    onReuse,
    onPost,
    onEditVideo,
    onLipsync,
    onCropped,
    userId,
}: ImagePreviewModalProps) => {
    const { gallery, previewMedia, previewStartInEdit, setPreviewMedia, removeFromGallery, addToGallery, videoDialogue, providers, activeProviderId } = useAvatarStudioStore()

    // Image-supporting providers available for editing override
    const imageProviders = providers.filter(p => p.supports_image)
    // Only models that actually CONSUME the source image edit well. Text-to-image
    // models (Z-Image, Seedream, Ideogram, Nano Banana 2) and MiniMax (keeps only
    // the face and re-renders everything else) ignore the photo and hallucinate a
    // new subject — so they're hidden from the edit provider list.
    const canEditImage = (p: (typeof imageProviders)[number]): boolean => {
        if (p.type === 'GOOGLE') return true // Gemini native editImage
        if (p.type !== 'KIE') return false
        const m = p.model || ''
        return (
            m.startsWith('flux-kontext') ||
            m === 'gpt-image-2-text-to-image' ||
            m === 'nano-banana-pro' ||
            m.startsWith('flux-2/') ||
            m.startsWith('qwen') ||
            m.startsWith('seedream/') || // real i2i variants (4.5-edit / 5-lite i2i)
            m === 'wan/2-7-image' || // unified t2i+edit vía input_urls, NSFW real
            m === 'wan/2-7-image-pro' || // mismo schema + seed/bbox (docs 2026-07-23)
            m.startsWith('grok-imagine/')
        )
    }
    // Orden manual + ocultos de la página AI Providers también aplican aquí.
    const hiddenProviderIds = readHiddenIds()
    const editProviders = sortByUserOrder(
        imageProviders.filter(canEditImage),
    ).filter((p) => !hiddenProviderIds.includes(p.id))
    // If the studio's active provider can't edit, default the edit dropdown to a
    // real editor (Gemini first) instead of a broken choice.
    const defaultEditProviderId =
        editProviders.find((p) => p.id === activeProviderId)?.id ??
        editProviders.find((p) => p.type === 'GOOGLE')?.id ??
        editProviders[0]?.id ??
        null

    const [isEditing, setIsEditing] = useState(false)
    const [assignMedia, setAssignMedia] = useState<GeneratedMedia | null>(null)
    const [vaultOpen, setVaultOpen] = useState(false)
    const [editPrompt, setEditPrompt] = useState('')
    const [isDrawingMask, setIsDrawingMask] = useState(false)
    const [maskCanvas, setMaskCanvas] = useState<string | null>(null)
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const [videoCurrentTime, setVideoCurrentTime] = useState(0)
    const [videoDuration, setVideoDuration] = useState(0)
    const [brushSize, setBrushSize] = useState(30)
    /** Radio del difuminado, en pixeles de la imagen NATURAL. */
    const [blurStrength, setBlurStrength] = useState(24)
    const [isBlurring, setIsBlurring] = useState(false)
    const [assetDragOver, setAssetDragOver] = useState(false)
    /** ESPACIO mantenido = mano temporal, como en Photoshop. Deja arrastrar la
     * imagen sin salir del pincel — antes, con la máscara activa, no había
     * forma de moverse por una imagen ampliada. */
    const [spaceHeld, setSpaceHeld] = useState(false)
    const [editAspectRatio, setEditAspectRatio] = useState<AspectRatio>('1:1')
    const [editProviderId, setEditProviderId] = useState<string | null>(null)
    const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 })
    const [cropScale, setCropScale] = useState(100) // Percentage 30-100
    const [isDraggingCrop, setIsDraggingCrop] = useState(false)
    // Crop is OPT-IN: the crop overlay/slider only appear after the user clicks
    // the Crop button. Entering edit-mode defaults to the AI-edit UI.
    const [isCropping, setIsCropping] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [zoomLevel, setZoomLevel] = useState(1)
    // Espejo del zoom para leerlo desde handlers sin re-crearlos en cada paso.
    const zoomLevelRef = useRef(1)
    /**
     * Desplazamiento en PIXELES de pantalla. Junto con el zoom forma un
     * `transform: translate3d(...) scale(...)`.
     *
     * Antes el zoom cambiaba la ALTURA de la imagen y el paneo movia el
     * scroll: las dos cosas son cambios de LAYOUT, asi que el navegador
     * reflowaba en cada paso de rueda y la imagen "brincaba". Un transform lo
     * resuelve el compositor —sin reflow ni repaint del contenido— que es como
     * consiguen el zoom continuo Figma, Photoshop o Maps.
     */
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const panRef = useRef({ x: 0, y: 0 })
    /** El contenido transformado; su rect ya viene con el transform aplicado. */
    const stageRef = useRef<HTMLDivElement>(null)
    /** Con rueda NO se anima (cada paso llegaria tarde y se sentiria pastoso);
     *  con los botones SI, porque es un salto grande y aislado. */
    const [animateZoom, setAnimateZoom] = useState(false)
    const [isPanning, setIsPanning] = useState(false)
    // Colapsar el panel inferior (prompt + acciones) para ver la media completa.
    const [panelCollapsed, setPanelCollapsed] = useState(false)
    // Drag-to-pan scrolls the overflow-auto media container; we stash the
    // pointer + scroll origin here on mousedown.
    const dragScrollRef = useRef<{
        startX: number
        startY: number
        scrollLeft: number
        scrollTop: number
    } | null>(null)
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
    const getMediaScrollEl = () => mediaContainerRef.current
    /**
     * El efecto de la rueda salia por `if (!el) return` cuando el contenedor
     * aun no estaba montado, y como sus dependencias no cambiaban NUNCA se
     * volvia a ejecutar: el zoom con rueda quedaba muerto para el resto de la
     * vida del modal. Este contador cambia al montar el nodo, asi que el
     * efecto se re-ejecuta justo cuando hay algo a lo que engancharse.
     */
    const [scrollElVersion, setScrollElVersion] = useState(0)
    const attachMediaContainer = useCallback((node: HTMLDivElement | null) => {
        mediaContainerRef.current = node
        if (node) setScrollElVersion((v) => v + 1)
    }, [])
    const viewportRef = useRef<HTMLDivElement>(null)
    const isDrawingRef = useRef(false)
    const lastPosRef = useRef({ x: 0, y: 0 })
    const [canvasSize, setCanvasSize] = useState({ width: 500, height: 500 })

    // Brush cursor preview — follows the mouse so the user sees the brush radius.
    //
    // Va en pixeles de PANTALLA, no del bitmap. Son cosas distintas desde que
    // el canvas escala con el zoom: el circulo se posiciona con CSS sobre el
    // contenedor, asi que darle coordenadas del bitmap lo desplazaba mas
    // cuanto mas zoom hubiera. `size` viaja con ellas porque el pincel tambien
    // se ve mas grande al acercarse — es el mismo trazo, visto de cerca.
    const [cursorPreview, setCursorPreview] = useState<{
        x: number
        y: number
        size: number
    } | null>(null)

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
        setIsCropping(false)
        setZoomLevel(1)
        setEditAssets([])
    }, [setPreviewMedia])

    // Handle edit asset upload
    /**
     * Alta de assets, compartida por el selector y por ARRASTRAR.
     *
     * La zona tenia borde punteado —que invita a soltar— pero era solo un
     * <button>: no habia manejador de drop, asi que soltar encima no hacia
     * nada y no habia forma de saber por que.
     */
    const addEditAssetFiles = useCallback((fileList: FileList | File[]) => {
        const files = Array.from(fileList).filter((f) =>
            f.type.startsWith('image/'),
        )
        if (files.length === 0) return

        files.forEach((file) => {
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
    }, [editAssets.length])

    const handleEditAssetUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) addEditAssetFiles(e.target.files)
        // Permite volver a elegir el MISMO fichero: sin esto el input conserva
        // el valor y el segundo intento no dispara onChange.
        e.target.value = ''
    }, [addEditAssetFiles])

    // Remove edit asset
    const removeEditAsset = useCallback((id: string) => {
        setEditAssets((prev) => prev.filter((a) => a.id !== id))
    }, [])

    // ── ZOOM ────────────────────────────────────────────────────────────
    // Hasta 600%: el techo de 300% se quedaba corto para retocar detalle, que
    // es justo para lo que se hace zoom aqui.
    const MAX_ZOOM = 6

    /**
     * Punto de la PANTALLA que debe quedarse quieto al escalar. Se guarda con
     * el zoom previo y lo consume el efecto de abajo, ya con el DOM al tamano
     * nuevo — hay que medir DESPUES de que el navegador aplique el tamano.
     */

    /**
     * Ancla el zoom al PUNTERO, como en Photoshop. Sin esto el contenedor
     * crece desde su origen y la vista se va a la esquina superior izquierda:
     * te acercas y pierdes justo lo que estabas mirando.
     *
     * La cuenta: lo que hay bajo el cursor esta a `(scroll + m)` del origen
     * del contenido. Al escalar por k pasa a `(scroll + m) * k`, y para que
     * siga bajo el cursor el scroll nuevo es `(scroll + m) * k - m`.
     */
    /**
     * Limita el desplazamiento a lo que un SCROLL habria permitido.
     *
     * Con `transform` el contenedor ya no scrollea, asi que su barra de ECME
     * dejo de tener sentido — pero lo que esa barra garantizaba si importa:
     * que no puedas perder la imagen fuera de la vista ni quedarte sin forma
     * de volver. Esto lo garantiza por construccion.
     *
     * A pan 0 la imagen esta CENTRADA, asi que el margen util a cada lado es
     * la mitad de lo que sobresale. Si cabe entera, el rango es 0 y queda
     * centrada — igual que un contenedor sin overflow.
     */
    const clampPan = useCallback((next: { x: number; y: number }, scale: number) => {
        const stage = stageRef.current
        const el = getMediaScrollEl()
        if (!stage || !el) return next
        const overflowX = Math.max(0, stage.offsetWidth * scale - el.clientWidth)
        const overflowY = Math.max(0, stage.offsetHeight * scale - el.clientHeight)
        return {
            x: Math.max(-overflowX / 2, Math.min(overflowX / 2, next.x)),
            y: Math.max(-overflowY / 2, Math.min(overflowY / 2, next.y)),
        }
    }, [])

    const applyZoom = useCallback(
        (next: number, clientX?: number, clientY?: number) => {
            const target = Math.max(1, Math.min(next, MAX_ZOOM))
            const prev = zoomLevelRef.current
            if (target === prev) return

            const stage = stageRef.current
            if (stage) {
                const rect = stage.getBoundingClientRect()
                // Sin puntero (botones) el ancla es el centro de lo que se ve.
                const container = getMediaScrollEl()?.getBoundingClientRect()
                const ax =
                    clientX ??
                    (container ? container.left + container.width / 2 : rect.left)
                const ay =
                    clientY ??
                    (container ? container.top + container.height / 2 : rect.top)
                // Punto del CONTENIDO bajo el ancla, sin escalar. El rect ya
                // viene transformado, asi que dividir por el zoom actual lo
                // devuelve a coordenadas propias.
                const lx = (ax - rect.left) / prev
                const ly = (ay - rect.top) / prev
                // Para que ese punto no se mueva, el borde debe caer en
                // `ancla - punto*zoomNuevo`; el pan absorbe la diferencia.
                const p = panRef.current
                const nextPan = {
                    x: p.x + (ax - lx * target) - rect.left,
                    y: p.y + (ay - ly * target) - rect.top,
                }
                panRef.current =
                    target === 1 ? { x: 0, y: 0 } : clampPan(nextPan, target)
                setPan(panRef.current)
            }
            zoomLevelRef.current = target
            setZoomLevel(target)
        },
        [clampPan],
    )

    useEffect(() => {
        zoomLevelRef.current = zoomLevel
    }, [zoomLevel])

    const handleZoomIn = useCallback(() => {
        setAnimateZoom(true)
        applyZoom(zoomLevelRef.current * 1.25)
    }, [applyZoom])

    const handleZoomOut = useCallback(() => {
        setAnimateZoom(true)
        applyZoom(zoomLevelRef.current / 1.25)
    }, [applyZoom])

    const handleResetZoom = useCallback(() => {
        setAnimateZoom(true)
        zoomLevelRef.current = 1
        panRef.current = { x: 0, y: 0 }
        setPan({ x: 0, y: 0 })
        setZoomLevel(1)
    }, [])

    // Mouse wheel zoom — use native listener with { passive: false }
    // so preventDefault() works (React's onWheel is passive by default in modern browsers)
    useEffect(() => {
        const el = getMediaScrollEl()
        if (!el) return
        const onWheel = (e: WheelEvent) => {
            // El crop SI asume la imagen en fit (su marco se calcula sobre el
            // tamaño mostrado). La máscara ya no: su canvas escala con la
            // imagen.
            if (isCropping) return
            e.preventDefault()
            setAnimateZoom(false)
            // Paso FINO y proporcional: con transform cada evento cuesta solo
            // una recomposicion, asi que se puede seguir la rueda de cerca en
            // vez de dar saltos gruesos.
            const step = Math.exp(-e.deltaY * 0.0015)
            applyZoom(zoomLevelRef.current * step, e.clientX, e.clientY)
        }
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => el.removeEventListener('wheel', onWheel)
    }, [isCropping, applyZoom, previewMedia, scrollElVersion])

    useEffect(() => {
        if (!previewMedia) return
        const isTyping = (t: EventTarget | null) =>
            t instanceof HTMLElement &&
            (t.tagName === 'INPUT' ||
                t.tagName === 'TEXTAREA' ||
                t.isContentEditable)
        const down = (e: KeyboardEvent) => {
            // Escribiendo en el prompt, ESPACIO es un espacio.
            if (e.code !== 'Space' || isTyping(e.target)) return
            e.preventDefault()
            setSpaceHeld(true)
        }
        const up = (e: KeyboardEvent) => {
            if (e.code === 'Space') setSpaceHeld(false)
        }
        // El blur importa: si se suelta la tecla fuera de la ventana el
        // keyup nunca llega y la mano se quedaria pegada.
        const clear = () => setSpaceHeld(false)
        window.addEventListener('keydown', down)
        window.addEventListener('keyup', up)
        window.addEventListener('blur', clear)
        return () => {
            window.removeEventListener('keydown', down)
            window.removeEventListener('keyup', up)
            window.removeEventListener('blur', clear)
        }
    }, [previewMedia])

    // Drag-to-pan: grabbing the zoomed image scrolls the overflow-auto media
    // container. Driving the container's own scrollLeft/scrollTop means every
    // region (incl. the bottom of tall images) is reachable, with no
    // translate/clamp jank.
    const handlePanStart = useCallback((e: React.MouseEvent) => {
        // Con ESPACIO se puede arrastrar incluso dibujando: es el gesto que
        // convierte el pincel en mano mientras se mantiene.
        if (isCropping || (isDrawingMask && !spaceHeld)) return
        // A zoom 1 no hay nada que mover: la imagen cabe entera.
        if (zoomLevelRef.current <= 1 && !spaceHeld) return
        e.preventDefault()
        setAnimateZoom(false)
        setIsPanning(true)
        dragScrollRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            // Reutiliza los campos: ahora guardan el PAN de partida, no el
            // scroll. Mover por transform y no por scroll es lo que evita el
            // reflow en cada frame del arrastre.
            scrollLeft: panRef.current.x,
            scrollTop: panRef.current.y,
        }
    }, [isDrawingMask, isCropping, spaceHeld])

    const handlePanMove = useCallback((e: MouseEvent) => {
        const drag = dragScrollRef.current
        if (!drag) return
        panRef.current = clampPan(
            {
                x: drag.scrollLeft + (e.clientX - drag.startX),
                y: drag.scrollTop + (e.clientY - drag.startY),
            },
            zoomLevelRef.current,
        )
        setPan(panRef.current)
    }, [clampPan])

    const handlePanEnd = useCallback(() => {
        setIsPanning(false)
        dragScrollRef.current = null
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
        await downloadMediaUrl(
            previewMedia.url,
            `avatar-${previewMedia.mediaType.toLowerCase()}-${Date.now()}`,
            previewMedia.mediaType === 'VIDEO',
        )
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
        setIsDrawingMask(false)
        setIsCropping(false)
    }

    // Honor the store's one-shot `previewStartInEdit` flag: when the modal was
    // opened directly in edit-mode (gallery "Edit"), auto-enter edit once, then
    // clear the flag so cancelling the edit doesn't re-trigger it.
    useEffect(() => {
        if (previewMedia && previewStartInEdit && previewMedia.mediaType === 'IMAGE' && onEdit) {
            setIsEditing(true)
            setEditPrompt('')
            setMaskCanvas(null)
            setIsDrawingMask(false)
            setIsCropping(false)
            setPreviewMedia(previewMedia, false)
        }
    }, [previewMedia, previewStartInEdit, onEdit, setPreviewMedia])

    /**
     * DIFUMINAR la zona pintada y guardar una COPIA.
     *
     * No pasa por ningun modelo: es composicion de canvas, asi que es
     * instantaneo y gratis. Sirve para tapar caras, marcas o fondos sin gastar
     * una generacion — y sobre todo sin arriesgar que el modelo cambie algo
     * mas de lo que se le pidio, que es lo que pasa al "editar" para borrar.
     *
     * Como funciona: se pinta el original, aparte una version desenfocada
     * entera, y se recorta esa version con la mascara usando
     * `destination-in` (deja solo los pixeles donde la mascara tiene alfa).
     * El resultado se superpone. La mascara viene a resolucion de PANTALLA y
     * se escala a la natural, igual que en el composite.
     */
    const handleApplyBlur = useCallback(async () => {
        if (!previewMedia || !canvasRef.current) return
        const maskUrl = canvasRef.current.toDataURL('image/png')

        const load = (src: string) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
                const im = new Image()
                im.crossOrigin = 'anonymous'
                im.onload = () => resolve(im)
                im.onerror = () => reject(new Error('no se pudo cargar'))
                im.src = src
            })

        try {
            const [source, mask] = await Promise.all([
                load(previewMedia.publicUrl ?? previewMedia.url),
                load(maskUrl),
            ])
            const w = source.naturalWidth
            const h = source.naturalHeight

            // Capa desenfocada, recortada por la mascara.
            const blurred = document.createElement('canvas')
            blurred.width = w
            blurred.height = h
            const bctx = blurred.getContext('2d')
            if (!bctx) return
            // El radio se escala con la imagen: 24px sobre una foto 4K casi no
            // se ve, y sobre una de 512 la borra entera.
            const radius = Math.max(2, Math.round((blurStrength * w) / 1024))
            bctx.filter = `blur(${radius}px)`
            bctx.drawImage(source, 0, 0, w, h)
            bctx.filter = 'none'
            bctx.globalCompositeOperation = 'destination-in'
            bctx.drawImage(mask, 0, 0, w, h)

            const out = document.createElement('canvas')
            out.width = w
            out.height = h
            const octx = out.getContext('2d')
            if (!octx) return
            octx.drawImage(source, 0, 0)
            octx.drawImage(blurred, 0, 0)

            const blurredMedia: GeneratedMedia = {
                id: `blur-${Date.now()}`,
                url: out.toDataURL('image/jpeg', 0.95),
                prompt: `Blurred: ${previewMedia.prompt}`,
                aspectRatio: previewMedia.aspectRatio,
                timestamp: Date.now(),
                mediaType: 'IMAGE',
                avatarId: previewMedia.avatarId ?? null,
                avatarInfo: previewMedia.avatarInfo,
            }
            addToGallery(blurredMedia)
            // Mismo contrato que el crop: persistir de inmediato para que Post
            // y Asignar no queden bloqueados esperando un Save manual.
            onCropped?.(blurredMedia)
            setPreviewMedia(blurredMedia)
            setIsDrawingMask(false)
            setIsBlurring(false)
            toast.push(
                <Notification type="success" title="Copia difuminada" duration={2500}>
                    El original se queda intacto en la galería.
                </Notification>,
            )
        } catch (e) {
            console.error('[blur] failed:', e)
            toast.push(
                <Notification type="danger" title="No se pudo difuminar">
                    {e instanceof Error ? e.message : 'Fallo al componer la imagen'}
                </Notification>,
            )
        }
    }, [previewMedia, blurStrength, addToGallery, onCropped, setPreviewMedia])

    const handleSubmitEdit = async () => {
        if (!previewMedia) return

        // Crop mode applies a local browser crop; otherwise it's an AI edit that
        // requires an instruction. Crop is opt-in (Crop button), so it never runs
        // by default.
        if (!isCropping && editPrompt.trim().length === 0) return

        setIsSubmittingEdit(true)

        try {
            if (isCropping) {
                await performLocalCrop()
            } else {
                if (!onEdit) return
                // Preserve the source aspect ratio on an AI edit — the user
                // didn't ask to reshape it. Se deriva de los PÍXELES reales,
                // no del metadato (uploads/paths viejos guardan '1:1' aunque
                // la imagen sea vertical) — con un AR equivocado, modelos como
                // Seedream Lite ESTIRAN la imagen (cabeza ancha/aplastada).
                const img = imageRef.current
                let sourceAspect: AspectRatio = previewMedia.aspectRatio || '1:1'
                if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
                    const r = img.naturalWidth / img.naturalHeight
                    const candidates: Array<[AspectRatio, number]> = [
                        ['1:1', 1],
                        ['16:9', 16 / 9],
                        ['9:16', 9 / 16],
                        ['4:3', 4 / 3],
                        ['3:4', 3 / 4],
                    ]
                    let best = candidates[0]
                    for (const c of candidates) {
                        if (Math.abs(c[1] - r) < Math.abs(best[1] - r)) best = c
                    }
                    sourceAspect = best[0]
                }
                await onEdit(previewMedia, editPrompt, maskCanvas, sourceAspect, editAssets, editProviderId ?? defaultEditProviderId ?? undefined)
                handleClose()
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

        // Add cropped image to gallery (inherits the source's owning avatar)
        const croppedMedia: GeneratedMedia = {
            id: `crop-${Date.now()}`,
            url: croppedUrl,
            prompt: `Cropped: ${previewMedia.prompt}`,
            aspectRatio: editAspectRatio,
            timestamp: Date.now(),
            mediaType: 'IMAGE',
            avatarId: previewMedia.avatarId ?? null,
            avatarInfo: previewMedia.avatarInfo,
        }

        addToGallery(croppedMedia)
        // Auto-persist so Post/Assign unlock without a manual Save (crop used
        // to strand items in an unsaved state).
        onCropped?.(croppedMedia)
        setPreviewMedia(croppedMedia)
        setIsEditing(false)
        setIsCropping(false)
        setEditPrompt('')
        setCropScale(100)
        setCropPosition({ x: 0, y: 0 })
    }

    const handleToggleMask = () => {
        setIsDrawingMask(!isDrawingMask)
        // El zoom SOBREVIVE al entrar en máscara: se pierde justo cuando más
        // falta hace, que es al acercarse para marcar con precisión. El canvas
        // escala con la imagen, asi que ya no hay desalineación que evitar.
        if (!isDrawingMask) setIsCropping(false)
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

    // Del rect MOSTRADO al bitmap. Ya no es 1:1: con zoom el canvas se estira
    // por CSS mientras su bitmap se queda al tamaño de "fit", asi que hay que
    // dividir por la escala o los trazos caen desplazados.
    const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current
        if (!canvas) return { x: 0, y: 0 }
        const rect = canvas.getBoundingClientRect()
        const sx = rect.width > 0 ? canvas.width / rect.width : 1
        const sy = rect.height > 0 ? canvas.height / rect.height : 1
        return {
            x: (e.clientX - rect.left) * sx,
            y: (e.clientY - rect.top) * sy,
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
        const rect = canvasRef.current.getBoundingClientRect()
        const shown = rect.width > 0 ? rect.width / canvasRef.current.width : 1
        setCursorPreview({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            size: brushSize * shown,
        })

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
        if (!isEditing || isDrawingMask || !isCropping) return
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
            videoRef.current.play().catch(() => {})
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
        // PNG by default — lossless capture of the frame. JPG would
        // re-compress and the user has no good reason to lose quality
        // here; the file is also small (one frame).
        canvas.toBlob((blob) => {
            if (!blob) return
            const blobUrl = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = blobUrl
            link.download = `avatar-frame-${Date.now()}.png`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(blobUrl)
        }, 'image/jpeg', 0.95)
    }, [])

    // Handle confirm continue from dialog
    const handleConfirmContinue = useCallback((
        prompt: string,
        dialogue: string,
        aspectRatio: AspectRatio,
        useAvatarIdentity: boolean,
        identityModel: 'seedance' | 'kling-omni' | 'veo-3-1',
    ) => {
        if (!capturedFrame || !previewMedia || !onContinueVideo) return
        onContinueVideo(capturedFrame, prompt, dialogue, aspectRatio, useAvatarIdentity, identityModel)
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
                {/* Header — una sola fila: badge + índice + provider (nowrap,
                    truncado en móvil para no crecer en alto) + zoom compacto.
                    pr-10 deja hueco para la X del Dialog (esquina superior). */}
                <div className="flex items-center gap-2 sm:gap-4 p-4 pr-12 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                    <span
                        className={`shrink-0 px-2 py-1 text-xs font-bold rounded ${
                            previewMedia.mediaType === 'VIDEO'
                                ? 'bg-purple-500 text-white'
                                : 'bg-blue-500 text-white'
                        }`}
                    >
                        {previewMedia.mediaType}
                    </span>
                    <span className="shrink-0 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {currentIndex + 1} / {gallery.length}
                    </span>

                    {previewMedia.providerName && (
                        <span className="min-w-0 truncate px-2 py-1 text-xs font-medium rounded bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 whitespace-nowrap">
                            {previewMedia.providerName}
                        </span>
                    )}

                    {/* Zoom Controls — sin el % (solo aparece al hacer zoom, como
                        botón de reset); a 100% no ocupa nada. Disponible también
                        en modo EDIT (se bloquea solo con máscara/crop activos). */}
                    {previewMedia.mediaType === 'IMAGE' && (
                        <div className="flex items-center gap-1 sm:gap-2 ml-auto shrink-0">
                            <button
                                onClick={handleZoomOut}
                                disabled={zoomLevel <= 1 || isCropping}
                                className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Zoom Out"
                            >
                                <HiOutlineZoomOut className="w-4 h-4" />
                            </button>
                            {zoomLevel !== 1 && (
                                <button
                                    onClick={handleResetZoom}
                                    className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white text-center whitespace-nowrap"
                                    title="Reset Zoom"
                                >
                                    {Math.round(zoomLevel * 100)}%
                                </button>
                            )}
                            <button
                                onClick={handleZoomIn}
                                disabled={zoomLevel >= 6 || isCropping}
                                className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Zoom In"
                            >
                                <HiOutlineZoomIn className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Media Content */}
                <div
                    ref={viewportRef}
                    className="flex-1 min-h-0 relative flex items-center justify-center p-2 bg-gray-100 dark:bg-gray-800 overflow-hidden"
                >
                    {/* Toggle: colapsar/expandir el panel inferior para ver la
                        media completa sin obstrucción. Flota abajo-centro de la
                        media y permanece visible en ambos estados. */}
                    {!isEditing && (
                        <button
                            onClick={() => setPanelCollapsed((v) => !v)}
                            title={panelCollapsed ? 'Mostrar panel' : 'Ocultar panel — ver completa'}
                            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-white/90 text-gray-700 rounded-full hover:bg-white dark:bg-gray-800/90 dark:text-gray-200 dark:hover:bg-gray-800 shadow-lg transition-colors flex items-center"
                        >
                            {panelCollapsed ? (
                                <HiOutlineChevronUp className="w-5 h-5" />
                            ) : (
                                <HiOutlineChevronDown className="w-5 h-5" />
                            )}
                        </button>
                    )}

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

                    {/* Media Display — overflow nativo con scrollbars FINOS del
                        template (plugin tailwind-scrollbar). SimpleBar aquí
                        rompía el render de la media (área vacía). */}
                    <div
                        ref={attachMediaContainer}
                        className="relative w-full h-full min-h-0 flex items-center justify-center overflow-hidden"
                        onMouseDown={handlePanStart}
                        style={{
                            cursor:
                                spaceHeld
                                    ? isPanning
                                        ? 'grabbing'
                                        : 'grab'
                                    : zoomLevel > 1 && !isDrawingMask && !isCropping
                                    ? isPanning
                                        ? 'grabbing'
                                        : 'grab'
                                    : 'default',
                        }}
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
                            // Zoomed images are navigated by SCROLLING the
                            // overflow-auto container above — every region
                            // (incl. the bottom of tall images) is reachable.
                            <div
                                ref={stageRef}
                                className="relative inline-block max-h-full max-w-full"
                                style={{
                                    // TODO el zoom y el paneo viven aqui. Es un
                                    // transform: lo resuelve el compositor sin
                                    // reflow, que es lo que hace que la rueda
                                    // se sienta continua en vez de a saltos.
                                    transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoomLevel})`,
                                    transformOrigin: '0 0',
                                    willChange: 'transform',
                                    transition: animateZoom
                                        ? 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)'
                                        : 'none',
                                }}
                            >
                                <img
                                    ref={imageRef}
                                    src={previewMedia.publicUrl ?? previewMedia.url}
                                    alt={previewMedia.prompt}
                                    onError={(e) => {
                                        // Durable Supabase copy is preferred; if it
                                        // fails, fall back to the provider url so the
                                        // preview never goes silently blank.
                                        const img = e.currentTarget
                                        if (previewMedia.url && img.src !== previewMedia.url) {
                                            img.src = previewMedia.url
                                        }
                                    }}
                                    className="rounded-lg block select-none"
                                    // Tamaño base = TODA el area disponible.
                                    // Estaba capado a 60vh, asi que el modal
                                    // se veia enorme alrededor de una imagen
                                    // pequena. El zoom lo aplica el transform
                                    // del contenedor, no este tamaño — por eso
                                    // aqui puede ser 100% sin reintroducir el
                                    // reflow.
                                    style={{ maxHeight: '100%', maxWidth: '100%' }}
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
                                                // El BITMAP (atributos width/
                                                // height) se queda fijo; aquí
                                                // solo se ESTIRA por CSS para
                                                // seguir a la imagen al hacer
                                                // zoom. Redimensionar el bitmap
                                                // borraria los trazos ya
                                                // dibujados.
                                                width: '100%',
                                                height: '100%',
                                                opacity: 0.5,
                                                cursor: 'none',
                                                // Con ESPACIO el canvas se
                                                // aparta para que el arrastre
                                                // llegue al contenedor.
                                                pointerEvents: spaceHeld
                                                    ? 'none'
                                                    : 'auto',
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
                                                    left: cursorPreview.x - cursorPreview.size / 2,
                                                    top: cursorPreview.y - cursorPreview.size / 2,
                                                    width: cursorPreview.size,
                                                    height: cursorPreview.size,
                                                    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(0, 0, 0, 0.7)',
                                                    mixBlendMode: 'difference',
                                                }}
                                            />
                                        )}
                                    </>
                                )}
                                {/* Crop Overlay — only when the user opted into Crop */}
                                {isEditing && !isDrawingMask && isCropping && (() => {
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
                            {/* Aspect Ratio only governs the CROP overlay — an AI
                                edit preserves the source ratio, so this selector
                                is hidden unless Crop is active (else it silently
                                re-shaped edits, e.g. a 9:16 → 1:1). */}
                            {isCropping && (
                                <div>
                                    <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                                        Crop ratio
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
                            )}
                            <div>
                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                                    Provider
                                </label>
                                <select
                                    value={editProviderId ?? defaultEditProviderId ?? ''}
                                    onChange={(e) => setEditProviderId(e.target.value || null)}
                                    className="h-10 px-3 text-sm border rounded-lg bg-white border-gray-300 text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 max-w-45"
                                    title="Solo modelos que editan la foto real (los de solo-texto no aparecen)"
                                >
                                    {editProviders.map(p => (
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
                                <span>{isDrawingMask ? 'Pintando…' : 'Pincel'}</span>
                            </Button>
                            <Button
                                variant={isCropping ? 'solid' : 'plain'}
                                color={isCropping ? 'purple' : 'gray'}
                                onClick={() => {
                                    setIsCropping((c) => {
                                        // Entering crop: default the crop ratio to
                                        // the image's own ratio so it doesn't reshape.
                                        if (!c) setEditAspectRatio(previewMedia.aspectRatio || '1:1')
                                        // El overlay de crop asume fit — 100%.
                                        if (!c) setZoomLevel(1)
                                        return !c
                                    })
                                    setIsDrawingMask(false)
                                }}
                            >
                                <span>Crop</span>
                            </Button>
                            <Button
                                variant="solid"
                                onClick={handleSubmitEdit}
                                loading={isSubmittingEdit}
                                disabled={!isCropping && !editPrompt.trim()}
                            >
                                {isCropping ? 'Apply Crop' : 'Apply Edit'}
                            </Button>
                            <Button variant="plain" onClick={() => { setIsEditing(false); setIsCropping(false) }}>
                                Cancel
                            </Button>
                        </div>
                        {isDrawingMask ? (
                            <div className="mt-3 space-y-2">
                                {/* Dos usos del MISMO trazo: marcarle la zona
                                    al modelo, o difuminarla aqui mismo. Lo
                                    segundo no pasa por ningun proveedor —
                                    instantaneo, gratis, y sin riesgo de que el
                                    modelo cambie algo mas de lo pedido. */}
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500 dark:text-gray-400 w-20">
                                        El trazo
                                    </span>
                                    <Button
                                        size="xs"
                                        variant={isBlurring ? 'default' : 'solid'}
                                        onClick={() => setIsBlurring(false)}
                                    >
                                        <span>Marca la zona a editar</span>
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant={isBlurring ? 'solid' : 'default'}
                                        onClick={() => setIsBlurring(true)}
                                    >
                                        <span>Difumina (copia)</span>
                                    </Button>
                                </div>
                                {isBlurring && (
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 w-20">
                                            Intensidad
                                        </span>
                                        <div className="flex-1">
                                            <Slider
                                                value={blurStrength}
                                                onChange={(val) => setBlurStrength(val as number)}
                                                min={4}
                                                max={80}
                                            />
                                        </div>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
                                            {blurStrength}
                                        </span>
                                        <Button
                                            size="xs"
                                            variant="solid"
                                            onClick={handleApplyBlur}
                                        >
                                            <span>Guardar copia</span>
                                        </Button>
                                    </div>
                                )}
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
                        ) : isCropping ? (
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
                        ) : null}

                        {/* Reference Assets for Edit */}
                        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 mb-2">
                                <HiOutlinePhotograph className="w-4 h-4 text-purple-500" />
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Reference Assets</span>
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">({editAssets.length}/3)</span>
                            </div>
                            {/* El drop escucha en TODA la fila, no solo en el
                                cuadrito: el objetivo era de 48px y fallarlo
                                parecia que la funcion no existiera. El
                                resaltado confirma que la zona esta viva —
                                antes no habia forma de saber si soltar valia. */}
                            <div
                                className={`flex items-center gap-2 rounded-lg transition-colors ${
                                    assetDragOver
                                        ? 'ring-2 ring-purple-400 bg-purple-50 dark:bg-purple-950/30'
                                        : ''
                                }`}
                                onDragOver={(e) => {
                                    if (editAssets.length >= 3) return
                                    e.preventDefault()
                                    setAssetDragOver(true)
                                }}
                                onDragLeave={() => setAssetDragOver(false)}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    setAssetDragOver(false)
                                    if (e.dataTransfer.files?.length) {
                                        addEditAssetFiles(e.dataTransfer.files)
                                    }
                                }}
                            >
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
                                    <Tooltip title="Haz clic o arrastra una imagen aquí">
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
                                    Arrastra o haz clic para añadir imágenes que guíen el edit (estilo, prenda de ejemplo…)
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer Actions — se oculta con el toggle de la media para
                    ver la imagen/video completo. */}
                {!isEditing && !panelCollapsed && (
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

                        {/* Toolbar de acciones: SOLO iconos + Tooltip (compacto
                            en todas las resoluciones). Delete vive en la esquina
                            de la media. Los deshabilitados usan el mismo patrón
                            Tooltip>Button que undo/redo de la máscara. */}
                        <div className="flex flex-wrap items-center gap-1">
                            <Tooltip title="Download">
                                <Button size="sm" variant="solid" onClick={handleDownload} icon={<HiOutlineDownload />} />
                            </Tooltip>

                            {previewMedia.mediaType === 'IMAGE' && (
                                <>
                                    {onEdit && (
                                        <Tooltip title="Edit">
                                            <Button size="sm" variant="plain" onClick={handleStartEdit} icon={<HiOutlinePencil />} />
                                        </Tooltip>
                                    )}
                                    {onAnimate && (
                                        <Tooltip title="Animate">
                                            <Button
                                                size="sm"
                                                variant="plain"
                                                color="purple"
                                                onClick={() => {
                                                    onAnimate(previewMedia)
                                                    handleClose()
                                                }}
                                                icon={<HiOutlineFilm />}
                                            />
                                        </Tooltip>
                                    )}
                                    {onVariant && (
                                        <Tooltip title="Variant">
                                            <Button
                                                size="sm"
                                                variant="plain"
                                                onClick={() => {
                                                    onVariant(previewMedia)
                                                    handleClose()
                                                }}
                                                icon={<HiOutlineDuplicate />}
                                            />
                                        </Tooltip>
                                    )}
                                    {onReuse && (
                                        <Tooltip title="Re-use">
                                            <Button
                                                size="sm"
                                                variant="plain"
                                                color="green"
                                                onClick={() => {
                                                    onReuse(previewMedia)
                                                    handleClose()
                                                }}
                                                icon={<HiOutlineRefresh />}
                                            />
                                        </Tooltip>
                                    )}
                                </>
                            )}

                            {previewMedia.mediaType === 'VIDEO' && onEditVideo && (
                                <Tooltip title="Edit">
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        onClick={() => {
                                            onEditVideo(previewMedia)
                                            handleClose()
                                        }}
                                        icon={<HiOutlinePencil />}
                                    />
                                </Tooltip>
                            )}

                            {previewMedia.mediaType === 'VIDEO' && (
                                <Tooltip title="Frame">
                                    <Button size="sm" variant="plain" onClick={captureFrameAsImage} icon={<HiOutlineCamera />} />
                                </Tooltip>
                            )}

                            {previewMedia.mediaType === 'VIDEO' && onContinueVideo && (
                                <Tooltip title="Continue">
                                    <Button size="sm" variant="plain" color="purple" onClick={captureFrame} icon={<HiOutlineFilm />} />
                                </Tooltip>
                            )}

                            {previewMedia.mediaType === 'VIDEO' && onLipsync && (
                                <Tooltip title="Lipsync">
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        onClick={() => {
                                            onLipsync(previewMedia)
                                            handleClose()
                                        }}
                                        icon={<HiOutlineVolumeUp />}
                                    />
                                </Tooltip>
                            )}

                            {onSave && (
                                <Tooltip title="Save">
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        onClick={() => {
                                            onSave(previewMedia)
                                        }}
                                        icon={<HiOutlineSave />}
                                    />
                                </Tooltip>
                            )}

                            <Tooltip
                                title={
                                    previewMedia.saveState !== 'saved'
                                        ? 'Saving… available once this media is saved'
                                        : 'Assign to avatar (decides whose accounts can publish it)'
                                }
                            >
                                <Button
                                    size="sm"
                                    variant="plain"
                                    onClick={() => setAssignMedia(previewMedia)}
                                    disabled={previewMedia.saveState !== 'saved'}
                                    icon={<HiOutlineUserCircle />}
                                />
                            </Tooltip>

                            {onPost && (
                                <Tooltip
                                    title={
                                        previewMedia.saveState !== 'saved'
                                            ? 'Saving… available once this media is saved'
                                            : 'Post to social platforms or Fanvue'
                                    }
                                >
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        color="blue"
                                        onClick={() => onPost(previewMedia)}
                                        disabled={previewMedia.saveState !== 'saved'}
                                        icon={<HiOutlineShare />}
                                    />
                                </Tooltip>
                            )}

                            {/* Bóveda de Fanvue: guardar sin publicar. Va
                                junto a Post porque comparten destino, pero es
                                la otra intención — archivar en vez de sacar. */}
                            <Tooltip
                                title={
                                    previewMedia.saveState !== 'saved'
                                        ? 'Saving… available once this media is saved'
                                        : 'Enviar a la bóveda de Fanvue (no publica)'
                                }
                            >
                                <Button
                                    size="sm"
                                    variant="plain"
                                    onClick={() => setVaultOpen(true)}
                                    disabled={
                                        previewMedia.saveState !== 'saved' ||
                                        !previewMedia.generationId
                                    }
                                    icon={<HiOutlineFolderAdd />}
                                />
                            </Tooltip>

                            {/* Delete — al final del toolbar y en ROJO (antes
                                flotaba junto al zoom: demasiado fácil tocarlo
                                por accidente). ml-auto lo separa del resto. */}
                            <div className="ml-auto">
                                <Tooltip title="Delete">
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        customColorClass={() =>
                                            'bg-red-500 hover:bg-red-400 text-white'
                                        }
                                        onClick={handleDelete}
                                        icon={<HiOutlineTrash />}
                                    />
                                </Tooltip>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Dialog>

            {/* Assign to avatar (owner decides whose accounts can publish) */}
            <VaultDialog
                isOpen={vaultOpen}
                onClose={() => setVaultOpen(false)}
                generationIds={previewMedia?.generationId ? [previewMedia.generationId] : []}
                avatarId={previewMedia?.avatarId ?? null}
                // Igual que en la galeria: el envio ARCHIVA del lado servidor,
                // asi que hay que recargar para que el cambio se vea.
                onSent={() => {
                    void useAvatarStudioStore.getState().reloadGallery()
                }}
            />
            <AssignAvatarDialog
                media={assignMedia}
                userId={userId}
                onClose={() => setAssignMedia(null)}
            />

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
