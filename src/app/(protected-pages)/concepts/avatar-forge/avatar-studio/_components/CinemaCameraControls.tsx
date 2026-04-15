'use client'

import { useState } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { CAMERA_SHOTS } from '../types'
import type { CameraShot, CinemaLens, CinemaFocalLength, CinemaAperture } from '../types'
import {
    CINEMA_LENSES,
    CINEMA_FOCAL_LENGTHS,
    CINEMA_APERTURES,
    buildCinemaPreview,
} from '../_constants/cinemaPresets'
import { HiOutlineFilm, HiChevronDown, HiChevronUp } from 'react-icons/hi'

const CinemaCameraControls = () => {
    const [isExpanded, setIsExpanded] = useState(false)

    const {
        cameraShot,
        cameraAngle,
        cinemaLens,
        cinemaFocalLength,
        cinemaAperture,
        setCameraShot,
        setCameraAngle,
        setCinemaLens,
        setCinemaFocalLength,
        setCinemaAperture,
    } = useAvatarStudioStore()

    const framingOptions = CAMERA_SHOTS.filter(s => s.category === 'framing')
    const angleOptions = CAMERA_SHOTS.filter(s => s.category === 'angle')

    // Count active (non-AUTO/non-null) settings
    const activeCount = [
        cameraShot !== 'AUTO',
        cameraAngle !== null,
        cinemaLens !== 'AUTO',
        cinemaFocalLength !== 'AUTO',
        cinemaAperture !== 'AUTO',
    ].filter(Boolean).length

    const cinemaPreview = buildCinemaPreview(cinemaLens, cinemaFocalLength, cinemaAperture)

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {/* Collapse Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <HiOutlineFilm className="w-4 h-4 text-purple-500" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Camera & Cinema
                    </span>
                    {activeCount > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-400 rounded-full">
                            {activeCount}
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <HiChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                    <HiChevronDown className="w-4 h-4 text-gray-400" />
                )}
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="px-3 py-3 space-y-3">
                    {/* Row 1: CAMERA */}
                    <div>
                        <div className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider mb-2">
                            Camera
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[10px] text-gray-500 mb-1 block">Framing</label>
                                <select
                                    value={cameraShot}
                                    onChange={(e) => setCameraShot(e.target.value as CameraShot)}
                                    className="w-full px-2 py-1.5 border rounded-lg text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                >
                                    {framingOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-gray-500 mb-1 block">Angle</label>
                                <select
                                    value={cameraAngle ?? ''}
                                    onChange={(e) =>
                                        setCameraAngle(
                                            e.target.value === '' ? null : (e.target.value as CameraShot)
                                        )
                                    }
                                    className="w-full px-2 py-1.5 border rounded-lg text-xs bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                                >
                                    <option value="">Auto</option>
                                    {angleOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-gray-200 dark:border-gray-700" />

                    {/* Row 2: CINEMA */}
                    <div className="space-y-2">
                        <div className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider">
                            Cinema
                        </div>

                        {/* Lens Pills */}
                        <div>
                            <label className="text-[10px] text-gray-500 mb-1 block">Lens</label>
                            <div className="flex gap-1 flex-wrap">
                                {CINEMA_LENSES.map((lens) => (
                                    <button
                                        key={lens.value}
                                        onClick={() => setCinemaLens(lens.value)}
                                        className={`px-2 py-1 rounded-full text-[11px] border transition-colors ${
                                            cinemaLens === lens.value
                                                ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                                                : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400 dark:hover:border-gray-500'
                                        }`}
                                    >
                                        {lens.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Focal Length + Aperture in 2-col grid */}
                        <div className="grid grid-cols-2 gap-2">
                            {/* Focal Length */}
                            <div>
                                <label className="text-[10px] text-gray-500 mb-1 block">Focal Length</label>
                                <div className="flex gap-1">
                                    {CINEMA_FOCAL_LENGTHS.map((focal) => (
                                        <button
                                            key={focal.value}
                                            onClick={() => setCinemaFocalLength(focal.value)}
                                            className={`flex-1 py-1 rounded text-[10px] border text-center transition-colors ${
                                                cinemaFocalLength === focal.value
                                                    ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                                                    : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400 dark:hover:border-gray-500'
                                            }`}
                                        >
                                            {focal.value === 'AUTO' ? 'Auto' : focal.value}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Aperture */}
                            <div>
                                <label className="text-[10px] text-gray-500 mb-1 block">Aperture</label>
                                <div className="flex gap-1">
                                    {CINEMA_APERTURES.map((ap) => (
                                        <button
                                            key={ap.value}
                                            onClick={() => setCinemaAperture(ap.value)}
                                            className={`flex-1 py-1 rounded text-[10px] border text-center transition-colors ${
                                                cinemaAperture === ap.value
                                                    ? 'border-purple-500 text-purple-400 bg-purple-500/10'
                                                    : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400 dark:hover:border-gray-500'
                                            }`}
                                        >
                                            {ap.value === 'AUTO' ? 'Auto' : ap.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Prompt Preview */}
                    {cinemaPreview && (
                        <div className="px-2 py-1.5 bg-gray-900/50 rounded text-[11px] text-gray-500 italic">
                            {cinemaPreview}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default CinemaCameraControls
