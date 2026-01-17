'use client'

import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { CATEGORY_INFO } from '../_utils/promptAnalyzer'
import { HiOutlineX } from 'react-icons/hi'
import Tooltip from '@/components/ui/Tooltip'

// Colors for each category based on CATEGORY_INFO
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    ethnicity: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-400' },
    gender: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-400' },
    age: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-400' },
    hair: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-400' },
    eyes: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-400' },
    skin: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-400' },
    facial: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-400' },
    body: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-400' },
}

const PromptTags = () => {
    const { detectedTerms, removeDetectedTerm } = useAvatarStudioStore()

    if (detectedTerms.length === 0) return null

    return (
        <div className="flex flex-wrap gap-1.5 mb-2">
            {detectedTerms.map((term) => {
                const colors = CATEGORY_COLORS[term.category] || CATEGORY_COLORS.ethnicity
                const categoryLabel = CATEGORY_INFO[term.category]?.label || term.category
                return (
                    <Tooltip key={term.id} title={`${categoryLabel}: Remove "${term.term}" from prompt`}>
                        <div
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-all hover:shadow-sm ${colors.bg} ${colors.text} ${colors.border}`}
                        >
                            <span className="max-w-40 truncate">{term.term}</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    removeDetectedTerm(term.id)
                                }}
                                className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                                title="Remove from prompt"
                            >
                                <HiOutlineX className="w-3 h-3" />
                            </button>
                        </div>
                    </Tooltip>
                )
            })}
        </div>
    )
}

export default PromptTags
