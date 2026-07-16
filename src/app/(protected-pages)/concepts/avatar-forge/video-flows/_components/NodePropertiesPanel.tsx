'use client'

import {
    HiOutlineX,
    HiOutlineTrash,
} from 'react-icons/hi'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
import { PORT_COLORS } from '../_constants/portTypes'
import { getTemplate } from '../_nodes/templates'
import type { VideoNodeData, NodeCategory } from '../_engine/types'
import AvatarPickerField from './panels/AvatarPickerField'
import UploadImageField from './panels/UploadImageField'
import VoicePickerField from './panels/VoicePickerField'
import ColorPickerField from './panels/ColorPickerField'

export default function NodePropertiesPanel() {
    const { nodes, selectedNodeId, setSelectedNodeId, setNodeConfig, removeNode } =
        useVideoFlowStore()

    const node = nodes.find((n) => n.id === selectedNodeId)
    if (!node) return null

    const data = node.data as VideoNodeData
    const template = getTemplate(data.type)
    const colors = CATEGORY_COLORS[data.category as NodeCategory]

    const handleConfigChange = (key: string, value: unknown) => {
        setNodeConfig(node.id, { [key]: value })
    }

    const setMany = (patch: Record<string, unknown>) => {
        setNodeConfig(node.id, patch)
    }

    return (
        <>
            {/* Docked to the right (ComfyUI-style) so the canvas stays visible
                while editing; clicking the canvas pane deselects/closes. */}
            <div
                className="absolute top-16 right-4 bottom-14 z-30 w-80 max-w-[85vw] flex flex-col bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-3 py-2 border-b"
                    style={{ borderColor: `${colors.border}40` }}
                >
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: colors.border }} />
                        <span className="text-gray-900 dark:text-gray-100 text-xs font-semibold">{data.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => {
                                removeNode(node.id)
                                setSelectedNodeId(null)
                            }}
                            className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 p-0.5"
                            title="Delete node"
                        >
                            <HiOutlineTrash className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setSelectedNodeId(null)}
                            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-0.5"
                        >
                            <HiOutlineX className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Config fields */}
                <div className="p-3 space-y-3 flex-1 overflow-y-auto">
                    {/* Node-specific custom panels */}
                    {data.type === 'select-avatar' && (
                        <AvatarPickerField
                            value={{
                                avatarId: data.config.avatarId as string | null,
                                avatarName: data.config.avatarName as string | undefined,
                                thumbnailUrl: data.config.thumbnailUrl as string | undefined,
                            }}
                            onSelect={(patch) => setMany(patch)}
                        />
                    )}

                    {data.type === 'upload-image' && (
                        <UploadImageField
                            value={{
                                imageUrl: data.config.imageUrl as string | undefined,
                                imageBase64: data.config.imageBase64 as string | undefined,
                                fileName: data.config.fileName as string | undefined,
                            }}
                            onChange={(patch) => setMany(patch)}
                        />
                    )}

                    {data.type === 'text-to-speech' && (
                        <VoicePickerField
                            value={data.config.voiceId as string | undefined}
                            onChange={(voiceId, voiceName) =>
                                setMany({ voiceId, voiceName })
                            }
                        />
                    )}

                    {/* Generic template-driven fields */}
                    {template && Object.entries(template.defaultData).map(([key, defaultVal]) => {
                        // Skip fields handled by custom panels above
                        if (isCustomField(data.type, key)) return null

                        const currentVal = data.config[key] ?? defaultVal
                        const selectOptions = getOptionsForField(key)

                        // Render color picker for color field
                        if (key === 'color') {
                            return (
                                <ColorPickerField
                                    key={key}
                                    label={key}
                                    value={String(currentVal)}
                                    onChange={(v) => handleConfigChange(key, v)}
                                />
                            )
                        }

                        // Render select for known enum fields
                        if (selectOptions.length > 0) {
                            return (
                                <label key={key} className="block">
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{key}</span>
                                    <select
                                        className="mt-0.5 w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-primary"
                                        value={String(currentVal)}
                                        onChange={(e) => handleConfigChange(key, e.target.value)}
                                    >
                                        {selectOptions.map((opt) => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </label>
                            )
                        }

                        // Number fields
                        if (typeof defaultVal === 'number') {
                            return (
                                <label key={key} className="block">
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{key}</span>
                                    <input
                                        type="number"
                                        className="mt-0.5 w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-primary"
                                        value={Number(currentVal)}
                                        onChange={(e) => handleConfigChange(key, Number(e.target.value))}
                                    />
                                </label>
                            )
                        }

                        // String / text fields
                        if (typeof defaultVal === 'string') {
                            const isLongText = key === 'text' || key === 'basePrompt' || key === 'url' || key === 'prompt'
                            return (
                                <label key={key} className="block">
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{key}</span>
                                    {isLongText ? (
                                        <textarea
                                            className="mt-0.5 w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-primary resize-none"
                                            rows={3}
                                            value={String(currentVal)}
                                            onChange={(e) => handleConfigChange(key, e.target.value)}
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            className="mt-0.5 w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-primary"
                                            value={String(currentVal)}
                                            onChange={(e) => handleConfigChange(key, e.target.value)}
                                        />
                                    )}
                                </label>
                            )
                        }

                        return null
                    })}

                    {/* I/O info — dot color = port type (same color connects) */}
                    {template && (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                            {template.inputs.length > 0 && (
                                <div className="mb-2">
                                    <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Inputs:</span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                        {template.inputs.map((port) => (
                                            <span key={port.key} className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-900 rounded text-[8px] text-gray-500 dark:text-gray-400 font-mono">
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: PORT_COLORS[port.type] }} />
                                                {port.key}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Outputs:</span>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                    {template.outputs.map((port) => (
                                        <span key={port.key} className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-900 rounded text-[8px] text-gray-500 dark:text-gray-400 font-mono">
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: PORT_COLORS[port.type] }} />
                                            {port.key}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}

// Fields rendered by custom panels — hide from the generic field loop
function isCustomField(nodeType: string, key: string): boolean {
    if (nodeType === 'select-avatar' && key === 'avatarId') return true
    if (nodeType === 'upload-image') return true
    if (nodeType === 'text-to-speech' && key === 'voiceId') return true
    return false
}

function getOptionsForField(key: string): string[] {
    const options: Record<string, string[]> = {
        style: ['photorealistic', 'cinematic', 'anime', 'illustration', 'editorial'],
        intensity: ['low', 'medium', 'high'],
        detailLevel: ['brief', 'detailed', 'exhaustive'],
        tone: ['professional', 'casual', 'energetic', 'calm'],
        language: ['es', 'en', 'pt', 'fr', 'de', 'zh'],
        template: ['general', 'property-tour', 'product-review', 'ugc-ad', 'greeting'],
        method: ['POST', 'PUT', 'PATCH'],
        position: ['top-center', 'center', 'bottom-center', 'bottom-left', 'bottom-right'],
        transition: ['none', 'fade', 'dissolve'],
        mode: ['standard', 'pro'],
        operator: ['equals', 'not-equals', 'contains', 'greater-than', 'less-than'],
        aspectRatio: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        model: ['gemini', 'minimax'],
        duration: ['5', '10'],
        collection: ['default'],
    }
    return options[key] ?? []
}
