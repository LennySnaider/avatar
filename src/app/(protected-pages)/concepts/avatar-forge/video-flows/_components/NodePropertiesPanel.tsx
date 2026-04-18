'use client'

import {
    HiOutlineX,
    HiOutlineTrash,
} from 'react-icons/hi'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
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
            {/* Backdrop — click outside to close */}
            <div
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={() => setSelectedNodeId(null)}
            />
            <div
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-105 max-w-[90vw] bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-3 py-2 border-b"
                    style={{ borderColor: `${colors.border}40` }}
                >
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: colors.border }} />
                        <span className="text-slate-200 text-xs font-semibold">{data.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => {
                                removeNode(node.id)
                                setSelectedNodeId(null)
                            }}
                            className="text-slate-500 hover:text-red-400 p-0.5"
                            title="Delete node"
                        >
                            <HiOutlineTrash className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setSelectedNodeId(null)}
                            className="text-slate-400 hover:text-slate-200 p-0.5"
                        >
                            <HiOutlineX className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Config fields */}
                <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
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
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">{key}</span>
                                    <select
                                        className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-500"
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
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">{key}</span>
                                    <input
                                        type="number"
                                        className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-500"
                                        value={Number(currentVal)}
                                        onChange={(e) => handleConfigChange(key, Number(e.target.value))}
                                    />
                                </label>
                            )
                        }

                        // String / text fields
                        if (typeof defaultVal === 'string') {
                            const isLongText = key === 'text' || key === 'basePrompt' || key === 'url'
                            return (
                                <label key={key} className="block">
                                    <span className="text-[10px] text-slate-500 uppercase tracking-wide">{key}</span>
                                    {isLongText ? (
                                        <textarea
                                            className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-500 resize-none"
                                            rows={3}
                                            value={String(currentVal)}
                                            onChange={(e) => handleConfigChange(key, e.target.value)}
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-500"
                                            value={String(currentVal)}
                                            onChange={(e) => handleConfigChange(key, e.target.value)}
                                        />
                                    )}
                                </label>
                            )
                        }

                        return null
                    })}

                    {/* I/O info */}
                    {template && (
                        <div className="pt-2 border-t border-slate-700">
                            {template.inputs.length > 0 && (
                                <div className="mb-2">
                                    <span className="text-[9px] text-slate-600 uppercase tracking-wide">Inputs:</span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                        {template.inputs.map((i) => (
                                            <span key={i} className="px-1.5 py-0.5 bg-slate-900 rounded text-[8px] text-slate-500 font-mono">{i}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                <span className="text-[9px] text-slate-600 uppercase tracking-wide">Outputs:</span>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                    {template.outputs.map((o) => (
                                        <span key={o} className="px-1.5 py-0.5 bg-slate-900 rounded text-[8px] text-slate-500 font-mono">{o}</span>
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
