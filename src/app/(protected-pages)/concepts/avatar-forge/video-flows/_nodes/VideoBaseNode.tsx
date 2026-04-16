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
        </div>
    )
}

function VideoBaseNode({ data }: NodeProps<VideoFlowNode>) {
    const { label, category, icon, status, config } = data
    const colors = CATEGORY_COLORS[category]
    const IconComponent = ICON_MAP[icon]
    const isInputNode = category === 'input'
    const isOutputNode = category === 'output'

    return (
        <div
            className="relative rounded-[10px] p-3 min-w-[180px] shadow-lg"
            style={{
                background: '#1e293b',
                border: `2px solid ${status === 'running' ? colors.border : status === 'error' ? '#ef4444' : colors.border}`,
                boxShadow: status === 'running' ? `0 0 24px ${colors.border}40` : status === 'completed' ? `0 0 16px ${colors.border}20` : 'none',
                opacity: status === 'pending' ? 0.6 : 1,
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
            <div className="bg-slate-900 rounded-md p-2 text-[10px]">
                <div className="text-slate-500 mb-0.5">Config:</div>
                <div className="text-slate-400 font-mono text-[8px] truncate max-w-[160px]">
                    {Object.entries(config)
                        .filter(([, v]) => v !== null && v !== '' && v !== undefined)
                        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                        .join(', ') || 'default'}
                </div>
            </div>
            {!isInputNode && (
                <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-slate-500 !border-2 !border-slate-700" />
            )}
            {!isOutputNode && (
                <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !border-2 !border-slate-700" style={{ background: colors.border }} />
            )}
        </div>
    )
}

export default memo(VideoBaseNode)
