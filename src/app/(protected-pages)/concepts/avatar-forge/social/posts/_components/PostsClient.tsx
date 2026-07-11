'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { cancelScheduledPost, type SocialPostRow } from '@/services/SocialService'

interface PostsClientProps {
    initialPosts: SocialPostRow[]
    loadError: string | null
}

const STATUS_STYLES: Record<string, string> = {
    scheduled: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-100 border-0',
    processing: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-100 border-0',
    published: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-100 border-0',
    failed: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-100 border-0',
    cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-100 border-0',
}

function platformLabel(p: unknown): string {
    if (typeof p === 'string') return p
    return (p as { platform?: string })?.platform ?? JSON.stringify(p)
}

function platformList(platforms: unknown): unknown[] {
    return Array.isArray(platforms) ? platforms : []
}

function formatDate(value: string | null): string {
    if (!value) return '—'
    return new Date(value).toLocaleString()
}

const PostsClient = ({ initialPosts, loadError }: PostsClientProps) => {
    const router = useRouter()
    // `initialPosts` is re-fetched server-side and passed down fresh whenever
    // `router.refresh()` runs (e.g. after a cancel) — no local mirror needed.
    const posts = initialPosts
    const [error, setError] = useState<string | null>(loadError)
    const [cancellingId, setCancellingId] = useState<string | null>(null)

    const handleCancel = async (postId: string) => {
        setCancellingId(postId)
        setError(null)
        try {
            const result = await cancelScheduledPost(postId)
            if (result.success) {
                toast.push(
                    <Notification type="success" title="Post cancelled">
                        The scheduled post has been cancelled.
                    </Notification>,
                )
                router.refresh()
            } else {
                setError(result.error ?? 'Failed to cancel post')
                toast.push(
                    <Notification type="danger" title="Cancel failed">
                        {result.error ?? 'Unknown error'}
                    </Notification>,
                )
            }
        } finally {
            setCancellingId(null)
        }
    }

    if (posts.length === 0 && !error) {
        return (
            <Card>
                <p className="text-sm text-gray-500">
                    No posts yet — publish or schedule a generation from the composer to see it here.
                </p>
            </Card>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            {error && (
                <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            <div className="flex flex-col gap-3">
                {posts.map((post) => {
                    const thumbnail = post.media_urls?.[0]
                    return (
                        <Card key={post.id}>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="w-full sm:w-32 h-32 shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                    {thumbnail ? (
                                        post.content_type === 'video' ? (
                                            <video src={thumbnail} className="w-full h-full object-cover" />
                                        ) : (
                                            <img
                                                src={thumbnail}
                                                alt="Post media"
                                                className="w-full h-full object-cover"
                                            />
                                        )
                                    ) : (
                                        <span className="text-xs text-gray-400">No media</span>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <Tag className={STATUS_STYLES[post.status] ?? ''}>
                                            {post.status}
                                        </Tag>
                                        {post.avatar_name && (
                                            <Tag className="bg-primary/10 text-primary dark:bg-primary/20 border-0">
                                                {post.avatar_name}
                                            </Tag>
                                        )}
                                        {platformList(post.platforms).map((p, idx) => (
                                            <Tag key={idx}>{platformLabel(p)}</Tag>
                                        ))}
                                    </div>

                                    <p className="text-sm line-clamp-2 mb-2">{post.caption || '—'}</p>

                                    <p className="text-xs text-gray-400">
                                        {post.status === 'published'
                                            ? `Published ${formatDate(post.published_at)}`
                                            : post.status === 'scheduled'
                                              ? `Scheduled for ${formatDate(post.scheduled_at)}`
                                              : `Created ${formatDate(post.created_at)}`}
                                    </p>

                                    {post.status === 'failed' && post.error_message && (
                                        <p className="text-xs text-red-500 mt-1">{post.error_message}</p>
                                    )}

                                    {post.status === 'scheduled' && (
                                        <div className="mt-3">
                                            <Button
                                                size="sm"
                                                variant="plain"
                                                loading={cancellingId === post.id}
                                                onClick={() => handleCancel(post.id)}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}

export default PostsClient
