'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Radio from '@/components/ui/Radio'
import Segment from '@/components/ui/Segment'
import Select from '@/components/ui/Select'
import DatePicker from '@/components/ui/DatePicker'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    createFanvuePost,
    type FanvueCreatorRow,
} from '@/services/FanvueService'
import type { FanvuePostAudience } from '@/lib/fanvue/types'
import type { MediaType } from '@/@types/supabase'

const { DateTimepicker } = DatePicker

interface ComposerGeneration {
    id: string
    mediaType: MediaType
    publicUrl: string
    prompt: string
}

interface FanvueComposerProps {
    creators: FanvueCreatorRow[]
    generations: ComposerGeneration[]
    initialGenerationId?: string
}

interface CreatorOption {
    value: string
    label: string
}

type ScheduleMode = 'now' | 'schedule'

const POSTS_PATH = '/concepts/avatar-forge/fanvue/posts'

const FanvueComposer = ({
    creators,
    generations,
    initialGenerationId,
}: FanvueComposerProps) => {
    const router = useRouter()

    const creatorOptions = useMemo<CreatorOption[]>(
        () =>
            creators.map((c) => ({
                value: c.creator_user_uuid,
                label: c.display_name ?? c.handle ?? c.creator_user_uuid,
            })),
        [creators],
    )

    // Agency accounts publish on behalf of a managed creator; solo creator
    // accounts (no creators) publish to their own Fanvue profile.
    const isAgency = creators.length > 0

    const [creatorUuid, setCreatorUuid] = useState<string>(
        creatorOptions[0]?.value ?? '',
    )
    const [selectedGenerationId, setSelectedGenerationId] = useState<string>(
        initialGenerationId &&
            generations.some((g) => g.id === initialGenerationId)
            ? initialGenerationId
            : (generations[0]?.id ?? ''),
    )
    const [caption, setCaption] = useState('')
    const [audience, setAudience] = useState<FanvuePostAudience>('subscribers')
    const [enablePrice, setEnablePrice] = useState(false)
    const [priceCents, setPriceCents] = useState('')
    const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now')
    const [scheduleDate, setScheduleDate] = useState<Date | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const selectedGeneration =
        generations.find((g) => g.id === selectedGenerationId) ?? null
    const selectedCreatorOption =
        creatorOptions.find((o) => o.value === creatorUuid) ?? null

    const handleSubmit = async () => {
        setError(null)

        if (isAgency && !creatorUuid) {
            setError('Pick a creator to publish for')
            return
        }
        if (!selectedGenerationId) {
            setError('Pick a generation to publish')
            return
        }

        let price: number | undefined
        if (enablePrice) {
            const parsed = Number(priceCents)
            if (!Number.isInteger(parsed) || parsed < 300) {
                setError('Price must be a whole number of at least 300 cents')
                return
            }
            price = parsed
        }

        let publishAt: string | null = null
        if (scheduleMode === 'schedule') {
            if (!scheduleDate || scheduleDate.getTime() <= Date.now()) {
                setError('Pick a future date and time to schedule this post')
                return
            }
            publishAt = scheduleDate.toISOString()
        }

        setIsSubmitting(true)
        try {
            const result = await createFanvuePost({
                creatorUserUuid: creatorUuid || undefined,
                generationId: selectedGenerationId,
                caption,
                audience,
                price,
                publishAt,
            })
            if (result.success) {
                toast.push(
                    <Notification
                        type="success"
                        title={publishAt ? 'Post scheduled' : 'Post published'}
                    >
                        {publishAt
                            ? 'Your Fanvue post has been scheduled.'
                            : 'Your Fanvue post was published.'}
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
                    <p className="text-xs text-red-600 dark:text-red-400">
                        {error}
                    </p>
                </div>
            )}

            {isAgency ? (
                <Card>
                    <p className="text-sm font-semibold mb-2">Creator</p>
                    <Select<CreatorOption>
                        instanceId="fanvue-creator"
                        options={creatorOptions}
                        value={selectedCreatorOption}
                        isSearchable={creatorOptions.length > 6}
                        onChange={(option) =>
                            setCreatorUuid(option?.value ?? '')
                        }
                    />
                </Card>
            ) : (
                <Card>
                    <p className="text-sm text-gray-500">
                        Publishing to{' '}
                        <span className="font-semibold">
                            your Fanvue account
                        </span>
                        .
                    </p>
                </Card>
            )}

            <Card>
                <p className="text-sm font-semibold mb-2">Media</p>
                {generations.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        No generations in your gallery yet — create some media
                        first.
                    </p>
                ) : (
                    <>
                        {selectedGeneration && (
                            <div className="mb-3 w-48 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                                {selectedGeneration.mediaType === 'VIDEO' ? (
                                    <video
                                        src={selectedGeneration.publicUrl}
                                        controls
                                        className="w-full h-auto"
                                    />
                                ) : (
                                    <img
                                        src={selectedGeneration.publicUrl}
                                        alt="Selected generation"
                                        className="w-full h-auto"
                                    />
                                )}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {generations.map((gen) => (
                                <button
                                    key={gen.id}
                                    type="button"
                                    onClick={() =>
                                        setSelectedGenerationId(gen.id)
                                    }
                                    className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                                        gen.id === selectedGenerationId
                                            ? 'border-primary'
                                            : 'border-transparent hover:border-primary/50'
                                    }`}
                                    title={gen.prompt}
                                >
                                    {gen.mediaType === 'VIDEO' ? (
                                        <video
                                            src={gen.publicUrl}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <img
                                            src={gen.publicUrl}
                                            alt="Gallery"
                                            className="w-full h-full object-cover"
                                        />
                                    )}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-2">Caption</p>
                <Input
                    textArea
                    rows={5}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption for this Fanvue post..."
                />
                <p className="text-xs text-gray-400 mt-1">
                    {caption.length} / 5000 characters
                </p>
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-2">Audience</p>
                <Segment
                    value={audience}
                    onChange={(val) => setAudience(val as FanvuePostAudience)}
                >
                    <Segment.Item value="subscribers">Subscribers</Segment.Item>
                    <Segment.Item value="followers-and-subscribers">
                        Followers &amp; subscribers
                    </Segment.Item>
                </Segment>
            </Card>

            <Card>
                <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">
                        Price (pay-per-view)
                    </p>
                    <Radio.Group
                        value={enablePrice ? 'paid' : 'free'}
                        onChange={(value) => setEnablePrice(value === 'paid')}
                    >
                        <Radio value="free">Free</Radio>
                        <Radio value="paid">Paid</Radio>
                    </Radio.Group>
                </div>
                {enablePrice && (
                    <div className="max-w-xs">
                        <Input
                            type="number"
                            min={300}
                            value={priceCents}
                            onChange={(e) => setPriceCents(e.target.value)}
                            placeholder="Price in cents (min 300)"
                            suffix="¢"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Minimum 300 cents. Requires attached media.
                        </p>
                    </div>
                )}
            </Card>

            <Card>
                <p className="text-sm font-semibold mb-2">When</p>
                <Radio.Group
                    value={scheduleMode}
                    onChange={(value) => setScheduleMode(value as ScheduleMode)}
                >
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
                    disabled={generations.length === 0}
                    onClick={handleSubmit}
                >
                    {scheduleMode === 'schedule'
                        ? 'Schedule post'
                        : 'Publish now'}
                </Button>
            </div>
        </div>
    )
}

export default FanvueComposer
