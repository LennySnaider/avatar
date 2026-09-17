'use client'

import { useState } from 'react'
import { HiOutlineSparkles } from 'react-icons/hi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Dialog from '@/components/ui/Dialog'
import Switcher from '@/components/ui/Switcher'
import Segment from '@/components/ui/Segment'
import Notification from '@/components/ui/Notification'
import Alert from '@/components/ui/Alert'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { upsertPaidMediaItem, deletePaidMediaItem } from '@/services/AgentTelegramService'
import type { PaidMediaItemView } from '@/services/AgentTelegramService'
import { generateSocialCaption } from '@/services/GeminiService'
import { isValidStarPrice } from '@/lib/telegram/mediaPricing'
import type { GenerationPickerItem } from './types'

interface TelegramGalleryProps {
    avatarId: string
    items: PaidMediaItemView[]
    onItemsChange: (items: PaidMediaItemView[]) => void
    generations: GenerationPickerItem[]
}

/** El rango lo decide `mediaPricing.ts` (el mismo fichero puro que valida el
 *  servicio), aquí sólo se traduce el texto del input a número. */
function parseStarPrice(raw: string): number | null {
    const n = Number(raw)
    return isValidStarPrice(n) ? n : null
}

const TelegramGallery = ({ avatarId, items, onItemsChange, generations }: TelegramGalleryProps) => {
    // --- Add from generations (Step 3) ---
    const [addOpen, setAddOpen] = useState(false)
    const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null)
    const [title, setTitle] = useState('')
    const [caption, setCaption] = useState('')
    const [starPrice, setStarPrice] = useState('50')
    // Gratis o de pago. Arranca en "de pago" porque es lo que este panel hacía
    // antes de que existieran los teasers: dar de alta algo gratis tiene que
    // ser una decisión explícita, no el camino por defecto.
    const [isFree, setIsFree] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [isGeneratingAi, setIsGeneratingAi] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)

    // --- Edit ---
    const [editTarget, setEditTarget] = useState<PaidMediaItemView | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editCaption, setEditCaption] = useState('')
    const [editStarPrice, setEditStarPrice] = useState('')
    const [editIsFree, setEditIsFree] = useState(false)
    const [editEnabled, setEditEnabled] = useState(true)
    const [isEditSaving, setIsEditSaving] = useState(false)

    // --- Quick enable/disable toggle ---
    const [togglingId, setTogglingId] = useState<string | null>(null)

    // --- Delete ---
    const [deleteTarget, setDeleteTarget] = useState<PaidMediaItemView | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const resetAddForm = () => {
        setSelectedGenerationId(null)
        setTitle('')
        setCaption('')
        setStarPrice('50')
        setIsFree(false)
        setAiError(null)
    }

    const openAdd = () => {
        resetAddForm()
        setAddOpen(true)
    }

    // "Generate with AI" del modal de añadir: pide título + caption a la vez
    // (withTitle: true) sobre la generación ya seleccionada. Tono pícaro
    // porque es contenido de pago para fans, igual que el toggle 🌶️ del
    // PostModal; sceneDescription es el PLAN B si Gemini veta la imagen en
    // la entrada (ver los comentarios de generateSocialCaption).
    const handleGenerateWithAi = async () => {
        const gen = generations.find((g) => g.id === selectedGenerationId)
        if (!gen) return
        setIsGeneratingAi(true)
        setAiError(null)
        try {
            const result = await generateSocialCaption({
                mediaUrl: gen.mediaUrl,
                mediaType: gen.mediaType,
                withTitle: true,
                spicy: true,
                language: 'es',
                draft: caption.trim() || undefined,
                sceneDescription: gen.prompt,
            })
            if (result.success) {
                setTitle(result.title ?? title)
                setCaption(result.caption ?? caption)
            } else {
                setAiError(result.error ?? 'AI generation failed')
            }
        } catch (err) {
            setAiError(err instanceof Error ? err.message : String(err))
        } finally {
            setIsGeneratingAi(false)
        }
    }

    const handleAdd = async () => {
        if (!selectedGenerationId) return
        const trimmedTitle = title.trim()
        if (!trimmedTitle) return
        // En un gratis el precio ni se pide ni se manda: el servicio lo fuerza
        // a 0 y el check de la tabla lo exige.
        const price = isFree ? 0 : parseStarPrice(starPrice)
        if (price === null) return

        // Siguiente hueco libre, no `items.length`: si algo se borró en medio,
        // reusar una longitud como índice repetiría un sort_order ya usado.
        const nextSortOrder = items.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1

        setIsSaving(true)
        try {
            const result = await upsertPaidMediaItem({
                avatarId,
                generationId: selectedGenerationId,
                title: trimmedTitle,
                caption: caption.trim() || null,
                starPrice: price,
                isFree,
                enabled: true,
                sortOrder: nextSortOrder,
            })
            if (result.success && result.data) {
                onItemsChange([...items, result.data])
                setAddOpen(false)
                resetAddForm()
                toast.push(
                    <Notification type="success" title="Content added">
                        {result.data.title} is live in the gallery.
                    </Notification>,
                )
            } else {
                // El límite de tamaño (y cualquier otro motivo) ya viene
                // formateado por el servicio — se enseña TAL CUAL, sin
                // reescribirlo.
                toast.push(
                    <Notification type="danger" title="Could not add content">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setIsSaving(false)
        }
    }

    const openEdit = (item: PaidMediaItemView) => {
        setEditTarget(item)
        setEditTitle(item.title)
        setEditCaption(item.caption ?? '')
        // Un gratis guarda 0; enseñar "0" en el campo de precio sería una
        // trampa si el usuario lo pasa a de pago, así que se ofrece el mismo
        // valor de partida que el alta.
        setEditStarPrice(item.isFree ? '50' : String(item.starPrice))
        setEditIsFree(item.isFree)
        setEditEnabled(item.enabled)
    }

    const handleEditSave = async () => {
        if (!editTarget) return
        const trimmedTitle = editTitle.trim()
        if (!trimmedTitle) return
        const price = editIsFree ? 0 : parseStarPrice(editStarPrice)
        if (price === null) return

        setIsEditSaving(true)
        try {
            const result = await upsertPaidMediaItem({
                id: editTarget.id,
                avatarId,
                title: trimmedTitle,
                caption: editCaption.trim() || null,
                starPrice: price,
                isFree: editIsFree,
                enabled: editEnabled,
                sortOrder: editTarget.sortOrder,
            })
            if (result.success && result.data) {
                const saved = result.data
                onItemsChange(items.map((i) => (i.id === saved.id ? saved : i)))
                setEditTarget(null)
                toast.push(<Notification type="success" title="Content updated" />)
            } else {
                toast.push(
                    <Notification type="danger" title="Could not save changes">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setIsEditSaving(false)
        }
    }

    const handleQuickToggle = async (item: PaidMediaItemView) => {
        setTogglingId(item.id)
        try {
            const result = await upsertPaidMediaItem({
                id: item.id,
                avatarId,
                title: item.title,
                caption: item.caption,
                starPrice: item.starPrice,
                // OBLIGATORIO arrastrarlo: sin `isFree` el servicio trataría
                // este ítem como de pago y su `starPrice` de 0 (el de un
                // gratis) no pasaría la validación 1..25000 — habilitar o
                // deshabilitar un teaser fallaría siempre.
                isFree: item.isFree,
                enabled: !item.enabled,
                sortOrder: item.sortOrder,
            })
            if (result.success && result.data) {
                const saved = result.data
                onItemsChange(items.map((i) => (i.id === saved.id ? saved : i)))
            } else {
                toast.push(
                    <Notification type="danger" title="Could not update">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setTogglingId(null)
        }
    }

    const handleDelete = async () => {
        const target = deleteTarget
        if (!target) return
        setIsDeleting(true)
        try {
            const result = await deletePaidMediaItem(avatarId, target.id)
            if (result.success) {
                onItemsChange(items.filter((i) => i.id !== target.id))
            } else {
                toast.push(
                    <Notification type="danger" title="Could not delete">
                        {result.error}
                    </Notification>,
                )
            }
        } finally {
            setIsDeleting(false)
            setDeleteTarget(null)
        }
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Content ({items.length})</p>
                <Button
                    size="sm"
                    variant="solid"
                    onClick={openAdd}
                    disabled={generations.length === 0}
                >
                    Add from generations
                </Button>
            </div>

            {items.length === 0 ? (
                <Card>
                    <p className="text-sm text-gray-500">
                        Nothing here yet — add a generation to send it as a free teaser or to
                        sell it as Stars-locked content.
                    </p>
                </Card>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {items.map((item) => (
                        <Card key={item.id} className="p-0! overflow-hidden">
                            <div className="relative w-full aspect-square bg-black">
                                {item.mediaKind === 'video' ? (
                                    <video
                                        crossOrigin="anonymous"
                                        src={item.mediaUrl}
                                        muted
                                        preload="metadata"
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <img
                                        src={item.mediaUrl}
                                        alt=""
                                        loading="lazy"
                                        className="w-full h-full object-cover"
                                    />
                                )}
                                {item.isFree && (
                                    <Tag className="absolute top-2 left-2 bg-emerald-500 text-white border-0">
                                        Free
                                    </Tag>
                                )}
                                {!item.enabled && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                        <Tag className="bg-gray-700 text-white border-0">Disabled</Tag>
                                    </div>
                                )}
                            </div>
                            <div className="p-3">
                                <p className="text-sm font-semibold truncate" title={item.title}>
                                    {item.title}
                                </p>
                                <p className="text-xs text-gray-400 mb-2">
                                    {item.isFree
                                        ? `Free · ${item.freeSendsCount} sent`
                                        : `⭐ ${item.starPrice} · ${item.salesCount} sold`}
                                </p>
                                <div className="flex items-center gap-1 flex-wrap">
                                    <Button size="xs" onClick={() => openEdit(item)}>
                                        Edit
                                    </Button>
                                    <Button
                                        size="xs"
                                        loading={togglingId === item.id}
                                        onClick={() => handleQuickToggle(item)}
                                    >
                                        {item.enabled ? 'Disable' : 'Enable'}
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        customColorClass={() => 'text-red-500 hover:text-red-600'}
                                        onClick={() => setDeleteTarget(item)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog
                isOpen={addOpen}
                width={640}
                onClose={() => setAddOpen(false)}
                onRequestClose={() => setAddOpen(false)}
            >
                {/* max-h + cuerpo scrolleable: en móvil el formulario es más
                    alto que el viewport y Cancel/Add quedaban fuera sin
                    scroll que los alcance. Cabecera y pie fijos; solo el
                    cuerpo scrollea. */}
                <div className="flex flex-col max-h-[82vh]">
                    <h5 className="mb-4 shrink-0">Add content</h5>
                    <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar">
                        {generations.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                No generations in this avatar&apos;s gallery yet.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Pick a generation</p>
                                    {/* max-h-48 propio: dos scrolls anidados a propósito, la
                                        rejilla de miniaturas no debe empujar el resto del
                                        formulario fuera de la pantalla. */}
                                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
                                        {generations.map((gen) => (
                                            <button
                                                key={gen.id}
                                                type="button"
                                                onClick={() => setSelectedGenerationId(gen.id)}
                                                title={gen.prompt}
                                                className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                                                    gen.id === selectedGenerationId
                                                        ? 'border-primary'
                                                        : 'border-transparent hover:border-primary/50'
                                                }`}
                                            >
                                                {gen.mediaType === 'VIDEO' ? (
                                                    <video
                                                        crossOrigin="anonymous"
                                                        src={gen.mediaUrl}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <img
                                                        src={gen.mediaUrl}
                                                        alt="Generation"
                                                        className="w-full h-full object-cover"
                                                    />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs text-gray-500">Title</p>
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            loading={isGeneratingAi}
                                            disabled={isGeneratingAi || !selectedGenerationId}
                                            icon={<HiOutlineSparkles />}
                                            onClick={handleGenerateWithAi}
                                        >
                                            {isGeneratingAi ? 'Generating…' : 'Generate with AI'}
                                        </Button>
                                    </div>
                                    <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                                </div>
                                {aiError && (
                                    <Alert type="danger" showIcon duration={0} title="AI generation failed">
                                        {aiError}
                                    </Alert>
                                )}
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">How it&apos;s sent</p>
                                    <Segment
                                        value={isFree ? 'free' : 'paid'}
                                        onChange={(val) => setIsFree(val === 'free')}
                                    >
                                        <Segment.Item value="free">Free teaser</Segment.Item>
                                        <Segment.Item value="paid">Paid</Segment.Item>
                                    </Segment>
                                </div>
                                {isFree ? (
                                    <p className="text-xs text-gray-400">
                                        Free teasers go out unlocked, once per fan — the agent uses
                                        them as a hook, never as the product.
                                    </p>
                                ) : (
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">
                                            Price (Stars, 1-25000)
                                        </p>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={25000}
                                            value={starPrice}
                                            onChange={(e) => setStarPrice(e.target.value)}
                                        />
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">Caption (optional)</p>
                                    <Input
                                        textArea
                                        rows={3}
                                        value={caption}
                                        onChange={(e) => setCaption(e.target.value)}
                                        placeholder="Shown to the fan alongside the paid content…"
                                    />
                                </div>
                                <p className="text-xs text-gray-400">
                                    Photos up to 10 MB, videos up to 50 MB — Telegram&apos;s own limit.
                                    Larger files are rejected when you hit Add, with the exact size
                                    shown.
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-4 shrink-0">
                        <Button variant="plain" onClick={() => setAddOpen(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button
                            variant="solid"
                            loading={isSaving}
                            disabled={
                                !selectedGenerationId ||
                                !title.trim() ||
                                (!isFree && parseStarPrice(starPrice) === null)
                            }
                            onClick={handleAdd}
                        >
                            Add
                        </Button>
                    </div>
                </div>
            </Dialog>

            <Dialog
                isOpen={!!editTarget}
                onClose={() => setEditTarget(null)}
                onRequestClose={() => setEditTarget(null)}
            >
                {/* Mismo problema que el modal de añadir: en móvil el
                    formulario es más alto que el viewport y Cancel/Save
                    quedaban fuera sin scroll que los alcance. Cabecera y pie
                    fijos; solo el cuerpo scrollea. */}
                <div className="flex flex-col max-h-[82vh]">
                    <h5 className="mb-4 shrink-0">Edit content</h5>
                    <div className="flex-1 min-h-0 overflow-y-auto thin-scrollbar">
                        <div className="flex flex-col gap-3">
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Title</p>
                                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">How it&apos;s sent</p>
                                <Segment
                                    value={editIsFree ? 'free' : 'paid'}
                                    onChange={(val) => setEditIsFree(val === 'free')}
                                >
                                    <Segment.Item value="free">Free teaser</Segment.Item>
                                    <Segment.Item value="paid">Paid</Segment.Item>
                                </Segment>
                            </div>
                            {!editIsFree && (
                                <div>
                                    <p className="text-xs text-gray-500 mb-1">
                                        Price (Stars, 1-25000)
                                    </p>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={25000}
                                        value={editStarPrice}
                                        onChange={(e) => setEditStarPrice(e.target.value)}
                                    />
                                </div>
                            )}
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Caption (optional)</p>
                                <Input
                                    textArea
                                    rows={3}
                                    value={editCaption}
                                    onChange={(e) => setEditCaption(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Switcher checked={editEnabled} onChange={(c) => setEditEnabled(c)} />
                                <span className="text-sm">
                                    {editEnabled
                                        ? 'Enabled — available to send'
                                        : 'Disabled — hidden from the agent and the inbox'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-4 shrink-0">
                        <Button variant="plain" onClick={() => setEditTarget(null)} disabled={isEditSaving}>
                            Cancel
                        </Button>
                        <Button variant="solid" loading={isEditSaving} onClick={handleEditSave}>
                            Save
                        </Button>
                    </div>
                </div>
            </Dialog>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                type="danger"
                title="Delete this content?"
                confirmText="Delete"
                confirmButtonProps={{ loading: isDeleting, color: 'red' }}
                onClose={() => setDeleteTarget(null)}
                onRequestClose={() => setDeleteTarget(null)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
            >
                <p>Past sales stay in your history. This only removes it from the gallery.</p>
            </ConfirmDialog>
        </div>
    )
}

export default TelegramGallery
