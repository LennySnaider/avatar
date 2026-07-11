'use client'

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Dialog from '@/components/ui/Dialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
    addKnowledge,
    deleteKnowledge,
    listKnowledge,
    reindexAvatarContent,
    searchKnowledge,
} from '@/services/AgentService'
import type { KnowledgeItemDTO, KnowledgeKind, RetrievedChunk } from '@/lib/agent/types'

interface KnowledgeManagerProps {
    avatarId: string
}

interface Option {
    value: string
    label: string
}

const KIND_OPTIONS: Option[] = (['bio', 'lore', 'faq', 'manual'] as KnowledgeKind[]).map((k) => ({
    value: k,
    label: k.toUpperCase(),
}))

const KIND_STYLES: Record<string, string> = {
    bio: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-100 border-0',
    lore: 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-100 border-0',
    faq: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 border-0',
    media: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-100 border-0',
    post: 'bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-100 border-0',
    manual: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-100 border-0',
}

const KnowledgeManager = ({ avatarId }: KnowledgeManagerProps) => {
    const [items, setItems] = useState<KnowledgeItemDTO[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [addOpen, setAddOpen] = useState(false)
    const [addKind, setAddKind] = useState<KnowledgeKind>('manual')
    const [addTitle, setAddTitle] = useState('')
    const [addContent, setAddContent] = useState('')
    const [isAdding, setIsAdding] = useState(false)

    const [isReindexing, setIsReindexing] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<KnowledgeItemDTO | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)

    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState<RetrievedChunk[] | null>(null)
    const [isSearching, setIsSearching] = useState(false)

    const refresh = async () => {
        const result = await listKnowledge(avatarId)
        if (result.success) {
            setItems(result.data ?? [])
            setError(null)
        } else {
            setError(result.error ?? 'Failed to load knowledge')
        }
        setIsLoading(false)
    }

    useEffect(() => {
        refresh()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [avatarId])

    const handleAdd = async () => {
        if (!addContent.trim()) return
        setIsAdding(true)
        try {
            const result = await addKnowledge({
                avatarId,
                kind: addKind,
                title: addTitle.trim() || undefined,
                content: addContent.trim(),
            })
            if (result.success && result.data) {
                setItems((prev) => [result.data!, ...prev])
                setAddOpen(false)
                setAddTitle('')
                setAddContent('')
                toast.push(
                    <Notification type="success" title="Knowledge added">
                        Embedded and ready for retrieval
                    </Notification>,
                )
            } else {
                toast.push(
                    <Notification type="danger" title="Failed to add">
                        {result.error ?? 'Unknown error'}
                    </Notification>,
                )
            }
        } finally {
            setIsAdding(false)
        }
    }

    const handleReindex = async () => {
        setIsReindexing(true)
        try {
            const result = await reindexAvatarContent(avatarId)
            if (result.success && result.data) {
                toast.push(
                    <Notification type="success" title="Reindex complete">
                        {result.data.indexed} new items indexed, {result.data.skipped} already known
                    </Notification>,
                )
                refresh()
            } else {
                toast.push(
                    <Notification type="danger" title="Reindex failed">
                        {result.error ?? 'Unknown error'}
                    </Notification>,
                )
            }
        } finally {
            setIsReindexing(false)
        }
    }

    const handleDelete = async () => {
        const target = deleteTarget
        if (!target) return
        setIsDeleting(true)
        try {
            const result = await deleteKnowledge(target.id)
            if (result.success) {
                setItems((prev) => prev.filter((i) => i.id !== target.id))
            } else {
                toast.push(
                    <Notification type="danger" title="Delete failed">
                        {result.error ?? 'Unknown error'}
                    </Notification>,
                )
            }
        } finally {
            setIsDeleting(false)
            setDeleteTarget(null)
        }
    }

    const handleSearch = async () => {
        const query = searchQuery.trim()
        if (!query) {
            setSearchResults(null)
            return
        }
        setIsSearching(true)
        try {
            const result = await searchKnowledge(avatarId, query)
            setSearchResults(result.success ? (result.data ?? []) : [])
        } finally {
            setIsSearching(false)
        }
    }

    return (
        <div className="flex flex-col gap-4 max-w-4xl">
            {error && (
                <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            <Card>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <p className="text-sm font-semibold">
                        Knowledge base {isLoading ? '' : `(${items.length})`}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button size="sm" loading={isReindexing} onClick={handleReindex}>
                            Reindex avatar content
                        </Button>
                        <Button size="sm" variant="solid" onClick={() => setAddOpen(true)}>
                            Add knowledge
                        </Button>
                    </div>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                    Reindex pulls in published captions and gallery prompts automatically; add
                    bio, lore and FAQs by hand. Everything here is what the agent “knows”.
                </p>

                <div className="flex items-center gap-2 mb-4">
                    <div className="w-full sm:w-96">
                        <Input
                            size="sm"
                            value={searchQuery}
                            placeholder="Test retrieval: ask something and see what matches…"
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSearch()
                            }}
                        />
                    </div>
                    <Button size="sm" loading={isSearching} onClick={handleSearch}>
                        Search
                    </Button>
                    {searchResults !== null && (
                        <Button
                            size="sm"
                            variant="plain"
                            onClick={() => {
                                setSearchResults(null)
                                setSearchQuery('')
                            }}
                        >
                            Clear
                        </Button>
                    )}
                </div>

                {searchResults !== null ? (
                    searchResults.length === 0 ? (
                        <p className="text-sm text-gray-500">No matches above the similarity threshold.</p>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {searchResults.map((chunk) => (
                                <div
                                    key={chunk.id}
                                    className="p-2 rounded-lg border border-gray-200 dark:border-gray-700"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Tag className={KIND_STYLES[chunk.kind] ?? ''}>{chunk.kind}</Tag>
                                        <span className="text-xs text-gray-400">
                                            similarity {(chunk.similarity * 100).toFixed(0)}%
                                        </span>
                                        {chunk.title && (
                                            <span className="text-xs font-semibold">{chunk.title}</span>
                                        )}
                                    </div>
                                    <p className="text-sm line-clamp-2">{chunk.content}</p>
                                </div>
                            ))}
                        </div>
                    )
                ) : isLoading ? (
                    <p className="text-sm text-gray-500">Loading…</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        Nothing yet — hit “Reindex avatar content” or add the first item.
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {items.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-start justify-between gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-700"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Tag className={KIND_STYLES[item.kind] ?? ''}>{item.kind}</Tag>
                                        {item.title && (
                                            <span className="text-xs font-semibold truncate">{item.title}</span>
                                        )}
                                        {!item.hasEmbedding && (
                                            <Tag className="bg-red-100 text-red-600 border-0">no embedding</Tag>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                                        {item.content}
                                    </p>
                                </div>
                                <Button
                                    size="xs"
                                    variant="plain"
                                    customColorClass={() => 'text-red-500 hover:text-red-600'}
                                    onClick={() => setDeleteTarget(item)}
                                >
                                    Delete
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Dialog isOpen={addOpen} onClose={() => setAddOpen(false)} onRequestClose={() => setAddOpen(false)}>
                <h5 className="mb-4">Add knowledge</h5>
                <div className="flex flex-col gap-3">
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Kind</p>
                        <Select<Option>
                            instanceId="knowledge-kind"
                            options={KIND_OPTIONS}
                            value={KIND_OPTIONS.find((o) => o.value === addKind) ?? null}
                            onChange={(opt) => opt && setAddKind(opt.value as KnowledgeKind)}
                        />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Title (optional)</p>
                        <Input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Content</p>
                        <Input
                            textArea
                            rows={5}
                            value={addContent}
                            onChange={(e) => setAddContent(e.target.value)}
                            placeholder="A fact, story or answer the agent should know…"
                        />
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-4">
                    <Button variant="plain" onClick={() => setAddOpen(false)} disabled={isAdding}>
                        Cancel
                    </Button>
                    <Button variant="solid" loading={isAdding} onClick={handleAdd}>
                        Add
                    </Button>
                </div>
            </Dialog>

            <ConfirmDialog
                isOpen={!!deleteTarget}
                type="danger"
                title="Delete knowledge item?"
                confirmText="Delete"
                confirmButtonProps={{ loading: isDeleting, color: 'red' }}
                onClose={() => setDeleteTarget(null)}
                onRequestClose={() => setDeleteTarget(null)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
            >
                <p>The agent will forget this immediately. This cannot be undone.</p>
            </ConfirmDialog>
        </div>
    )
}

export default KnowledgeManager
