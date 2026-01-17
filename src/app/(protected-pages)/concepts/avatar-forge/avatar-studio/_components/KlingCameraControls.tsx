'use client'

import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Card from '@/components/ui/Card'
import Slider from '@/components/ui/Slider'
import { KLING_CAMERA_PRESETS, type KlingCameraControlType, type KlingCameraSimpleConfig } from '@/@types/kling'
import { HiOutlineCamera, HiOutlineArrowsExpand } from 'react-icons/hi'

interface KlingCameraControlsProps {
    disabled?: boolean
}

const KlingCameraControls = ({ disabled = false }: KlingCameraControlsProps) => {
    const {
        klingCameraControlType,
        klingCameraConfig,
        setKlingCameraControlType,
        setKlingCameraConfig,
    } = useAvatarStudioStore()

    const handleConfigChange = (key: keyof KlingCameraSimpleConfig, value: number) => {
        // For 'simple' type, only one parameter should be non-zero at a time
        const newConfig: KlingCameraSimpleConfig = {
            horizontal: 0,
            vertical: 0,
            pan: 0,
            tilt: 0,
            roll: 0,
            zoom: 0,
            [key]: value,
        }
        setKlingCameraConfig(newConfig)
    }

    const sliderConfig = [
        { key: 'horizontal' as const, label: 'Horizontal Pan', description: 'Left (-) / Right (+)' },
        { key: 'vertical' as const, label: 'Vertical Pan', description: 'Down (-) / Up (+)' },
        { key: 'pan' as const, label: 'Camera Pan', description: 'Rotation around X-axis' },
        { key: 'tilt' as const, label: 'Camera Tilt', description: 'Rotation around Y-axis' },
        { key: 'roll' as const, label: 'Camera Roll', description: 'Counterclockwise (-) / Clockwise (+)' },
        { key: 'zoom' as const, label: 'Zoom', description: 'Wide (-) / Narrow (+)' },
    ]

    // Find current active slider (non-zero value)
    const activeSliderKey = sliderConfig.find(
        s => klingCameraConfig && klingCameraConfig[s.key] !== 0
    )?.key || null

    return (
        <Card className="p-4 bg-gray-800/50 border-gray-700">
            <div className="flex items-center gap-2 mb-4">
                <HiOutlineCamera className="w-5 h-5 text-blue-400" />
                <span className="font-medium text-white">Camera Control</span>
            </div>

            <div className="space-y-4">
                {/* Camera Type Selector - using native select */}
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Camera Movement Type</label>
                    <select
                        value={klingCameraControlType || ''}
                        onChange={(e) => {
                            const value = e.target.value as KlingCameraControlType | ''
                            setKlingCameraControlType(value || null)
                            if (value !== 'simple') {
                                setKlingCameraConfig(null)
                            }
                        }}
                        disabled={disabled}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">None (AI decides)</option>
                        {KLING_CAMERA_PRESETS.map(preset => (
                            <option key={preset.type} value={preset.type}>
                                {preset.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Preset Description */}
                {klingCameraControlType && klingCameraControlType !== 'simple' && (
                    <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                        <p className="text-xs text-gray-400">
                            {KLING_CAMERA_PRESETS.find(p => p.type === klingCameraControlType)?.description}
                        </p>
                    </div>
                )}

                {/* Simple Camera Config Sliders */}
                {klingCameraControlType === 'simple' && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                            <HiOutlineArrowsExpand className="w-4 h-4" />
                            <span>Select one movement type (only one can be active)</span>
                        </div>

                        {sliderConfig.map(({ key, label, description }) => {
                            const value = klingCameraConfig?.[key] || 0

                            return (
                                <div
                                    key={key}
                                    className={`p-3 rounded-lg transition-colors ${
                                        activeSliderKey === key
                                            ? 'bg-blue-900/30 border border-blue-700'
                                            : 'bg-gray-900/30 border border-gray-700'
                                    }`}
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-sm text-gray-300">{label}</label>
                                        <span className="text-xs text-gray-500 font-mono">
                                            {value > 0 ? '+' : ''}{value}
                                        </span>
                                    </div>
                                    <Slider
                                        value={value}
                                        min={-10}
                                        max={10}
                                        step={1}
                                        onChange={(val) => handleConfigChange(key, val as number)}
                                        disabled={disabled || (activeSliderKey !== null && activeSliderKey !== key && value === 0)}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">{description}</p>
                                </div>
                            )
                        })}

                        {/* Reset Button */}
                        {activeSliderKey && (
                            <button
                                onClick={() => setKlingCameraConfig(null)}
                                className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors"
                                disabled={disabled}
                            >
                                Reset Camera Config
                            </button>
                        )}
                    </div>
                )}
            </div>
        </Card>
    )
}

export default KlingCameraControls
