'use client'

import {
    HiOutlineX,
    HiOutlineTrash,
} from 'react-icons/hi'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
import { getTemplate } from '../_nodes/templates'
import type { VideoNodeData, NodeCategory } from '../_engine/types'

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

    return (
        <div className="absolute top-4 right-72 z-10 w-64 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-xl overflow-hidden">
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
            <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
                {template && Object.entries(template.defaultData).map(([key, defaultVal]) => {
                    const currentVal = data.config[key] ?? defaultVal

                    // Render select for known enum fields
                    if (key === 'style' || key === 'intensity' || key === 'detailLevel' || key === 'tone' || key === 'language' || key === 'template' || key === 'method' || key === 'position' || key === 'transition' || key === 'mode' || key === 'operator') {
                        const options = getOptionsForField(key)
                        return (
                            <label key={key} className="block">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wide">{key}</span>
                                <select
                                    className="mt-0.5 w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-500"
                                    value={String(currentVal)}
                                    onChange={(e) => handleConfigChange(key, e.target.value)}
                                >
                                    {options.map((opt) => (
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
    )
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
    }
    return options[key] ?? []
}
