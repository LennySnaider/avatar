'use client'

import type { ReactNode } from 'react'
import Dialog from '@/components/ui/Dialog'
import { HiOutlineX } from 'react-icons/hi'

interface ToolModalProps {
    isOpen: boolean
    /** Optional — omit when the hosted tool renders its own header/title. */
    title?: string
    onClose: () => void
    children: ReactNode
}

/**
 * Reusable near-fullscreen modal that hosts a page-shaped tool (e.g. the
 * Video Editor) in-place inside Avatar Studio, without navigating away.
 * Mirrors the Dialog usage in ImagePreviewModal.tsx (width + p-0! + bg
 * overrides), but manages its own header/close button (`closable={false}`
 * on the Dialog) so hosted tools that render their own header don't end up
 * with two overlapping close buttons.
 */
const ToolModal = ({ isOpen, title, onClose, children }: ToolModalProps) => {
    if (!isOpen) return null

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            closable={false}
            width={1100}
            className="p-0! bg-white! dark:bg-gray-900!"
        >
            <div className="h-[85vh] flex flex-col overflow-auto">
                {/* Header */}
                <div className="flex items-center justify-between gap-4 px-4 py-2 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 shrink-0">
                    {title ? (
                        <h3 className="text-lg font-semibold truncate">{title}</h3>
                    ) : (
                        <span />
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors shrink-0"
                    >
                        <HiOutlineX className="w-5 h-5" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-auto min-h-0">{children}</div>
            </div>
        </Dialog>
    )
}

export default ToolModal
