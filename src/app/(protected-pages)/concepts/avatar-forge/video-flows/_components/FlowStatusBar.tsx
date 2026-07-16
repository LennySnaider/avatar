'use client'

import { useVideoFlowStore } from '../_store/videoFlowStore'

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
    idle:      { text: 'Idle', color: '#737373' },
    running:   { text: 'Running...', color: '#f43f5e' },
    completed: { text: 'Completed', color: '#10b981' },
    error:     { text: 'Error', color: '#ef4444' },
}

export default function FlowStatusBar() {
    const { nodes, edges, executionStatus, executionError } = useVideoFlowStore()
    const statusInfo = STATUS_LABELS[executionStatus] ?? STATUS_LABELS.idle

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-1.5 shadow-xl">
            <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusInfo.color }} />
                <span className="text-[10px] font-medium" style={{ color: statusInfo.color }}>
                    {statusInfo.text}
                </span>
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                Nodes: {nodes.length}
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                Edges: {edges.length}
            </span>
            {executionError && (
                <span className="text-[10px] text-red-500 dark:text-red-400 truncate max-w-50">
                    {executionError.message}
                </span>
            )}
        </div>
    )
}
