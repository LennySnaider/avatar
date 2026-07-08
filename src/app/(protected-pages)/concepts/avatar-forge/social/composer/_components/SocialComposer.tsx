'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Checkbox from '@/components/ui/Checkbox'
import Radio from '@/components/ui/Radio'
import DatePicker from '@/components/ui/DatePicker'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineX } from 'react-icons/hi'
import { createSocialPost } from '@/services/SocialService'
import { normalizeHashtag } from '@/lib/social/hashtagHelpers'
import type { MediaType } from '@/@types/supabase'

const { DateTimepicker } = DatePicker

interface GenerationMedia {
    id: string
    mediaType: MediaType
    publicUrl: string
    prompt: string
}

interface SocialComposerProps {
    media: GenerationMedia | null
    generationId?: string
    platforms: string[]
}

type ScheduleMode = 'now' | 'schedule'

const POSTS_PATH = '/concepts/avatar-forge/social/posts'

const SocialComposer = ({ media, generationId, platforms }: SocialComposerProps) => {
    const router = useRouter()

    const [caption, setCaption] = useState(media?.prompt ?? '')
    const [hashtagInput, setHashtagInput] = useState('')
    const [hashtags, setHashtags] = useState<string[]>([])
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(platforms)
    const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now')
    const [scheduleDate, setScheduleDate] = useState<Date | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const hasConnectedPlatforms = platforms.length > 0

    const addHashtag = () => {
        const normalized = normalizeHashtag(hashtagInput)
        if (!normalized) {
            setHashtagInput('')
            return
        }
        setHashtags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]))
        setHashtagInput('')
    }

    const handleHashtagKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            addHashtag()
        }
    }

    const removeHashtag = (tag: string) => {
        setHashtags((prev) => prev.filter((h) => h !== tag))
    }

    const togglePlatform = (platform: string, checked: boolean) => {
        setSelectedPlatforms((prev) =>
            checked ? [...prev, platform] : prev.filter((p) => p !== platform),
        )
    }

    const handleSubmit = async () => {
        setError(null)

        if (selectedPlatforms.length === 0) {
            setError('Pick at least one platform')
            return
        }
        if (!caption.trim() && !media) {
            setError('Add a caption or attach media')
            return
        }
        let scheduledAt: string | null = null
        if (scheduleMode === 'schedule') {
            if (!scheduleDate || scheduleDate.getTime() <= Date.now()) {
                setError('Pick a future date and time to schedule this post')
                return
            }
            scheduledAt = scheduleDate.toISOString()
        }

        setIsSubmitting(true)
        try {
            const result = await createSocialPost({
                generationId,
                caption,
                hashtags,
                platforms: selectedPlatforms,
                scheduledAt,
            })
            if (result.success) {
                toast.push(
                    <Notification type="success" title={scheduledAt ? 'Post scheduled' : 'Post published'}>
                        {scheduledAt
                            ? 'Your post has been scheduled.'
                            : 'Your post was sent for publishing.'}
                    </Notification>,
                )
                router.push(POSTS_PATH)
            } else {
                setError(result.error ?? 'Failed to create post')
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="flex flex-col gap-4 max-w-3xl">
            {error && (
                <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            <Card>
                <p className="text-sm font-semibold mb-2">Media</p>
                {media ? (
                    <div className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 max-w-sm">
                        {media.mediaType === 'VIDEO' ? (
                            <video src={media.publicUrl} controls className="w-full h-auto" />
                        ) : (
                            <img src={media.publicUrl} alt="Generation preview" className="w-full h-auto" />
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">
                        No media attached — this will be posted as a text-only update.
                    </p>
                )}
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-2">Caption</p>
                <Input
                    textArea
                    rows={5}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption for this post..."
                />
                <p className="text-xs text-gray-400 mt-1">{caption.length} characters</p>
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-2">Hashtags</p>
                <Input
                    value={hashtagInput}
                    onChange={(e) => setHashtagInput(e.target.value)}
                    onKeyDown={handleHashtagKeyDown}
                    onBlur={addHashtag}
                    placeholder="Type a hashtag and press Enter"
                />
                {hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {hashtags.map((tag) => (
                            <Tag key={tag} className="flex items-center gap-1">
                                #{tag}
                                <button
                                    type="button"
                                    onClick={() => removeHashtag(tag)}
                                    className="ml-1 cursor-pointer"
                                    aria-label={`Remove #${tag}`}
                                >
                                    <HiOutlineX />
                                </button>
                            </Tag>
                        ))}
                    </div>
                )}
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-2">Platforms</p>
                {hasConnectedPlatforms ? (
                    <div className="flex flex-wrap gap-4">
                        {platforms.map((platform) => (
                            <Checkbox
                                key={platform}
                                checked={selectedPlatforms.includes(platform)}
                                onChange={(checked) => togglePlatform(platform, checked)}
                            >
                                <span className="capitalize">{platform}</span>
                            </Checkbox>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                        No platforms connected yet — connect an account first.
                    </p>
                )}
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-2">When</p>
                <Radio.Group value={scheduleMode} onChange={(value) => setScheduleMode(value as ScheduleMode)}>
                    <Radio value="now">Publish now</Radio>
                    <Radio value="schedule">Schedule</Radio>
                </Radio.Group>
                {scheduleMode === 'schedule' && (
                    <div className="mt-3 max-w-xs">
                        <DateTimepicker
                            placeholder="Pick date & time"
                            value={scheduleDate}
                            minDate={new Date()}
                            onChange={(value) => setScheduleDate(value)}
                        />
                    </div>
                )}
            </Card>

            <div>
                <Button
                    variant="solid"
                    loading={isSubmitting}
                    disabled={!hasConnectedPlatforms}
                    onClick={handleSubmit}
                >
                    {scheduleMode === 'schedule' ? 'Schedule post' : 'Publish now'}
                </Button>
            </div>
        </div>
    )
}

export default SocialComposer
