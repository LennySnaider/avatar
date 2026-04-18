'use client'

import { useEffect, useState } from 'react'
import { HiOutlineMicrophone } from 'react-icons/hi'
import type { ClonedVoice } from '@/@types/voice'

interface VoicePickerFieldProps {
    value: string | undefined
    onChange: (voiceId: string, voiceName: string) => void
}

export default function VoicePickerField({ value, onChange }: VoicePickerFieldProps) {
    const [voices, setVoices] = useState<ClonedVoice[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            try {
                const res = await fetch('/api/voice/list')
                if (!res.ok) {
                    throw new Error(`Failed to load voices (${res.status})`)
                }
                const { voices: list } = (await res.json()) as { voices: ClonedVoice[] }
                if (!cancelled) setVoices(list ?? [])
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Error loading voices')
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        load()
        return () => {
            cancelled = true
        }
    }, [])

    return (
        <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Voice</span>
            {isLoading ? (
                <div className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-500">
                    Loading voices…
                </div>
            ) : error ? (
                <div className="mt-0.5 w-full bg-slate-900 border border-red-900/60 rounded px-2 py-1.5 text-xs text-red-400">
                    {error}
                </div>
            ) : voices.length === 0 ? (
                <div className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-xs text-slate-400 flex items-center gap-2">
                    <HiOutlineMicrophone className="w-4 h-4 text-slate-500" />
                    <span>No voices cloned yet. Create one in Voice Studio.</span>
                </div>
            ) : (
                <select
                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-500"
                    value={value ?? ''}
                    onChange={(e) => {
                        const selected = voices.find((v) => v.provider_voice_id === e.target.value)
                        onChange(e.target.value, selected?.name ?? '')
                    }}
                >
                    <option value="">— Select a voice —</option>
                    {voices.map((v) => (
                        <option key={v.id} value={v.provider_voice_id}>
                            {v.name} ({v.language})
                        </option>
                    ))}
                </select>
            )}
        </div>
    )
}
