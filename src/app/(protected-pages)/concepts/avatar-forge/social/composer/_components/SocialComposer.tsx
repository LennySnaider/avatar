'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import Radio from '@/components/ui/Radio'
import DatePicker from '@/components/ui/DatePicker'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineX, HiOutlineSparkles } from 'react-icons/hi'
import { createSocialPost } from '@/services/SocialService'
import { generateSocialCaption, translateSocialCaption } from '@/services/GeminiService'
import { normalizeHashtag } from '@/lib/social/hashtagHelpers'
import type { MediaType } from '@/@types/supabase'

const { DateTimepicker } = DatePicker

interface GenerationMedia {
    id: string
    mediaType: MediaType
    publicUrl: string
    prompt: string
}

interface LibraryImage {
    id: string
    publicUrl: string
}

interface SocialComposerProps {
    media: GenerationMedia | null
    generationId?: string
    platforms: string[]
    libraryImages?: LibraryImage[]
}

type ScheduleMode = 'now' | 'schedule'

const POSTS_PATH = '/concepts/avatar-forge/social/posts'

const SocialComposer = ({ media, generationId, platforms, libraryImages = [] }: SocialComposerProps) => {
    const router = useRouter()

    // The generation PROMPT is harness text ([BODY]/[FACE]…), never a caption —
    // start empty and let "Generate with AI" write a real one.
    const [caption, setCaption] = useState('')
    const [hashtagInput, setHashtagInput] = useState('')
    // Hashtags are toggleable chips: only the active ones are published.
    const [hashtags, setHashtags] = useState<{ tag: string; active: boolean }[]>([])
    const [captionLang, setCaptionLang] = useState<'en' | 'es'>('en')
    const [isTranslating, setIsTranslating] = useState(false)
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(platforms)
    const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now')
    const [scheduleDate, setScheduleDate] = useState<Date | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isGeneratingAi, setIsGeneratingAi] = useState(false)
    // Extra gallery images appended after the primary one → photo carousel
    const [carouselIds, setCarouselIds] = useState<string[]>([])

    const hasConnectedPlatforms = platforms.length > 0
    // Carousels are photos-only; offer the library when the primary is an image
    const canCarousel = media?.mediaType === 'IMAGE'
    const availableLibrary = libraryImages.filter(
        (img) => img.id !== media?.id && !carouselIds.includes(img.id),
    )
    const carouselImages = carouselIds
        .map((id) => libraryImages.find((img) => img.id === id))
        .filter((img): img is LibraryImage => !!img)

    const handleGenerateWithAi = async () => {
        if (!media) return
        setIsGeneratingAi(true)
        setError(null)
        try {
            const result = await generateSocialCaption({
                mediaUrl: media.publicUrl,
                mediaType: media.mediaType,
                draft: caption.trim() || undefined,
                language: captionLang,
            })
            if (!result.success || !result.caption) {
                setError(result.error ?? 'AI caption generation failed')
                return
            }
            setCaption(result.caption)
            mergeHashtags(result.hashtags ?? [])
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setIsGeneratingAi(false)
        }
    }

    const handleTranslate = async () => {
        if (!caption.trim() && hashtags.length === 0) return
        setIsTranslating(true)
        setError(null)
        try {
            const result = await translateSocialCaption({
                caption,
                hashtags: hashtags.filter((h) => h.active).map((h) => h.tag),
                targetLanguage: captionLang,
            })
            if (!result.success || !result.caption) {
                setError(result.error ?? 'Translation failed')
                return
            }
            setCaption(result.caption)
            // Translation replaces the set (translated tags arrive active)
            const translated = (result.hashtags ?? [])
                .map((h) => normalizeHashtag(h))
                .filter((h): h is string => Boolean(h))
            setHashtags(Array.from(new Set(translated)).map((tag) => ({ tag, active: true })))
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setIsTranslating(false)
        }
    }

    const mergeHashtags = (incoming: string[]) => {
        const normalized = incoming
            .map((h) => normalizeHashtag(h))
            .filter((h): h is string => Boolean(h))
        setHashtags((prev) => {
            const existing = new Set(prev.map((h) => h.tag))
            return [...prev, ...normalized.filter((t) => !existing.has(t)).map((tag) => ({ tag, active: true }))]
        })
    }

    const addHashtag = () => {
        const normalized = normalizeHashtag(hashtagInput)
        if (!normalized) {
            setHashtagInput('')
            return
        }
        mergeHashtags([normalized])
        setHashtagInput('')
    }

    const handleHashtagKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            addHashtag()
        }
    }

    const toggleHashtag = (tag: string) => {
        setHashtags((prev) => prev.map((h) => (h.tag === tag ? { ...h, active: !h.active } : h)))
    }

    const removeHashtag = (tag: string) => {
        setHashtags((prev) => prev.filter((h) => h.tag !== tag))
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
                generationIds: canCarousel ? carouselIds : undefined,
                caption,
                hashtags: hashtags.filter((h) => h.active).map((h) => h.tag),
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
                    <div className="flex flex-wrap gap-3">
                        <div className="rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 w-48">
                            {media.mediaType === 'VIDEO' ? (
                                <video src={media.publicUrl} controls className="w-full h-auto" />
                            ) : (
                                <img src={media.publicUrl} alt="Generation preview" className="w-full h-auto" />
                            )}
                        </div>
                        {carouselImages.map((img, i) => (
                            <div key={img.id} className="relative w-48 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                                <img src={img.publicUrl} alt={`Carousel ${i + 2}`} className="w-full h-auto" />
                                <button
                                    type="button"
                                    onClick={() => setCarouselIds((prev) => prev.filter((id) => id !== img.id))}
                                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80"
                                >
                                    <HiOutlineX className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">
                        No media attached — this will be posted as a text-only update.
                    </p>
                )}
                {canCarousel && availableLibrary.length > 0 && (
                    <div className="mt-4">
                        <p className="text-xs text-gray-500 mb-2">
                            Add more images from your gallery (carousel)
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {availableLibrary.map((img) => (
                                <button
                                    key={img.id}
                                    type="button"
                                    onClick={() => setCarouselIds((prev) => [...prev, img.id])}
                                    className="w-16 h-16 rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-colors"
                                    title="Add to carousel"
                                >
                                    <img src={img.publicUrl} alt="Gallery" className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            <Card>
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <p className="text-sm font-semibold">Caption</p>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 dark:bg-gray-700 rounded p-0.5">
                            {(['en', 'es'] as const).map((lang) => (
                                <button
                                    key={lang}
                                    type="button"
                                    onClick={() => setCaptionLang(lang)}
                                    className={`px-2 py-0.5 text-[10px] font-medium rounded uppercase transition-colors ${
                                        captionLang === lang
                                            ? 'bg-primary text-white'
                                            : 'text-gray-500'
                                    }`}
                                >
                                    {lang}
                                </button>
                            ))}
                        </div>
                        {(caption.trim() || hashtags.length > 0) && (
                            <Button
                                size="xs"
                                variant="plain"
                                loading={isTranslating}
                                disabled={isTranslating || isGeneratingAi}
                                onClick={handleTranslate}
                                title={`Translate caption + hashtags to ${captionLang.toUpperCase()}`}
                            >
                                {isTranslating ? 'Translating…' : `Translate → ${captionLang.toUpperCase()}`}
                            </Button>
                        )}
                        <Button
                            size="xs"
                            variant="plain"
                            loading={isGeneratingAi}
                            disabled={!media || isGeneratingAi || isTranslating}
                            icon={<HiOutlineSparkles />}
                            onClick={handleGenerateWithAi}
                        >
                            {isGeneratingAi ? 'Generating…' : 'Generate with AI'}
                        </Button>
                    </div>
                </div>
                <Input
                    textArea
                    rows={5}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Write a caption for this post — or let AI write it from the image..."
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
                    <>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {hashtags.map(({ tag, active }) => (
                                <span
                                    key={tag}
                                    onClick={() => toggleHashtag(tag)}
                                    title={active ? 'Click to exclude from the post' : 'Click to include in the post'}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold cursor-pointer select-none transition-colors border ${
                                        active
                                            ? 'bg-primary/15 text-primary border-primary/40'
                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-400 border-transparent opacity-60 line-through'
                                    }`}
                                >
                                    #{tag}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            removeHashtag(tag)
                                        }}
                                        className="ml-1 cursor-pointer"
                                        aria-label={`Remove #${tag}`}
                                    >
                                        <HiOutlineX />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                            {hashtags.filter((h) => h.active).length} of {hashtags.length} selected — click a tag to toggle it
                        </p>
                    </>
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
