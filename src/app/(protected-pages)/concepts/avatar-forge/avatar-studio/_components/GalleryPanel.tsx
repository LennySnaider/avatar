'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { downloadMediaUrl } from '../../_utils/mediaDownload'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'
import ScrollBar, { type ScrollBarRef } from '@/components/ui/ScrollBar'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import VaultDialog from './VaultDialog'
import AssignAvatarDialog from './AssignAvatarDialog'
import KieTaskRescueDialog from './KieTaskRescueDialog'
import {
    apiDeleteGeneration,
    apiGetAvatars,
    apiUpdateGenerationMetadata,
} from '@/services/AvatarForgeService'
import { apiReconcilePendingGenerations } from '@/services/ReconcileGenerationsService'
import {
    HiOutlineTrash,
    HiOutlineDownload,
    HiOutlinePhotograph,
    HiOutlineUpload,
    HiOutlineSearch,
    HiOutlineX,
    HiOutlineShare,
    HiOutlineSave,
    HiOutlineUserCircle,
    HiStar,
    HiOutlineStar,
    HiArchive,
    HiOutlineArchive,
    HiOutlineFolderAdd,
    HiArrowUp,
    HiOutlineCheckCircle,
    HiCheck,
    HiOutlineRefresh,
    HiOutlineIdentification,
} from 'react-icons/hi'
import { PiFlowArrowDuotone } from 'react-icons/pi'
import { TbPepper } from 'react-icons/tb'
import { useVideoFlowStore } from '../../video-flows/_store/videoFlowStore'
import { useStudioTabStore } from '../_store/studioTabStore'
import type { GeneratedMedia, AspectRatio, MediaType } from '../types'

interface GalleryPanelProps {
    onCreateVariant?: (media: GeneratedMedia) => void
    onSaveToGallery?: (media: GeneratedMedia) => Promise<void>
    onPost?: (media: GeneratedMedia) => void
    /** Called for each uploaded file after it lands in the gallery — the studio
     * wires this to persistGeneration so uploads get a DB row (enables Post). */
    onUploaded?: (media: GeneratedMedia) => void
    /** Needed to list avatars for the "Assign avatar" action. */
    userId?: string
    /** Optional external ref so a parent (the studio header) can open the file
     * picker — the "Upload" button now lives up there. */
    uploadInputRef?: RefObject<HTMLInputElement | null>
    /** Manda la generación en curso a segundo plano (card "En espera") y
     * libera el botón Generate. El botón vive DENTRO del placeholder de
     * Generating, junto a lo que controla. */
    onSendToBackground?: () => void
}

interface AvatarOption {
    value: string
    label: string
}

const GalleryPanel = ({
    onSaveToGallery,
    onPost,
    onUploaded,
    userId,
    uploadInputRef: externalUploadRef,
    onSendToBackground,
}: GalleryPanelProps) => {
    const {
        gallery,
        isGenerating,
        pendingGenerations,
        setPreviewMedia,
        removeFromGallery,
        addToGallery,
        updateGalleryItem,
        // Search/filter/view state lives in the store so it survives remounts
        // (the dev error overlay / Fast Refresh used to wipe the typed search).
        reloadGallery,
        gallerySearchQuery: searchQuery,
        setGallerySearchQuery: setSearchQuery,
        galleryMediaTypeFilter: mediaTypeFilter,
        setGalleryMediaTypeFilter: setMediaTypeFilter,
        galleryAvatarFilter: avatarFilter,
        setGalleryAvatarFilter: setAvatarFilter,
        galleryView,
        setGalleryView,
        galleryBarOpen,
        setGalleryBarOpen,
        galleryHideNsfw,
    } = useAvatarStudioStore()

    // Prefer the parent-provided ref (header "Upload" button) so both trigger
    // the same hidden input; fall back to a local one when rendered standalone.
    const localUploadRef = useRef<HTMLInputElement>(null)
    const uploadInputRef = externalUploadRef ?? localUploadRef

    // "Scroll to top" floating button — appears once the gallery is scrolled
    // down past ~one viewport of cards. SimpleBar owns the scroll element.
    const scrollBarRef = useRef<ScrollBarRef>(null)
    const [showScrollTop, setShowScrollTop] = useState(false)
    // Rescate de huerfanas: tareas que el proveedor completo pero que nadie
    // guardo porque el navegador dejo de sondear (navegar, recargar, cerrar la
    // pestana). Estan pagadas y su imagen sigue viva un rato en el CDN.
    const [isReconciling, setIsReconciling] = useState(false)
    // Rescate por ID: el reconciliador solo ve el rastro de reclamables, y hay
    // tareas que nunca llegaron a registrarse ahi (poll sincrono de servidor).
    // Con el taskId a mano se pueden recuperar igual.
    const [rescueOpen, setRescueOpen] = useState(false)

    useEffect(() => {
        const el = scrollBarRef.current?.getScrollElement()
        if (!el) return
        const onScroll = () => setShowScrollTop(el.scrollTop > 600)
        el.addEventListener('scroll', onScroll, { passive: true })
        onScroll()
        return () => el.removeEventListener('scroll', onScroll)
    }, [])
    const scrollToTop = () => {
        scrollBarRef.current
            ?.getScrollElement()
            ?.scrollTo({ top: 0, behavior: 'smooth' })
    }

    // Carga incremental: un sentinel al fondo dispara la siguiente página cuando
    // entra al viewport (con 600px de margen — precarga suave). El root es el
    // scroll de SimpleBar. Ver `visibleGallery` más abajo.
    const loadMoreRef = useRef<HTMLDivElement>(null)

    // "Send to flow": drop the media into the Flow Editor as a preconfigured
    // From Gallery node and jump to that tab. Requires the item to be saved
    // (publishing nodes need the generations row).
    const sendToFlow = (media: GeneratedMedia) => {
        const flowStore = useVideoFlowStore.getState()
        const offset = flowStore.nodes.length * 24
        flowStore.addNode(
            'from-gallery',
            { x: 60 + offset, y: 320 + offset },
            {
                generationId: media.generationId ?? null,
                url: media.publicUrl ?? media.url,
                mediaType: media.mediaType,
                prompt: media.prompt ?? '',
                avatarId: media.avatarId ?? null,
            },
        )
        useStudioTabStore.getState().setActiveTab('flow-editor')
    }

    // Toggle a favorite/archived flag: update the in-memory item AND merge-write
    // it into generations.metadata so it survives a reload (only once the item
    // has a DB row — session-only items flip locally and persist on auto-save).
    // ── Multi-selección para acciones en lote ──────────────────────────────
    const [selectMode, setSelectMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
    const [vaultOpen, setVaultOpen] = useState(false)
    const [bulkBusy, setBulkBusy] = useState(false)
    const exitSelect = () => {
        setSelectMode(false)
        setSelectedIds(new Set())
    }
    const toggleSelect = (id: string) =>
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

    const setFlags = (
        media: GeneratedMedia,
        patch: { favorite?: boolean; archived?: boolean },
    ) => {
        const nextMeta = { ...(media.metadata ?? {}), ...patch }
        updateGalleryItem(media.id, {
            ...patch,
            metadata: nextMeta as typeof media.metadata,
        })
        if (media.generationId) {
            void apiUpdateGenerationMetadata(
                media.generationId,
                nextMeta,
            ).catch((e) => console.error('Failed to persist gallery flags:', e))
        }
    }
    const toggleFavorite = (media: GeneratedMedia) =>
        setFlags(media, { favorite: !media.favorite })
    const toggleArchive = (media: GeneratedMedia) =>
        setFlags(media, { archived: !media.archived })
    // NSFW vive SOLO en metadata (no es campo top-level como favorite/archived),
    // por eso no reusa setFlags: parcha metadata.nsfw en memoria y lo persiste en
    // la fila `generations` para etiquetar retroactivamente lo que el auto-tag no
    // captó (todo lo generado sin el 🌶️).
    const setNsfwFlag = (media: GeneratedMedia, value: boolean) => {
        const nextMeta = { ...(media.metadata ?? {}), nsfw: value }
        updateGalleryItem(media.id, {
            metadata: nextMeta as typeof media.metadata,
        })
        if (media.generationId) {
            void apiUpdateGenerationMetadata(media.generationId, nextMeta).catch(
                (e) => console.error('Failed to persist NSFW flag:', e),
            )
        }
    }
    const toggleNsfw = (media: GeneratedMedia) =>
        setNsfwFlag(media, !media.metadata?.nsfw)

    // "Assign avatar" — decides which avatar's accounts can publish this media.
    const [assignTarget, setAssignTarget] = useState<GeneratedMedia | null>(
        null,
    )
    const [avatarOptions, setAvatarOptions] = useState<AvatarOption[] | null>(
        null,
    )

    // Avatar list feeds the gallery filter and the per-card owner badges.
    useEffect(() => {
        if (!userId) return
        let cancelled = false
        apiGetAvatars()
            .then((avatars) => {
                if (!cancelled) {
                    setAvatarOptions(
                        avatars.map((a) => ({ value: a.id, label: a.name })),
                    )
                }
            })
            .catch(() => {
                if (!cancelled) setAvatarOptions([])
            })
        return () => {
            cancelled = true
        }
    }, [userId])

    const avatarNameById = new Map(
        (avatarOptions ?? []).map((o) => [o.value, o.label]),
    )

    // Avatars actually present in the gallery (by id — avatarInfo.name only
    // exists on session items; persisted rows carry avatarId).
    const presentAvatarIds = new Set(
        gallery
            .map((m) => m.avatarId)
            .filter((id): id is string => Boolean(id)),
    )
    const filterableAvatars = (avatarOptions ?? []).filter((o) =>
        presentAvatarIds.has(o.value),
    )
    const hasOrphanMedia = gallery.some((m) => !m.avatarId)

    // Client-side filter — MEMOIZADO: con 1000+ items, recalcularlo en cada
    // render (seleccionar, hover, tecla) era 1000 iteraciones de más. Solo
    // depende de la galería y los filtros.
    const filteredGallery = useMemo(
        () =>
            gallery.filter((media) => {
                const matchesSearch =
                    !searchQuery ||
                    media.prompt
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase())
                const matchesType =
                    mediaTypeFilter === 'ALL' ||
                    media.mediaType === mediaTypeFilter
                const matchesAvatar =
                    avatarFilter === 'ALL'
                        ? true
                        : avatarFilter === 'NONE'
                          ? !media.avatarId
                          : media.avatarId === avatarFilter
                // Archived items are hidden everywhere EXCEPT the Archivadas view.
                const matchesView =
                    galleryView === 'archived'
                        ? !!media.archived
                        : galleryView === 'favorites'
                          ? !!media.favorite && !media.archived
                          : !media.archived
                // Ocultar-NSFW: con el toggle ON, las cards con metadata.nsfw
                // salen de la grilla (privacidad).
                const matchesNsfw = !galleryHideNsfw || !media.metadata?.nsfw
                return (
                    matchesSearch &&
                    matchesType &&
                    matchesAvatar &&
                    matchesView &&
                    matchesNsfw
                )
            }),
        [
            gallery,
            searchQuery,
            mediaTypeFilter,
            avatarFilter,
            galleryView,
            galleryHideNsfw,
        ],
    )

    // ── WINDOWING incremental (2026-07-25, "carga lento"): renderizar las
    //    1000+ cards de golpe saturaba el DOM (1000 <img>/<video> + re-render
    //    de todas en cada interacción). Se renderiza una VENTANA que crece al
    //    scrollear cerca del fondo. Cae a 48 cuando cambia el set filtrado. ──
    const PAGE = 48
    const [visibleCount, setVisibleCount] = useState(PAGE)
    // Reset al cambiar de filtro/vista/búsqueda (evita renderizar 1000 tras
    // cambiar de vista) + al scroll-top.
    useEffect(() => {
        setVisibleCount(PAGE)
        scrollBarRef.current?.getScrollElement()?.scrollTo({ top: 0 })
    }, [searchQuery, mediaTypeFilter, avatarFilter, galleryView, galleryHideNsfw])
    const visibleGallery = filteredGallery.slice(0, visibleCount)
    const hasMore = visibleCount < filteredGallery.length

    useEffect(() => {
        const sentinel = loadMoreRef.current
        const root = scrollBarRef.current?.getScrollElement()
        if (!sentinel || !root) return
        const io = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    setVisibleCount((c) => Math.min(filteredGallery.length, c + PAGE))
                }
            },
            { root, rootMargin: '600px' },
        )
        io.observe(sentinel)
        return () => io.disconnect()
        // Re-observa cuando cambia el total (nuevo filtro) o aparece el sentinel.
    }, [filteredGallery.length, hasMore])

    const favCount = gallery.filter((m) => m.favorite && !m.archived).length
    const archivedCount = gallery.filter((m) => m.archived).length

    // ── Selección: derivados + acciones en lote (toggle de grupo: si TODAS
    //    ya tienen el flag, lo quita; si no, lo pone — intuitivo en cualquier
    //    vista). Archivar en la vista Archivadas = Restaurar. ─────────────────
    const selectedMedia = filteredGallery.filter((m) => selectedIds.has(m.id))
    const allFav =
        selectedMedia.length > 0 && selectedMedia.every((m) => m.favorite)
    const allNsfw =
        selectedMedia.length > 0 &&
        selectedMedia.every((m) => m.metadata?.nsfw)
    const inArchived = galleryView === 'archived'
    const selectAllVisible = () =>
        setSelectedIds(new Set(filteredGallery.map((m) => m.id)))
    const bulkFavorite = () => {
        selectedMedia.forEach((m) => setFlags(m, { favorite: !allFav }))
        exitSelect()
    }
    const bulkArchive = () => {
        selectedMedia.forEach((m) => setFlags(m, { archived: !inArchived }))
        exitSelect()
    }
    const bulkNsfw = () => {
        selectedMedia.forEach((m) => setNsfwFlag(m, !allNsfw))
        exitSelect()
    }
    // Solo lo persistido puede ir a la bóveda: el servidor comprueba la
    // propiedad contra la fila de `generations`, y una media de sesión aún no
    // tiene ninguna.
    const vaultableIds = selectedMedia
        .map((m) => m.generationId)
        .filter((id): id is string => Boolean(id))
    // El creator de Fanvue cuelga del avatar. Si la selección mezcla avatares
    // no hay un destino único, así que manda el de la primera — que es el
    // caso real, porque la galería se filtra por avatar.
    const vaultAvatarId = selectedMedia.find((m) => m.avatarId)?.avatarId ?? null

    const bulkDelete = async () => {
        setBulkBusy(true)
        try {
            for (const m of selectedMedia) {
                if (m.generationId) await apiDeleteGeneration(m.generationId)
                removeFromGallery(m.id)
            }
            setBulkDeleteOpen(false)
            exitSelect()
        } catch (err) {
            console.error('Bulk delete failed:', err)
            toast.push(
                <Notification type="danger" title="Error al borrar">
                    Algunas no se pudieron borrar. Intenta de nuevo.
                </Notification>,
            )
        } finally {
            setBulkBusy(false)
        }
    }

    const detectAspectRatio = (width: number, height: number): AspectRatio => {
        const ratio = width / height
        if (ratio > 1.5) return '16:9'
        if (ratio > 1.15) return '4:3'
        if (ratio < 0.67) return '9:16'
        if (ratio < 0.87) return '3:4'
        return '1:1'
    }

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return

        Array.from(files).forEach((file) => {
            const isVideo = file.type.startsWith('video/')
            const isImage = file.type.startsWith('image/')

            if (!isVideo && !isImage) {
                toast.push(
                    <Notification type="warning" title="Invalid File">
                        Only video and image files are supported
                    </Notification>,
                )
                return
            }

            const url = URL.createObjectURL(file)
            const id = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

            if (isVideo) {
                const video = document.createElement('video')
                video.preload = 'metadata'
                video.onloadedmetadata = () => {
                    const item: GeneratedMedia = {
                        id,
                        url,
                        prompt: `Uploaded: ${file.name}`,
                        aspectRatio: detectAspectRatio(
                            video.videoWidth,
                            video.videoHeight,
                        ),
                        timestamp: Date.now(),
                        mediaType: 'VIDEO',
                    }
                    addToGallery(item)
                    onUploaded?.(item)
                }
                video.src = url
            } else {
                const img = new Image()
                img.onload = () => {
                    const item: GeneratedMedia = {
                        id,
                        url,
                        prompt: `Uploaded: ${file.name}`,
                        aspectRatio: detectAspectRatio(
                            img.naturalWidth,
                            img.naturalHeight,
                        ),
                        timestamp: Date.now(),
                        mediaType: 'IMAGE',
                    }
                    addToGallery(item)
                    onUploaded?.(item)
                }
                img.src = url
            }
        })

        toast.push(
            <Notification type="success" title="Upload Complete">
                {files.length} file(s) added to gallery
            </Notification>,
        )

        // Reset input
        e.target.value = ''
    }

    const handleDownload = async (media: GeneratedMedia) => {
        await downloadMediaUrl(
            media.url,
            `avatar-${media.mediaType.toLowerCase()}-${Date.now()}`,
            media.mediaType === 'VIDEO',
        )
    }

    // Delete with a real ConfirmDialog (the old toast-based confirm sometimes
    // failed to dismiss). Deleting removes BOTH the in-memory item and the
    // persisted `generations` row — the gallery hydrates from the DB, so a
    // memory-only delete resurrected the item on reload.
    const [deleteTarget, setDeleteTarget] = useState<GeneratedMedia | null>(
        null,
    )
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDeleteConfirmed = async () => {
        if (!deleteTarget) return
        setIsDeleting(true)
        try {
            if (deleteTarget.generationId) {
                await apiDeleteGeneration(deleteTarget.generationId)
            }
            removeFromGallery(deleteTarget.id)
            setDeleteTarget(null)
        } catch (err) {
            console.error('Failed to delete generation:', err)
            toast.push(
                <Notification type="danger" title="Delete failed">
                    The item could not be deleted from the database. Try again.
                </Notification>,
            )
        } finally {
            setIsDeleting(false)
        }
    }

    // Stitch/montage moved to the Video Editor as the "Combine" mode —
    // see src/app/.../video-editor/_components/VideoEditorMain.tsx.
    // The gallery no longer manages selection or processing state.

    const handleReconcile = async () => {
        if (isReconciling) return
        setIsReconciling(true)
        try {
            const r = await apiReconcilePendingGenerations()
            if (r.recovered > 0) reloadGallery()
            const parts: string[] = []
            if (r.recovered)
                parts.push(
                    `${r.recovered} recuperada${r.recovered === 1 ? '' : 's'}`,
                )
            if (r.running)
                parts.push(`${r.running} aún generando`)
            if (r.failed) parts.push(`${r.failed} sin rescate`)
            toast.push(
                <Notification
                    type={r.recovered ? 'success' : 'info'}
                    title={
                        r.recovered
                            ? 'Generaciones recuperadas'
                            : 'Nada que recuperar'
                    }
                >
                    {parts.length
                        ? parts.join(' · ')
                        : 'No hay tareas pendientes de KIE ni MuleRouter.'}
                </Notification>,
            )
        } catch (e) {
            toast.push(
                <Notification type="danger" title="Falló la revisión">
                    {e instanceof Error ? e.message : 'Error desconocido'}
                </Notification>,
            )
        } finally {
            setIsReconciling(false)
        }
    }

    return (
        <div className="h-full flex flex-col relative">
            {/* Hidden Upload Input */}
            <input
                ref={uploadInputRef}
                type="file"
                accept="video/*,image/*"
                multiple
                className="hidden"
                onChange={handleUpload}
            />

            {/* Search + filtros: TODA la barra se muestra solo con el toggle
                del header (botón lupa) — cuando está cerrada NO se renderiza,
                así no ocupa ninguna fila. La X interna también la cierra. */}
            {gallery.length > 0 && galleryBarOpen && (
                <div className="px-4 pt-3 pb-1 shrink-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Input
                            size="sm"
                            placeholder="Search by prompt..."
                            prefix={<HiOutlineSearch className="text-lg" />}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-1 min-w-40"
                        />
                        {/* Rescate de huerfanas. Discreto a proposito: en
                            estado sano no hay nada que recuperar, asi que no
                            merece jerarquia — pero cuando hace falta, evita
                            perder una generacion ya pagada. */}
                        <button
                            type="button"
                            onClick={handleReconcile}
                            disabled={isReconciling}
                            title="Buscar generaciones terminadas en KIE / MuleRouter que no se guardaron"
                            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-primary hover:border-primary disabled:opacity-40 transition-colors"
                        >
                            <HiOutlineRefresh
                                className={`w-4 h-4 ${isReconciling ? 'animate-spin' : ''}`}
                            />
                        </button>
                        {/* Rescate por taskId — para cuando la tarea ni
                            siquiera llego al rastro de reclamables y el boton
                            de al lado dice "nada que recuperar". */}
                        <button
                            type="button"
                            onClick={() => setRescueOpen(true)}
                            title="Buscar una tarea de KIE por su taskId y rescatarla"
                            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-primary hover:border-primary transition-colors"
                        >
                            <HiOutlineIdentification className="w-4 h-4" />
                        </button>
                        {(filterableAvatars.length > 0 || hasOrphanMedia) && (
                            <select
                                value={avatarFilter}
                                onChange={(e) =>
                                    setAvatarFilter(e.target.value)
                                }
                                className="w-36 px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                title="Filter by avatar"
                            >
                                <option value="ALL">All avatars</option>
                                {filterableAvatars.map((avatar) => (
                                    <option
                                        key={avatar.value}
                                        value={avatar.value}
                                    >
                                        {avatar.label}
                                    </option>
                                ))}
                                {hasOrphanMedia && (
                                    <option value="NONE">No avatar</option>
                                )}
                            </select>
                        )}
                        <select
                            value={mediaTypeFilter}
                            onChange={(e) =>
                                setMediaTypeFilter(
                                    e.target.value as MediaType | 'ALL',
                                )
                            }
                            className="w-28 px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                        >
                            <option value="ALL">All</option>
                            <option value="IMAGE">Images</option>
                            <option value="VIDEO">Videos</option>
                        </select>
                        <div className="flex items-center gap-1.5">
                            {[
                                {
                                    key: 'all' as const,
                                    label: 'Todas',
                                    count: gallery.filter((m) => !m.archived)
                                        .length,
                                    icon: (
                                        <HiOutlinePhotograph className="w-3.5 h-3.5" />
                                    ),
                                },
                                {
                                    key: 'favorites' as const,
                                    label: 'Favoritas',
                                    count: favCount,
                                    icon: <HiStar className="w-3.5 h-3.5" />,
                                },
                                {
                                    key: 'archived' as const,
                                    label: 'Archivadas',
                                    count: archivedCount,
                                    icon: (
                                        <HiOutlineArchive className="w-3.5 h-3.5" />
                                    ),
                                },
                            ].map((v) => (
                                <button
                                    key={v.key}
                                    type="button"
                                    onClick={() => setGalleryView(v.key)}
                                    className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                                        galleryView === v.key
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200 font-medium'
                                            : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {v.icon}
                                    {v.label}
                                    <span className="opacity-60">
                                        {v.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                selectMode ? exitSelect() : setSelectMode(true)
                            }
                            title="Seleccionar varias para borrar/archivar/favoritas/NSFW en lote"
                            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                                selectMode
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-200 font-medium'
                                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                            Seleccionar
                        </button>
                        <button
                            type="button"
                            onClick={() => setGalleryBarOpen(false)}
                            title="Cerrar filtros"
                            className="ml-auto shrink-0 p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                        >
                            <HiOutlineX className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            <ScrollBar
                ref={scrollBarRef}
                className="flex-1 h-full"
                autoHide={false}
            >
                <div className="p-4 pt-1">
                    {/* Empty State */}
                    {gallery.length === 0 &&
                        !isGenerating &&
                        pendingGenerations.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                                <div className="w-16 h-16 rounded-full border-2 border-gray-300 flex items-center justify-center mb-4">
                                    <HiOutlinePhotograph className="w-8 h-8" />
                                </div>
                                <p className="text-lg font-medium">
                                    Ready to Generate
                                </p>
                                <p className="text-sm mb-4">
                                    Describe a scene and click Generate
                                </p>
                                <Button
                                    size="sm"
                                    variant="solid"
                                    onClick={() =>
                                        uploadInputRef.current?.click()
                                    }
                                    icon={<HiOutlineUpload />}
                                >
                                    Or Upload Videos/Images
                                </Button>
                            </div>
                        )}

                    {/* No Matches State */}
                    {gallery.length > 0 &&
                        filteredGallery.length === 0 &&
                        !isGenerating && (
                            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                                <HiOutlinePhotograph className="w-8 h-8 mb-2" />
                                <p className="text-sm">
                                    No media matches your filters
                                </p>
                            </div>
                        )}

                    {/* Gallery Grid */}
                    {/* Barra de acciones en lote — sticky mientras se selecciona */}
                    {selectMode && (
                        <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-500/40 bg-white/95 dark:bg-gray-900/95 backdrop-blur px-3 py-2 shadow">
                            <span className="text-sm font-medium">
                                {selectedMedia.length} seleccionada
                                {selectedMedia.length === 1 ? '' : 's'}
                            </span>
                            <button
                                type="button"
                                onClick={selectAllVisible}
                                className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                Todas ({filteredGallery.length})
                            </button>
                            <div className="ml-auto flex flex-wrap items-center gap-1.5">
                                <button
                                    type="button"
                                    disabled={selectedMedia.length === 0}
                                    onClick={bulkFavorite}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 disabled:opacity-40"
                                >
                                    <HiStar className="w-3.5 h-3.5" />
                                    {allFav ? 'Quitar fav' : 'Favoritas'}
                                </button>
                                <button
                                    type="button"
                                    disabled={selectedMedia.length === 0}
                                    onClick={bulkArchive}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                                >
                                    <HiOutlineArchive className="w-3.5 h-3.5" />
                                    {inArchived ? 'Restaurar' : 'Archivar'}
                                </button>
                                <button
                                    type="button"
                                    disabled={selectedMedia.length === 0}
                                    onClick={bulkNsfw}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-pink-300 text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-500/10 disabled:opacity-40"
                                >
                                    <TbPepper className="w-3.5 h-3.5" />
                                    {allNsfw ? 'Quitar NSFW' : 'NSFW'}
                                </button>
                                {/* La bóveda solo acepta media PERSISTIDA: las
                                    de sesión aún no tienen fila, y el servidor
                                    valida propiedad contra ella. Por eso el
                                    contador es de `vaultableIds`, no de la
                                    selección — decir "3" y enviar 1 sería
                                    peor que decir 1. */}
                                <button
                                    type="button"
                                    disabled={vaultableIds.length === 0}
                                    onClick={() => setVaultOpen(true)}
                                    title={
                                        vaultableIds.length === 0
                                            ? 'Ninguna de las seleccionadas está guardada todavía'
                                            : 'Enviar a la bóveda de Fanvue (no publica)'
                                    }
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-violet-300 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 disabled:opacity-40"
                                >
                                    <HiOutlineFolderAdd className="w-3.5 h-3.5" />
                                    Bóveda{vaultableIds.length > 0 ? ` (${vaultableIds.length})` : ''}
                                </button>
                                <button
                                    type="button"
                                    disabled={selectedMedia.length === 0}
                                    onClick={() => setBulkDeleteOpen(true)}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-red-400 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40"
                                >
                                    <HiOutlineTrash className="w-3.5 h-3.5" />
                                    Borrar
                                </button>
                                <button
                                    type="button"
                                    onClick={exitSelect}
                                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    <HiOutlineX className="w-3.5 h-3.5" />
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Generating Placeholder — el botón "En espera" vive
                            aquí, debajo del texto: manda esta generación a
                            segundo plano y libera el Generate. */}
                        {isGenerating && (
                            <Card className="h-64 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                                <div className="flex flex-col items-center px-4">
                                    <Spinner size={32} />
                                    <span className="text-xs text-primary mt-2 font-mono animate-pulse">
                                        Generating...
                                    </span>
                                    {onSendToBackground && (
                                        <button
                                            type="button"
                                            onClick={onSendToBackground}
                                            className="mt-4 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                        >
                                            ⏳ Dejar en espera
                                        </button>
                                    )}
                                </div>
                            </Card>
                        )}

                        {/* Generaciones "en espera" (segundo plano): la tarea
                            sigue viva en KIE; su resultado entra solo a la
                            galería al terminar (o toast si falla). */}
                        {pendingGenerations.map((p) => (
                            <Card
                                key={p.id}
                                className="h-64 flex items-center justify-center bg-amber-50 dark:bg-amber-900/10 border border-dashed border-amber-300 dark:border-amber-700"
                            >
                                <div className="flex flex-col items-center px-4 text-center">
                                    <Spinner size={28} />
                                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-2">
                                        En espera ·{' '}
                                        {p.mediaType === 'VIDEO'
                                            ? 'Video'
                                            : 'Imagen'}
                                    </span>
                                    <span className="text-[11px] text-gray-500 mt-1 font-mono">
                                        {p.label}
                                    </span>
                                    {p.avatarName && (
                                        <span className="text-[11px] text-gray-400 mt-0.5">
                                            {p.avatarName}
                                        </span>
                                    )}
                                    <span className="text-[10px] text-gray-400 mt-1">
                                        Llegará sola a la galería al terminar
                                    </span>
                                </div>
                            </Card>
                        ))}

                        {/* Gallery Items (solo la VENTANA visible) */}
                        {visibleGallery.map((media) => {
                            return (
                                <Card
                                    key={media.id}
                                    className={`relative group overflow-hidden cursor-pointer transition-all hover:shadow-lg ${
                                        selectMode && selectedIds.has(media.id)
                                            ? 'ring-2 ring-blue-500'
                                            : ''
                                    }`}
                                    onClick={() =>
                                        selectMode
                                            ? toggleSelect(media.id)
                                            : setPreviewMedia(media)
                                    }
                                >
                                    {/* Checkbox de selección (modo lote) */}
                                    {selectMode && (
                                        <div className="absolute top-2 left-2 z-30">
                                            <span
                                                className={`flex items-center justify-center w-6 h-6 rounded-full border-2 ${
                                                    selectedIds.has(media.id)
                                                        ? 'bg-blue-500 border-blue-500 text-white'
                                                        : 'bg-black/40 border-white/80'
                                                }`}
                                            >
                                                {selectedIds.has(media.id) && (
                                                    <HiCheck className="w-4 h-4" />
                                                )}
                                            </span>
                                        </div>
                                    )}
                                    {/* Media Content */}
                                    <div className="bg-gray-100 dark:bg-gray-800">
                                        {media.mediaType === 'VIDEO' ? (
                                            <video
                                                src={
                                                    media.publicUrl ?? media.url
                                                }
                                                className="w-full h-auto"
                                                // Only fetch headers/first frame up
                                                // front — 100+ videos eagerly
                                                // buffering killed the gallery load.
                                                preload="metadata"
                                                muted
                                                loop
                                                onMouseOver={(e) => {
                                                    e.currentTarget
                                                        .play()
                                                        .catch(() => {})
                                                }}
                                                onMouseOut={(e) =>
                                                    e.currentTarget.pause()
                                                }
                                            />
                                        ) : (
                                            // Prefer the durable Supabase copy; the
                                            // provider `url` (KIE re-host, MiniMax data
                                            // URI, or a temp URL) can expire/fail to load
                                            // and would show nothing with no error. If the
                                            // primary src fails, fall back to the other.
                                            <img
                                                // El THUMB primero: la card
                                                // mide ~250px y el original
                                                // 1-3 MB — bajarlo aqui fue lo
                                                // que fundio la cuota de
                                                // egress. El detalle sigue
                                                // abriendo el original.
                                                src={
                                                    media.thumbnailUrl ??
                                                    media.publicUrl ??
                                                    media.url
                                                }
                                                alt={media.prompt}
                                                className="w-full h-auto"
                                                // Lazy: only visible cards load —
                                                // 160+ full-res images at once
                                                // saturated the connection.
                                                loading="lazy"
                                                decoding="async"
                                                onError={(e) => {
                                                    const img = e.currentTarget
                                                    if (
                                                        media.url &&
                                                        img.src !== media.url
                                                    ) {
                                                        img.src = media.url
                                                    }
                                                }}
                                            />
                                        )}
                                    </div>

                                    {/* Media Type + Save State badges (top-right column —
                                        the bottom corners belong to the action buttons) */}
                                    <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                toggleFavorite(media)
                                            }}
                                            title={
                                                media.favorite
                                                    ? 'Quitar de favoritas'
                                                    : 'Marcar como favorita'
                                            }
                                            className="p-1 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
                                        >
                                            {media.favorite ? (
                                                <HiStar className="w-4 h-4 text-amber-400" />
                                            ) : (
                                                <HiOutlineStar className="w-4 h-4 text-white" />
                                            )}
                                        </button>
                                        <span
                                            className={`px-2 py-1 text-xs font-bold rounded ${
                                                media.mediaType === 'VIDEO'
                                                    ? 'bg-purple-500 text-white'
                                                    : 'bg-blue-500 text-white'
                                            }`}
                                        >
                                            {media.mediaType}
                                        </span>
                                        {media.saveState === 'saving' && (
                                            <span className="px-2 py-1 text-[10px] font-medium rounded bg-black/70 text-white inline-flex items-center gap-1">
                                                <Spinner size={12} />
                                                Saving
                                            </span>
                                        )}
                                        {media.saveState === 'saved' && (
                                            <span className="px-2 py-1 text-[10px] font-medium rounded bg-emerald-500 text-white inline-block">
                                                Saved
                                            </span>
                                        )}
                                        {media.saveState === 'error' && (
                                            <span className="px-2 py-1 text-[10px] font-medium rounded bg-red-500 text-white inline-block">
                                                Save failed
                                            </span>
                                        )}
                                        {/* Ya esta en la boveda de Fanvue. El
                                            badge es lo que evita el reenvio:
                                            archivarla la quita de la vista,
                                            pero si se restaura hay que seguir
                                            viendo que ya se mando. */}
                                        {(media.metadata as { fanvueVault?: { folderName?: string } } | undefined)
                                            ?.fanvueVault && (
                                            <span
                                                className="px-2 py-1 text-[10px] font-medium rounded bg-violet-500 text-white inline-block"
                                                title={`En la bóveda de Fanvue · ${
                                                    (media.metadata as { fanvueVault?: { folderName?: string } })
                                                        ?.fanvueVault?.folderName ?? ''
                                                }`}
                                            >
                                                Bóveda
                                            </span>
                                        )}
                                        {media.postedPlatforms &&
                                            media.postedPlatforms.length >
                                                0 && (
                                                <span
                                                    title={`Posted to: ${media.postedPlatforms.join(', ')}`}
                                                    className="px-2 py-1 text-[10px] font-medium rounded bg-sky-500 text-white inline-block"
                                                >
                                                    Posted
                                                </span>
                                            )}
                                    </div>

                                    {/* Provider/Model + owning-avatar badges */}
                                    <div
                                        className={`absolute left-2 flex flex-col items-start gap-1 ${
                                            selectMode ? 'top-10' : 'top-2'
                                        }`}
                                    >
                                        {media.providerName && (
                                            <span className="px-2 py-1 text-[10px] font-medium rounded bg-black/70 text-white max-w-32 truncate inline-block">
                                                {media.providerName}
                                            </span>
                                        )}
                                        {(() => {
                                            const ownerName =
                                                media.avatarInfo?.name ??
                                                (media.avatarId
                                                    ? avatarNameById.get(
                                                          media.avatarId,
                                                      )
                                                    : undefined)
                                            return ownerName ? (
                                                <span className="px-2 py-1 text-[10px] font-medium rounded bg-primary/80 text-white max-w-32 truncate inline-block">
                                                    {ownerName}
                                                </span>
                                            ) : null
                                        })()}
                                        {/* Modo con que se generó: Clone %·tramo o
                                            Deepfake. Ausente en cards previos. */}
                                        {(() => {
                                            const gt =
                                                media.metadata?.generation_type
                                            if (gt === 'deepfake')
                                                return (
                                                    <span className="px-2 py-1 text-[10px] font-medium rounded bg-red-500/80 text-white inline-block">
                                                        Deepfake
                                                    </span>
                                                )
                                            if (gt === 'clone') {
                                                const w =
                                                    typeof media.metadata
                                                        ?.clone_weight ===
                                                    'number'
                                                        ? media.metadata
                                                              .clone_weight
                                                        : 100
                                                const tier =
                                                    w >= 75
                                                        ? 'EXACT'
                                                        : w >= 50
                                                          ? 'STRONG'
                                                          : w >= 25
                                                            ? 'MODERATE'
                                                            : 'LOOSE'
                                                return (
                                                    <span className="px-2 py-1 text-[10px] font-medium rounded bg-purple-500/80 text-white inline-block">
                                                        {`Clone ${w}% · ${tier}`}
                                                    </span>
                                                )
                                            }
                                            return null
                                        })()}
                                        {/* 🌶️ NSFW: etiqueta al crear (toggle 🌶️)
                                            o marcada a mano desde el hover. */}
                                        {media.metadata?.nsfw && (
                                            <span className="px-2 py-1 text-[10px] font-bold rounded bg-pink-600 text-white inline-flex items-center gap-0.5">
                                                🌶️ NSFW
                                            </span>
                                        )}
                                    </div>

                                    {/* Overlay Actions (oculto en modo selección
                                        para no chocar con el click de selección) */}
                                    <div
                                        className={`absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end ${
                                            selectMode ? 'hidden' : ''
                                        }`}
                                    >
                                        <div className="w-full p-3 space-y-2">
                                            {/* Prompt Preview */}
                                            <p className="text-xs text-white line-clamp-2">
                                                {media.prompt}
                                            </p>

                                            {/* Actions */}
                                            <div className="flex flex-wrap gap-2 items-center">
                                                <Button
                                                    size="xs"
                                                    variant="solid"
                                                    icon={<HiOutlineDownload />}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDownload(media)
                                                    }}
                                                />
                                                {/* Edit/Animate live inside the preview modal — clicking
                                                        the card opens it, so a card-level Edit was redundant. */}
                                                <Button
                                                    size="xs"
                                                    variant="solid"
                                                    icon={
                                                        <HiOutlineUserCircle />
                                                    }
                                                    disabled={
                                                        media.saveState !==
                                                        'saved'
                                                    }
                                                    title={
                                                        media.saveState !==
                                                        'saved'
                                                            ? 'Save to gallery first'
                                                            : 'Assign to avatar (decides whose accounts can publish it)'
                                                    }
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setAssignTarget(media)
                                                    }}
                                                />
                                                {onPost && (
                                                    <Button
                                                        size="xs"
                                                        variant="solid"
                                                        icon={
                                                            <HiOutlineShare />
                                                        }
                                                        disabled={
                                                            media.saveState !==
                                                            'saved'
                                                        }
                                                        title={
                                                            media.saveState ===
                                                            'saving'
                                                                ? 'Saving to gallery…'
                                                                : media.saveState !==
                                                                    'saved'
                                                                  ? 'Save to gallery first'
                                                                  : 'Post'
                                                        }
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            onPost(media)
                                                        }}
                                                    />
                                                )}
                                                <Button
                                                    size="xs"
                                                    variant="solid"
                                                    icon={
                                                        <PiFlowArrowDuotone />
                                                    }
                                                    disabled={
                                                        media.saveState !==
                                                        'saved'
                                                    }
                                                    title={
                                                        media.saveState !==
                                                        'saved'
                                                            ? 'Save to gallery first'
                                                            : 'Send to flow (opens Flow Editor with this media)'
                                                    }
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        sendToFlow(media)
                                                    }}
                                                />
                                                {/* Save + Delete grouped on the right, both solid so
                                                        they stay visible over the image. */}
                                                <div className="ml-auto flex gap-1.5">
                                                    <Button
                                                        size="xs"
                                                        variant="solid"
                                                        icon={<TbPepper />}
                                                        title={
                                                            media.metadata?.nsfw
                                                                ? 'Quitar etiqueta NSFW'
                                                                : 'Marcar como NSFW'
                                                        }
                                                        className={
                                                            media.metadata?.nsfw
                                                                ? 'bg-pink-600! hover:bg-pink-700!'
                                                                : undefined
                                                        }
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            toggleNsfw(media)
                                                        }}
                                                    />
                                                    <Button
                                                        size="xs"
                                                        variant="solid"
                                                        icon={
                                                            media.archived ? (
                                                                <HiArchive />
                                                            ) : (
                                                                <HiOutlineArchive />
                                                            )
                                                        }
                                                        title={
                                                            media.archived
                                                                ? 'Sacar del bucket'
                                                                : 'Archivar (mover al bucket)'
                                                        }
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            toggleArchive(media)
                                                        }}
                                                    />
                                                    {onSaveToGallery && (
                                                        <Button
                                                            size="xs"
                                                            variant="solid"
                                                            icon={
                                                                <HiOutlineSave />
                                                            }
                                                            title="Save"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                onSaveToGallery(
                                                                    media,
                                                                )
                                                            }}
                                                        />
                                                    )}
                                                    <Button
                                                        size="xs"
                                                        variant="solid"
                                                        icon={
                                                            <HiOutlineTrash />
                                                        }
                                                        title="Delete"
                                                        customColorClass={() =>
                                                            'bg-red-500 hover:bg-red-400 text-white'
                                                        }
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setDeleteTarget(
                                                                media,
                                                            )
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            )
                        })}
                    </div>

                    {/* Sentinel de carga incremental — al entrar al viewport
                        (600px antes) carga la siguiente página. */}
                    {hasMore && (
                        <div
                            ref={loadMoreRef}
                            className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400"
                        >
                            <Spinner size={16} />
                            Cargando más… ({visibleGallery.length} de{' '}
                            {filteredGallery.length})
                        </div>
                    )}
                </div>
            </ScrollBar>

            {/* Scroll to top — anclado al borde inferior de la galería (pegado
                al panel de creación), color primario para que no se pierda
                sobre las fotos. */}
            {showScrollTop && (
                <button
                    type="button"
                    onClick={scrollToTop}
                    title="Volver arriba"
                    aria-label="Volver arriba"
                    className="absolute bottom-10 right-4 z-20 w-10 h-10 rounded-full bg-primary text-white shadow-lg ring-2 ring-white/60 dark:ring-gray-900/60 flex items-center justify-center hover:bg-primary-deep transition-colors"
                >
                    <HiArrowUp className="w-5 h-5" />
                </button>
            )}

            <ConfirmDialog
                isOpen={!!deleteTarget}
                type="danger"
                title="Delete this generation?"
                onClose={() => setDeleteTarget(null)}
                onRequestClose={() => setDeleteTarget(null)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={handleDeleteConfirmed}
                confirmButtonProps={{ loading: isDeleting }}
            >
                <p>
                    It will be removed from your gallery
                    {deleteTarget?.generationId
                        ? ' and deleted from the database'
                        : ''}
                    .
                </p>
            </ConfirmDialog>

            {/* Bóveda de Fanvue (multi-selección) */}
            <VaultDialog
                isOpen={vaultOpen}
                onClose={() => setVaultOpen(false)}
                generationIds={vaultableIds}
                avatarId={vaultAvatarId}
                // Recargar no es cosmetico: el envio ARCHIVA las enviadas del
                // lado servidor, asi que sin esto seguirian en la vista
                // principal como si nada hubiera pasado.
                onSent={() => {
                    exitSelect()
                    void reloadGallery()
                }}
            />

            {/* Borrado en LOTE (multi-selección) */}
            <ConfirmDialog
                isOpen={bulkDeleteOpen}
                type="danger"
                title={`¿Borrar ${selectedMedia.length} elemento${selectedMedia.length === 1 ? '' : 's'}?`}
                onClose={() => setBulkDeleteOpen(false)}
                onRequestClose={() => setBulkDeleteOpen(false)}
                onCancel={() => setBulkDeleteOpen(false)}
                onConfirm={bulkDelete}
                confirmButtonProps={{ loading: bulkBusy }}
            >
                <p>
                    Se eliminarán de tu galería (y de la base de datos las que ya
                    estén guardadas). Esta acción no se puede deshacer.
                </p>
            </ConfirmDialog>

            <AssignAvatarDialog
                media={assignTarget}
                userId={userId}
                onClose={() => setAssignTarget(null)}
            />

            <KieTaskRescueDialog
                isOpen={rescueOpen}
                onClose={() => setRescueOpen(false)}
                onRescued={() => void reloadGallery()}
            />
        </div>
    )
}

export default GalleryPanel
