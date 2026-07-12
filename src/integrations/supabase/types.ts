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
          appearance: Json | null
          avatar_url: string | null
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
          appearance?: Json | null
          avatar_url?: string | null
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
          appearance?: Json | null
          avatar_url?: string | null
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
      announcement_reads: {
        Row: {
          announcement_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          lockdown: boolean
          severity: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          lockdown?: boolean
          severity?: string
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          lockdown?: boolean
          severity?: string
          starts_at?: string
          title?: string
          updated_at?: string
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
          current_step: number
          error: string | null
          id: string
          last_step_at: string | null
          next_action_at: string | null
          phone: string
          responded_at: string | null
          sent_at: string | null
          status: string
          timeline: Json
          user_id: string
        }
        Insert: {
          broadcast_id: string
          contact_id?: string | null
          created_at?: string
          current_step?: number
          error?: string | null
          id?: string
          last_step_at?: string | null
          next_action_at?: string | null
          phone: string
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          timeline?: Json
          user_id: string
        }
        Update: {
          broadcast_id?: string
          contact_id?: string | null
          created_at?: string
          current_step?: number
          error?: string | null
          id?: string
          last_step_at?: string | null
          next_action_at?: string | null
          phone?: string
          responded_at?: string | null
          sent_at?: string | null
          status?: string
          timeline?: Json
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
      broadcast_steps: {
        Row: {
          broadcast_id: string
          created_at: string
          delay_hours: number
          id: string
          media_type: string | null
          media_url: string | null
          message: string
          step_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          broadcast_id: string
          created_at?: string
          delay_hours?: number
          id?: string
          media_type?: string | null
          media_url?: string | null
          message: string
          step_order: number
          updated_at?: string
          user_id: string
        }
        Update: {
          broadcast_id?: string
          created_at?: string
          delay_hours?: number
          id?: string
          media_type?: string | null
          media_url?: string | null
          message?: string
          step_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_steps_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
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
          metadata: Json
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
          metadata?: Json
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
          metadata?: Json
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
      credit_orders: {
        Row: {
          created_at: string
          id: string
          package_id: string
          paid_at: string | null
          price_cents: number
          provider: string | null
          status: string
          tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          paid_at?: string | null
          price_cents: number
          provider?: string | null
          status?: string
          tokens: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          paid_at?: string | null
          price_cents?: number
          provider?: string | null
          status?: string
          tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "credit_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packages: {
        Row: {
          badge: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_cents: number
          sort_order: number
          tokens: number
        }
        Insert: {
          badge?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_cents: number
          sort_order?: number
          tokens: number
        }
        Update: {
          badge?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          sort_order?: number
          tokens?: number
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          agent_id: string | null
          cost_cents: number
          id: string
          input_tokens: number
          kind: string
          metadata: Json
          model: string | null
          occurred_at: string
          output_tokens: number
          status: string
          total_tokens: number
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          cost_cents?: number
          id?: string
          input_tokens?: number
          kind: string
          metadata?: Json
          model?: string | null
          occurred_at?: string
          output_tokens?: number
          status?: string
          total_tokens?: number
          user_id: string
        }
        Update: {
          agent_id?: string | null
          cost_cents?: number
          id?: string
          input_tokens?: number
          kind?: string
          metadata?: Json
          model?: string | null
          occurred_at?: string
          output_tokens?: number
          status?: string
          total_tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_wallets: {
        Row: {
          created_at: string
          extra_tokens_remaining: number
          plan_tokens_remaining: number
          plan_tokens_reset_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extra_tokens_remaining?: number
          plan_tokens_remaining?: number
          plan_tokens_reset_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extra_tokens_remaining?: number
          plan_tokens_remaining?: number
          plan_tokens_reset_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      email_settings: {
        Row: {
          brand_color: string
          id: boolean
          provider: string
          reply_to: string | null
          reset_banner_url: string | null
          reset_enabled: boolean
          reset_subject: string
          sender_email: string | null
          sender_name: string
          signup_banner_url: string | null
          signup_enabled: boolean
          signup_subject: string
          updated_at: string
        }
        Insert: {
          brand_color?: string
          id?: boolean
          provider?: string
          reply_to?: string | null
          reset_banner_url?: string | null
          reset_enabled?: boolean
          reset_subject?: string
          sender_email?: string | null
          sender_name?: string
          signup_banner_url?: string | null
          signup_enabled?: boolean
          signup_subject?: string
          updated_at?: string
        }
        Update: {
          brand_color?: string
          id?: boolean
          provider?: string
          reply_to?: string | null
          reset_banner_url?: string | null
          reset_enabled?: boolean
          reset_subject?: string
          sender_email?: string | null
          sender_name?: string
          signup_banner_url?: string | null
          signup_enabled?: boolean
          signup_subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      flow_execution_logs: {
        Row: {
          block_id: string | null
          created_at: string
          data: Json | null
          duration_ms: number | null
          event: string
          execution_id: string
          id: string
          level: string
          message: string | null
          user_id: string
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          data?: Json | null
          duration_ms?: number | null
          event: string
          execution_id: string
          id?: string
          level?: string
          message?: string | null
          user_id: string
        }
        Update: {
          block_id?: string | null
          created_at?: string
          data?: Json | null
          duration_ms?: number | null
          event?: string
          execution_id?: string
          id?: string
          level?: string
          message?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_execution_logs_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "flow_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_executions: {
        Row: {
          awaiting_variable: string | null
          completed_at: string | null
          connection_id: string | null
          contact_id: string | null
          conversation_id: string | null
          current_block_id: string | null
          flow_id: string
          id: string
          is_simulation: boolean
          last_error: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
          variables: Json
        }
        Insert: {
          awaiting_variable?: string | null
          completed_at?: string | null
          connection_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          current_block_id?: string | null
          flow_id: string
          id?: string
          is_simulation?: boolean
          last_error?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
          variables?: Json
        }
        Update: {
          awaiting_variable?: string | null
          completed_at?: string | null
          connection_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          current_block_id?: string | null
          flow_id?: string
          id?: string
          is_simulation?: boolean
          last_error?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
          variables?: Json
        }
        Relationships: []
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
      followup_steps: {
        Row: {
          created_at: string
          delay_unit: string
          delay_value: number
          followup_id: string
          id: string
          media_url: string | null
          message: string
          step_order: number
          user_id: string
        }
        Insert: {
          created_at?: string
          delay_unit?: string
          delay_value?: number
          followup_id: string
          id?: string
          media_url?: string | null
          message: string
          step_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          delay_unit?: string
          delay_value?: number
          followup_id?: string
          id?: string
          media_url?: string | null
          message?: string
          step_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_steps_followup_id_fkey"
            columns: ["followup_id"]
            isOneToOne: false
            referencedRelation: "followups"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          connection_id: string | null
          created_at: string
          description: string | null
          id: string
          inactivity_unit: string
          inactivity_value: number
          is_active: boolean
          name: string
          stop_on_reply: boolean
          total_converted: number
          total_replied: number
          total_sent: number
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          inactivity_unit?: string
          inactivity_value?: number
          is_active?: boolean
          name: string
          stop_on_reply?: boolean
          total_converted?: number
          total_replied?: number
          total_sent?: number
          trigger_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          inactivity_unit?: string
          inactivity_value?: number
          is_active?: boolean
          name?: string
          stop_on_reply?: boolean
          total_converted?: number
          total_replied?: number
          total_sent?: number
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      meta_wa_configs: {
        Row: {
          access_token: string | null
          app_id: string | null
          app_secret: string | null
          business_account_id: string | null
          created_at: string
          display_phone: string | null
          graph_version: string
          id: string
          is_active: boolean
          is_default: boolean
          last_status: string | null
          last_verified_at: string | null
          name: string
          phone_number_id: string | null
          updated_at: string
          user_id: string
          webhook_verify_token: string | null
        }
        Insert: {
          access_token?: string | null
          app_id?: string | null
          app_secret?: string | null
          business_account_id?: string | null
          created_at?: string
          display_phone?: string | null
          graph_version?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_status?: string | null
          last_verified_at?: string | null
          name?: string
          phone_number_id?: string | null
          updated_at?: string
          user_id: string
          webhook_verify_token?: string | null
        }
        Update: {
          access_token?: string | null
          app_id?: string | null
          app_secret?: string | null
          business_account_id?: string | null
          created_at?: string
          display_phone?: string | null
          graph_version?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_status?: string | null
          last_verified_at?: string | null
          name?: string
          phone_number_id?: string | null
          updated_at?: string
          user_id?: string
          webhook_verify_token?: string | null
        }
        Relationships: []
      }
      meta_wa_templates: {
        Row: {
          category: string
          components: Json
          config_id: string | null
          created_at: string
          id: string
          language: string
          last_synced_at: string | null
          meta_template_id: string | null
          name: string
          rejection_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          components?: Json
          config_id?: string | null
          created_at?: string
          id?: string
          language?: string
          last_synced_at?: string | null
          meta_template_id?: string | null
          name: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          components?: Json
          config_id?: string | null
          created_at?: string
          id?: string
          language?: string
          last_synced_at?: string | null
          meta_template_id?: string | null
          name?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_wa_templates_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "meta_wa_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_settings: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          mode: string
          provider: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          mode?: string
          provider: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          mode?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_activities: {
        Row: {
          created_at: string
          deal_id: string
          from_stage: string | null
          id: string
          payload: Json
          to_stage: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          from_stage?: string | null
          id?: string
          payload?: Json
          to_stage?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          from_stage?: string | null
          id?: string
          payload?: Json
          to_stage?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "pipeline_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_attachments: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          mime: string | null
          name: string
          size: number | null
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          mime?: string | null
          name: string
          size?: number | null
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          mime?: string | null
          name?: string
          size?: number | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_attachments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "pipeline_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_deals: {
        Row: {
          avatar_url: string | null
          checklist: Json
          client_id: string | null
          company: string | null
          contact_id: string | null
          created_at: string
          email: string | null
          id: string
          last_interaction_at: string | null
          links: Json
          lost_reason: string | null
          next_contact_at: string | null
          notes: string | null
          owner_id: string | null
          owner_name: string | null
          phone: string | null
          position: number
          priority: Database["public"]["Enums"]["pipeline_priority"]
          product: string | null
          source: string | null
          stage_id: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          value_cents: number
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          checklist?: Json
          client_id?: string | null
          company?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          links?: Json
          lost_reason?: string | null
          next_contact_at?: string | null
          notes?: string | null
          owner_id?: string | null
          owner_name?: string | null
          phone?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["pipeline_priority"]
          product?: string | null
          source?: string | null
          stage_id: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
          value_cents?: number
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          checklist?: Json
          client_id?: string | null
          company?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          links?: Json
          lost_reason?: string | null
          next_contact_at?: string | null
          notes?: string | null
          owner_id?: string | null
          owner_name?: string | null
          phone?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["pipeline_priority"]
          product?: string | null
          source?: string | null
          stage_id?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          value_cents?: number
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_lost: boolean
          is_system: boolean
          is_won: boolean
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_system?: boolean
          is_won?: boolean
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_system?: boolean
          is_won?: boolean
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_activation_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          note: string | null
          plan_id: string
          status: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          plan_id: string
          status?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          plan_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_activation_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          daily_limit: number
          description: string | null
          features: Json
          highlight: boolean
          id: string
          is_active: boolean
          monthly_limit: number
          name: string
          price_annual_cents: number
          price_cents: number
          sort_order: number
          tokens_included: number
        }
        Insert: {
          created_at?: string
          currency?: string
          daily_limit?: number
          description?: string | null
          features?: Json
          highlight?: boolean
          id?: string
          is_active?: boolean
          monthly_limit?: number
          name: string
          price_annual_cents?: number
          price_cents?: number
          sort_order?: number
          tokens_included?: number
        }
        Update: {
          created_at?: string
          currency?: string
          daily_limit?: number
          description?: string | null
          features?: Json
          highlight?: boolean
          id?: string
          is_active?: boolean
          monthly_limit?: number
          name?: string
          price_annual_cents?: number
          price_cents?: number
          sort_order?: number
          tokens_included?: number
        }
        Relationships: []
      }
      presence: {
        Row: {
          jid: string
          presence: string
          updated_at: string
          user_id: string
        }
        Insert: {
          jid: string
          presence: string
          updated_at?: string
          user_id: string
        }
        Update: {
          jid?: string
          presence?: string
          updated_at?: string
          user_id?: string
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
          plan_activated_at: string | null
          plan_expires_at: string | null
          plan_id: string | null
          plan_started_at: string | null
          status: Database["public"]["Enums"]["account_status"]
          suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          alert_phone?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          plan_activated_at?: string | null
          plan_expires_at?: string | null
          plan_id?: string | null
          plan_started_at?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          alert_phone?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          plan_activated_at?: string | null
          plan_expires_at?: string | null
          plan_id?: string | null
          plan_started_at?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          suspended_reason?: string | null
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
      prompt_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "prompt_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_chat_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      quick_sends: {
        Row: {
          created_at: string
          id: string
          is_ptt: boolean
          media_mime: string | null
          media_name: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          storage_path: string | null
          text: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_ptt?: boolean
          media_mime?: string | null
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          storage_path?: string | null
          text?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_ptt?: boolean
          media_mime?: string | null
          media_name?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          storage_path?: string | null
          text?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          performed_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          performed_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          performed_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          target_user_id?: string
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
      support_messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          id: string
          reply_to_id: string | null
          sender_id: string
          sender_role: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          id?: string
          reply_to_id?: string | null
          sender_id: string
          sender_role?: string
          ticket_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          reply_to_id?: string | null
          sender_id?: string
          sender_role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          attachments: Json
          browser: string | null
          category: string | null
          closed_at: string | null
          created_at: string
          environment: string | null
          first_response_at: string | null
          id: string
          last_message_at: string
          page_url: string | null
          priority: string
          rating: number | null
          rating_comment: string | null
          resolved_at: string | null
          status: string
          subject: string
          ticket_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          attachments?: Json
          browser?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          environment?: string | null
          first_response_at?: string | null
          id?: string
          last_message_at?: string
          page_url?: string | null
          priority?: string
          rating?: number | null
          rating_comment?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          ticket_number?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          attachments?: Json
          browser?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          environment?: string | null
          first_response_at?: string | null
          id?: string
          last_message_at?: string
          page_url?: string | null
          priority?: string
          rating?: number | null
          rating_comment?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          ticket_number?: number
          updated_at?: string
          user_id?: string
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
      training_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          module_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          module_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          module_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      training_progress: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          module_key: string
          progress_seconds: number
          rating: number | null
          updated_at: string
          user_id: string
          watched_at: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          module_key: string
          progress_seconds?: number
          rating?: number | null
          updated_at?: string
          user_id: string
          watched_at?: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          module_key?: string
          progress_seconds?: number
          rating?: number | null
          updated_at?: string
          user_id?: string
          watched_at?: string
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
      video_jobs: {
        Row: {
          attempts: number
          connection_id: string | null
          conversation_id: string | null
          created_at: string
          declared_bytes: number | null
          direct_path: string
          error: string | null
          file_name: string | null
          id: string
          kind: string
          media_key: string
          media_url: string | null
          message_id: string | null
          mime: string | null
          status: string
          storage_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          connection_id?: string | null
          conversation_id?: string | null
          created_at?: string
          declared_bytes?: number | null
          direct_path: string
          error?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          media_key: string
          media_url?: string | null
          message_id?: string | null
          mime?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          connection_id?: string | null
          conversation_id?: string | null
          created_at?: string
          declared_bytes?: number | null
          direct_path?: string
          error?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          media_key?: string
          media_url?: string | null
          message_id?: string | null
          mime?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_jobs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_jobs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
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
      consume_ai_tokens: {
        Args: {
          _agent_id: string
          _cost_cents: number
          _input_tokens: number
          _model: string
          _output_tokens: number
          _user_id: string
        }
        Returns: Json
      }
      consume_send_quota: { Args: { _user_id: string }; Returns: Json }
      create_credit_order: {
        Args: { _package_id: string }
        Returns: {
          created_at: string
          id: string
          package_id: string
          paid_at: string | null
          price_cents: number
          provider: string | null
          status: string
          tokens: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_credit_wallet: {
        Args: { _user_id: string }
        Returns: {
          created_at: string
          extra_tokens_remaining: number
          plan_tokens_remaining: number
          plan_tokens_reset_at: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_wallets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_default_pipeline_stages: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_credit_order_paid: {
        Args: { _order_id: string }
        Returns: {
          created_at: string
          id: string
          package_id: string
          paid_at: string | null
          price_cents: number
          provider: string | null
          status: string
          tokens: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      master_activate_account: {
        Args: { _expires_at: string; _plan_id: string; _user_id: string }
        Returns: undefined
      }
      master_approve_plan_request: {
        Args: { _days?: number; _request_id: string }
        Returns: undefined
      }
      master_cancel_order: { Args: { _order_id: string }; Returns: undefined }
      master_cancel_plan: {
        Args: { _reason?: string; _user_id: string }
        Returns: undefined
      }
      master_delete_order: { Args: { _order_id: string }; Returns: undefined }
      master_delete_plan_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      master_grant_credits: {
        Args: { _reason: string; _tokens: number; _user_id: string }
        Returns: undefined
      }
      master_grant_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      master_list_users_with_roles: {
        Args: { _search?: string }
        Returns: {
          email: string
          full_name: string
          roles: Database["public"]["Enums"]["app_role"][]
          status: string
          user_id: string
        }[]
      }
      master_mark_order_paid: {
        Args: { _order_id: string }
        Returns: {
          created_at: string
          id: string
          package_id: string
          paid_at: string | null
          price_cents: number
          provider: string | null
          status: string
          tokens: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      master_reactivate_account: {
        Args: { _user_id: string }
        Returns: undefined
      }
      master_reject_plan_request: {
        Args: { _note?: string; _request_id: string }
        Returns: undefined
      }
      master_revoke_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      master_suspend_account: {
        Args: { _reason: string; _user_id: string }
        Returns: undefined
      }
      purge_old_messages_media: { Args: never; Returns: undefined }
    }
    Enums: {
      account_status: "active" | "suspended" | "pending"
      app_role: "admin" | "supervisor" | "atendente" | "viewer" | "master"
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
      pipeline_priority: "low" | "medium" | "high" | "urgent"
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
      account_status: ["active", "suspended", "pending"],
      app_role: ["admin", "supervisor", "atendente", "viewer", "master"],
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
      pipeline_priority: ["low", "medium", "high", "urgent"],
    },
  },
} as const
