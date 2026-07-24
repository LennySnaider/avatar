'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    HiOutlinePencil,
    HiOutlineTrash,
    HiOutlinePhotograph,
    HiOutlinePlay,
} from 'react-icons/hi'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Radio from '@/components/ui/Radio'
import Segment from '@/components/ui/Segment'
import Dialog from '@/components/ui/Dialog'
import DatePicker from '@/components/ui/DatePicker'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
    updateFanvuePost,
    deleteFanvuePost,
    type FanvuePostRow,
} from '@/services/FanvueService'
import type { FanvuePostAudience } from '@/lib/fanvue/types'

interface FanvuePostsClientProps {
    initialPosts: FanvuePostRow[]
    loadError: string | null
}

const STATUS_STYLES: Record<string, string> = {
    scheduled:
        'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-100 border-0',
    published:
        'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 border-0',
    failed: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-100 border-0',
}

const AUDIENCE_LABELS: Record<string, string> = {
    subscribers: 'Subscribers',
    'followers-and-subscribers': 'Followers & subscribers',
}

function formatDate(value: string | null): string {
    if (!value) return '—'
    return new Date(value).toLocaleString()
}

function formatPrice(cents: number | null): string | null {
    if (cents === null || cents === undefined) return null
    return `$${(cents / 100).toFixed(2)}`
}

/** Form state seeded when the edit dialog opens. */
interface EditForm {
    caption: string
    audience: FanvuePostAudience
    paid: boolean
    priceCents: string
    scheduledAt: Date | null
}

const FanvuePostsClient = ({
    initialPosts,
    loadError,
}: FanvuePostsClientProps) => {
    const router = useRouter()
    const posts = initialPosts

    // Enlarged media preview (the thumbnail's whole point — "ni se ve la imagen").
    const [previewPost, setPreviewPost] = useState<FanvuePostRow | null>(null)

    // Edit dialog.
    const [editTarget, setEditTarget] = useState<FanvuePostRow | null>(null)
    const [editForm, setEditForm] = useState<EditForm | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Delete confirm.
    const [deleteTarget, setDeleteTarget] = useState<FanvuePostRow | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const openEdit = (post: FanvuePostRow) => {
        setEditTarget(post)
        setEditForm({
            caption: post.caption ?? '',
            audience:
                (post.audience as FanvuePostAudience) ?? 'subscribers',
            paid: !!post.price && post.price > 0,
            priceCents: post.price ? String(post.price) : '',
            scheduledAt: post.scheduled_at ? new Date(post.scheduled_at) : null,
        })
    }

    const closeEdit = () => {
        setEditTarget(null)
        setEditForm(null)
    }

    const handleSave = async () => {
        if (!editTarget || !editForm) return
        // Only paid posts carry a price; validate the floor before the round-trip.
        let price: number | null = null
        if (editForm.paid) {
            const parsed = Number(editForm.priceCents)
            if (!Number.isFinite(parsed) || parsed < 300) {
                toast.push(
                    <Notification type="warning" title="Precio inválido">
                        El mínimo de Fanvue es 300¢ ($3.00).
                    </Notification>,
                )
                return
            }
            price = Math.round(parsed)
        }

        setIsSaving(true)
        try {
            const result = await updateFanvuePost({
                postId: editTarget.id,
                caption: editForm.caption,
                audience: editForm.audience,
                price,
                // Schedule only applies while the post is still scheduled.
                ...(editTarget.status === 'scheduled'
                    ? {
                          publishAt: editForm.scheduledAt
                              ? editForm.scheduledAt.toISOString()
                              : null,
                      }
                    : {}),
            })
            if (!result.success) {
                toast.push(
                    <Notification type="danger" title="No se pudo editar">
                        {result.error ?? 'Error desconocido'}
                    </Notification>,
                )
                return
            }
            toast.push(
                <Notification
                    type="success"
                    title="Post actualizado"
                    duration={2500}
                >
                    Los cambios se guardaron en Fanvue.
                </Notification>,
            )
            closeEdit()
            router.refresh()
        } catch (e) {
            toast.push(
                <Notification type="danger" title="No se pudo editar">
                    {e instanceof Error ? e.message : String(e)}
                </Notification>,
            )
        } finally {
            setIsSaving(false)
        }
    }

    const handleDeleteConfirmed = async () => {
        if (!deleteTarget) return
        setIsDeleting(true)
        try {
            const result = await deleteFanvuePost(deleteTarget.id)
            if (!result.success) {
                toast.push(
                    <Notification type="danger" title="No se pudo borrar">
                        {result.error ?? 'Error desconocido'}
                    </Notification>,
                )
                return
            }
            toast.push(
                <Notification
                    type="success"
                    title="Post borrado"
                    duration={2500}
                >
                    Se eliminó de Fanvue y del historial.
                </Notification>,
            )
            setDeleteTarget(null)
            router.refresh()
        } catch (e) {
            toast.push(
                <Notification type="danger" title="No se pudo borrar">
                    {e instanceof Error ? e.message : String(e)}
                </Notification>,
            )
        } finally {
            setIsDeleting(false)
        }
    }

    if (posts.length === 0 && !loadError) {
        return (
            <Card>
                <p className="text-sm text-gray-500">
                    No Fanvue posts yet — publish a generation from the composer
                    to see it here.
                </p>
            </Card>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            {loadError && (
                <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">
                        {loadError}
                    </p>
                </div>
            )}

            <div className="flex flex-col gap-3">
                {posts.map((post) => {
                    const price = formatPrice(post.price)
                    const isVideo = post.cover_media_type === 'VIDEO'
                    const mediaCount = post.media_uuids?.length ?? 0
                    return (
                        <Card key={post.id}>
                            <div className="flex gap-4">
                                {/* Cover thumbnail */}
                                <button
                                    type="button"
                                    onClick={() =>
                                        post.cover_url && setPreviewPost(post)
                                    }
                                    disabled={!post.cover_url}
                                    className="relative shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center group disabled:cursor-default"
                                    title={
                                        post.cover_url
                                            ? 'Ver imagen'
                                            : undefined
                                    }
                                >
                                    {post.cover_url ? (
                                        <>
                                            {isVideo ? (
                                                <video
                                                    src={post.cover_url}
                                                    className="w-full h-full object-cover"
                                                    muted
                                                    playsInline
                                                    preload="metadata"
                                                />
                                            ) : (
                                                <img
                                                    src={post.cover_url}
                                                    alt=""
                                                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                                />
                                            )}
                                            {isVideo && (
                                                <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-white text-2xl">
                                                    <HiOutlinePlay />
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="flex flex-col items-center gap-1 text-gray-400 text-xs">
                                            <HiOutlinePhotograph className="text-2xl" />
                                            {mediaCount > 0
                                                ? `${mediaCount} media`
                                                : 'Sin media'}
                                        </span>
                                    )}
                                </button>

                                {/* Content */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <Tag
                                            className={
                                                STATUS_STYLES[
                                                    post.status ?? ''
                                                ] ?? ''
                                            }
                                        >
                                            {post.status ?? 'unknown'}
                                        </Tag>
                                        {post.audience && (
                                            <Tag>
                                                {AUDIENCE_LABELS[
                                                    post.audience
                                                ] ?? post.audience}
                                            </Tag>
                                        )}
                                        {price && <Tag>{price}</Tag>}
                                        {mediaCount > 0 && (
                                            <Tag>{mediaCount} media</Tag>
                                        )}
                                    </div>

                                    <p className="text-sm line-clamp-2 mb-2">
                                        {post.caption || '—'}
                                    </p>

                                    <p className="text-xs text-gray-400">
                                        {post.status === 'published'
                                            ? `Published ${formatDate(post.published_at)}`
                                            : post.status === 'scheduled'
                                              ? `Scheduled for ${formatDate(post.scheduled_at)}`
                                              : `Created ${formatDate(post.created_at)}`}
                                    </p>

                                    {post.status === 'failed' &&
                                        post.error_message && (
                                            <p className="text-xs text-red-500 mt-1">
                                                {post.error_message}
                                            </p>
                                        )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-2 shrink-0">
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        icon={<HiOutlinePencil />}
                                        onClick={() => openEdit(post)}
                                    >
                                        Editar
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        className="text-red-500 hover:text-red-600"
                                        icon={<HiOutlineTrash />}
                                        onClick={() => setDeleteTarget(post)}
                                    >
                                        Borrar
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )
                })}
            </div>

            {/* Media preview lightbox */}
            <Dialog
                isOpen={!!previewPost}
                onClose={() => setPreviewPost(null)}
                onRequestClose={() => setPreviewPost(null)}
                width={720}
            >
                {previewPost?.cover_url &&
                    (previewPost.cover_media_type === 'VIDEO' ? (
                        <video
                            src={previewPost.cover_url}
                            className="w-full max-h-[75vh] rounded-lg"
                            controls
                            autoPlay
                            playsInline
                        />
                    ) : (
                        <img
                            src={previewPost.cover_url}
                            alt=""
                            className="w-full max-h-[75vh] object-contain rounded-lg"
                        />
                    ))}
                {previewPost?.caption && (
                    <p className="text-sm text-gray-500 mt-3">
                        {previewPost.caption}
                    </p>
                )}
            </Dialog>

            {/* Edit dialog */}
            <Dialog
                isOpen={!!editTarget}
                onClose={closeEdit}
                onRequestClose={closeEdit}
                width={560}
            >
                <h5 className="mb-4">Editar post</h5>
                {editForm && (
                    <div className="flex flex-col gap-4">
                        <div>
                            <p className="text-sm font-semibold mb-2">Caption</p>
                            <Input
                                textArea
                                rows={4}
                                value={editForm.caption}
                                onChange={(e) =>
                                    setEditForm({
                                        ...editForm,
                                        caption: e.target.value,
                                    })
                                }
                                placeholder="Escribe una caption…"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                {editForm.caption.length} / 5000
                            </p>
                        </div>

                        <div>
                            <p className="text-sm font-semibold mb-2">
                                Audiencia
                            </p>
                            <Segment
                                value={editForm.audience}
                                onChange={(val) =>
                                    setEditForm({
                                        ...editForm,
                                        audience: val as FanvuePostAudience,
                                    })
                                }
                            >
                                <Segment.Item value="subscribers">
                                    Subscribers
                                </Segment.Item>
                                <Segment.Item value="followers-and-subscribers">
                                    Followers &amp; subscribers
                                </Segment.Item>
                            </Segment>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-semibold">
                                    Precio (PPV)
                                </p>
                                <Radio.Group
                                    value={editForm.paid ? 'paid' : 'free'}
                                    onChange={(value) =>
                                        setEditForm({
                                            ...editForm,
                                            paid: value === 'paid',
                                        })
                                    }
                                >
                                    <Radio value="free">Gratis</Radio>
                                    <Radio value="paid">De pago</Radio>
                                </Radio.Group>
                            </div>
                            {editForm.paid && (
                                <div className="max-w-xs">
                                    <Input
                                        type="number"
                                        min={300}
                                        value={editForm.priceCents}
                                        onChange={(e) =>
                                            setEditForm({
                                                ...editForm,
                                                priceCents: e.target.value,
                                            })
                                        }
                                        placeholder="Precio en centavos (mín. 300)"
                                        suffix="¢"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">
                                        Mínimo 300¢ ($3.00).
                                    </p>
                                </div>
                            )}
                        </div>

                        {editTarget?.status === 'scheduled' && (
                            <div>
                                <p className="text-sm font-semibold mb-2">
                                    Programación
                                </p>
                                <DatePicker.DateTimepicker
                                    value={editForm.scheduledAt}
                                    onChange={(date) =>
                                        setEditForm({
                                            ...editForm,
                                            scheduledAt: date,
                                        })
                                    }
                                    placeholder="Selecciona fecha y hora"
                                />
                            </div>
                        )}

                        <div className="flex justify-end gap-2 mt-2">
                            <Button
                                size="sm"
                                variant="plain"
                                onClick={closeEdit}
                                disabled={isSaving}
                            >
                                Cancelar
                            </Button>
                            <Button
                                size="sm"
                                variant="solid"
                                loading={isSaving}
                                onClick={handleSave}
                            >
                                Guardar
                            </Button>
                        </div>
                    </div>
                )}
            </Dialog>

            {/* Delete confirm */}
            <ConfirmDialog
                isOpen={!!deleteTarget}
                type="danger"
                title="Borrar post"
                onClose={() => setDeleteTarget(null)}
                onRequestClose={() => setDeleteTarget(null)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={handleDeleteConfirmed}
                confirmText="Borrar"
                cancelText="Cancelar"
                confirmButtonProps={{ loading: isDeleting }}
            >
                <p>
                    Esto elimina el post de Fanvue
                    {deleteTarget?.status === 'scheduled'
                        ? ' (cancela su publicación programada)'
                        : deleteTarget?.status === 'published'
                          ? ' (lo despublica)'
                          : ''}{' '}
                    y lo quita de este historial. Esta acción no se puede
                    deshacer.
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default FanvuePostsClient
