'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Dialog from '@/components/ui/Dialog'
import Switcher from '@/components/ui/Switcher'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { upsertPaidMediaItem, deletePaidMediaItem } from '@/services/AgentTelegramService'
import type { PaidMediaItemView } from '@/services/AgentTelegramService'
import type { GenerationPickerItem } from './types'

interface TelegramGalleryProps {
    avatarId: string
    items: PaidMediaItemView[]
    onItemsChange: (items: PaidMediaItemView[]) => void
    generations: GenerationPickerItem[]
}

function parseStarPrice(raw: string): number | null {
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 1 || n > 25_000) return null
    return n
}

const TelegramGallery = ({ avatarId, items, onItemsChange, generations }: TelegramGalleryProps) => {
    // --- Add from generations (Step 3) ---
    const [addOpen, setAddOpen] = useState(false)
    const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null)
    const [title, setTitle] = useState('')
    const [caption, setCaption] = useState('')
    const [starPrice, setStarPrice] = useState('50')
    const [isSaving, setIsSaving] = useState(false)

    // --- Edit ---
    const [editTarget, setEditTarget] = useState<PaidMediaItemView | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editCaption, setEditCaption] = useState('')
    const [editStarPrice, setEditStarPrice] = useState('')
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
    }

    const openAdd = () => {
        resetAddForm()
        setAddOpen(true)
    }

    const handleAdd = async () => {
        if (!selectedGenerationId) return
        const trimmedTitle = title.trim()
        if (!trimmedTitle) return
        const price = parseStarPrice(starPrice)
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
        setEditStarPrice(String(item.starPrice))
        setEditEnabled(item.enabled)
    }

    const handleEditSave = async () => {
        if (!editTarget) return
        const trimmedTitle = editTitle.trim()
        if (!trimmedTitle) return
        const price = parseStarPrice(editStarPrice)
        if (price === null) return

        setIsEditSaving(true)
        try {
            const result = await upsertPaidMediaItem({
                id: editTarget.id,
                avatarId,
                title: trimmedTitle,
                caption: editCaption.trim() || null,
                starPrice: price,
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
                <p className="text-sm font-semibold">Paid content ({items.length})</p>
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
                        No paid content yet — add a generation to sell it as Stars-locked content.
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
                                    ⭐ {item.starPrice} · {item.salesCount} sold
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
                <h5 className="mb-4">Add paid content</h5>
                {generations.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        No generations in this avatar&apos;s gallery yet.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Pick a generation</p>
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
                            <p className="text-xs text-gray-500 mb-1">Title</p>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Price (Stars, 1-25000)</p>
                            <Input
                                type="number"
                                min={1}
                                max={25000}
                                value={starPrice}
                                onChange={(e) => setStarPrice(e.target.value)}
                            />
                        </div>
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
                            Photos up to 10 MB, videos up to 50 MB — Telegram&apos;s own limit for
                            paid media. Larger files are rejected when you hit Add, with the exact
                            size shown.
                        </p>
                    </div>
                )}
                <div className="flex items-center justify-end gap-2 mt-4">
                    <Button variant="plain" onClick={() => setAddOpen(false)} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        loading={isSaving}
                        disabled={!selectedGenerationId || !title.trim()}
                        onClick={handleAdd}
                    >
                        Add
                    </Button>
                </div>
            </Dialog>

            <Dialog
                isOpen={!!editTarget}
                onClose={() => setEditTarget(null)}
                onRequestClose={() => setEditTarget(null)}
            >
                <h5 className="mb-4">Edit content</h5>
                <div className="flex flex-col gap-3">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Title</p>
                        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Price (Stars, 1-25000)</p>
                        <Input
                            type="number"
                            min={1}
                            max={25000}
                            value={editStarPrice}
                            onChange={(e) => setEditStarPrice(e.target.value)}
                        />
                    </div>
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
                            {editEnabled ? 'Enabled — visible for sale' : 'Disabled — hidden from sale'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-4">
                    <Button variant="plain" onClick={() => setEditTarget(null)} disabled={isEditSaving}>
                        Cancel
                    </Button>
                    <Button variant="solid" loading={isEditSaving} onClick={handleEditSave}>
                        Save
                    </Button>
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
