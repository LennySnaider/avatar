/**
 * TIPOS GENERADOS del schema real de Supabase (F4.0.2 — resuelve el drift del
 * archivo a mano). Fuente de verdad para tablas/columnas nuevas.
 *
 * REGENERAR: `npm run db:types` (requiere `supabase login` una vez, o
 * SUPABASE_ACCESS_TOKEN en el entorno). Alternativa sin CLI: la tool MCP
 * `generate_typescript_types` produce este mismo contenido.
 *
 * NOTA: `src/@types/supabase.ts` (a mano) sigue siendo el archivo APP-facing
 * porque enriquece columnas jsonb (measurements: PhysicalMeasurements, etc.).
 * Para tablas nuevas del multitenant usar estos tipos directamente.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agent_chats: {
        Row: {
          attention_reason: string | null
          avatar_id: string
          created_at: string
          external_chat_id: string
          fan_avatar_url: string | null
          fan_display_name: string | null
          fan_handle: string | null
          id: string
          is_creator: boolean
          last_fan_message_at: string | null
          last_message_at: string | null
          mode: Database["public"]["Enums"]["agent_chat_mode"]
          needs_attention: boolean
          organization_id: string
          platform: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          attention_reason?: string | null
          avatar_id: string
          created_at?: string
          external_chat_id: string
          fan_avatar_url?: string | null
          fan_display_name?: string | null
          fan_handle?: string | null
          id?: string
          is_creator?: boolean
          last_fan_message_at?: string | null
          last_message_at?: string | null
          mode?: Database["public"]["Enums"]["agent_chat_mode"]
          needs_attention?: boolean
          organization_id: string
          platform?: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          attention_reason?: string | null
          avatar_id?: string
          created_at?: string
          external_chat_id?: string
          fan_avatar_url?: string | null
          fan_display_name?: string | null
          fan_handle?: string | null
          id?: string
          is_creator?: boolean
          last_fan_message_at?: string | null
          last_message_at?: string | null
          mode?: Database["public"]["Enums"]["agent_chat_mode"]
          needs_attention?: boolean
          organization_id?: string
          platform?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_chats_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_chats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          approved_by: string | null
          chat_id: string
          created_at: string
          direction: Database["public"]["Enums"]["agent_msg_direction"]
          error_message: string | null
          external_created_at: string | null
          external_message_id: string | null
          generated_by: Json | null
          id: string
          media: Json
          organization_id: string
          send_after: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["agent_msg_status"]
          text: string | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          chat_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["agent_msg_direction"]
          error_message?: string | null
          external_created_at?: string | null
          external_message_id?: string | null
          generated_by?: Json | null
          id?: string
          media?: Json
          organization_id: string
          send_after?: string | null
          sent_at?: string | null
          status: Database["public"]["Enums"]["agent_msg_status"]
          text?: string | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          chat_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["agent_msg_direction"]
          error_message?: string | null
          external_created_at?: string | null
          external_message_id?: string | null
          generated_by?: Json | null
          id?: string
          media?: Json
          organization_id?: string
          send_after?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["agent_msg_status"]
          text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "agent_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_usage_counters: {
        Row: {
          avatar_id: string
          counter: string
          id: string
          organization_id: string
          period: string
          value: number
        }
        Insert: {
          avatar_id: string
          counter: string
          id?: string
          organization_id: string
          period: string
          value?: number
        }
        Update: {
          avatar_id?: string
          counter?: string
          id?: string
          organization_id?: string
          period?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_usage_counters_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_usage_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          organization_id: string | null
          api_key: string | null
          api_key_env_var: string | null
          created_at: string | null
          endpoint: string | null
          id: string
          is_active: boolean | null
          model: string
          name: string
          requires_api_key: boolean | null
          supports_image: boolean | null
          supports_video: boolean | null
          type: string
        }
        Insert: {
          organization_id?: string | null
          api_key?: string | null
          api_key_env_var?: string | null
          created_at?: string | null
          endpoint?: string | null
          id?: string
          is_active?: boolean | null
          model: string
          name: string
          requires_api_key?: boolean | null
          supports_image?: boolean | null
          supports_video?: boolean | null
          type: string
        }
        Update: {
          organization_id?: string | null
          api_key?: string | null
          api_key_env_var?: string | null
          created_at?: string | null
          endpoint?: string | null
          id?: string
          is_active?: boolean | null
          model?: string
          name?: string
          requires_api_key?: boolean | null
          supports_image?: boolean | null
          supports_video?: boolean | null
          type?: string
        }
        Relationships: []
      }
      audio_scripts: {
        Row: {
          organization_id: string
          context: Json
          created_at: string
          duration_target_seconds: number
          generation_id: string | null
          id: string
          language: string
          script_text: string
          template_type: string
          title: string
          tone: string
          user_id: string
        }
        Insert: {
          organization_id?: string
          context?: Json
          created_at?: string
          duration_target_seconds?: number
          generation_id?: string | null
          id?: string
          language?: string
          script_text: string
          template_type?: string
          title: string
          tone?: string
          user_id: string
        }
        Update: {
          organization_id?: string
          context?: Json
          created_at?: string
          duration_target_seconds?: number
          generation_id?: string | null
          id?: string
          language?: string
          script_text?: string
          template_type?: string
          title?: string
          tone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_scripts_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_fan_memories: {
        Row: {
          avatar_id: string
          created_at: string
          display_name: string | null
          external_fan_id: string
          facts: Json
          id: string
          last_seen_at: string | null
          organization_id: string
          platform: string
          spend_total: number | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          avatar_id: string
          created_at?: string
          display_name?: string | null
          external_fan_id: string
          facts?: Json
          id?: string
          last_seen_at?: string | null
          organization_id: string
          platform?: string
          spend_total?: number | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          avatar_id?: string
          created_at?: string
          display_name?: string | null
          external_fan_id?: string
          facts?: Json
          id?: string
          last_seen_at?: string | null
          organization_id?: string
          platform?: string
          spend_total?: number | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_fan_memories_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_fan_memories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_knowledge: {
        Row: {
          avatar_id: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          kind: string
          metadata: Json
          organization_id: string
          source_ref: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar_id: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          kind?: string
          metadata?: Json
          organization_id: string
          source_ref?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_id?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          kind?: string
          metadata?: Json
          organization_id?: string
          source_ref?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_knowledge_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_knowledge_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_personas: {
        Row: {
          api_key: string | null
          autopilot: Json
          avatar_id: string
          backstory: string | null
          boundaries: string | null
          chat_model: string
          chat_provider: string
          created_at: string
          enabled: boolean
          id: string
          languages: string[]
          nsfw_level: string
          organization_id: string
          personality: Json
          response_length: string
          response_objective: string
          response_tone: string
          system_prompt: string | null
          updated_at: string
          writing_style: string | null
        }
        Insert: {
          api_key?: string | null
          autopilot?: Json
          avatar_id: string
          backstory?: string | null
          boundaries?: string | null
          chat_model?: string
          chat_provider?: string
          created_at?: string
          enabled?: boolean
          id?: string
          languages?: string[]
          nsfw_level?: string
          organization_id: string
          personality?: Json
          response_length?: string
          response_objective?: string
          response_tone?: string
          system_prompt?: string | null
          updated_at?: string
          writing_style?: string | null
        }
        Update: {
          api_key?: string | null
          autopilot?: Json
          avatar_id?: string
          backstory?: string | null
          boundaries?: string | null
          chat_model?: string
          chat_provider?: string
          created_at?: string
          enabled?: boolean
          id?: string
          languages?: string[]
          nsfw_level?: string
          organization_id?: string
          personality?: Json
          response_length?: string
          response_objective?: string
          response_tone?: string
          system_prompt?: string | null
          updated_at?: string
          writing_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_personas_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: true
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_personas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_references: {
        Row: {
          organization_id: string
          avatar_id: string | null
          created_at: string | null
          id: string
          mime_type: string
          storage_path: string
          type: string
        }
        Insert: {
          organization_id?: string
          avatar_id?: string | null
          created_at?: string | null
          id?: string
          mime_type: string
          storage_path: string
          type: string
        }
        Update: {
          organization_id?: string
          avatar_id?: string | null
          created_at?: string | null
          id?: string
          mime_type?: string
          storage_path?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_references_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
        ]
      }
      avatars: {
        Row: {
          organization_id: string
          created_at: string | null
          default_voice_id: string | null
          face_description: string | null
          fanvue_creator_uuid: string | null
          id: string
          identity_weight: number | null
          measurements: Json | null
          name: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          organization_id?: string
          created_at?: string | null
          default_voice_id?: string | null
          face_description?: string | null
          fanvue_creator_uuid?: string | null
          id?: string
          identity_weight?: number | null
          measurements?: Json | null
          name: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          organization_id?: string
          created_at?: string | null
          default_voice_id?: string | null
          face_description?: string | null
          fanvue_creator_uuid?: string | null
          id?: string
          identity_weight?: number | null
          measurements?: Json | null
          name?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatars_default_voice_id_fkey"
            columns: ["default_voice_id"]
            isOneToOne: false
            referencedRelation: "cloned_voices"
            referencedColumns: ["id"]
          },
        ]
      }
      cloned_voices: {
        Row: {
          organization_id: string
          avatar_id: string | null
          created_at: string
          id: string
          language: string
          name: string
          preview_audio_url: string | null
          provider: string
          provider_voice_id: string
          sample_audio_url: string
          status: string
          tts_settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          organization_id?: string
          avatar_id?: string | null
          created_at?: string
          id?: string
          language?: string
          name: string
          preview_audio_url?: string | null
          provider?: string
          provider_voice_id: string
          sample_audio_url: string
          status?: string
          tts_settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          organization_id?: string
          avatar_id?: string | null
          created_at?: string
          id?: string
          language?: string
          name?: string
          preview_audio_url?: string | null
          provider?: string
          provider_voice_id?: string
          sample_audio_url?: string
          status?: string
          tts_settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cloned_voices_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
        ]
      }
      fanvue_connections: {
        Row: {
          organization_id: string
          access_token: string | null
          created_at: string
          fanvue_account_uuid: string | null
          id: string
          refresh_token: string | null
          scopes: string[] | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          organization_id?: string
          access_token?: string | null
          created_at?: string
          fanvue_account_uuid?: string | null
          id?: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          organization_id?: string
          access_token?: string | null
          created_at?: string
          fanvue_account_uuid?: string | null
          id?: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fanvue_creators: {
        Row: {
          organization_id: string
          avatar_url: string | null
          connection_id: string
          creator_user_uuid: string
          display_name: string | null
          handle: string | null
          id: string
          updated_at: string
        }
        Insert: {
          organization_id?: string
          avatar_url?: string | null
          connection_id: string
          creator_user_uuid: string
          display_name?: string | null
          handle?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          organization_id?: string
          avatar_url?: string | null
          connection_id?: string
          creator_user_uuid?: string
          display_name?: string | null
          handle?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fanvue_creators_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "fanvue_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      fanvue_posts: {
        Row: {
          organization_id: string
          audience: string | null
          caption: string | null
          created_at: string
          creator_user_uuid: string | null
          error_message: string | null
          fanvue_post_uuid: string | null
          generation_id: string | null
          id: string
          media_uuids: string[] | null
          price: number | null
          published_at: string | null
          scheduled_at: string | null
          status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          organization_id?: string
          audience?: string | null
          caption?: string | null
          created_at?: string
          creator_user_uuid?: string | null
          error_message?: string | null
          fanvue_post_uuid?: string | null
          generation_id?: string | null
          id?: string
          media_uuids?: string[] | null
          price?: number | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          organization_id?: string
          audience?: string | null
          caption?: string | null
          created_at?: string
          creator_user_uuid?: string | null
          error_message?: string | null
          fanvue_post_uuid?: string | null
          generation_id?: string | null
          id?: string
          media_uuids?: string[] | null
          price?: number | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      generations: {
        Row: {
          organization_id: string
          aspect_ratio: string | null
          avatar_id: string | null
          created_at: string | null
          id: string
          media_type: string
          metadata: Json | null
          prompt: string
          storage_path: string
          user_id: string | null
        }
        Insert: {
          organization_id?: string
          aspect_ratio?: string | null
          avatar_id?: string | null
          created_at?: string | null
          id?: string
          media_type: string
          metadata?: Json | null
          prompt: string
          storage_path: string
          user_id?: string | null
        }
        Update: {
          organization_id?: string
          aspect_ratio?: string | null
          avatar_id?: string | null
          created_at?: string | null
          id?: string
          media_type?: string
          metadata?: Json | null
          prompt?: string
          storage_path?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generations_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompts: {
        Row: {
          organization_id: string
          category: string | null
          created_at: string | null
          id: string
          is_pinned: boolean | null
          media_type: string
          name: string
          text: string
          user_id: string | null
        }
        Insert: {
          organization_id?: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          media_type: string
          name: string
          text: string
          user_id?: string | null
        }
        Update: {
          organization_id?: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          media_type?: string
          name?: string
          text?: string
          user_id?: string | null
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          organization_id: string
          caption: string
          content_type: string
          created_at: string
          error_message: string | null
          generation_id: string | null
          hashtags: string[]
          id: string
          media_urls: string[]
          platforms: Json
          published_at: string | null
          scheduled_at: string | null
          social_profile_id: string | null
          status: string
          updated_at: string
          upload_post_job_id: string | null
          upload_post_request_id: string | null
          upload_post_response: Json | null
          user_id: string | null
        }
        Insert: {
          organization_id?: string
          caption?: string
          content_type: string
          created_at?: string
          error_message?: string | null
          generation_id?: string | null
          hashtags?: string[]
          id?: string
          media_urls?: string[]
          platforms?: Json
          published_at?: string | null
          scheduled_at?: string | null
          social_profile_id?: string | null
          status?: string
          updated_at?: string
          upload_post_job_id?: string | null
          upload_post_request_id?: string | null
          upload_post_response?: Json | null
          user_id?: string | null
        }
        Update: {
          organization_id?: string
          caption?: string
          content_type?: string
          created_at?: string
          error_message?: string | null
          generation_id?: string | null
          hashtags?: string[]
          id?: string
          media_urls?: string[]
          platforms?: Json
          published_at?: string | null
          scheduled_at?: string | null
          social_profile_id?: string | null
          status?: string
          updated_at?: string
          upload_post_job_id?: string | null
          upload_post_request_id?: string | null
          upload_post_response?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_social_profile_id_fkey"
            columns: ["social_profile_id"]
            isOneToOne: false
            referencedRelation: "social_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      social_profiles: {
        Row: {
          organization_id: string
          api_key: string | null
          avatar_id: string | null
          connected_platforms: Json
          created_at: string
          id: string
          last_synced_at: string | null
          status: string
          upload_post_metadata: Json | null
          upload_post_username: string
        }
        Insert: {
          organization_id?: string
          api_key?: string | null
          avatar_id?: string | null
          connected_platforms?: Json
          created_at?: string
          id?: string
          last_synced_at?: string | null
          status?: string
          upload_post_metadata?: Json | null
          upload_post_username: string
        }
        Update: {
          organization_id?: string
          api_key?: string | null
          avatar_id?: string | null
          connected_platforms?: Json
          created_at?: string
          id?: string
          last_synced_at?: string | null
          status?: string
          upload_post_metadata?: Json | null
          upload_post_username?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_profiles_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
        ]
      }
      trending_sounds: {
        Row: {
          author: string | null
          country_code: string
          cover_url: string | null
          fetched_at: string
          id: string
          is_original: boolean | null
          link_url: string | null
          name: string
          period: number
          play_url: string | null
          rank: number
          sound_id: string | null
          source: string
          trend: string | null
          video_count: number | null
        }
        Insert: {
          author?: string | null
          country_code?: string
          cover_url?: string | null
          fetched_at?: string
          id?: string
          is_original?: boolean | null
          link_url?: string | null
          name: string
          period?: number
          play_url?: string | null
          rank: number
          sound_id?: string | null
          source?: string
          trend?: string | null
          video_count?: number | null
        }
        Update: {
          author?: string | null
          country_code?: string
          cover_url?: string | null
          fetched_at?: string
          id?: string
          is_original?: boolean | null
          link_url?: string | null
          name?: string
          period?: number
          play_url?: string | null
          rank?: number
          sound_id?: string | null
          source?: string
          trend?: string | null
          video_count?: number | null
        }
        Relationships: []
      }
      users: {
        Row: {
          authority: string[]
          created_at: string
          email: string
          id: string
          image: string | null
          is_platform_admin: boolean
          name: string | null
          password_hash: string | null
          provider: string
          provider_account_id: string | null
          updated_at: string
        }
        Insert: {
          authority?: string[]
          created_at?: string
          email: string
          id: string
          image?: string | null
          is_platform_admin?: boolean
          name?: string | null
          password_hash?: string | null
          provider?: string
          provider_account_id?: string | null
          updated_at?: string
        }
        Update: {
          authority?: string[]
          created_at?: string
          email?: string
          id?: string
          image?: string | null
          is_platform_admin?: boolean
          name?: string | null
          password_hash?: string | null
          provider?: string
          provider_account_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      video_flows: {
        Row: {
          organization_id: string
          created_at: string | null
          description: string | null
          edges: Json
          id: string
          is_template: boolean | null
          name: string
          nodes: Json
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          organization_id?: string
          created_at?: string | null
          description?: string | null
          edges?: Json
          id?: string
          is_template?: boolean | null
          name: string
          nodes?: Json
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          organization_id?: string
          created_at?: string | null
          description?: string | null
          edges?: Json
          id?: string
          is_template?: boolean | null
          name?: string
          nodes?: Json
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_agent_counter: {
        Args: {
          p_avatar: string
          p_counter: string
          p_delta?: number
          p_org: string
          p_period: string
        }
        Returns: undefined
      }
      match_avatar_knowledge: {
        Args: {
          p_avatar_id: string
          p_match_count?: number
          p_min_similarity?: number
          p_query_embedding: string
        }
        Returns: {
          content: string
          id: string
          kind: string
          metadata: Json
          similarity: number
          title: string
        }[]
      }
    }
    Enums: {
      agent_chat_mode: "off" | "draft" | "auto"
      agent_msg_direction: "in" | "out"
      agent_msg_status:
        | "received"
        | "draft"
        | "approved"
        | "sent"
        | "failed"
        | "discarded"
      org_member_role: "owner" | "admin" | "operator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agent_chat_mode: ["off", "draft", "auto"],
      agent_msg_direction: ["in", "out"],
      agent_msg_status: [
        "received",
        "draft",
        "approved",
        "sent",
        "failed",
        "discarded",
      ],
      org_member_role: ["owner", "admin", "operator"],
    },
  },
} as const
