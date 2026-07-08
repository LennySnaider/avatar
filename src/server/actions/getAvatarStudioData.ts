import { createServerSupabaseClient } from '@/lib/supabase'
import type { AIProvider, Prompt, Avatar, AvatarReference } from '@/@types/supabase'
import type { ClonedVoice } from '@/@types/voice'

interface AvatarStudioData {
    avatar: Avatar | null
    references: AvatarReference[]
    providers: AIProvider[]
    prompts: Prompt[]
    defaultVoice: ClonedVoice | null
}

const getAvatarStudioData = async (
    avatarId?: string,
    userId?: string
): Promise<AvatarStudioData> => {
    const supabase = createServerSupabaseClient()

    // Get providers (global, read-only for all)
    const { data: providers, error: providersError } = await supabase
        .from('ai_providers')
        .select('*')
        .eq('is_active', true)
        .order('name')

    if (providersError) {
        console.error('Error fetching providers:', providersError)
    }

    // Get user's prompts
    let prompts: Prompt[] = []
    if (userId) {
        const { data: userPrompts, error: promptsError } = await supabase
            .from('prompts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })

        if (promptsError) {
            console.error('Error fetching prompts:', promptsError)
        } else {
            prompts = userPrompts || []
        }
    }

    // Get avatar if editing
    let avatar: Avatar | null = null
    let references: AvatarReference[] = []
    let defaultVoice: ClonedVoice | null = null

    if (avatarId) {
        const { data: avatarData, error: avatarError } = await supabase
            .from('avatars')
            .select('*')
            .eq('id', avatarId)
            .single()

        if (avatarError) {
            console.error('Error fetching avatar:', avatarError)
        } else {
            avatar = avatarData
        }

        // Get references
        if (avatar) {
            const { data: refsData, error: refsError } = await supabase
                .from('avatar_references')
                .select('*')
                .eq('avatar_id', avatarId)

            if (refsError) {
                console.error('Error fetching references:', refsError)
            } else {
                references = refsData || []
            }

            // Get the avatar's default cloned voice, if any
            if (avatar?.default_voice_id) {
                const { data: voiceData, error: voiceError } = await supabase
                    .from('cloned_voices')
                    .select('*')
                    .eq('id', avatar.default_voice_id)
                    .eq('status', 'ready')
                    .single()

                if (voiceError) {
                    console.error('Error fetching default voice:', voiceError)
                } else {
                    defaultVoice = voiceData as unknown as ClonedVoice
                }
            }
        }
    }

    return {
        avatar,
        references,
        providers: providers || [],
        prompts,
        defaultVoice,
    }
}

export default getAvatarStudioData
