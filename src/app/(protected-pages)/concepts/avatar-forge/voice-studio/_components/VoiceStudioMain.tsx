'use client'

import { useEffect } from 'react'
import { refreshVoices } from '../_store/voiceStudioStore'
import VoiceLibrary from './VoiceLibrary'
import VoiceClonePanel from './VoiceClonePanel'
import ScriptEditor from './ScriptEditor'
import AudioPreview from './AudioPreview'
import LipsyncPanel from './LipsyncPanel'
import type { Avatar } from '@/@types/supabase'

interface VoiceStudioMainProps {
    userId: string
    avatars: Avatar[]
}

export default function VoiceStudioMain({ userId, avatars }: VoiceStudioMainProps) {
    useEffect(() => {
        // Fuente de verdad viva: voces + mapeo avatar↔voz-default.
        refreshVoices()
    }, [])

    return (
        <div className="flex flex-col gap-6 p-4">
            <h1 className="text-2xl font-bold">Voice & Script Studio</h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left column: Voice management */}
                <div className="flex flex-col gap-4">
                    <VoiceClonePanel avatars={avatars} />
                    <VoiceLibrary avatars={avatars} />
                </div>

                {/* Center column: Script editor */}
                <div className="flex flex-col gap-4">
                    <ScriptEditor />
                </div>

                {/* Right column: Preview */}
                <div className="flex flex-col gap-4">
                    <AudioPreview />
                </div>
            </div>

            {/* Full-width row: lipsync picks from the whole gallery */}
            <LipsyncPanel userId={userId} />
        </div>
    )
}
