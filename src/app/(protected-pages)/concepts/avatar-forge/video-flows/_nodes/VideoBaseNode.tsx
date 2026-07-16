'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import {
    HiOutlineUser, HiOutlineUpload, HiOutlineSparkles, HiOutlineEye,
    HiOutlinePhotograph, HiOutlineFilm, HiOutlineScissors, HiOutlineAnnotation,
    HiOutlineDocumentText, HiOutlineMicrophone, HiOutlineSwitchHorizontal,
    HiOutlineSave, HiOutlineLink, HiOutlineCheck, HiOutlineX,
} from 'react-icons/hi'
import type { VideoFlowNode, NodeStatus } from '../_engine/types'
import { CATEGORY_COLORS } from '../_constants/categoryColors'
import { getTemplate } from './templates'
import { useVideoFlowStore } from '../_store/videoFlowStore'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
    HiOutlineUser, HiOutlineUpload, HiOutlineSparkles, HiOutlineEye,
    HiOutlinePhotograph, HiOutlineFilm, HiOutlineScissors, HiOutlineAnnotation,
    HiOutlineDocumentText, HiOutlineMicrophone, HiOutlineSwitchHorizontal,
    HiOutlineSave, HiOutlineLink,
}

function StatusBadge({ status }: { status: NodeStatus }) {
    if (status === 'idle') return null
    const config: Record<string, { bg: string; color: string }> = {
        running:   { bg: '#f43f5e20', color: '#f43f5e' },
        completed: { bg: '#10b98120', color: '#10b981' },
        error:     { bg: '#ef444420', color: '#ef4444' },
        pending:   { bg: '#33415530', color: '#64748b' },
        skipped:   { bg: '#33415530', color: '#475569' },
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
    | { kind: 'text'; text: string }

function looksLikeVideo(url: string): boolean {
    return url.includes('.mp4') || url.includes('.webm') || url.startsWith('data:video')
}

function getPreview(result: Record<string, unknown> | undefined): Preview | null {
    if (!result) return null
    const videoUrl = (result.videoUrl ?? result.stitchedVideoUrl) as string | undefined
    if (videoUrl) return { kind: 'video', url: videoUrl }

    const outputUrl = result.outputUrl as string | undefined
    if (outputUrl) {
        return looksLikeVideo(outputUrl)
            ? { kind: 'video', url: outputUrl }
            : { kind: 'image', url: outputUrl }
    }

    const imageUrl = (result.imageUrl ?? result.savedUrl) as string | undefined
    if (imageUrl) {
        return looksLikeVideo(imageUrl)
            ? { kind: 'video', url: imageUrl }
            : { kind: 'image', url: imageUrl }
    }

    const audioUrl = result.audioUrl as string | undefined
    if (audioUrl) return { kind: 'audio', url: audioUrl }

    const text = (result.enhancedPrompt ??
        result.description ??
        result.script) as string | undefined
    if (text) return { kind: 'text', text }

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
                className="nodrag mt-1.5 w-full max-h-44 object-cover rounded-md border border-slate-700"
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
                className="nodrag mt-1.5 w-full max-h-44 rounded-md border border-slate-700 bg-black"
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
    if (preview.kind === 'text') {
        return (
            <div className="mt-1.5 bg-slate-900 rounded-md p-2 text-[9px] text-slate-300 leading-snug max-h-24 overflow-y-auto whitespace-pre-wrap nodrag">
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
            className="relative rounded-[10px] p-3 w-[220px] shadow-lg"
            style={{
                background: '#1e293b',
                border: `2px solid ${status === 'error' ? '#ef4444' : colors.border}`,
                boxShadow: status === 'running' ? `0 0 24px ${colors.border}40` : status === 'completed' ? `0 0 16px ${colors.border}20` : 'none',
                opacity: status === 'pending' || status === 'skipped' ? 0.6 : 1,
            }}
        >
            <div className="absolute -top-2.5 left-3 text-white text-[8px] px-2 py-px rounded-full font-semibold uppercase tracking-wide" style={{ background: colors.border }}>
                {colors.label}
            </div>
            <div className="flex items-center justify-between mt-1 mb-2">
                <div className="flex items-center gap-1.5">
                    {IconComponent && <IconComponent className="w-4 h-4" style={{ color: colors.border }} />}
                    <span className="text-slate-200 text-xs font-bold">{label}</span>
                </div>
                <StatusBadge status={status} />
            </div>

            {/* Named ports: inputs on the left, outputs on the right */}
            {(inputs.length > 0 || outputs.length > 0) && (
                <div className="flex justify-between gap-3 mb-1">
                    <div className="flex flex-col gap-1 min-w-0">
                        {inputs.map((key) => (
                            <div key={key} className="flex items-center gap-1.5 h-4">
                                <Handle
                                    type="target"
                                    id={key}
                                    position={Position.Left}
                                    style={HANDLE_STYLE}
                                    className="!w-2.5 !h-2.5 !bg-slate-500 !border-2 !border-slate-700 !-ml-[19px] shrink-0"
                                />
                                <span className="text-[8px] text-slate-400 font-mono truncate">
                                    {key}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-1 items-end min-w-0">
                        {outputs.map((key) => (
                            <div key={key} className="flex items-center gap-1.5 h-4">
                                <span className="text-[8px] text-slate-400 font-mono truncate">
                                    {key}
                                </span>
                                <Handle
                                    type="source"
                                    id={key}
                                    position={Position.Right}
                                    style={{ ...HANDLE_STYLE, background: colors.border }}
                                    className="!w-2.5 !h-2.5 !border-2 !border-slate-700 !-mr-[19px] shrink-0"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {configSummary && (
                <div className="bg-slate-900 rounded-md p-2 text-[10px]">
                    <div className="text-slate-400 font-mono text-[8px] line-clamp-2 break-all">
                        {configSummary}
                    </div>
                </div>
            )}

            {status === 'error' && errorMessage && (
                <div className="mt-1.5 bg-red-950/60 border border-red-900 rounded-md p-2 text-[9px] text-red-300 leading-snug whitespace-pre-wrap break-words">
                    {errorMessage}
                </div>
            )}

            <ResultPreview result={result} />
        </div>
    )
}

export default memo(VideoBaseNode)
