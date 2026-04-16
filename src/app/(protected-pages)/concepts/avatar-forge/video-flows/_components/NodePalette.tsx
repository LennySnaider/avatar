'use client'

import { useState, type DragEvent } from 'react'
import {
    HiOutlineUser,
    HiOutlineUpload,
    HiOutlineSparkles,
    HiOutlineEye,
    HiOutlinePhotograph,
    HiOutlineFilm,
    HiOutlineScissors,
    HiOutlineAnnotation,
    HiOutlineDocumentText,
    HiOutlineMicrophone,
    HiOutlineSwitchHorizontal,
    HiOutlineSave,
    HiOutlineLink,
    HiOutlineChevronDown,
    HiOutlineChevronRight,
    HiOutlineViewGrid,
} from 'react-icons/hi'
import { TEMPLATES_BY_CATEGORY } from '../_nodes/templates'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
import type { NodeCategory } from '../_engine/types'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
    HiOutlineUser,
    HiOutlineUpload,
    HiOutlineSparkles,
    HiOutlineEye,
    HiOutlinePhotograph,
    HiOutlineFilm,
    HiOutlineScissors,
    HiOutlineAnnotation,
    HiOutlineDocumentText,
    HiOutlineMicrophone,
    HiOutlineSwitchHorizontal,
    HiOutlineSave,
    HiOutlineLink,
}

const CATEGORY_ORDER: NodeCategory[] = ['input', 'ai', 'generation', 'transform', 'voice', 'logic', 'output']

export default function NodePalette() {
    const [isOpen, setIsOpen] = useState(true)
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORY_ORDER))

    const toggleCategory = (cat: string) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev)
            if (next.has(cat)) next.delete(cat)
            else next.add(cat)
            return next
        })
    }

    const onDragStart = (event: DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/video-flow-node', nodeType)
        event.dataTransfer.effectAllowed = 'move'
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="absolute top-4 left-4 z-10 bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-lg hover:bg-slate-700 text-slate-300"
                title="Open node palette"
            >
                <HiOutlineViewGrid className="w-5 h-5" />
            </button>
        )
    }

    return (
        <div className="absolute top-4 left-4 z-10 w-56 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                <span className="text-slate-200 text-xs font-semibold">Nodes</span>
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-200">
                    <HiOutlineChevronDown className="w-4 h-4 rotate-180" />
                </button>
            </div>

            {/* Categories */}
            <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-1.5">
                {CATEGORY_ORDER.map((cat) => {
                    const templates = TEMPLATES_BY_CATEGORY[cat] ?? []
                    const colors = CATEGORY_COLORS[cat]
                    const isExpanded = expandedCategories.has(cat)

                    return (
                        <div key={cat} className="mb-1">
                            <button
                                onClick={() => toggleCategory(cat)}
                                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-slate-700/50"
                            >
                                <div
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ background: colors.border }}
                                />
                                <span className="text-[11px] font-semibold text-slate-300 flex-1">
                                    {colors.label}
                                </span>
                                {isExpanded
                                    ? <HiOutlineChevronDown className="w-3 h-3 text-slate-500" />
                                    : <HiOutlineChevronRight className="w-3 h-3 text-slate-500" />
                                }
                            </button>

                            {isExpanded && (
                                <div className="ml-2 space-y-0.5">
                                    {templates.map((t) => {
                                        const Icon = ICON_MAP[t.icon]
                                        return (
                                            <div
                                                key={t.type}
                                                draggable
                                                onDragStart={(e) => onDragStart(e, t.type)}
                                                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-slate-700/50 active:cursor-grabbing"
                                                title={t.description}
                                            >
                                                {Icon && (
                                                    <Icon
                                                        className="w-3.5 h-3.5 shrink-0"
                                                        style={{ color: colors.border } as React.CSSProperties}
                                                    />
                                                )}
                                                <span className="text-[10px] text-slate-400">
                                                    {t.label}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
