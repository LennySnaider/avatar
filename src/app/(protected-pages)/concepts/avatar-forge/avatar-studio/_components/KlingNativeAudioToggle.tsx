'use client'

import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Checkbox from '@/components/ui/Checkbox'
import { HiOutlineVolumeUp } from 'react-icons/hi'

interface KlingNativeAudioToggleProps {
    disabled?: boolean
}

/**
 * Native-audio (`sound`) toggle for Kling 3.0 via KIE. OFF by default — the
 * silent tier is ~19.6% cheaper. Render it gated to the `kling-3.0/video`
 * provider.
 */
const KlingNativeAudioToggle = ({ disabled = false }: KlingNativeAudioToggleProps) => {
    const { klingNativeAudioEnabled, setKlingNativeAudioEnabled } = useAvatarStudioStore()

    return (
        <div className="flex items-center gap-2">
            <HiOutlineVolumeUp className="w-4 h-4 text-cyan-400" />
            <Checkbox
                checked={klingNativeAudioEnabled}
                onChange={(checked) => setKlingNativeAudioEnabled(checked)}
                disabled={disabled}
            >
                <span className="text-sm text-gray-300">Audio nativo (sound)</span>
            </Checkbox>
        </div>
    )
}

export default KlingNativeAudioToggle
