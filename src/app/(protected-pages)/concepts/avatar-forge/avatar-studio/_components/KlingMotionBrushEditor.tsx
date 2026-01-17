'use client'

import { useState } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Input from '@/components/ui/Input'
import { HiOutlinePencil, HiOutlineTrash, HiOutlinePlus, HiOutlineInformationCircle } from 'react-icons/hi'
import type { KlingTrajectoryPoint } from '@/@types/kling'

interface KlingMotionBrushEditorProps {
    disabled?: boolean
}

const KlingMotionBrushEditor = ({ disabled = false }: KlingMotionBrushEditorProps) => {
    const {
        klingMotionBrushEnabled,
        klingStaticMask,
        klingDynamicMasks,
        setKlingMotionBrushEnabled,
        setKlingStaticMask,
        addKlingDynamicMask,
        removeKlingDynamicMask,
        clearKlingDynamicMasks,
    } = useAvatarStudioStore()

    const [newTrajectoryInput, setNewTrajectoryInput] = useState('')

    // Parse trajectory input like "100,200 150,180 200,160"
    const parseTrajectories = (input: string): KlingTrajectoryPoint[] => {
        try {
            return input.split(/\s+/).filter(Boolean).map(point => {
                const [x, y] = point.split(',').map(Number)
                if (isNaN(x) || isNaN(y)) throw new Error('Invalid point')
                return { x, y }
            })
        } catch {
            return []
        }
    }

    const handleAddDynamicMask = () => {
        const trajectories = parseTrajectories(newTrajectoryInput)
        if (trajectories.length >= 2) {
            addKlingDynamicMask({
                mask: '', // Will need to be set via file upload
                trajectories,
            })
            setNewTrajectoryInput('')
        }
    }

    return (
        <Card className="p-4 bg-gray-800/50 border-gray-700">
            <div className="flex items-center gap-2 mb-4">
                <HiOutlinePencil className="w-5 h-5 text-orange-400" />
                <span className="font-medium text-white">Motion Brush</span>
                <span className="text-xs text-gray-400 ml-auto">(kling-v1 std/pro 5s)</span>
            </div>

            <div className="space-y-4">
                {/* Enable Motion Brush Toggle */}
                <Checkbox
                    checked={klingMotionBrushEnabled}
                    onChange={(checked) => setKlingMotionBrushEnabled(checked)}
                    disabled={disabled}
                >
                    <span className="text-sm text-gray-300">
                        Enable Motion Brush
                    </span>
                </Checkbox>

                {klingMotionBrushEnabled && (
                    <>
                        {/* Info Box */}
                        <div className="p-3 bg-blue-900/20 border border-blue-800 rounded-lg">
                            <div className="flex gap-2">
                                <HiOutlineInformationCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                <div className="text-xs text-blue-300">
                                    <p className="mb-1"><strong>Motion Brush</strong> controls which parts of the image move:</p>
                                    <ul className="list-disc list-inside space-y-0.5 text-blue-200/80">
                                        <li><strong>Static Mask:</strong> Areas that should NOT move</li>
                                        <li><strong>Dynamic Masks:</strong> Areas with specific movement paths</li>
                                    </ul>
                                    <p className="mt-1">Masks must be same resolution as input image.</p>
                                </div>
                            </div>
                        </div>

                        {/* Static Mask */}
                        <div>
                            <label className="block text-xs text-gray-400 mb-2">
                                Static Mask (areas that won&apos;t move)
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    value={klingStaticMask || ''}
                                    onChange={(e) => setKlingStaticMask(e.target.value || null)}
                                    placeholder="Base64 or URL of mask image"
                                    disabled={disabled}
                                    className="flex-1"
                                />
                                {klingStaticMask && (
                                    <Button
                                        variant="plain"
                                        size="sm"
                                        onClick={() => setKlingStaticMask(null)}
                                        disabled={disabled}
                                    >
                                        <HiOutlineTrash className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Dynamic Masks List */}
                        <div>
                            <label className="block text-xs text-gray-400 mb-2">
                                Dynamic Masks ({klingDynamicMasks.length}/6)
                            </label>

                            {klingDynamicMasks.length > 0 && (
                                <div className="space-y-2 mb-3">
                                    {klingDynamicMasks.map((dm, idx) => (
                                        <div
                                            key={idx}
                                            className="p-2 bg-gray-900/50 rounded border border-gray-700 flex items-center gap-2"
                                        >
                                            <span className="text-xs text-gray-400 w-16">Mask {idx + 1}</span>
                                            <span className="text-xs text-green-400 flex-1 truncate">
                                                {dm.trajectories.length} points
                                            </span>
                                            <Button
                                                variant="plain"
                                                size="xs"
                                                onClick={() => removeKlingDynamicMask(idx)}
                                                disabled={disabled}
                                            >
                                                <HiOutlineTrash className="w-4 h-4 text-red-400" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add New Dynamic Mask */}
                            {klingDynamicMasks.length < 6 && (
                                <div className="space-y-2">
                                    <Input
                                        value={newTrajectoryInput}
                                        onChange={(e) => setNewTrajectoryInput(e.target.value)}
                                        placeholder="Trajectory points: x1,y1 x2,y2 x3,y3 ..."
                                        disabled={disabled}
                                        className="w-full"
                                    />
                                    <div className="flex gap-2">
                                        <Button
                                            variant="solid"
                                            size="sm"
                                            onClick={handleAddDynamicMask}
                                            disabled={disabled || parseTrajectories(newTrajectoryInput).length < 2}
                                            className="flex-1"
                                        >
                                            <HiOutlinePlus className="w-4 h-4 mr-1" />
                                            Add Dynamic Mask
                                        </Button>
                                        {klingDynamicMasks.length > 0 && (
                                            <Button
                                                variant="plain"
                                                size="sm"
                                                onClick={clearKlingDynamicMasks}
                                                disabled={disabled}
                                            >
                                                Clear All
                                            </Button>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        Enter coordinates: &quot;279,219 350,150 417,65&quot; (min 2, max 77 points)
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Trajectory visualization placeholder */}
                        {klingDynamicMasks.some(dm => dm.trajectories.length > 0) && (
                            <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                                <p className="text-xs text-gray-400 mb-2">Trajectory Preview:</p>
                                <div className="flex flex-wrap gap-1">
                                    {klingDynamicMasks.flatMap((dm, maskIdx) =>
                                        dm.trajectories.map((pt, ptIdx) => (
                                            <span
                                                key={`${maskIdx}-${ptIdx}`}
                                                className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-orange-900/50 text-orange-300"
                                            >
                                                ({pt.x}, {pt.y})
                                            </span>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Card>
    )
}

export default KlingMotionBrushEditor
