'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
    HiOutlineUser, HiOutlineUpload, HiOutlineSparkles, HiOutlineEye,
    HiOutlinePhotograph, HiOutlineFilm, HiOutlineScissors, HiOutlineAnnotation,
    HiOutlineDocumentText, HiOutlineMicrophone, HiOutlineSwitchHorizontal,
    HiOutlineSave, HiOutlineLink, HiOutlineCheck, HiOutlineX,
    HiOutlineLightningBolt, HiOutlineCollection, HiOutlineVideoCamera,
    HiOutlineShieldCheck, HiOutlineChatAlt, HiOutlineHeart, HiOutlineGlobeAlt,
} from 'react-icons/hi'
import type { VideoFlowNode, NodeStatus, MediaBundle, AvatarBundle } from '../_engine/types'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
import { PORT_COLORS } from '../_constants/portTypes'
import { getTemplate } from './templates'
import { useVideoFlowStore } from '../_store/videoFlowStore'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
    HiOutlineUser, HiOutlineUpload, HiOutlineSparkles, HiOutlineEye,
    HiOutlinePhotograph, HiOutlineFilm, HiOutlineScissors, HiOutlineAnnotation,
    HiOutlineDocumentText, HiOutlineMicrophone, HiOutlineSwitchHorizontal,
    HiOutlineSave, HiOutlineLink,
    HiOutlineLightningBolt, HiOutlineCollection, HiOutlineVideoCamera,
    HiOutlineShieldCheck, HiOutlineChatAlt, HiOutlineHeart, HiOutlineGlobeAlt,
}

function StatusBadge({ status }: { status: NodeStatus }) {
    if (status === 'idle') return null
    const config: Record<string, { bg: string; color: string }> = {
        running:   { bg: '#f43f5e20', color: '#f43f5e' },
        completed: { bg: '#10b98120', color: '#10b981' },
        error:     { bg: '#ef444420', color: '#ef4444' },
        pending:   { bg: '#73737330', color: '#737373' },
        skipped:   { bg: '#73737330', color: '#737373' },
    }
    const { bg, color } = config[status] ?? config.pending
    return (
        <div className="flex items-center justify-center rounded-full shrink-0" style={{ width: 18, height: 18, background: bg }}>
            {status === 'running' && (
                <svg className="animate-spin" width={10} height={10} viewBox="0 0 16 16">
                    <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8z" fill={color} opacity={0.2} />
                    <path d="M8 0a8 8 0 018 8h-1.5A6.5 6.5 0 008 1.5V0z" fill={color} />
                </svg>
            )}
            {status === 'completed' && <HiOutlineCheck style={{ width: 10, height: 10, color }} />}
            {status === 'error' && <HiOutlineX style={{ width: 10, height: 10, color }} />}
            {status === 'pending' && (
                <svg width={10} height={10} viewBox="0 0 16 16">
                    <rect x={4} y={3} width={3} height={10} rx={0.75} fill={color} />
                    <rect x={9} y={3} width={3} height={10} rx={0.75} fill={color} />
                </svg>
            )}
            {status === 'skipped' && (
                <svg width={10} height={10} viewBox="0 0 16 16">
                    <rect x={3} y={7} width={10} height={2.5} rx={1.25} fill={color} />
                </svg>
            )}
        </div>
    )
}

// ─── Result preview (ComfyUI-style: outputs render on the node) ──
type Preview =
    | { kind: 'image' | 'video' | 'audio'; url: string }
    | { kind: 'avatar'; name?: string; thumbnailUrl?: string }
    | { kind: 'text'; text: string }

function isMediaBundle(value: unknown): value is MediaBundle {
    return (
        !!value &&
        typeof value === 'object' &&
        'kind' in value &&
        ['image', 'video', 'audio'].includes((value as MediaBundle).kind)
    )
}

function isAvatarBundle(value: unknown): value is AvatarBundle {
    return (
        !!value &&
        typeof value === 'object' &&
        (value as AvatarBundle).kind === 'avatar'
    )
}

function getPreview(result: Record<string, unknown> | undefined): Preview | null {
    if (!result) return null

    for (const value of Object.values(result)) {
        if (isMediaBundle(value) && value.url) {
            return { kind: value.kind, url: value.url }
        }
    }
    for (const value of Object.values(result)) {
        if (isAvatarBundle(value)) {
            return { kind: 'avatar', name: value.avatarName, thumbnailUrl: value.thumbnailUrl }
        }
    }
    for (const value of Object.values(result)) {
        if (typeof value === 'string' && value.length > 0) {
            return { kind: 'text', text: value }
        }
    }
    return null
}

function ResultPreview({ result }: { result: Record<string, unknown> | undefined }) {
    const preview = getPreview(result)
    if (!preview) return null

    if (preview.kind === 'image') {
        return (
            <img
                src={preview.url}
                alt="result"
                className="nodrag mt-1.5 w-full max-h-44 object-cover rounded-md border border-gray-200 dark:border-gray-700"
            />
        )
    }
    if (preview.kind === 'video') {
        return (
            <video
                src={preview.url}
                controls
                muted
                loop
                playsInline
                className="nodrag mt-1.5 w-full max-h-44 rounded-md border border-gray-200 dark:border-gray-700 bg-black"
            />
        )
    }
    if (preview.kind === 'audio') {
        return (
            <audio
                src={preview.url}
                controls
                className="nodrag mt-1.5 w-full h-8"
            />
        )
    }
    if (preview.kind === 'avatar') {
        return (
            <div className="mt-1.5 flex items-center gap-2 bg-gray-100 dark:bg-gray-900 rounded-md p-2">
                {preview.thumbnailUrl && (
                    <img
                        src={preview.thumbnailUrl}
                        alt=""
                        className="nodrag w-8 h-8 rounded object-cover"
                    />
                )}
                <span className="text-[10px] text-gray-700 dark:text-gray-300 truncate">
                    {preview.name ?? 'Avatar'}
                </span>
            </div>
        )
    }
    if (preview.kind === 'text') {
        return (
            <div className="mt-1.5 bg-gray-100 dark:bg-gray-900 rounded-md p-2 text-[9px] text-gray-700 dark:text-gray-300 leading-snug max-h-24 overflow-y-auto whitespace-pre-wrap nodrag">
                {preview.text}
            </div>
        )
    }
    return null
}

// Handles rendered inline in the port rows: static positioning inside the row
// (ReactFlow measures their DOM rect, so they don't need absolute placement),
// nudged outward so the dot straddles the node border.
const HANDLE_STYLE: React.CSSProperties = {
    position: 'static',
    transform: 'none',
}

function VideoBaseNode({ id, data }: NodeProps<VideoFlowNode>) {
    const { label, category, icon, status, config } = data
    const colors = CATEGORY_COLORS[category]
    const IconComponent = ICON_MAP[icon]
    const template = getTemplate(data.type)
    const inputs = template?.inputs ?? []
    const outputs = template?.outputs ?? []

    const result = useVideoFlowStore((s) => s.nodeResults[id])
    const errorMessage = useVideoFlowStore((s) =>
        s.executionError?.nodeId === id ? s.executionError.message : null,
    )

    const configSummary = Object.entries(config)
        .filter(([, v]) =>
            v !== null && v !== '' && v !== undefined &&
            typeof v !== 'object',
        )
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')

    return (
        <div
            className="relative rounded-[10px] p-3 w-[220px] shadow-lg bg-white dark:bg-gray-800"
            style={{
                border: `2px solid ${status === 'error' ? '#ef4444' : colors.border}`,
                boxShadow: status === 'running' ? `0 0 24px ${colors.border}40` : status === 'completed' ? `0 0 16px ${colors.border}20` : undefined,
                opacity: status === 'pending' || status === 'skipped' ? 0.6 : 1,
            }}
        >
            <div className="absolute -top-2.5 left-3 text-white text-[8px] px-2 py-px rounded-full font-semibold uppercase tracking-wide" style={{ background: colors.border }}>
                {colors.label}
            </div>
            <div className="flex items-center justify-between mt-1 mb-2">
                <div className="flex items-center gap-1.5">
                    {IconComponent && <IconComponent className="w-4 h-4" style={{ color: colors.border }} />}
                    <span className="text-gray-900 dark:text-gray-100 text-xs font-bold">{label}</span>
                </div>
                <StatusBadge status={status} />
            </div>

            {/* Typed ports: inputs on the left, outputs on the right. The dot
                color encodes the data type — same color connects to same color. */}
            {(inputs.length > 0 || outputs.length > 0) && (
                <div className="flex justify-between gap-3 mb-1">
                    <div className="flex flex-col gap-1 min-w-0">
                        {inputs.map((port) => (
                            <div key={port.key} className="flex items-center gap-1.5 h-4" title={`${port.key} (${port.type})`}>
                                <Handle
                                    type="target"
                                    id={port.key}
                                    position={Position.Left}
                                    style={{ ...HANDLE_STYLE, background: PORT_COLORS[port.type] }}
                                    className="!w-2.5 !h-2.5 !border-2 !border-white dark:!border-gray-800 !-ml-[19px] shrink-0"
                                />
                                <span className="text-[8px] text-gray-500 dark:text-gray-400 font-mono truncate">
                                    {port.key}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-1 items-end min-w-0">
                        {outputs.map((port) => (
                            <div key={port.key} className="flex items-center gap-1.5 h-4" title={`${port.key} (${port.type})`}>
                                <span className="text-[8px] text-gray-500 dark:text-gray-400 font-mono truncate">
                                    {port.key}
                                </span>
                                <Handle
                                    type="source"
                                    id={port.key}
                                    position={Position.Right}
                                    style={{ ...HANDLE_STYLE, background: PORT_COLORS[port.type] }}
                                    className="!w-2.5 !h-2.5 !border-2 !border-white dark:!border-gray-800 !-mr-[19px] shrink-0"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {configSummary && (
                <div className="bg-gray-100 dark:bg-gray-900 rounded-md p-2 text-[10px]">
                    <div className="text-gray-500 dark:text-gray-400 font-mono text-[8px] line-clamp-2 break-all">
                        {configSummary}
                    </div>
                </div>
            )}

            {status === 'error' && errorMessage && (
                <div className="mt-1.5 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 rounded-md p-2 text-[9px] text-red-600 dark:text-red-300 leading-snug whitespace-pre-wrap break-words">
                    {errorMessage}
                </div>
            )}

            <ResultPreview result={result} />
        </div>
    )
}

export default memo(VideoBaseNode)
