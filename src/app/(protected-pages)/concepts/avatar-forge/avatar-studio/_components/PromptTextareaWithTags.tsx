'use client'

import { useRef, useState, useCallback } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { CATEGORY_INFO, type DetectedTerm } from '../_utils/promptAnalyzer'
import { HiOutlineX } from 'react-icons/hi'
import Tooltip from '@/components/ui/Tooltip'

// Colors for each category - compact version for inline tags
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    ethnicity: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-700' },
    gender: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-700' },
    age: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-700' },
    hair: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-700' },
    eyes: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-700' },
    skin: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-700' },
    facial: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-300 dark:border-pink-700' },
    body: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-300 dark:border-cyan-700' },
}

interface InlineTagProps {
    term: DetectedTerm
    onRemove: (id: string) => void
}

const InlineTag = ({ term, onRemove }: InlineTagProps) => {
    const colors = CATEGORY_COLORS[term.category] || CATEGORY_COLORS.ethnicity
    const categoryLabel = CATEGORY_INFO[term.category]?.label || term.category

    return (
        <Tooltip title={`${categoryLabel}: Click ✕ to remove`}>
            <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded border cursor-default ${colors.bg} ${colors.text} ${colors.border}`}
                style={{ verticalAlign: 'baseline' }}
            >
                <span>{term.term}</span>
                <button
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onRemove(term.id)
                    }}
                    className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
                >
                    <HiOutlineX className="w-3 h-3" />
                </button>
            </span>
        </Tooltip>
    )
}

interface PromptTextareaWithTagsProps {
    value: string
    onChange: (value: string) => void
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
    placeholder?: string
    rows?: number
    rightContent?: React.ReactNode
}

const PromptTextareaWithTags = ({
    value,
    onChange,
    onKeyDown,
    placeholder,
    rows = 6,
    rightContent,
}: PromptTextareaWithTagsProps) => {
    const { detectedTerms, removeDetectedTerm } = useAvatarStudioStore()
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [isFocused, setIsFocused] = useState(false)

    // Build rendered content with inline tags
    const renderContentWithTags = useCallback(() => {
        if (detectedTerms.length === 0) {
            return value || <span className="text-gray-400">{placeholder}</span>
        }

        // Sort terms by startIndex
        const sortedTerms = [...detectedTerms].sort((a, b) => a.startIndex - b.startIndex)

        const elements: React.ReactNode[] = []
        let lastIndex = 0

        sortedTerms.forEach((term, idx) => {
            // Add text before this term
            if (term.startIndex > lastIndex) {
                const textBefore = value.substring(lastIndex, term.startIndex)
                elements.push(<span key={`text-${idx}`}>{textBefore}</span>)
            }

            // Add the tag (replacing the original text)
            elements.push(
                <InlineTag
                    key={term.id}
                    term={term}
                    onRemove={removeDetectedTerm}
                />
            )

            lastIndex = term.endIndex
        })

        // Add remaining text after last term
        if (lastIndex < value.length) {
            elements.push(<span key="text-end">{value.substring(lastIndex)}</span>)
        }

        return elements.length > 0 ? elements : <span className="text-gray-400">{placeholder}</span>
    }, [value, detectedTerms, removeDetectedTerm, placeholder])

    // Handle click on display to switch to edit mode
    const handleDisplayClick = (e: React.MouseEvent) => {
        // Don't switch to edit if clicking on a tag button
        if ((e.target as HTMLElement).closest('button')) {
            return
        }
        setIsEditing(true)
        setTimeout(() => {
            textareaRef.current?.focus()
            // Put cursor at end
            if (textareaRef.current) {
                textareaRef.current.selectionStart = textareaRef.current.value.length
                textareaRef.current.selectionEnd = textareaRef.current.value.length
            }
        }, 0)
    }

    // Handle blur to switch back to display mode
    const handleBlur = () => {
        setIsEditing(false)
        setIsFocused(false)
    }

    const handleFocus = () => {
        setIsFocused(true)
    }

    const hasTags = detectedTerms.length > 0
    const showTagView = hasTags && !isEditing

    return (
        <div
            className={`relative border rounded-lg bg-white dark:bg-gray-900 transition-all ${
                isFocused
                    ? 'ring-2 ring-primary border-primary'
                    : 'border-gray-200 dark:border-gray-600'
            }`}
        >
            <div className="flex">
                {/* Content Area */}
                <div className="flex-1 min-w-0">
                    {showTagView ? (
                        /* Display Mode with Inline Tags */
                        <div
                            onClick={handleDisplayClick}
                            className="px-2.5 py-2 text-sm cursor-text overflow-auto"
                            style={{
                                minHeight: `${rows * 24}px`,
                                maxHeight: `${rows * 24 + 48}px`,
                                lineHeight: '1.7',
                            }}
                        >
                            {renderContentWithTags()}
                        </div>
                    ) : (
                        /* Edit Mode - Normal Textarea */
                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            onKeyDown={onKeyDown}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                            placeholder={placeholder}
                            className="w-full px-2.5 py-2 text-sm bg-transparent focus:outline-none resize-none"
                            style={{
                                minHeight: `${rows * 24}px`,
                                lineHeight: '1.7',
                            }}
                        />
                    )}
                </div>

                {/* Right Content (buttons) */}
                {rightContent && (
                    <div className="shrink-0 p-1.5 border-l border-gray-200 dark:border-gray-700">
                        {rightContent}
                    </div>
                )}
            </div>
        </div>
    )
}

export default PromptTextareaWithTags
