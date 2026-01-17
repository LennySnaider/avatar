'use client'

import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Input from '@/components/ui/Input'
import Checkbox from '@/components/ui/Checkbox'
import Card from '@/components/ui/Card'
import { KLING_VOICE_PRESETS } from '@/@types/kling'
import { HiOutlineMicrophone, HiOutlineVolumeUp } from 'react-icons/hi'

interface KlingVoiceControlsProps {
    disabled?: boolean
}

const KlingVoiceControls = ({ disabled = false }: KlingVoiceControlsProps) => {
    const {
        klingVoiceEnabled,
        klingVoiceId,
        klingDialogue,
        setKlingVoiceEnabled,
        setKlingVoiceId,
        setKlingDialogue,
    } = useAvatarStudioStore()

    // Voice options for the selector
    const voiceOptions = [
        { value: '', label: 'Select a voice...' },
        ...KLING_VOICE_PRESETS.map(v => ({
            value: v.id,
            label: v.label,
        })),
        { value: 'custom', label: 'Custom Voice ID' },
    ]

    const isCustomVoice = klingVoiceId && !KLING_VOICE_PRESETS.some(v => v.id === klingVoiceId) && klingVoiceId !== ''

    return (
        <Card className="p-4 bg-gray-800/50 border-gray-700">
            <div className="flex items-center gap-2 mb-4">
                <HiOutlineMicrophone className="w-5 h-5 text-purple-400" />
                <span className="font-medium text-white">Voice Generation</span>
                <span className="text-xs text-gray-400 ml-auto">(Requires Kling v2.6+)</span>
            </div>

            <div className="space-y-4">
                {/* Enable Voice Toggle */}
                <Checkbox
                    checked={klingVoiceEnabled}
                    onChange={(checked) => setKlingVoiceEnabled(checked)}
                    disabled={disabled}
                >
                    <span className="text-sm text-gray-300">
                        Enable Voice Synthesis
                    </span>
                </Checkbox>

                {klingVoiceEnabled && (
                    <>
                        {/* Voice Selector - using native select for simplicity */}
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Voice</label>
                            <select
                                value={isCustomVoice ? 'custom' : klingVoiceId}
                                onChange={(e) => {
                                    const value = e.target.value
                                    if (value === 'custom') {
                                        setKlingVoiceId('')
                                    } else {
                                        setKlingVoiceId(value)
                                    }
                                }}
                                disabled={disabled}
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                {voiceOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Custom Voice ID Input */}
                        {isCustomVoice && (
                            <div>
                                <label className="block text-xs text-gray-400 mb-1">
                                    Custom Voice ID
                                </label>
                                <Input
                                    value={klingVoiceId}
                                    onChange={(e) => setKlingVoiceId(e.target.value)}
                                    placeholder="Enter voice_id from Kling API"
                                    disabled={disabled}
                                    className="w-full"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Get voice IDs from Kling Voice Customization API
                                </p>
                            </div>
                        )}

                        {/* Dialogue Input */}
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">
                                <HiOutlineVolumeUp className="inline w-4 h-4 mr-1" />
                                Dialogue
                            </label>
                            <textarea
                                value={klingDialogue}
                                onChange={(e) => setKlingDialogue(e.target.value)}
                                placeholder="Enter what the avatar should say..."
                                disabled={disabled}
                                rows={3}
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                This text will be spoken by the avatar with lip-sync
                            </p>
                        </div>

                        {/* Preview of generated prompt syntax */}
                        {klingDialogue && (
                            <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                                <p className="text-xs text-gray-400 mb-1">Voice Prompt Preview:</p>
                                <code className="text-xs text-green-400 break-all">
                                    {"<<<voice_1>>>"} {klingDialogue.substring(0, 50)}
                                    {klingDialogue.length > 50 ? '...' : ''}
                                </code>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Card>
    )
}

export default KlingVoiceControls
