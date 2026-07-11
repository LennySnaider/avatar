'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Dialog from '@/components/ui/Dialog'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import Radio from '@/components/ui/Radio'
import DatePicker from '@/components/ui/DatePicker'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { HiOutlineX, HiOutlineSparkles, HiOutlineMusicNote, HiOutlinePlus } from 'react-icons/hi'
import { createSocialPost, getSocialProfileAction } from '@/services/SocialService'
import { createFanvuePost, getFanvueConnection } from '@/services/FanvueService'
import {
    apiGetAvatarById,
    apiCreateGenerationUploadUrl,
    apiSaveGeneration,
} from '@/services/AvatarForgeService'
import { generateSocialCaption, translateSocialCaption } from '@/services/GeminiService'
import { muxAudioIntoVideo } from '@/services/AudioMuxService'
import { listTrendingSounds } from '@/services/TrendService'
import type { TrendingSoundDTO } from '@/lib/trends/constants'
import { normalizeHashtag } from '@/lib/social/hashtagHelpers'
import { supabase } from '@/lib/supabase'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import type { FanvuePostAudience } from '@/lib/fanvue/types'
import type { GeneratedMedia } from '../types'

type AudioMode = 'none' | 'trending' | 'upload'

const { DateTimepicker } = DatePicker

interface PostModalProps {
    media: GeneratedMedia | null
    /** Studio's currently loaded avatar — fallback owner for media that
     * predates avatar linking (`media.avatarId` null/undefined). */
    fallbackAvatarId: string | null
    /** Needed to upload the audio-muxed video via a signed URL. */
    userId?: string
    onClose: () => void
}

type ScheduleMode = 'now' | 'schedule'

/** Connected platforms come back either as bare strings or `{ platform }` objects. */
function normalizePlatformKey(p: unknown): string {
    if (typeof p === 'string') return p
    return (p as { platform?: string })?.platform ?? ''
}

interface PublishOutcome {
    label: string
    ok: boolean
    error?: string
}

/**
 * Unified Post modal — publishes a persisted `GeneratedMedia` (by its
 * `generationId`) to the owning avatar's connected Upload-Post platforms
 * and/or Fanvue in one shot. Each avatar has its own Upload-Post account,
 * so the platform list is the resolved avatar's, not global. Adapted from
 * `SocialComposer`; renders nothing when `media` is null.
 */
const PostModal = ({ media, fallbackAvatarId, userId, onClose }: PostModalProps) => {
    const updateGalleryItem = useAvatarStudioStore((s) => s.updateGalleryItem)
    const gallery = useAvatarStudioStore((s) => s.gallery)
    // Extra media (besides the opened one) for a multi-image carousel post, plus
    // the picker that adds them.
    const [extraMedia, setExtraMedia] = useState<GeneratedMedia[]>([])
    const [isPickerOpen, setIsPickerOpen] = useState(false)
    // Caption starts empty — the generation PROMPT is harness text, never a
    // caption; "Generate with AI" writes a real one from the media.
    const [caption, setCaption] = useState('')
    const [hashtagInput, setHashtagInput] = useState('')
    const [hashtags, setHashtags] = useState<{ tag: string; active: boolean }[]>([])
    const [captionLang, setCaptionLang] = useState<'en' | 'es'>('en')
    const [isTranslating, setIsTranslating] = useState(false)
    const [isGeneratingAi, setIsGeneratingAi] = useState(false)

    // Destinations
    const [platforms, setPlatforms] = useState<string[]>([])
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
    const [hasSocialAccount, setHasSocialAccount] = useState(false)
    const [fanvueConnected, setFanvueConnected] = useState(false)
    // The Fanvue creator THIS avatar maps to (agency mode). Null when the avatar
    // isn't linked to a creator — Fanvue is then off for it (unless self mode).
    const [fanvueCreatorUuid, setFanvueCreatorUuid] = useState<string | null>(null)
    const [isAgencyConnection, setIsAgencyConnection] = useState(false)
    const [fanvueSelected, setFanvueSelected] = useState(false)
    const [audience, setAudience] = useState<FanvuePostAudience>('subscribers')
    const [enablePrice, setEnablePrice] = useState(false)
    const [priceCents, setPriceCents] = useState('')

    const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('now')
    const [scheduleDate, setScheduleDate] = useState<Date | null>(null)

    // Audio (video only) — baked into the video before publishing, since
    // official trending sounds can't be attached via API.
    const [audioMode, setAudioMode] = useState<AudioMode>('none')
    const [trendingSounds, setTrendingSounds] = useState<TrendingSoundDTO[] | null>(null)
    const [selectedSound, setSelectedSound] = useState<TrendingSoundDTO | null>(null)
    const [uploadedAudio, setUploadedAudio] = useState<File | null>(null)
    const [keepOriginalSound, setKeepOriginalSound] = useState(false)
    const [muxProgress, setMuxProgress] = useState<number | null>(null)

    const [isLoadingDestinations, setIsLoadingDestinations] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Which avatar's Upload-Post account this post goes out through: the
    // media's own avatar (generations.avatar_id) wins; the studio's current
    // avatar covers avatar-less auto-saves. Null → social publishing is off.
    const effectiveAvatarId = media?.avatarId ?? fallbackAvatarId ?? null
    // Persisted gallery items carry no avatarInfo — resolve the owner's name
    // so the hints can say WHICH avatar the media belongs to.
    const [ownerName, setOwnerName] = useState<string | null>(null)
    const avatarName = media?.avatarInfo?.name ?? ownerName

    // Reset composer state + load destinations whenever a new media opens.
    useEffect(() => {
        if (!media) return
        setCaption('')
        setExtraMedia([])
        setIsPickerOpen(false)
        setHashtagInput('')
        setHashtags([])
        setCaptionLang('en')
        setSelectedPlatforms([])
        setFanvueSelected(false)
        setFanvueCreatorUuid(null)
        setIsAgencyConnection(false)
        setAudience('subscribers')
        setEnablePrice(false)
        setPriceCents('')
        setScheduleMode('now')
        setScheduleDate(null)
        setAudioMode('none')
        setSelectedSound(null)
        setUploadedAudio(null)
        setKeepOriginalSound(false)
        setMuxProgress(null)
        setError(null)

        let cancelled = false
        setIsLoadingDestinations(true)
        setOwnerName(null)
        const socialPromise = effectiveAvatarId
            ? getSocialProfileAction(effectiveAvatarId)
            : Promise.resolve({ success: true as const, data: null })
        // The avatar row carries its Fanvue creator mapping + gives us the name.
        const avatarPromise = effectiveAvatarId
            ? apiGetAvatarById(effectiveAvatarId).catch(() => null)
            : Promise.resolve(null)
        Promise.all([socialPromise, getFanvueConnection(), avatarPromise])
            .then(([profileResult, fanvueResult, avatar]) => {
                if (cancelled) return
                const profile = profileResult.success ? profileResult.data : null
                const accountActive = !!profile && profile.status === 'active'
                setHasSocialAccount(accountActive)
                const connectedPlatforms = accountActive
                    ? (profile.connectedPlatforms ?? [])
                          .map(normalizePlatformKey)
                          .filter((p): p is string => Boolean(p))
                    : []
                setPlatforms(connectedPlatforms)
                setSelectedPlatforms(connectedPlatforms)

                // Owner name (only when the media didn't already carry it).
                if (avatar && !media.avatarInfo?.name) setOwnerName(avatar.name ?? null)

                // Fanvue availability is PER-AVATAR: agency connections post through
                // the avatar's mapped creator, so an unmapped avatar (like a fresh
                // Ana) has no Fanvue destination and must not show the checkbox.
                const fanvueConn = fanvueResult.success ? fanvueResult.data : null
                setFanvueConnected(!!fanvueConn?.connected)
                setIsAgencyConnection(!!fanvueConn?.scopes?.includes('read:agency'))
                setFanvueCreatorUuid(avatar?.fanvue_creator_uuid ?? null)
            })
            .finally(() => {
                if (!cancelled) setIsLoadingDestinations(false)
            })
        return () => {
            cancelled = true
        }
    }, [media, effectiveAvatarId])

    // Display can use the local blob:/data: url, but anything the SERVER must
    // fetch (AI caption) needs the durable public Storage URL — undici can't
    // fetch browser-only blob URLs ("TypeError: fetch failed / invalid method").
    const mediaUrl = media?.url ?? ''
    const serverMediaUrl = media?.publicUrl ?? mediaUrl
    const mediaType = media?.mediaType ?? 'IMAGE'

    const mergeHashtags = (incoming: string[]) => {
        const normalized = incoming
            .map((h) => normalizeHashtag(h))
            .filter((h): h is string => Boolean(h))
        setHashtags((prev) => {
            const existing = new Set(prev.map((h) => h.tag))
            return [
                ...prev,
                ...normalized
                    .filter((t) => !existing.has(t))
                    .map((tag) => ({ tag, active: true })),
            ]
        })
    }

    const handleGenerateWithAi = async () => {
        if (!media) return
        setIsGeneratingAi(true)
        setError(null)
        try {
            const result = await generateSocialCaption({
                mediaUrl: serverMediaUrl,
                mediaType,
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
            const translated = (result.hashtags ?? [])
                .map((h) => normalizeHashtag(h))
                .filter((h): h is string => Boolean(h))
            setHashtags(
                Array.from(new Set(translated)).map((tag) => ({ tag, active: true })),
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setIsTranslating(false)
        }
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

    const handleHashtagKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            addHashtag()
        }
    }

    const toggleHashtag = (tag: string) => {
        setHashtags((prev) =>
            prev.map((h) => (h.tag === tag ? { ...h, active: !h.active } : h)),
        )
    }

    const removeHashtag = (tag: string) => {
        setHashtags((prev) => prev.filter((h) => h.tag !== tag))
    }

    const togglePlatform = (platform: string, checked: boolean) => {
        setSelectedPlatforms((prev) =>
            checked ? [...prev, platform] : prev.filter((p) => p !== platform),
        )
    }

    // Fanvue is a valid destination for THIS avatar only when connected AND
    // either the avatar maps to a managed creator (agency) or the connection is
    // a personal/self account (no agency scope → posts to the own account).
    const fanvueAvailable = fanvueConnected && (!!fanvueCreatorUuid || !isAgencyConnection)
    const hasDestinations = platforms.length > 0 || fanvueAvailable
    const isVideo = mediaType === 'VIDEO'

    // Multi-media (carousel). Images only — the social backend rejects videos in
    // a carousel — so extras are limited to other SAVED images of this avatar.
    const MAX_MEDIA = 10
    const postMediaItems = media ? [media, ...extraMedia] : []
    const canAddMedia = !!media && !isVideo && postMediaItems.length < MAX_MEDIA
    const pickerCandidates = gallery.filter(
        (g) =>
            g.mediaType === 'IMAGE' &&
            g.saveState === 'saved' &&
            !!g.generationId &&
            g.id !== media?.id &&
            !extraMedia.some((e) => e.id === g.id) &&
            // Same avatar (or avatar-less) — social won't post another avatar's media.
            (!effectiveAvatarId || !g.avatarId || g.avatarId === effectiveAvatarId),
    )
    const addExtra = (item: GeneratedMedia) => {
        setExtraMedia((prev) =>
            prev.some((e) => e.id === item.id) || prev.length >= MAX_MEDIA - 1
                ? prev
                : [...prev, item],
        )
    }
    const removeExtra = (id: string) => setExtraMedia((prev) => prev.filter((e) => e.id !== id))

    const loadTrendingSounds = async () => {
        if (trendingSounds !== null) return
        const result = await listTrendingSounds({ countryCode: 'GLOBAL', period: 7 })
        setTrendingSounds(result.success ? (result.data?.sounds ?? []) : [])
    }

    /**
     * When an audio track is chosen for a video, bake it in (ffmpeg WASM),
     * upload the muxed result via a signed URL (never through a server action —
     * anti-413), persist it as a new generation and return its id. Otherwise
     * returns the original generationId. Runs ONCE per publish and the result
     * is reused across every destination.
     */
    const resolvePostGenerationId = async (originalGenerationId: string): Promise<string> => {
        if (audioMode === 'none' || !isVideo) return originalGenerationId
        if (!userId) throw new Error('Cannot process audio — missing user context')

        const audioUrl =
            audioMode === 'trending'
                ? selectedSound
                    ? `/api/trends/sound-audio?id=${encodeURIComponent(selectedSound.id)}`
                    : null
                : uploadedAudio
                  ? URL.createObjectURL(uploadedAudio)
                  : null
        if (!audioUrl) throw new Error('Pick a sound or upload an audio file first')

        const sourceVideoUrl = serverMediaUrl || mediaUrl
        setMuxProgress(0)
        try {
            const muxedBlobUrl = await muxAudioIntoVideo(sourceVideoUrl, audioUrl, {
                keepOriginalVolume: keepOriginalSound ? 0.15 : 0,
                onProgress: setMuxProgress,
            })
            // Upload the muxed mp4 straight to Storage (browser → signed URL).
            const blob = await (await fetch(muxedBlobUrl)).blob()
            const { path, token } = await apiCreateGenerationUploadUrl(userId, 'VIDEO')
            const { error: upErr } = await supabase.storage
                .from('generations')
                .uploadToSignedUrl(path, token, blob, { contentType: 'video/mp4' })
            if (upErr) throw new Error(upErr.message)

            const row = await apiSaveGeneration({
                user_id: userId,
                avatar_id: effectiveAvatarId,
                media_type: 'VIDEO',
                storage_path: path,
                prompt: media?.prompt ?? '',
                aspect_ratio: media?.aspectRatio,
                metadata: {
                    muxedFrom: originalGenerationId,
                    audioSource: audioMode,
                    audioName:
                        audioMode === 'trending'
                            ? (selectedSound?.name ?? null)
                            : (uploadedAudio?.name ?? null),
                } as never,
            })
            URL.revokeObjectURL(muxedBlobUrl)
            return row.id
        } finally {
            setMuxProgress(null)
        }
    }

    const handleSubmit = async () => {
        setError(null)
        if (!media?.generationId) {
            setError('This media has not been saved yet — try again in a moment')
            return
        }
        if (selectedPlatforms.length === 0 && !fanvueSelected) {
            setError('Pick at least one destination')
            return
        }
        if (selectedPlatforms.length > 0 && !effectiveAvatarId) {
            setError(
                "This media isn't linked to an avatar — deselect the social platforms or open it from that avatar's studio",
            )
            return
        }

        // When
        let scheduledAt: string | null = null
        if (scheduleMode === 'schedule') {
            if (!scheduleDate || scheduleDate.getTime() <= Date.now()) {
                setError('Pick a future date and time to schedule this post')
                return
            }
            scheduledAt = scheduleDate.toISOString()
        }

        // Fanvue price (integer cents, min 300)
        let price: number | undefined
        if (fanvueSelected && enablePrice) {
            const parsed = Number(priceCents)
            if (!Number.isInteger(parsed) || parsed < 300) {
                setError('Price must be a whole number of at least 300 cents')
                return
            }
            price = parsed
        }

        // Audio selection guard (video only)
        if (isVideo && audioMode === 'trending' && !selectedSound) {
            setError('Pick a trending sound, or switch audio to "No audio"')
            return
        }
        if (isVideo && audioMode === 'upload' && !uploadedAudio) {
            setError('Upload an audio file, or switch audio to "No audio"')
            return
        }

        const activeHashtags = hashtags.filter((h) => h.active).map((h) => h.tag)

        setIsSubmitting(true)
        try {
            // Bake in audio once (if any), then publish the resulting video to
            // every destination.
            let generationId: string
            try {
                generationId = await resolvePostGenerationId(media.generationId)
            } catch (audioErr) {
                setError(
                    audioErr instanceof Error
                        ? `Audio processing failed: ${audioErr.message}`
                        : 'Audio processing failed',
                )
                setIsSubmitting(false)
                return
            }

            // Additional carousel media (images only, already saved).
            const extraGenerationIds = extraMedia
                .map((m) => m.generationId)
                .filter((id): id is string => Boolean(id))

            const tasks: Promise<PublishOutcome>[] = []

            if (selectedPlatforms.length > 0 && effectiveAvatarId) {
                tasks.push(
                    createSocialPost({
                        avatarId: effectiveAvatarId,
                        generationId,
                        generationIds: extraGenerationIds,
                        caption,
                        hashtags: activeHashtags,
                        platforms: selectedPlatforms,
                        scheduledAt,
                    }).then((r) => ({
                        label: selectedPlatforms
                            .map((p) => p[0].toUpperCase() + p.slice(1))
                            .join(', '),
                        ok: r.success,
                        error: r.error,
                    })),
                )
            }

            if (fanvueSelected) {
                tasks.push(
                    createFanvuePost({
                        generationId,
                        generationIds: extraGenerationIds,
                        caption,
                        audience,
                        price,
                        publishAt: scheduledAt,
                        // Route to the avatar's mapped creator (agency); undefined
                        // → self account for personal connections.
                        creatorUserUuid: fanvueCreatorUuid ?? undefined,
                    }).then((r) => ({
                        label: 'Fanvue',
                        ok: r.success,
                        error: r.error,
                    })),
                )
            }

            const outcomes = await Promise.all(tasks)
            const succeeded = outcomes.filter((o) => o.ok)
            const failed = outcomes.filter((o) => !o.ok)

            // Reflect the "Posted" badge on the gallery card right away.
            const newlyPosted: string[] = []
            if (outcomes.some((o) => o.ok && o.label !== 'Fanvue')) {
                newlyPosted.push(...selectedPlatforms)
            }
            if (outcomes.some((o) => o.ok && o.label === 'Fanvue')) {
                newlyPosted.push('fanvue')
            }
            if (newlyPosted.length > 0) {
                updateGalleryItem(media.id, {
                    postedPlatforms: Array.from(
                        new Set([...(media.postedPlatforms ?? []), ...newlyPosted]),
                    ),
                })
            }

            toast.push(
                <Notification
                    type={failed.length === 0 ? 'success' : succeeded.length === 0 ? 'danger' : 'warning'}
                    title={
                        failed.length === 0
                            ? scheduledAt
                                ? 'Post scheduled'
                                : 'Post published'
                            : succeeded.length === 0
                              ? 'Publishing failed'
                              : 'Published with errors'
                    }
                >
                    <div className="flex flex-col gap-1 text-sm">
                        {succeeded.map((o) => (
                            <span key={o.label}>
                                ✓ {o.label} — {scheduledAt ? 'scheduled' : 'sent'}
                            </span>
                        ))}
                        {failed.map((o) => (
                            <span key={o.label} className="text-red-500">
                                ✗ {o.label} — {o.error ?? 'failed'}
                            </span>
                        ))}
                    </div>
                </Notification>,
            )

            if (failed.length === 0) {
                onClose()
            } else if (succeeded.length === 0) {
                setError(failed.map((o) => `${o.label}: ${o.error ?? 'failed'}`).join(' · '))
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!media) return null

    return (
        <Dialog
            isOpen={!!media}
            onClose={onClose}
            width={720}
            className="bg-white! dark:bg-gray-900!"
        >
            <h5 className="mb-1">New post</h5>
            <p className="text-sm text-gray-500 mb-4">
                Publish or schedule this generation to your connected accounts
            </p>

            <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
                {error && (
                    <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                    </div>
                )}

                <Card>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold">
                            Media{postMediaItems.length > 1 ? ` (${postMediaItems.length})` : ''}
                        </p>
                        {isVideo && (
                            <span className="text-xs text-gray-400">Videos post individually</span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {postMediaItems.map((item, idx) => (
                            <div
                                key={item.id}
                                className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                            >
                                {item.mediaType === 'VIDEO' ? (
                                    <video src={item.url} className="w-full h-full object-cover" />
                                ) : (
                                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                                )}
                                {idx === 0 && postMediaItems.length > 1 && (
                                    <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-black/70 text-white">
                                        Cover
                                    </span>
                                )}
                                {idx > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => removeExtra(item.id)}
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                                        aria-label="Remove from post"
                                    >
                                        <HiOutlineX className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        ))}
                        {canAddMedia && (
                            <button
                                type="button"
                                onClick={() => setIsPickerOpen(true)}
                                title="Add more images (carousel)"
                                className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center text-gray-400 hover:border-primary hover:text-primary transition-colors"
                            >
                                <HiOutlinePlus className="w-6 h-6" />
                                <span className="text-[10px] mt-1">Add</span>
                            </button>
                        )}
                    </div>
                    {media.saveState !== 'saved' && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                            Media is still saving — publishing may fail until it finishes.
                        </p>
                    )}
                    {postMediaItems.length > 1 && (
                        <p className="text-xs text-gray-400 mt-2">
                            Posts as a carousel — the cover shows first. Up to {MAX_MEDIA} images.
                        </p>
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
                                    {isTranslating
                                        ? 'Translating…'
                                        : `Translate → ${captionLang.toUpperCase()}`}
                                </Button>
                            )}
                            <Button
                                size="xs"
                                variant="plain"
                                loading={isGeneratingAi}
                                disabled={isGeneratingAi || isTranslating}
                                icon={<HiOutlineSparkles />}
                                onClick={handleGenerateWithAi}
                            >
                                {isGeneratingAi ? 'Generating…' : 'Generate with AI'}
                            </Button>
                        </div>
                    </div>
                    <Input
                        textArea
                        rows={4}
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
                                        title={
                                            active
                                                ? 'Click to exclude from the post'
                                                : 'Click to include in the post'
                                        }
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
                                {hashtags.filter((h) => h.active).length} of{' '}
                                {hashtags.length} selected — click a tag to toggle it
                            </p>
                        </>
                    )}
                </Card>

                <Card>
                    <div className="flex items-center justify-between mb-2 gap-2">
                        <p className="text-sm font-semibold">Destinations</p>
                        {effectiveAvatarId && avatarName && (
                            <p className="text-xs text-gray-400">
                                Posting as <span className="font-semibold">{avatarName}</span>
                            </p>
                        )}
                    </div>
                    {isLoadingDestinations ? (
                        <p className="text-sm text-gray-500">Loading connected accounts…</p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {!effectiveAvatarId ? (
                                <p className="text-sm text-amber-600 dark:text-amber-400">
                                    This media isn&apos;t linked to an avatar — social
                                    publishing is unavailable for it.
                                </p>
                            ) : !hasSocialAccount ? (
                                <p className="text-sm text-amber-600 dark:text-amber-400">
                                    {avatarName ?? 'This avatar'} has no Upload-Post account
                                    yet —{' '}
                                    <Link
                                        href="/concepts/avatar-forge/social/accounts"
                                        className="underline font-semibold"
                                    >
                                        connect one
                                    </Link>
                                    .
                                </p>
                            ) : platforms.length > 0 ? (
                                <div className="flex flex-wrap gap-4">
                                    {platforms.map((platform) => (
                                        <Checkbox
                                            key={platform}
                                            checked={selectedPlatforms.includes(platform)}
                                            onChange={(checked) =>
                                                togglePlatform(platform, checked)
                                            }
                                        >
                                            <span className="capitalize">{platform}</span>
                                        </Checkbox>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-amber-600 dark:text-amber-400">
                                    No socials linked to this avatar&apos;s account yet —{' '}
                                    <Link
                                        href="/concepts/avatar-forge/social/accounts"
                                        className="underline font-semibold"
                                    >
                                        link accounts
                                    </Link>
                                    .
                                </p>
                            )}
                            {fanvueAvailable ? (
                                <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
                                    <Checkbox
                                        checked={fanvueSelected}
                                        onChange={(checked) => setFanvueSelected(checked)}
                                    >
                                        Fanvue
                                    </Checkbox>
                                </div>
                            ) : fanvueConnected && isAgencyConnection && effectiveAvatarId ? (
                                <p className="pt-1 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400">
                                    {avatarName ?? 'This avatar'} isn&apos;t linked to a Fanvue
                                    creator —{' '}
                                    <Link
                                        href={`/concepts/avatar-forge/agent/${effectiveAvatarId}`}
                                        className="underline font-semibold"
                                    >
                                        map one
                                    </Link>{' '}
                                    to post here.
                                </p>
                            ) : null}
                            {!fanvueAvailable && !fanvueConnected && platforms.length === 0 && (
                                <p className="text-xs text-gray-400">
                                    No destinations available for this media yet.
                                </p>
                            )}
                        </div>
                    )}
                </Card>

                {fanvueSelected && (
                    <Card>
                        <p className="text-sm font-semibold mb-2">Fanvue options</p>
                        <div className="mb-3">
                            <p className="text-xs text-gray-500 mb-1">Audience</p>
                            <Radio.Group
                                value={audience}
                                onChange={(val) => setAudience(val as FanvuePostAudience)}
                            >
                                <Radio value="subscribers">Subscribers</Radio>
                                <Radio value="followers-and-subscribers">
                                    Followers &amp; subscribers
                                </Radio>
                            </Radio.Group>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">Price (pay-per-view)</p>
                            <Radio.Group
                                value={enablePrice ? 'paid' : 'free'}
                                onChange={(value) => setEnablePrice(value === 'paid')}
                            >
                                <Radio value="free">Free</Radio>
                                <Radio value="paid">Paid</Radio>
                            </Radio.Group>
                            {enablePrice && (
                                <div className="mt-2 max-w-xs">
                                    <Input
                                        type="number"
                                        value={priceCents}
                                        onChange={(e) => setPriceCents(e.target.value)}
                                        placeholder="Price in cents (min 300)"
                                    />
                                    <p className="text-xs text-gray-400 mt-1">
                                        Minimum 300 cents. Requires attached media.
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                )}

                {isVideo && (
                    <Card>
                        <div className="flex items-center gap-2 mb-2">
                            <HiOutlineMusicNote className="text-primary" />
                            <p className="text-sm font-semibold">Audio</p>
                        </div>
                        <Radio.Group
                            value={audioMode}
                            onChange={(value) => {
                                const mode = value as AudioMode
                                setAudioMode(mode)
                                if (mode === 'trending') void loadTrendingSounds()
                            }}
                        >
                            <Radio value="none">No audio</Radio>
                            <Radio value="trending">Trending sound</Radio>
                            <Radio value="upload">Upload audio</Radio>
                        </Radio.Group>

                        {audioMode === 'trending' && (
                            <div className="mt-3">
                                {trendingSounds === null ? (
                                    <p className="text-sm text-gray-500">Loading chart…</p>
                                ) : trendingSounds.length === 0 ? (
                                    <p className="text-sm text-amber-600 dark:text-amber-400">
                                        No sounds cached yet — open{' '}
                                        <Link
                                            href="/concepts/avatar-forge/trending-sounds"
                                            className="underline font-semibold"
                                        >
                                            Trending Sounds
                                        </Link>{' '}
                                        and hit Refresh first.
                                    </p>
                                ) : (
                                    <div className="max-h-48 overflow-y-auto flex flex-col gap-1 pr-1">
                                        {trendingSounds.map((sound) => (
                                            <button
                                                key={sound.id}
                                                type="button"
                                                onClick={() => setSelectedSound(sound)}
                                                className={`flex items-center gap-2 p-2 rounded-lg text-left transition-colors border ${
                                                    selectedSound?.id === sound.id
                                                        ? 'bg-primary/15 border-primary/40'
                                                        : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                                                }`}
                                            >
                                                <span className="text-xs font-bold text-gray-400 w-5 shrink-0">
                                                    {sound.rank}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-sm font-medium truncate">
                                                        {sound.name}
                                                    </span>
                                                    <span className="block text-xs text-gray-400 truncate">
                                                        {sound.author ?? 'Unknown'}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {audioMode === 'upload' && (
                            <div className="mt-3">
                                <input
                                    type="file"
                                    accept="audio/*"
                                    onChange={(e) => setUploadedAudio(e.target.files?.[0] ?? null)}
                                    className="text-sm"
                                />
                                {uploadedAudio && (
                                    <p className="text-xs text-gray-400 mt-1">
                                        {uploadedAudio.name}
                                    </p>
                                )}
                            </div>
                        )}

                        {audioMode !== 'none' && (
                            <>
                                <div className="mt-3">
                                    <Checkbox
                                        checked={keepOriginalSound}
                                        onChange={(checked) => setKeepOriginalSound(checked)}
                                    >
                                        <span className="text-sm">Keep original video sound (mixed low)</span>
                                    </Checkbox>
                                </div>
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                    The track is baked into the video (the only way to auto-post with
                                    sound). Platforms may mute copyrighted music — use your own audio
                                    for guaranteed reach.
                                </p>
                            </>
                        )}
                    </Card>
                )}

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
            </div>

            <div className="flex items-center justify-end gap-3 mt-4">
                {muxProgress !== null && (
                    <span className="text-xs text-gray-500 mr-auto">
                        Baking audio into video… {muxProgress}%
                    </span>
                )}
                <Button variant="plain" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button
                    variant="solid"
                    loading={isSubmitting}
                    disabled={!hasDestinations || isLoadingDestinations}
                    onClick={handleSubmit}
                >
                    {scheduleMode === 'schedule' ? 'Schedule post' : 'Publish now'}
                </Button>
            </div>

            {/* Media picker — pick more saved images for the carousel. */}
            <Dialog
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                width={640}
                className="bg-white! dark:bg-gray-900!"
            >
                <h5 className="mb-1">Add media</h5>
                <p className="text-sm text-gray-500 mb-4">
                    Pick saved images from{' '}
                    <span className="font-semibold">{avatarName ?? 'this avatar'}</span> to add to
                    the carousel.
                </p>
                {pickerCandidates.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        No other saved images available for this avatar. Save more images to the
                        gallery first.
                    </p>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto pr-1">
                        {pickerCandidates.map((g) => (
                            <button
                                key={g.id}
                                type="button"
                                onClick={() => addExtra(g)}
                                className="relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-colors"
                                title="Add to carousel"
                            >
                                <img src={g.url} alt="" className="w-full h-full object-cover" />
                                <span className="absolute inset-0 bg-black/0 hover:bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                    <HiOutlinePlus className="w-6 h-6 text-white" />
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex justify-end mt-4">
                    <Button variant="solid" onClick={() => setIsPickerOpen(false)}>
                        Done
                    </Button>
                </div>
            </Dialog>
        </Dialog>
    )
}

export default PostModal
