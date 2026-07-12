'use client'

import { useEffect, useRef, useState } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    HiOutlinePlay,
    HiOutlinePause,
    HiOutlineExternalLink,
    HiOutlineTrendingUp,
    HiOutlineTrendingDown,
    HiOutlineRefresh,
} from 'react-icons/hi'
import { listTrendingSounds, refreshTrendingBoard } from '@/services/TrendService'
import {
    TREND_COUNTRIES,
    TREND_PERIODS,
    type TrendingSoundDTO,
} from '@/lib/trends/constants'

interface TrendingSoundsClientProps {
    initialSounds: TrendingSoundDTO[]
    initialFetchedAt: string | null
    loadError: string | null
}

interface Option {
    value: string
    label: string
}

const COUNTRY_LABELS: Record<string, string> = {
    GLOBAL: '🌎 Global',
    US: '🇺🇸 United States',
    MX: '🇲🇽 Mexico',
    ES: '🇪🇸 Spain',
    GB: '🇬🇧 United Kingdom',
    BR: '🇧🇷 Brazil',
}
const COUNTRY_OPTIONS: Option[] = TREND_COUNTRIES.map((c) => ({
    value: c,
    label: COUNTRY_LABELS[c] ?? c,
}))
const PERIOD_OPTIONS: Option[] = TREND_PERIODS.map((p) => ({
    value: String(p),
    label: `Last ${p} days`,
}))

function formatCount(n: number | null): string {
    if (n === null) return '—'
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
}

function relativeTime(iso: string | null): string {
    if (!iso) return 'never'
    const diffMs = Date.now() - new Date(iso).getTime()
    const hours = Math.floor(diffMs / 3_600_000)
    if (hours < 1) return 'just now'
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
}

const TrendingSoundsClient = ({
    initialSounds,
    initialFetchedAt,
    loadError,
}: TrendingSoundsClientProps) => {
    const [country, setCountry] = useState('GLOBAL')
    const [period, setPeriod] = useState(7)
    const [sounds, setSounds] = useState<TrendingSoundDTO[]>(initialSounds)
    const [fetchedAt, setFetchedAt] = useState<string | null>(initialFetchedAt)
    const [error, setError] = useState<string | null>(loadError)
    const [isLoading, setIsLoading] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [playingId, setPlayingId] = useState<string | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const isFirstRender = useRef(true)

    const loadBoard = async (nextCountry: string, nextPeriod: number) => {
        setIsLoading(true)
        setError(null)
        try {
            const result = await listTrendingSounds({ countryCode: nextCountry, period: nextPeriod })
            if (result.success) {
                setSounds(result.data?.sounds ?? [])
                setFetchedAt(result.data?.fetchedAt ?? null)
            } else {
                setError(result.error ?? 'Failed to load sounds')
                setSounds([])
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load sounds')
            setSounds([])
        } finally {
            setIsLoading(false)
        }
    }

    // Reload when the board selector changes (skip the initial SSR-provided board).
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false
            return
        }
        loadBoard(country, period)
    }, [country, period])

    const handleRefresh = async () => {
        setIsRefreshing(true)
        setError(null)
        try {
            const result = await refreshTrendingBoard({ countryCode: country, period })
            if (result.success) {
                toast.push(
                    <Notification type="success" title="Chart refreshed">
                        Pulled {result.data?.count ?? 0} sounds from TikTok
                    </Notification>,
                )
                await loadBoard(country, period)
            } else {
                setError(result.error ?? 'Refresh failed')
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Refresh failed')
        } finally {
            setIsRefreshing(false)
        }
    }

    const togglePlay = (sound: TrendingSoundDTO) => {
        if (!sound.playUrl) return
        if (playingId === sound.id) {
            audioRef.current?.pause()
            setPlayingId(null)
            return
        }
        if (audioRef.current) {
            audioRef.current.pause()
        }
        // Stream through our same-origin proxy — TikTok's CDN URL is signed,
        // expiring and CORS-blocked, so a direct <audio> src just fails silently.
        const audio = new Audio(`/api/trends/sound-audio?id=${encodeURIComponent(sound.id)}`)
        audio.onended = () => setPlayingId(null)
        audio.onerror = () => {
            setPlayingId(null)
            toast.push(
                <Notification type="warning" title="Couldn't play">
                    This sound&apos;s audio isn&apos;t available anymore — open it on TikTok.
                </Notification>,
            )
        }
        audioRef.current = audio
        void audio.play().catch(() => setPlayingId(null))
        setPlayingId(sound.id)
    }

    useEffect(() => {
        return () => audioRef.current?.pause()
    }, [])

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <div className="w-44">
                    <Select<Option>
                        instanceId="trend-country"
                        options={COUNTRY_OPTIONS}
                        value={COUNTRY_OPTIONS.find((o) => o.value === country) ?? null}
                        onChange={(opt) => opt && setCountry(opt.value)}
                    />
                </div>
                <div className="w-36">
                    <Select<Option>
                        instanceId="trend-period"
                        options={PERIOD_OPTIONS}
                        value={PERIOD_OPTIONS.find((o) => o.value === String(period)) ?? null}
                        onChange={(opt) => opt && setPeriod(Number(opt.value))}
                    />
                </div>
                <Button
                    size="sm"
                    icon={<HiOutlineRefresh />}
                    loading={isRefreshing}
                    onClick={handleRefresh}
                >
                    Refresh
                </Button>
                <span className="text-xs text-gray-400 ml-auto">
                    {isRefreshing
                        ? 'Scraping TikTok… this can take 1–2 min'
                        : `Updated ${relativeTime(fetchedAt)}`}
                </span>
            </div>

            {error && (
                <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {isLoading ? (
                <Card>
                    <p className="text-sm text-gray-500">Loading chart…</p>
                </Card>
            ) : sounds.length === 0 ? (
                <Card>
                    <p className="text-sm text-gray-500 mb-3">
                        This chart is empty. Hit <span className="font-semibold">Refresh</span> to
                        pull the latest viral sounds from TikTok.
                    </p>
                    <p className="text-xs text-gray-400">
                        Requires <code>APIFY_TOKEN</code> in the environment — the daily cron keeps
                        the Global chart warm automatically once it&apos;s set.
                    </p>
                </Card>
            ) : (
                <div className="flex flex-col gap-2">
                    {sounds.map((sound) => (
                        <Card key={sound.id} className="p-3!">
                            <div className="flex items-center gap-3">
                                <div className="w-8 text-center text-sm font-bold text-gray-400 shrink-0">
                                    {sound.rank}
                                </div>

                                <div className="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                                    {sound.coverUrl ? (
                                        <img
                                            src={sound.coverUrl}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : null}
                                    {sound.playUrl && (
                                        <button
                                            type="button"
                                            onClick={() => togglePlay(sound)}
                                            className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white transition-colors"
                                            aria-label={playingId === sound.id ? 'Pause' : 'Play'}
                                        >
                                            {playingId === sound.id ? (
                                                <HiOutlinePause className="text-xl" />
                                            ) : (
                                                <HiOutlinePlay className="text-xl" />
                                            )}
                                        </button>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold truncate">{sound.name}</p>
                                        {sound.trend === 'rising' && (
                                            <HiOutlineTrendingUp className="text-emerald-500 shrink-0" />
                                        )}
                                        {sound.trend === 'falling' && (
                                            <HiOutlineTrendingDown className="text-red-500 shrink-0" />
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 truncate">
                                        {sound.author ?? 'Unknown artist'}
                                        {sound.isOriginal ? ' · original' : ''}
                                    </p>
                                </div>

                                {sound.videoCount && sound.videoCount > 0 ? (
                                    <Tag className="shrink-0 hidden sm:inline-flex">
                                        {formatCount(sound.videoCount)} videos
                                    </Tag>
                                ) : null}

                                {sound.linkUrl && (
                                    <a href={sound.linkUrl} target="_blank" rel="noopener noreferrer">
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            icon={<HiOutlineExternalLink />}
                                            title="Open the sound on TikTok"
                                        />
                                    </a>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <p className="text-xs text-gray-400">
                Heads up: TikTok and Instagram only let you attach an official trending sound from
                inside their app (licensing). Publish your video to drafts, then add the sound
                there — this chart is your shortlist.
            </p>
        </div>
    )
}

export default TrendingSoundsClient
