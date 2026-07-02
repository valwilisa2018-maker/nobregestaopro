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
      agents: {
        Row: {
          ai_provider_id: string | null
          appearance: Json | null
          avatar_url: string | null
          category: string | null
          connection_id: string | null
          created_at: string
          description: string | null
          frequency_penalty: number | null
          id: string
          initial_message: string | null
          integrations: Json | null
          is_active: boolean
          knowledge: Json | null
          language: string | null
          max_tokens: number | null
          memory: Json | null
          model: string | null
          name: string
          presence_penalty: number | null
          primary_color: string | null
          role: string | null
          secondary_color: string | null
          security: Json | null
          seed: number | null
          stop_sequences: string[] | null
          streaming: boolean | null
          system_prompt: string | null
          temperature: number
          thinking_mode: boolean | null
          timezone: string | null
          tools: Json | null
          top_k: number | null
          top_p: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_provider_id?: string | null
          appearance?: Json | null
          avatar_url?: string | null
          category?: string | null
          connection_id?: string | null
          created_at?: string
          description?: string | null
          frequency_penalty?: number | null
          id?: string
          initial_message?: string | null
          integrations?: Json | null
          is_active?: boolean
          knowledge?: Json | null
          language?: string | null
          max_tokens?: number | null
          memory?: Json | null
          model?: string | null
          name: string
          presence_penalty?: number | null
          primary_color?: string | null
          role?: string | null
          secondary_color?: string | null
          security?: Json | null
          seed?: number | null
          stop_sequences?: string[] | null
          streaming?: boolean | null
          system_prompt?: string | null
          temperature?: number
          thinking_mode?: boolean | null
          timezone?: string | null
          tools?: Json | null
          top_k?: number | null
          top_p?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_provider_id?: string | null
          appearance?: Json | null
          avatar_url?: string | null
          category?: string | null
          connection_id?: string | null
          created_at?: string
          description?: string | null
          frequency_penalty?: number | null
          id?: string
          initial_message?: string | null
          integrations?: Json | null
          is_active?: boolean
          knowledge?: Json | null
          language?: string | null
          max_tokens?: number | null
          memory?: Json | null
          model?: string | null
          name?: string
          presence_penalty?: number | null
          primary_color?: string | null
          role?: string | null
          secondary_color?: string | null
          security?: Json | null
          seed?: number | null
          stop_sequences?: string[] | null
          streaming?: boolean | null
          system_prompt?: string | null
          temperature?: number
          thinking_mode?: boolean | null
          timezone?: string | null
          tools?: Json | null
          top_k?: number | null
          top_p?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_ai_provider_id_fkey"
            columns: ["ai_provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_key: string | null
          base_url: string | null
          created_at: string
          id: string
          is_active: boolean
          model: string | null
          name: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          model?: string | null
          name: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          model?: string | null
          name?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          user_id?: string
        }
        Relationships: []
      }
      audio_messages: {
        Row: {
          audio_url: string | null
          conversation_id: string | null
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          duration_seconds: number | null
          id: string
          language: string | null
          transcription: string | null
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          duration_seconds?: number | null
          id?: string
          language?: string | null
          transcription?: string | null
          user_id: string
        }
        Update: {
          audio_url?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          duration_seconds?: number | null
          id?: string
          language?: string | null
          transcription?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          amount: number
          currency: string
          description: string | null
          id: string
          kind: string
          occurred_at: string
          quantity: number
          user_id: string
        }
        Insert: {
          amount?: number
          currency?: string
          description?: string | null
          id?: string
          kind: string
          occurred_at?: string
          quantity?: number
          user_id: string
        }
        Update: {
          amount?: number
          currency?: string
          description?: string | null
          id?: string
          kind?: string
          occurred_at?: string
          quantity?: number
          user_id?: string
        }
        Relationships: []
      }
      broadcast_recipients: {
        Row: {
          broadcast_id: string
          contact_id: string | null
          created_at: string
          error: string | null
          id: string
          phone: string
          responded_at: string | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          broadcast_id: string
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          phone: string
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          broadcast_id?: string
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          phone?: string
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          connection_id: string | null
          continue_next_day: boolean
          created_at: string
          daily_limit: number | null
          day_marker: string | null
          dedupe: boolean
          delay_seconds: number
          description: string | null
          error_count: number
          estimated_finish_at: string | null
          finished_at: string | null
          flow_id: string | null
          humanize_max: number
          humanize_min: number
          id: string
          ignore_holidays: boolean
          ignore_responded: boolean
          media_type: string | null
          media_url: string | null
          message: string
          mode: string
          name: string
          paused_at: string | null
          rate_per_min: number
          responded_count: number
          sent_count: number
          sent_today: number
          sequence: Json | null
          source_type: string
          source_value: Json
          started_at: string | null
          status: string
          stop_on_reply: boolean
          total: number
          updated_at: string
          user_id: string
          weekdays: number[] | null
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          connection_id?: string | null
          continue_next_day?: boolean
          created_at?: string
          daily_limit?: number | null
          day_marker?: string | null
          dedupe?: boolean
          delay_seconds?: number
          description?: string | null
          error_count?: number
          estimated_finish_at?: string | null
          finished_at?: string | null
          flow_id?: string | null
          humanize_max?: number
          humanize_min?: number
          id?: string
          ignore_holidays?: boolean
          ignore_responded?: boolean
          media_type?: string | null
          media_url?: string | null
          message: string
          mode?: string
          name: string
          paused_at?: string | null
          rate_per_min?: number
          responded_count?: number
          sent_count?: number
          sent_today?: number
          sequence?: Json | null
          source_type?: string
          source_value?: Json
          started_at?: string | null
          status?: string
          stop_on_reply?: boolean
          total?: number
          updated_at?: string
          user_id: string
          weekdays?: number[] | null
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          connection_id?: string | null
          continue_next_day?: boolean
          created_at?: string
          daily_limit?: number | null
          day_marker?: string | null
          dedupe?: boolean
          delay_seconds?: number
          description?: string | null
          error_count?: number
          estimated_finish_at?: string | null
          finished_at?: string | null
          flow_id?: string | null
          humanize_max?: number
          humanize_min?: number
          id?: string
          ignore_holidays?: boolean
          ignore_responded?: boolean
          media_type?: string | null
          media_url?: string | null
          message?: string
          mode?: string
          name?: string
          paused_at?: string | null
          rate_per_min?: number
          responded_count?: number
          sent_count?: number
          sent_today?: number
          sequence?: Json | null
          source_type?: string
          source_value?: Json
          started_at?: string | null
          status?: string
          stop_on_reply?: boolean
          total?: number
          updated_at?: string
          user_id?: string
          weekdays?: number[] | null
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          notes: string | null
          phone: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          phone: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          phone?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      connections: {
        Row: {
          api_key: string
          consumption: number
          created_at: string
          description: string | null
          id: string
          instance_name: string
          last_sync: string | null
          message_count: number
          name: string
          notes: string | null
          phone_number: string | null
          profile_name: string | null
          profile_picture: string | null
          provider: string
          status: string
          updated_at: string
          url_api: string
          user_id: string
        }
        Insert: {
          api_key: string
          consumption?: number
          created_at?: string
          description?: string | null
          id?: string
          instance_name: string
          last_sync?: string | null
          message_count?: number
          name: string
          notes?: string | null
          phone_number?: string | null
          profile_name?: string | null
          profile_picture?: string | null
          provider?: string
          status?: string
          updated_at?: string
          url_api: string
          user_id: string
        }
        Update: {
          api_key?: string
          consumption?: number
          created_at?: string
          description?: string | null
          id?: string
          instance_name?: string
          last_sync?: string | null
          message_count?: number
          name?: string
          notes?: string | null
          phone_number?: string | null
          profile_name?: string | null
          profile_picture?: string | null
          provider?: string
          status?: string
          updated_at?: string
          url_api?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          name: string | null
          notes: string | null
          phone: string
          source: string | null
          status: string
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string | null
          notes?: string | null
          phone: string
          source?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          name?: string | null
          notes?: string | null
          phone?: string
          source?: string | null
          status?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          agent_id: string | null
          client_id: string | null
          connection_id: string | null
          created_at: string
          flow_state: Json | null
          follow_up_paused: boolean
          follow_up_step: number
          id: string
          last_message_at: string | null
          metadata: Json
          next_follow_up_at: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          client_id?: string | null
          connection_id?: string | null
          created_at?: string
          flow_state?: Json | null
          follow_up_paused?: boolean
          follow_up_step?: number
          id?: string
          last_message_at?: string | null
          metadata?: Json
          next_follow_up_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          client_id?: string | null
          connection_id?: string | null
          created_at?: string
          flow_state?: Json | null
          follow_up_paused?: boolean
          follow_up_step?: number
          id?: string
          last_message_at?: string | null
          metadata?: Json
          next_follow_up_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          client_id: string | null
          conversation_id: string | null
          created_at: string
          extracted_data: Json | null
          extracted_text: string | null
          file_name: string
          file_url: string | null
          id: string
          kind: string
          mime_type: string | null
          size_bytes: number | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          extracted_data?: Json | null
          extracted_text?: string | null
          file_name: string
          file_url?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          extracted_data?: Json | null
          extracted_text?: string | null
          file_name?: string
          file_url?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          connection_id: string | null
          created_at: string
          definition: Json
          description: string | null
          id: string
          is_active: boolean
          name: string
          trigger: string | null
          trigger_keywords: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          trigger?: string | null
          trigger_keywords?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          definition?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          trigger?: string | null
          trigger_keywords?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flows_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          kind: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      internal_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      knowledge_documents: {
        Row: {
          agent_id: string | null
          content: string | null
          created_at: string
          id: string
          source_type: string
          source_url: string | null
          title: string
          tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          source_type?: string
          source_url?: string | null
          title: string
          tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          source_type?: string
          source_url?: string | null
          title?: string
          tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          metadata: Json
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          metadata?: Json
          source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          id: string
          media_url: string | null
          metadata: Json
          type: Database["public"]["Enums"]["message_type"]
          user_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          id?: string
          media_url?: string | null
          metadata?: Json
          type?: Database["public"]["Enums"]["message_type"]
          user_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          id?: string
          media_url?: string | null
          metadata?: Json
          type?: Database["public"]["Enums"]["message_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          daily_limit: number
          id: string
          monthly_limit: number
          name: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          id?: string
          monthly_limit?: number
          name: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          id?: string
          monthly_limit?: number
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          alert_phone: string | null
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          plan_id: string | null
          updated_at: string
        }
        Insert: {
          alert_phone?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          plan_id?: string | null
          updated_at?: string
        }
        Update: {
          alert_phone?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          plan_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          content: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          user_id: string
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      tools: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          kind: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          day: string
          day_count: number
          month: string
          month_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          day?: string
          day_count?: number
          month?: string
          month_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          day?: string
          day_count?: number
          month?: string
          month_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          created_at: string
          events: string[]
          id: string
          is_active: boolean
          name: string
          secret: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          name: string
          secret?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          name?: string
          secret?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      white_label: {
        Row: {
          accent_color: string | null
          brand_name: string | null
          domain: string | null
          id: string
          logo_url: string | null
          primary_color: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          brand_name?: string | null
          domain?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          brand_name?: string | null
          domain?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_send_quota: { Args: { _user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "atendente" | "viewer"
      conversation_status: "open" | "pending" | "closed" | "archived"
      message_direction: "inbound" | "outbound"
      message_type:
        | "text"
        | "image"
        | "audio"
        | "video"
        | "document"
        | "sticker"
        | "location"
        | "system"
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
      app_role: ["admin", "supervisor", "atendente", "viewer"],
      conversation_status: ["open", "pending", "closed", "archived"],
      message_direction: ["inbound", "outbound"],
      message_type: [
        "text",
        "image",
        "audio",
        "video",
        "document",
        "sticker",
        "location",
        "system",
      ],
    },
  },
} as const
