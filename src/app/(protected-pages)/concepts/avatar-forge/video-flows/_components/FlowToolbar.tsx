'use client'

import { useState } from 'react'
import {
    HiOutlinePlay,
    HiOutlineSave,
    HiOutlineTrash,
    HiOutlineFolder,
} from 'react-icons/hi'
import {
    apiSaveVideoFlow,
    apiListVideoFlows,
    apiGetVideoFlow,
} from '@/services/VideoFlowService'
import { useVideoFlowStore } from '../_store/videoFlowStore'
import type { VideoFlowNode } from '../_engine/types'
import type { Edge } from '@xyflow/react'

export default function FlowToolbar() {
    const {
        nodes,
        edges,
        flowId,
        flowName,
        isDirty,
        executionStatus,
        setFlowMeta,
        setIsDirty,
        clearCanvas,
        loadFlowData,
        setExecutionStatus,
        resetExecution,
    } = useVideoFlowStore()

    const [saving, setSaving] = useState(false)
    const [showLoadMenu, setShowLoadMenu] = useState(false)
    const [savedFlows, setSavedFlows] = useState<{ id: string; name: string }[]>([])

    // ─── Save ────────────────────────────────────────────────
    // Identity/ownership live server-side in VideoFlowService now.
    const handleSave = async () => {
        setSaving(true)
        try {
            const { id } = await apiSaveVideoFlow(
                flowId,
                flowName,
                JSON.parse(JSON.stringify(nodes)),
                JSON.parse(JSON.stringify(edges)),
            )
            if (!flowId) setFlowMeta(id, flowName)
            setIsDirty(false)
        } catch (err) {
            console.error('Failed to save flow:', err)
        } finally {
            setSaving(false)
        }
    }

    // ─── Load ────────────────────────────────────────────────
    const handleLoadMenu = async () => {
        if (showLoadMenu) {
            setShowLoadMenu(false)
            return
        }
        try {
            setSavedFlows(await apiListVideoFlows())
        } catch (err) {
            console.error('Failed to list flows:', err)
            setSavedFlows([])
        }
        setShowLoadMenu(true)
    }

    const handleLoadFlow = async (id: string) => {
        try {
            const row = await apiGetVideoFlow(id)
            loadFlowData(row.nodes as VideoFlowNode[], row.edges as Edge[])
            setFlowMeta(row.id, row.name)
        } catch (err) {
            console.error('Failed to load flow:', err)
        }
        setShowLoadMenu(false)
    }

    // ─── Run (placeholder — wired in Task 10) ───────────────
    const handleRun = async () => {
        const { executeFlow } = await import('../_engine/executeFlow')
        resetExecution()
        setExecutionStatus('running')
        try {
            await executeFlow()
            setExecutionStatus('completed')
        } catch {
            setExecutionStatus('error')
        }
    }

    const isRunning = executionStatus === 'running'

    return (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg px-2 py-1.5 shadow-xl">
            {/* Flow name */}
            <input
                className="bg-transparent text-slate-200 text-xs font-medium w-32 outline-none border-b border-transparent focus:border-slate-500 mr-2"
                value={flowName}
                onChange={(e) => setFlowMeta(flowId, e.target.value)}
                placeholder="Flow name..."
            />

            {/* Run */}
            <button
                onClick={handleRun}
                disabled={isRunning || nodes.length === 0}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                title="Run flow"
            >
                <HiOutlinePlay className="w-3.5 h-3.5" />
                {isRunning ? 'Running...' : 'Run'}
            </button>

            {/* Save */}
            <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                title="Save flow"
            >
                <HiOutlineSave className="w-3.5 h-3.5" />
                {saving ? '...' : 'Save'}
            </button>

            {/* Load */}
            <div className="relative">
                <button
                    onClick={handleLoadMenu}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-300 hover:bg-slate-700"
                    title="Load flow"
                >
                    <HiOutlineFolder className="w-3.5 h-3.5" />
                    Load
                </button>
                {showLoadMenu && (
                    <div className="absolute top-full right-0 mt-1 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                        {savedFlows.length === 0 ? (
                            <div className="px-3 py-2 text-[10px] text-slate-500">No saved flows</div>
                        ) : (
                            savedFlows.map((f) => (
                                <button
                                    key={f.id}
                                    onClick={() => handleLoadFlow(f.id)}
                                    className="block w-full text-left px-3 py-1.5 text-[10px] text-slate-300 hover:bg-slate-700"
                                >
                                    {f.name}
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Clear */}
            <button
                onClick={clearCanvas}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-400 hover:bg-slate-700 hover:text-red-400"
                title="Clear canvas"
            >
                <HiOutlineTrash className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}
