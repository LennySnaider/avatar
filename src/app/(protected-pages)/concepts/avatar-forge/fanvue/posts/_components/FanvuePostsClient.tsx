'use client'

import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import type { FanvuePostRow } from '@/services/FanvueService'

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

const FanvuePostsClient = ({
    initialPosts,
    loadError,
}: FanvuePostsClientProps) => {
    const posts = initialPosts

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
                    return (
                        <Card key={post.id}>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <Tag
                                    className={
                                        STATUS_STYLES[post.status ?? ''] ?? ''
                                    }
                                >
                                    {post.status ?? 'unknown'}
                                </Tag>
                                {post.audience && (
                                    <Tag>
                                        {AUDIENCE_LABELS[post.audience] ??
                                            post.audience}
                                    </Tag>
                                )}
                                {price && <Tag>{price}</Tag>}
                                {post.media_uuids &&
                                    post.media_uuids.length > 0 && (
                                        <Tag>
                                            {post.media_uuids.length} media
                                        </Tag>
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
                            {post.creator_user_uuid && (
                                <p className="text-xs text-gray-400 mt-1 truncate">
                                    Creator: {post.creator_user_uuid}
                                </p>
                            )}

                            {post.status === 'failed' && post.error_message && (
                                <p className="text-xs text-red-500 mt-1">
                                    {post.error_message}
                                </p>
                            )}
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}

export default FanvuePostsClient
