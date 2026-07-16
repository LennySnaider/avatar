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
    HiOutlineLightningBolt,
    HiOutlineCollection,
    HiOutlineVideoCamera,
    HiOutlineShieldCheck,
    HiOutlineChatAlt,
    HiOutlineHeart,
    HiOutlineGlobeAlt,
} from 'react-icons/hi'
import { TEMPLATES_BY_CATEGORY } from '../_nodes/templates'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
import { PORT_COLORS, PORT_LEGEND } from '../_constants/portTypes'
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
    HiOutlineLightningBolt,
    HiOutlineCollection,
    HiOutlineVideoCamera,
    HiOutlineShieldCheck,
    HiOutlineChatAlt,
    HiOutlineHeart,
    HiOutlineGlobeAlt,
}

const CATEGORY_ORDER: NodeCategory[] = ['trigger', 'input', 'ai', 'generation', 'transform', 'voice', 'logic', 'output']

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
                className="absolute top-4 left-4 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                title="Open node palette"
            >
                <HiOutlineViewGrid className="w-5 h-5" />
            </button>
        )
    }

    return (
        <div className="absolute top-4 left-4 z-10 w-56 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-900 dark:text-gray-100 text-xs font-semibold">Nodes</span>
                <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                    <HiOutlineChevronDown className="w-4 h-4 rotate-180" />
                </button>
            </div>

            {/* Categories */}
            <div className="max-h-[calc(100vh-16rem)] overflow-y-auto p-1.5">
                {CATEGORY_ORDER.map((cat) => {
                    const templates = TEMPLATES_BY_CATEGORY[cat] ?? []
                    const colors = CATEGORY_COLORS[cat]
                    const isExpanded = expandedCategories.has(cat)

                    return (
                        <div key={cat} className="mb-1">
                            <button
                                onClick={() => toggleCategory(cat)}
                                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-gray-100 dark:hover:bg-gray-700/50"
                            >
                                <div
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ background: colors.border }}
                                />
                                <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 flex-1">
                                    {colors.label}
                                </span>
                                {isExpanded
                                    ? <HiOutlineChevronDown className="w-3 h-3 text-gray-400" />
                                    : <HiOutlineChevronRight className="w-3 h-3 text-gray-400" />
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
                                                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-gray-100 dark:hover:bg-gray-700/50 active:cursor-grabbing"
                                                title={t.description}
                                            >
                                                {Icon && (
                                                    <Icon
                                                        className="w-3.5 h-3.5 shrink-0"
                                                        style={{ color: colors.border } as React.CSSProperties}
                                                    />
                                                )}
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400">
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

            {/* Port type legend — same color connects to same color */}
            <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
                <div className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
                    Connections
                </div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                    {PORT_LEGEND.map((type) => (
                        <div key={type} className="flex items-center gap-1">
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{ background: PORT_COLORS[type] }}
                            />
                            <span className="text-[9px] text-gray-500 dark:text-gray-400">{type}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
