'use client'

import { useEffect, useRef } from 'react'
import { useAvatarStudioStore } from '../_store/avatarStudioStore'
import { supabase } from '@/lib/supabase'
import { createThumbnail } from '@/utils/imageOptimization'
import type { Avatar, AIProvider, Prompt } from '@/@types/supabase'
import type { ReferenceImage } from '../types'

interface AvatarStudioProviderProps {
    children: React.ReactNode
    avatar?: Avatar | null
    references?: ReferenceImage[]
    providers?: AIProvider[]
    prompts?: Prompt[]
}

// Download file from Supabase Storage and convert to base64
const downloadAndConvertToBase64 = async (bucket: string, path: string): Promise<{ base64: string; url: string }> => {
    try {
        // Download the file directly using Supabase client
        const { data, error } = await supabase.storage
            .from(bucket)
            .download(path)

        if (error || !data) {
            console.error('Failed to download from storage:', error)
            return { base64: '', url: '' }
        }

        // Convert blob to base64
        return new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
                const result = reader.result as string
                const base64 = result.split(',')[1] || result
                resolve({ base64, url: result })
            }
            reader.onerror = () => resolve({ base64: '', url: '' })
            reader.readAsDataURL(data)
        })
    } catch (error) {
        console.error('Failed to download and convert to base64:', error)
        return { base64: '', url: '' }
    }
}

// Load references with base64 data from Storage
const loadReferencesWithBase64 = async (refs: ReferenceImage[]): Promise<ReferenceImage[]> => {
    const loadedRefs = await Promise.all(
        refs.map(async (ref) => {
            // If we already have base64, use it
            if (ref.base64 && ref.base64.length > 0) {
                // Still create thumbnail if missing
                if (!ref.thumbnailUrl) {
                    try {
                        const thumbnailUrl = await createThumbnail(ref.base64, 'THUMBNAIL')
                        return { ...ref, thumbnailUrl }
                    } catch {
                        return ref
                    }
                }
                return ref
            }

            // If we have storagePath, fetch from Storage using Supabase client
            if (ref.storagePath) {
                const { base64, url } = await downloadAndConvertToBase64('avatars', ref.storagePath)

                // Create optimized thumbnail using Canvas (200x200)
                let thumbnailUrl = url
                if (base64) {
                    try {
                        thumbnailUrl = await createThumbnail(base64, 'THUMBNAIL')
                    } catch {
                        // Fallback to full URL if thumbnail creation fails
                    }
                }

                return {
                    ...ref,
                    url,
                    base64,
                    thumbnailUrl,
                }
            }

            return ref
        })
    )
    return loadedRefs
}

const AvatarStudioProvider = ({
    children,
    avatar,
    references = [],
    providers = [],
    prompts = [],
}: AvatarStudioProviderProps) => {
    // Use refs to track initialization and prevent re-loading
    const initializedRef = useRef(false)
    const avatarIdRef = useRef<string | null>(null)

    // Get store actions directly to avoid re-renders
    const setProviders = useAvatarStudioStore((state) => state.setProviders)
    const setPromptPresets = useAvatarStudioStore((state) => state.setPromptPresets)
    const loadAvatarData = useAvatarStudioStore((state) => state.loadAvatarData)
    const setIsLoadingReferences = useAvatarStudioStore((state) => state.setIsLoadingReferences)

    // Initialize providers and prompts only once
    useEffect(() => {
        if (providers.length > 0) {
            setProviders(providers)
        }
        if (prompts.length > 0) {
            setPromptPresets(prompts)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Only run once on mount

    // Load avatar data only when avatar changes
    useEffect(() => {
        // Skip if already initialized with the same avatar
        if (initializedRef.current && avatarIdRef.current === avatar?.id) {
            return
        }

        // Load avatar if editing existing
        if (avatar && references.length > 0) {
            initializedRef.current = true
            avatarIdRef.current = avatar.id

            // Set loading state
            setIsLoadingReferences(true)

            // Load references with base64 data
            loadReferencesWithBase64(references)
                .then((loadedRefs) => {
                    const faceRef = loadedRefs.find((r) => r.type === 'face') || null
                    const angleRef = loadedRefs.find((r) => r.type === 'angle') || null
                    const bodyRef = loadedRefs.find((r) => r.type === 'body') || null
                    const generalRefs = loadedRefs.filter((r) => r.type === 'general')

                    loadAvatarData(avatar, generalRefs, faceRef, angleRef, bodyRef)
                })
                .finally(() => {
                    setIsLoadingReferences(false)
                })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [avatar?.id]) // Only re-run when avatar ID changes

    return <>{children}</>
}

export default AvatarStudioProvider
