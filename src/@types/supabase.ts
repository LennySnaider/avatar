export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export type Database = {
    public: {
        Tables: {
            avatars: {
                Row: {
                    id: string
                    user_id: string | null
                    name: string
                    identity_weight: number | null
                    face_description: string | null
                    measurements: PhysicalMeasurements | null
                    created_at: string | null
                    updated_at: string | null
                }
                Insert: {
                    id?: string
                    user_id?: string | null
                    name: string
                    identity_weight?: number | null
                    face_description?: string | null
                    measurements?: PhysicalMeasurements | null
                    created_at?: string | null
                    updated_at?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string | null
                    name?: string
                    identity_weight?: number | null
                    face_description?: string | null
                    measurements?: PhysicalMeasurements | null
                    created_at?: string | null
                    updated_at?: string | null
                }
                Relationships: []
            }
            avatar_references: {
                Row: {
                    id: string
                    avatar_id: string | null
                    type: ReferenceType
                    storage_path: string
                    mime_type: string
                    created_at: string | null
                }
                Insert: {
                    id?: string
                    avatar_id?: string | null
                    type: ReferenceType
                    storage_path: string
                    mime_type: string
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    avatar_id?: string | null
                    type?: ReferenceType
                    storage_path?: string
                    mime_type?: string
                    created_at?: string | null
                }
                Relationships: []
            }
            generations: {
                Row: {
                    id: string
                    user_id: string | null
                    avatar_id: string | null
                    media_type: MediaType
                    storage_path: string
                    prompt: string
                    aspect_ratio: string | null
                    metadata: GenerationMetadata | null
                    created_at: string | null
                }
                Insert: {
                    id?: string
                    user_id?: string | null
                    avatar_id?: string | null
                    media_type: MediaType
                    storage_path: string
                    prompt: string
                    aspect_ratio?: string | null
                    metadata?: GenerationMetadata | null
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string | null
                    avatar_id?: string | null
                    media_type?: MediaType
                    storage_path?: string
                    prompt?: string
                    aspect_ratio?: string | null
                    metadata?: GenerationMetadata | null
                    created_at?: string | null
                }
                Relationships: []
            }
            prompts: {
                Row: {
                    id: string
                    user_id: string | null
                    name: string
                    text: string
                    media_type: MediaType
                    is_pinned: boolean | null
                    category: string | null
                    created_at: string | null
                }
                Insert: {
                    id?: string
                    user_id?: string | null
                    name: string
                    text: string
                    media_type: MediaType
                    is_pinned?: boolean | null
                    category?: string | null
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    user_id?: string | null
                    name?: string
                    text?: string
                    media_type?: MediaType
                    is_pinned?: boolean | null
                    category?: string | null
                    created_at?: string | null
                }
                Relationships: []
            }
            ai_providers: {
                Row: {
                    id: string
                    name: string
                    type: ProviderType
                    model: string
                    endpoint: string | null
                    is_active: boolean | null
                    supports_image: boolean | null
                    supports_video: boolean | null
                    requires_api_key: boolean | null
                    api_key_env_var: string | null
                    created_at: string | null
                }
                Insert: {
                    id?: string
                    name: string
                    type: ProviderType
                    model: string
                    endpoint?: string | null
                    is_active?: boolean | null
                    supports_image?: boolean | null
                    supports_video?: boolean | null
                    requires_api_key?: boolean | null
                    api_key_env_var?: string | null
                    created_at?: string | null
                }
                Update: {
                    id?: string
                    name?: string
                    type?: ProviderType
                    model?: string
                    endpoint?: string | null
                    is_active?: boolean | null
                    supports_image?: boolean | null
                    supports_video?: boolean | null
                    requires_api_key?: boolean | null
                    api_key_env_var?: string | null
                    created_at?: string | null
                }
                Relationships: []
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
    }
}

// Custom types
export type ReferenceType = 'general' | 'face' | 'angle' | 'body'
export type MediaType = 'IMAGE' | 'VIDEO'
export type ProviderType = 'GOOGLE' | 'KLING' | 'OPENAI' | 'RUNWAY' | 'QWEN' | 'CUSTOM'
export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4'

export type BodyType = 'petite' | 'slim' | 'athletic' | 'average' | 'curvy' | 'hourglass' | 'plus-size'

// Skin tone scale (1-9 loosely based on Fitzpatrick scale)
export type SkinTone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

// Hair color options
export type HairColor =
    | 'black'
    | 'dark-brown'
    | 'brown'
    | 'light-brown'
    | 'dark-blonde'
    | 'blonde'
    | 'platinum-blonde'
    | 'red'
    | 'auburn'
    | 'ginger'
    | 'gray'
    | 'silver'
    | 'white'

export interface PhysicalMeasurements {
    age: number
    height: number // in cm
    bodyType: BodyType
    bust: number
    waist: number
    hips: number
    skinTone?: SkinTone // 1=very fair/porcelain, 9=very dark/ebony
    hairColor?: HairColor
}

export interface GenerationMetadata {
    provider_id?: string
    model?: string
    identity_weight?: number
    style_weight?: number
    camera_motion?: string
    subject_action?: string
    [key: string]: unknown
}

// Table row types shortcuts
export type Avatar = Database['public']['Tables']['avatars']['Row']
export type AvatarInsert = Database['public']['Tables']['avatars']['Insert']
export type AvatarUpdate = Database['public']['Tables']['avatars']['Update']

export type AvatarReference = Database['public']['Tables']['avatar_references']['Row']
export type AvatarReferenceInsert = Database['public']['Tables']['avatar_references']['Insert']

export type Generation = Database['public']['Tables']['generations']['Row']
export type GenerationInsert = Database['public']['Tables']['generations']['Insert']

export type Prompt = Database['public']['Tables']['prompts']['Row']
export type PromptInsert = Database['public']['Tables']['prompts']['Insert']
export type PromptUpdate = Database['public']['Tables']['prompts']['Update']

export type AIProvider = Database['public']['Tables']['ai_providers']['Row']
