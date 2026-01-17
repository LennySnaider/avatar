'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import Drawer from '@/components/ui/Drawer'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tabs from '@/components/ui/Tabs'
import {
    apiGetPrompts,
    apiCreatePrompt,
    apiDeletePrompt,
} from '@/services/AvatarForgeService'
import {
    HiOutlineTrash,
    HiOutlineClipboardCopy,
    HiOutlineSave,
    HiOutlinePhotograph,
    HiOutlineVideoCamera,
} from 'react-icons/hi'
import {
    PiPushPinFill,
    PiPushPinSlashDuotone,
    PiPersonSimpleWalkDuotone,
    PiSparkleDuotone,
    PiSmileyDuotone,
    PiPersonArmsSpreadDuotone,
    PiHandPalmDuotone,
    PiCameraDuotone,
} from 'react-icons/pi'
import {
    MODEL_ACTION_PRESETS,
    ACTION_CATEGORIES,
    type ActionCategory,
    type ActionPreset,
} from '../_constants/modelActionPresets'
import type { Prompt, MediaType } from '@/@types/supabase'

interface PromptLibraryDrawerProps {
    userId?: string
}

const { TabNav, TabList, TabContent } = Tabs

const categoryIcons: Record<ActionCategory, React.ReactNode> = {
    poses_basic: <PiPersonSimpleWalkDuotone className="w-4 h-4" />,
    poses_fashion: <PiSparkleDuotone className="w-4 h-4" />,
    expressions: <PiSmileyDuotone className="w-4 h-4" />,
    actions_dynamic: <PiPersonArmsSpreadDuotone className="w-4 h-4" />,
    interactions: <PiHandPalmDuotone className="w-4 h-4" />,
    studio_angles: <PiCameraDuotone className="w-4 h-4" />,
}

const PromptLibraryDrawer = ({ userId }: PromptLibraryDrawerProps) => {
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [prompts, setPrompts] = useState<Prompt[]>([])
    const [filterType, setFilterType] = useState<MediaType | 'ALL'>('ALL')
    const [activeTab, setActiveTab] = useState('my-prompts')
    const [expandedCategory, setExpandedCategory] = useState<ActionCategory | null>('poses_basic')

    const {
        isPromptLibraryOpen,
        setIsPromptLibraryOpen,
        showSavePromptInput,
        setShowSavePromptInput,
        newPromptName,
        setNewPromptName,
        prompt,
        setPrompt,
        generationMode,
        pinnedActionIds,
        togglePinnedAction,
    } = useAvatarStudioStore()

    // Load prompts
    const loadPrompts = useCallback(async () => {
        if (!userId) return

        setIsLoading(true)
        try {
            const data = await apiGetPrompts(userId)
            setPrompts(data)
        } catch (error) {
            console.error('Failed to load prompts:', error)
        } finally {
            setIsLoading(false)
        }
    }, [userId])

    useEffect(() => {
        if (isPromptLibraryOpen && userId) {
            loadPrompts()
        }
    }, [isPromptLibraryOpen, userId, loadPrompts])

    // Save current prompt
    const handleSavePrompt = async () => {
        if (!userId || !newPromptName.trim() || !prompt.trim()) return

        setIsSaving(true)
        try {
            const newPrompt = await apiCreatePrompt({
                user_id: userId,
                name: newPromptName.trim(),
                text: prompt,
                media_type: generationMode,
            })
            setPrompts((prev) => [newPrompt, ...prev])
            setNewPromptName('')
            setShowSavePromptInput(false)
            toast.push(
                <Notification type="success" title="Saved">
                    Prompt saved to library
                </Notification>
            )
        } catch (error) {
            console.error('Failed to save prompt:', error)
            toast.push(
                <Notification type="danger" title="Error">
                    Failed to save prompt
                </Notification>
            )
        } finally {
            setIsSaving(false)
        }
    }

    // Use a prompt
    const handleUsePrompt = (promptText: string) => {
        setPrompt(promptText)
        setIsPromptLibraryOpen(false)
        toast.push(
            <Notification type="info" title="Prompt Loaded">
                Prompt applied
            </Notification>
        )
    }

    // Use an action preset - append to existing prompt
    const handleUseActionPreset = (preset: ActionPreset) => {
        const newPrompt = prompt.trim()
            ? `${prompt.trim()}. ${preset.text}`
            : preset.text
        setPrompt(newPrompt)
        setIsPromptLibraryOpen(false)
        toast.push(
            <Notification type="info" title="Action Applied">
                {preset.name} {prompt.trim() ? 'added' : 'applied'}
            </Notification>
        )
    }

    // Toggle pin for action preset
    const handleTogglePin = (presetId: string, event: React.MouseEvent) => {
        event.stopPropagation()
        togglePinnedAction(presetId)
        const isPinned = pinnedActionIds.includes(presetId)
        toast.push(
            <Notification type="info" title={isPinned ? 'Unpinned' : 'Pinned'}>
                {isPinned ? 'Removed from Quick Actions' : 'Added to Quick Actions'}
            </Notification>
        )
    }

    // Delete a prompt
    const handleDeletePrompt = async (promptId: string) => {
        try {
            await apiDeletePrompt(promptId)
            setPrompts((prev) => prev.filter((p) => p.id !== promptId))
            toast.push(
                <Notification type="success" title="Deleted">
                    Prompt removed
                </Notification>
            )
        } catch (error) {
            console.error('Failed to delete prompt:', error)
        }
    }

    // Filter prompts
    const filteredPrompts = prompts.filter((p) =>
        filterType === 'ALL' ? true : p.media_type === filterType
    )

    // Filter action presets by media type
    const filteredPresets = MODEL_ACTION_PRESETS.filter((preset) =>
        filterType === 'ALL' ? true : preset.mediaType === filterType
    )

    // Group presets by category
    const groupedPresets = filteredPresets.reduce((acc, preset) => {
        if (!acc[preset.category]) {
            acc[preset.category] = []
        }
        acc[preset.category].push(preset)
        return acc
    }, {} as Record<ActionCategory, ActionPreset[]>)

    return (
        <Drawer
            title="Prompt Library"
            isOpen={isPromptLibraryOpen}
            onClose={() => {
                setIsPromptLibraryOpen(false)
                setShowSavePromptInput(false)
            }}
            width={450}
        >
            <div className="flex flex-col h-full">
                {/* Save Current Prompt */}
                {showSavePromptInput && prompt.trim() && (
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-primary/5">
                        <p className="text-sm font-medium mb-2">Save Current Prompt</p>
                        <div className="flex gap-2">
                            <Input
                                size="sm"
                                placeholder="Prompt name..."
                                value={newPromptName}
                                onChange={(e) => setNewPromptName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSavePrompt()}
                            />
                            <Button
                                size="sm"
                                icon={<HiOutlineSave />}
                                onClick={handleSavePrompt}
                                loading={isSaving}
                                disabled={!newPromptName.trim()}
                            >
                                Save
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{prompt}</p>
                    </div>
                )}

                {/* Filter */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setFilterType('ALL')}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                                filterType === 'ALL'
                                    ? 'bg-primary text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setFilterType('IMAGE')}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1 ${
                                filterType === 'IMAGE'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <HiOutlinePhotograph className="w-3.5 h-3.5" />
                            Image
                        </button>
                        <button
                            onClick={() => setFilterType('VIDEO')}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1 ${
                                filterType === 'VIDEO'
                                    ? 'bg-purple-500 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200'
                            }`}
                        >
                            <HiOutlineVideoCamera className="w-3.5 h-3.5" />
                            Video
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onChange={(val) => setActiveTab(val)} className="flex-1 flex flex-col overflow-hidden min-h-0">
                    <TabList className="px-4 pt-2">
                        <TabNav value="my-prompts">My Prompts</TabNav>
                        <TabNav value="action-presets">
                            Action Presets
                            {pinnedActionIds.length > 0 && (
                                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded-full">
                                    {pinnedActionIds.length}
                                </span>
                            )}
                        </TabNav>
                    </TabList>

                    {/* My Prompts Tab */}
                    <TabContent value="my-prompts" className="flex-1 overflow-auto min-h-0">
                        <div className="p-4 space-y-3">
                                {isLoading ? (
                                    <div className="flex justify-center py-8">
                                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : filteredPrompts.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500">
                                        <p className="text-sm">No prompts saved yet</p>
                                        <p className="text-xs mt-1">
                                            Save your favorite prompts for quick access
                                        </p>
                                    </div>
                                ) : (
                                    filteredPrompts.map((p) => (
                                        <div
                                            key={p.id}
                                            className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg group hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                                            onClick={() => handleUsePrompt(p.text)}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-medium truncate">
                                                            {p.name}
                                                        </span>
                                                        {p.media_type === 'IMAGE' ? (
                                                            <HiOutlinePhotograph className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                                        ) : (
                                                            <HiOutlineVideoCamera className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-500 line-clamp-2">
                                                        {p.text}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        size="xs"
                                                        variant="plain"
                                                        icon={<HiOutlineClipboardCopy />}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleUsePrompt(p.text)
                                                        }}
                                                    />
                                                    <Button
                                                        size="xs"
                                                        variant="plain"
                                                        color="red"
                                                        icon={<HiOutlineTrash />}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleDeletePrompt(p.id)
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                        </div>
                    </TabContent>

                    {/* Action Presets Tab */}
                    <TabContent value="action-presets" className="flex-1 overflow-auto min-h-0">
                        <div className="p-4 space-y-3">
                                {/* Pinned Actions Section */}
                                {pinnedActionIds.length > 0 && (
                                    <div className="mb-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <PiPushPinFill className="w-4 h-4 text-amber-500" />
                                            <span className="text-sm font-medium">Quick Actions</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {pinnedActionIds.map((id) => {
                                                const preset = MODEL_ACTION_PRESETS.find((p) => p.id === id)
                                                if (!preset) return null
                                                return (
                                                    <button
                                                        key={id}
                                                        onClick={() => handleUseActionPreset(preset)}
                                                        className="px-3 py-1.5 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-colors"
                                                    >
                                                        {preset.name}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Categories */}
                                {Object.entries(groupedPresets).map(([category, presets]) => (
                                    <div key={category} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                        <button
                                            onClick={() => setExpandedCategory(expandedCategory === category ? null : category as ActionCategory)}
                                            className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                {categoryIcons[category as ActionCategory]}
                                                <span className="text-sm font-medium">
                                                    {ACTION_CATEGORIES[category as ActionCategory].label}
                                                </span>
                                                <span className="text-xs text-gray-400">({presets.length})</span>
                                            </div>
                                            <svg
                                                className={`w-4 h-4 transition-transform ${expandedCategory === category ? 'rotate-180' : ''}`}
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {expandedCategory === category && (
                                            <div className="p-2 space-y-1">
                                                {presets.map((preset) => {
                                                    const isPinned = pinnedActionIds.includes(preset.id)
                                                    return (
                                                        <div
                                                            key={preset.id}
                                                            onClick={() => handleUseActionPreset(preset)}
                                                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer group transition-colors"
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-medium">{preset.name}</span>
                                                                        {preset.mediaType === 'VIDEO' && (
                                                                            <HiOutlineVideoCamera className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                                                        )}
                                                                    </div>
                                                                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                                                                        {preset.text}
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    onClick={(e) => handleTogglePin(preset.id, e)}
                                                                    className={`p-1.5 rounded-lg transition-all ${
                                                                        isPinned
                                                                            ? 'text-amber-500 bg-amber-500/10'
                                                                            : 'text-gray-400 opacity-0 group-hover:opacity-100 hover:text-amber-500 hover:bg-amber-500/10'
                                                                    }`}
                                                                    title={isPinned ? 'Unpin from Quick Actions' : 'Pin to Quick Actions'}
                                                                >
                                                                    {isPinned ? (
                                                                        <PiPushPinFill className="w-4 h-4" />
                                                                    ) : (
                                                                        <PiPushPinSlashDuotone className="w-4 h-4" />
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    </TabContent>
                </Tabs>

                {/* Quick Add Button */}
                {!showSavePromptInput && prompt.trim() && (
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                        <Button
                            variant="solid"
                            block
                            icon={<HiOutlineSave />}
                            onClick={() => setShowSavePromptInput(true)}
                        >
                            Save Current Prompt
                        </Button>
                    </div>
                )}
            </div>
        </Drawer>
    )
}

export default PromptLibraryDrawer
