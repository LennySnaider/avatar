'use client'

import { useEffect } from 'react'
import { refreshVoices } from '../_store/voiceStudioStore'
import VoiceLibrary from './VoiceLibrary'
import VoiceClonePanel from './VoiceClonePanel'
import ScriptEditor from './ScriptEditor'
import AudioPreview from './AudioPreview'
import type { Avatar } from '@/@types/supabase'

interface VoiceStudioMainProps {
    userId: string
    avatars: Avatar[]
    /** Hosted-in-ToolModal mode: called instead of navigating when the user
     * sends audio to Avatar Studio's Speak mode. */
    onSentToAvatarStudio?: (avatarId: string | null) => void
}

// userId stays in the props contract (both callers pass it) though the
// component no longer uses it directly since LipsyncPanel moved out.
export default function VoiceStudioMain({ avatars, onSentToAvatarStudio }: VoiceStudioMainProps) {
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
                    <AudioPreview onSentToAvatarStudio={onSentToAvatarStudio} />
                </div>
            </div>
            {/* Lipsync moved to the gallery video preview ("Lipsync" action →
                LipsyncDialog in Avatar Studio) — Voice Studio now lives inside
                the studio, right next to the gallery, so the picker was redundant. */}
        </div>
    )
}
