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
    PostgrestVersion: "14.5"
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
          api_key: string | null
          api_key_env_var: string | null
          created_at: string | null
          endpoint: string | null
          id: string
          is_active: boolean | null
          model: string
          name: string
          organization_id: string | null
          requires_api_key: boolean | null
          supports_image: boolean | null
          supports_video: boolean | null
          type: string
        }
        Insert: {
          api_key?: string | null
          api_key_env_var?: string | null
          created_at?: string | null
          endpoint?: string | null
          id?: string
          is_active?: boolean | null
          model: string
          name: string
          organization_id?: string | null
          requires_api_key?: boolean | null
          supports_image?: boolean | null
          supports_video?: boolean | null
          type: string
        }
        Update: {
          api_key?: string | null
          api_key_env_var?: string | null
          created_at?: string | null
          endpoint?: string | null
          id?: string
          is_active?: boolean | null
          model?: string
          name?: string
          organization_id?: string | null
          requires_api_key?: boolean | null
          supports_image?: boolean | null
          supports_video?: boolean | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_providers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_scripts: {
        Row: {
          context: Json
          created_at: string
          duration_target_seconds: number
          generation_id: string | null
          id: string
          language: string
          organization_id: string
          script_text: string
          template_type: string
          title: string
          tone: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          duration_target_seconds?: number
          generation_id?: string | null
          id?: string
          language?: string
          organization_id: string
          script_text: string
          template_type?: string
          title: string
          tone?: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          duration_target_seconds?: number
          generation_id?: string | null
          id?: string
          language?: string
          organization_id?: string
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
          {
            foreignKeyName: "audio_scripts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_rate_limits: {
        Row: {
          attempts: number
          bucket: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          bucket: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          bucket?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
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
          avatar_id: string | null
          created_at: string | null
          id: string
          mime_type: string
          organization_id: string
          storage_path: string
          storage_provider: string
          type: string
        }
        Insert: {
          avatar_id?: string | null
          created_at?: string | null
          id?: string
          mime_type: string
          organization_id: string
          storage_path: string
          storage_provider?: string
          type: string
        }
        Update: {
          avatar_id?: string | null
          created_at?: string | null
          id?: string
          mime_type?: string
          organization_id?: string
          storage_path?: string
          storage_provider?: string
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
          {
            foreignKeyName: "avatar_references_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_telegram_settings: {
        Row: {
          avatar_id: string
          bot_id: number
          bot_token: string
          bot_username: string | null
          connected_at: string | null
          created_at: string
          disconnected_at: string | null
          enabled: boolean
          id: string
          last_error: string | null
          last_update_at: string | null
          organization_id: string
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          avatar_id: string
          bot_id: number
          bot_token: string
          bot_username?: string | null
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_update_at?: string | null
          organization_id: string
          updated_at?: string
          webhook_secret: string
        }
        Update: {
          avatar_id?: string
          bot_id?: number
          bot_token?: string
          bot_username?: string | null
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_update_at?: string | null
          organization_id?: string
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_telegram_settings_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: true
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_telegram_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      avatars: {
        Row: {
          created_at: string | null
          default_voice_id: string | null
          face_description: string | null
          fanvue_creator_uuid: string | null
          id: string
          identity_weight: number | null
          measurements: Json | null
          name: string
          organization_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          default_voice_id?: string | null
          face_description?: string | null
          fanvue_creator_uuid?: string | null
          id?: string
          identity_weight?: number | null
          measurements?: Json | null
          name: string
          organization_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          default_voice_id?: string | null
          face_description?: string | null
          fanvue_creator_uuid?: string | null
          id?: string
          identity_weight?: number | null
          measurements?: Json | null
          name?: string
          organization_id?: string
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
          {
            foreignKeyName: "avatars_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cloned_voices: {
        Row: {
          avatar_id: string | null
          created_at: string
          id: string
          language: string
          name: string
          organization_id: string
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
          avatar_id?: string | null
          created_at?: string
          id?: string
          language?: string
          name: string
          organization_id: string
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
          avatar_id?: string | null
          created_at?: string
          id?: string
          language?: string
          name?: string
          organization_id?: string
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
          {
            foreignKeyName: "cloned_voices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fanvue_connections: {
        Row: {
          access_token: string | null
          created_at: string
          fanvue_account_uuid: string | null
          id: string
          organization_id: string
          refresh_token: string | null
          scopes: string[] | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          fanvue_account_uuid?: string | null
          id?: string
          organization_id: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          fanvue_account_uuid?: string | null
          id?: string
          organization_id?: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fanvue_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fanvue_creators: {
        Row: {
          avatar_url: string | null
          connection_id: string
          creator_user_uuid: string
          display_name: string | null
          handle: string | null
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          connection_id: string
          creator_user_uuid: string
          display_name?: string | null
          handle?: string | null
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          connection_id?: string
          creator_user_uuid?: string
          display_name?: string | null
          handle?: string | null
          id?: string
          organization_id?: string
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
          {
            foreignKeyName: "fanvue_creators_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fanvue_posts: {
        Row: {
          audience: string | null
          caption: string | null
          created_at: string
          creator_user_uuid: string | null
          error_message: string | null
          fanvue_post_uuid: string | null
          generation_id: string | null
          id: string
          media_uuids: string[] | null
          organization_id: string
          price: number | null
          published_at: string | null
          scheduled_at: string | null
          status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          audience?: string | null
          caption?: string | null
          created_at?: string
          creator_user_uuid?: string | null
          error_message?: string | null
          fanvue_post_uuid?: string | null
          generation_id?: string | null
          id?: string
          media_uuids?: string[] | null
          organization_id: string
          price?: number | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          audience?: string | null
          caption?: string | null
          created_at?: string
          creator_user_uuid?: string | null
          error_message?: string | null
          fanvue_post_uuid?: string | null
          generation_id?: string | null
          id?: string
          media_uuids?: string[] | null
          organization_id?: string
          price?: number | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fanvue_posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          aspect_ratio: string | null
          avatar_id: string | null
          created_at: string | null
          id: string
          media_type: string
          metadata: Json | null
          organization_id: string
          prompt: string
          storage_path: string
          storage_provider: string
          thumbnail_path: string | null
          user_id: string | null
        }
        Insert: {
          aspect_ratio?: string | null
          avatar_id?: string | null
          created_at?: string | null
          id?: string
          media_type: string
          metadata?: Json | null
          organization_id: string
          prompt: string
          storage_path: string
          storage_provider?: string
          thumbnail_path?: string | null
          user_id?: string | null
        }
        Update: {
          aspect_ratio?: string | null
          avatar_id?: string | null
          created_at?: string | null
          id?: string
          media_type?: string
          metadata?: Json | null
          organization_id?: string
          prompt?: string
          storage_path?: string
          storage_provider?: string
          thumbnail_path?: string | null
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
          {
            foreignKeyName: "generations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      module_catalog: {
        Row: {
          commission_ai_pct: number
          commission_manual_pct: number
          created_at: string
          description: string | null
          is_public: boolean
          name: string
          price_usd_month_per_unit: number
          slug: string
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          commission_ai_pct?: number
          commission_manual_pct?: number
          created_at?: string
          description?: string | null
          is_public?: boolean
          name: string
          price_usd_month_per_unit?: number
          slug: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          commission_ai_pct?: number
          commission_manual_pct?: number
          created_at?: string
          description?: string | null
          is_public?: boolean
          name?: string
          price_usd_month_per_unit?: number
          slug?: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_modules: {
        Row: {
          created_at: string
          id: string
          installed_at: string
          installed_by: string | null
          module_slug: string
          organization_id: string
          settings: Json
          status: string
          uninstalled_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          installed_at?: string
          installed_by?: string | null
          module_slug: string
          organization_id: string
          settings?: Json
          status?: string
          uninstalled_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          installed_at?: string
          installed_by?: string | null
          module_slug?: string
          organization_id?: string
          settings?: Json
          status?: string
          uninstalled_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_modules_module_slug_fkey"
            columns: ["module_slug"]
            isOneToOne: false
            referencedRelation: "module_catalog"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "org_modules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_wallets: {
        Row: {
          held_balance: number
          included_balance: number
          organization_id: string
          period_start: string | null
          purchased_balance: number
          updated_at: string
        }
        Insert: {
          held_balance?: number
          included_balance?: number
          organization_id: string
          period_start?: string | null
          purchased_balance?: number
          updated_at?: string
        }
        Update: {
          held_balance?: number
          included_balance?: number
          organization_id?: string
          period_start?: string | null
          purchased_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_wallets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
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
          current_period_end: string | null
          current_period_start: string | null
          id: string
          name: string
          payment_customer_id: string | null
          payment_provider: string | null
          payment_subscription_id: string | null
          plan_slug: string | null
          slug: string
          subscription_status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          name: string
          payment_customer_id?: string | null
          payment_provider?: string | null
          payment_subscription_id?: string | null
          plan_slug?: string | null
          slug: string
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          name?: string
          payment_customer_id?: string | null
          payment_provider?: string | null
          payment_subscription_id?: string | null
          plan_slug?: string | null
          slug?: string
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_plan_slug_fkey"
            columns: ["plan_slug"]
            isOneToOne: false
            referencedRelation: "plan_configurations"
            referencedColumns: ["slug"]
          },
        ]
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          requested_ip: string | null
          requested_user_agent: string | null
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          requested_ip?: string | null
          requested_user_agent?: string | null
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          requested_ip?: string | null
          requested_user_agent?: string | null
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_generations: {
        Row: {
          aspect_ratio: string | null
          avatar_id: string | null
          created_at: string
          id: string
          media_type: string
          metadata: Json
          organization_id: string | null
          prompt: string | null
          provider: string
          task_id: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          avatar_id?: string | null
          created_at?: string
          id?: string
          media_type?: string
          metadata?: Json
          organization_id?: string | null
          prompt?: string | null
          provider: string
          task_id: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          avatar_id?: string | null
          created_at?: string
          id?: string
          media_type?: string
          metadata?: Json
          organization_id?: string | null
          prompt?: string | null
          provider?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_generations_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_configurations: {
        Row: {
          created_at: string
          is_public: boolean
          max_avatars: number | null
          max_seats: number | null
          name: string
          price_usd_month: number
          slug: string
          sort_order: number
          tokens_included: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_public?: boolean
          max_avatars?: number | null
          max_seats?: number | null
          name: string
          price_usd_month?: number
          slug: string
          sort_order?: number
          tokens_included?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_public?: boolean
          max_avatars?: number | null
          max_seats?: number | null
          name?: string
          price_usd_month?: number
          slug?: string
          sort_order?: number
          tokens_included?: number
          updated_at?: string
        }
        Relationships: []
      }
      prompts: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          is_pinned: boolean | null
          media_type: string
          name: string
          organization_id: string
          text: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          media_type: string
          name: string
          organization_id: string
          text: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_pinned?: boolean | null
          media_type?: string
          name?: string
          organization_id?: string
          text?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prompts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          caption: string
          content_type: string
          created_at: string
          error_message: string | null
          generation_id: string | null
          hashtags: string[]
          id: string
          media_urls: string[]
          organization_id: string
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
          caption?: string
          content_type: string
          created_at?: string
          error_message?: string | null
          generation_id?: string | null
          hashtags?: string[]
          id?: string
          media_urls?: string[]
          organization_id: string
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
          caption?: string
          content_type?: string
          created_at?: string
          error_message?: string | null
          generation_id?: string | null
          hashtags?: string[]
          id?: string
          media_urls?: string[]
          organization_id?: string
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
            foreignKeyName: "social_posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          api_key: string | null
          avatar_id: string | null
          connected_platforms: Json
          created_at: string
          id: string
          last_synced_at: string | null
          organization_id: string
          status: string
          upload_post_metadata: Json | null
          upload_post_username: string
        }
        Insert: {
          api_key?: string | null
          avatar_id?: string | null
          connected_platforms?: Json
          created_at?: string
          id?: string
          last_synced_at?: string | null
          organization_id: string
          status?: string
          upload_post_metadata?: Json | null
          upload_post_username: string
        }
        Update: {
          api_key?: string | null
          avatar_id?: string | null
          connected_platforms?: Json
          created_at?: string
          id?: string
          last_synced_at?: string | null
          organization_id?: string
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
          {
            foreignKeyName: "social_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_paid_media_items: {
        Row: {
          avatar_id: string
          caption: string | null
          created_at: string
          enabled: boolean
          generation_id: string | null
          id: string
          media_kind: string
          offers_count: number
          organization_id: string
          sales_count: number
          sort_order: number
          star_price: number
          stars_total: number
          storage_path: string
          storage_provider: string | null
          telegram_file_id: string | null
          telegram_file_id_bot_id: number | null
          title: string
          updated_at: string
        }
        Insert: {
          avatar_id: string
          caption?: string | null
          created_at?: string
          enabled?: boolean
          generation_id?: string | null
          id?: string
          media_kind: string
          offers_count?: number
          organization_id: string
          sales_count?: number
          sort_order?: number
          star_price: number
          stars_total?: number
          storage_path: string
          storage_provider?: string | null
          telegram_file_id?: string | null
          telegram_file_id_bot_id?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          avatar_id?: string
          caption?: string | null
          created_at?: string
          enabled?: boolean
          generation_id?: string | null
          id?: string
          media_kind?: string
          offers_count?: number
          organization_id?: string
          sales_count?: number
          sort_order?: number
          star_price?: number
          stars_total?: number
          storage_path?: string
          storage_provider?: string | null
          telegram_file_id?: string | null
          telegram_file_id_bot_id?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_paid_media_items_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_paid_media_items_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_paid_media_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_stars_sales: {
        Row: {
          avatar_id: string
          chat_id: string
          commission_ledger_id: string | null
          commission_pct: number | null
          commission_settled_at: string | null
          commission_tokens: number | null
          commission_usd: number | null
          created_at: string
          id: string
          item_id: string | null
          offered_at: string
          organization_id: string
          payload: string
          purchased_at: string | null
          refunded_at: string | null
          sold_by: string
          source: string
          star_usd: number | null
          stars: number
          status: string
          telegram_message_id: number | null
          telegram_user_id: number
          updated_at: string
        }
        Insert: {
          avatar_id: string
          chat_id: string
          commission_ledger_id?: string | null
          commission_pct?: number | null
          commission_settled_at?: string | null
          commission_tokens?: number | null
          commission_usd?: number | null
          created_at?: string
          id?: string
          item_id?: string | null
          offered_at?: string
          organization_id: string
          payload: string
          purchased_at?: string | null
          refunded_at?: string | null
          sold_by: string
          source: string
          star_usd?: number | null
          stars: number
          status?: string
          telegram_message_id?: number | null
          telegram_user_id: number
          updated_at?: string
        }
        Update: {
          avatar_id?: string
          chat_id?: string
          commission_ledger_id?: string | null
          commission_pct?: number | null
          commission_settled_at?: string | null
          commission_tokens?: number | null
          commission_usd?: number | null
          created_at?: string
          id?: string
          item_id?: string | null
          offered_at?: string
          organization_id?: string
          payload?: string
          purchased_at?: string | null
          refunded_at?: string | null
          sold_by?: string
          source?: string
          star_usd?: number | null
          stars?: number
          status?: string
          telegram_message_id?: number | null
          telegram_user_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_stars_sales_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_stars_sales_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "agent_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_stars_sales_commission_ledger_id_fkey"
            columns: ["commission_ledger_id"]
            isOneToOne: false
            referencedRelation: "token_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_stars_sales_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "telegram_paid_media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_stars_sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_webhook_events: {
        Row: {
          avatar_id: string
          received_at: string
          update_id: number
        }
        Insert: {
          avatar_id: string
          received_at?: string
          update_id: number
        }
        Update: {
          avatar_id?: string
          received_at?: string
          update_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "telegram_webhook_events_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "avatars"
            referencedColumns: ["id"]
          },
        ]
      }
      token_ledger: {
        Row: {
          cost_usd: number | null
          created_at: string
          from_included: number
          from_purchased: number
          hold_id: string | null
          id: string
          idempotency_key: string | null
          kind: string
          metadata: Json
          organization_id: string
          ref_id: string | null
          ref_type: string | null
          sku: string | null
          tokens: number
          user_id: string | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          from_included?: number
          from_purchased?: number
          hold_id?: string | null
          id?: string
          idempotency_key?: string | null
          kind: string
          metadata?: Json
          organization_id: string
          ref_id?: string | null
          ref_type?: string | null
          sku?: string | null
          tokens: number
          user_id?: string | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          from_included?: number
          from_purchased?: number
          hold_id?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          metadata?: Json
          organization_id?: string
          ref_id?: string | null
          ref_type?: string | null
          sku?: string | null
          tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "token_ledger_hold_id_fkey"
            columns: ["hold_id"]
            isOneToOne: false
            referencedRelation: "token_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      token_packs: {
        Row: {
          created_at: string
          is_public: boolean
          name: string
          price_usd: number
          slug: string
          sort_order: number
          tokens: number
        }
        Insert: {
          created_at?: string
          is_public?: boolean
          name: string
          price_usd: number
          slug: string
          sort_order?: number
          tokens: number
        }
        Update: {
          created_at?: string
          is_public?: boolean
          name?: string
          price_usd?: number
          slug?: string
          sort_order?: number
          tokens?: number
        }
        Relationships: []
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
          password_changed_at: string | null
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
          password_changed_at?: string | null
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
          password_changed_at?: string | null
          password_hash?: string | null
          provider?: string
          provider_account_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      video_flows: {
        Row: {
          created_at: string | null
          description: string | null
          edges: Json
          id: string
          is_template: boolean | null
          name: string
          nodes: Json
          organization_id: string
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          edges?: Json
          id?: string
          is_template?: boolean | null
          name: string
          nodes?: Json
          organization_id: string
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          edges?: Json
          id?: string
          is_template?: boolean | null
          name?: string
          nodes?: Json
          organization_id?: string
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_flows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_auth_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: Json
      }
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
      wallet_charge: {
        Args: {
          p_cost_usd?: number
          p_enforce?: boolean
          p_idempotency_key?: string
          p_metadata?: Json
          p_org: string
          p_ref_id?: string
          p_ref_type?: string
          p_sku: string
          p_tokens: number
          p_user: string
        }
        Returns: Json
      }
      wallet_credit: {
        Args: {
          p_cost_usd?: number
          p_idempotency_key?: string
          p_kind?: string
          p_org: string
          p_ref_id?: string
          p_ref_type?: string
          p_tokens: number
        }
        Returns: Json
      }
      wallet_hold: {
        Args: {
          p_cost_usd?: number
          p_enforce?: boolean
          p_idempotency_key?: string
          p_org: string
          p_ref_id?: string
          p_ref_type?: string
          p_sku: string
          p_tokens: number
          p_user: string
        }
        Returns: Json
      }
      wallet_refund: {
        Args: { p_hold_id: string; p_org: string; p_reason?: string }
        Returns: Json
      }
      wallet_settle: {
        Args: {
          p_cost_usd?: number
          p_hold_id: string
          p_org: string
          p_tokens_final?: number
        }
        Returns: Json
      }
      wallet_start_period: {
        Args: {
          p_org: string
          p_period_start?: string
          p_tokens_included: number
        }
        Returns: Json
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
