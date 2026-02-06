'use client'

import { useState, useEffect, useCallback } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import { HiOutlineFilm } from 'react-icons/hi'

interface ContinueVideoDialogProps {
    isOpen: boolean
    frameBase64: string
    originalPrompt: string
    onClose: () => void
    onConfirm: (prompt: string) => void
}

const ContinueVideoDialog = ({
    isOpen,
    frameBase64,
    originalPrompt,
    onClose,
    onConfirm,
}: ContinueVideoDialogProps) => {
    const [editablePrompt, setEditablePrompt] = useState('')
    const [showOriginal, setShowOriginal] = useState(false)

    // Inicializar con sugerencia cuando se abre
    useEffect(() => {
        if (isOpen) {
            const suggestion = originalPrompt
                ? `${originalPrompt} (Continued)`
                : 'Cinematic movement, continuation of previous scene'
            setEditablePrompt(suggestion)
        } else {
            // Reset al cerrar
            setEditablePrompt('')
            setShowOriginal(false)
        }
    }, [isOpen, originalPrompt])

    // Handler para confirmar
    const handleConfirm = useCallback(() => {
        const cleanPrompt = editablePrompt.trim()
        if (cleanPrompt) {
            onConfirm(cleanPrompt)
        }
    }, [editablePrompt, onConfirm])

    // Shortcut de teclado
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleConfirm()
        }
    }, [handleConfirm])

    const canConfirm = editablePrompt.trim().length > 0

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            width={550}
            className="z-[60]"
            closable={true}
        >
            <div className="flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-3 p-5 border-b border-gray-200">
                    <div className="p-2 bg-purple-100 rounded-lg">
                        <HiOutlineFilm className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            Continue Video Generation
                        </h3>
                        <p className="text-xs text-gray-500">
                            Describe what happens next in the scene
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* Frame Preview */}
                    {frameBase64 && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <img
                                src={frameBase64}
                                alt="Last frame"
                                className="w-16 h-16 object-cover rounded border border-gray-200"
                            />
                            <div className="flex-1">
                                <p className="text-xs font-medium text-gray-700">
                                    Last Frame Captured
                                </p>
                                <p className="text-xs text-gray-500">
                                    This will be the starting point for continuation
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Prompt Input */}
                    <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                            Continuation Prompt
                        </label>
                        <textarea
                            value={editablePrompt}
                            onChange={(e) => setEditablePrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Describe what happens next..."
                            rows={4}
                            className="w-full p-3 border border-gray-300 rounded-lg bg-white resize-none text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all"
                            autoFocus
                        />
                        <div className="flex items-center justify-between mt-2">
                            <button
                                onClick={() => setShowOriginal(!showOriginal)}
                                className="text-xs text-gray-500 hover:text-gray-700 underline"
                            >
                                {showOriginal ? 'Hide' : 'Show'} original prompt
                            </button>
                            <span className="text-xs text-gray-400">
                                {editablePrompt.length} characters
                            </span>
                        </div>
                    </div>

                    {/* Original Prompt (collapsible) */}
                    {showOriginal && originalPrompt && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs font-medium text-blue-900 mb-1">
                                Original Prompt:
                            </p>
                            <p className="text-xs text-blue-700">
                                {originalPrompt}
                            </p>
                        </div>
                    )}

                    {/* Help Text */}
                    <div className="flex items-start gap-2 p-3 bg-purple-50 rounded-lg">
                        <div className="text-purple-600 mt-0.5">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <p className="text-xs text-purple-700">
                            Tip: Press <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs">Cmd/Ctrl + Enter</kbd> to quickly confirm
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 bg-gray-50">
                    <Button
                        variant="plain"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        color="purple"
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        icon={<HiOutlineFilm />}
                    >
                        Continue Generation
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

export default ContinueVideoDialog
