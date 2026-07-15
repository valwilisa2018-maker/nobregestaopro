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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
          performed_by: string | null
          performed_by_email: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
          performed_by?: string | null
          performed_by_email?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
          performed_by?: string | null
          performed_by_email?: string | null
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          movement_date: string
          movement_type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          movement_date?: string
          movement_type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          movement_date?: string
          movement_type?: Database["public"]["Enums"]["cash_movement_type"]
        }
        Relationships: []
      }
      customers: {
        Row: {
          company: string | null
          created_at: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          name: string
          notes: string | null
          paid_date: string | null
          receipt_url: string | null
          status: Database["public"]["Enums"]["expense_status"]
          supplier: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          name: string
          notes?: string | null
          paid_date?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          paid_date?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          supplier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          active: boolean
          created_at: string
          id: string
          period: string
          seller_id: string | null
          target_amount: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          period: string
          seller_id?: string | null
          target_amount?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          period?: string
          seller_id?: string | null
          target_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "goals_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          file_url: string | null
          from_package: boolean
          id: string
          issued_at: string | null
          notes: string | null
          number: string | null
          sale_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id: string
          file_url?: string | null
          from_package?: boolean
          id?: string
          issued_at?: string | null
          notes?: string | null
          number?: string | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          file_url?: string | null
          from_package?: boolean
          id?: string
          issued_at?: string | null
          notes?: string | null
          number?: string | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_columns: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_default: boolean
          is_done: boolean
          name: string
          producer_id: string | null
          sort_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          is_done?: boolean
          name: string
          producer_id?: string | null
          sort_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          is_done?: boolean
          name?: string
          producer_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "kanban_columns_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      om_eventos: {
        Row: {
          card_key: string
          card_name: string
          created_at: string
          evento: Database["public"]["Enums"]["om_evento"]
          id: string
          occurred_at: string
          pontos: number
          producer_id: string
          raw: Json | null
          trello_card_id: string | null
        }
        Insert: {
          card_key: string
          card_name: string
          created_at?: string
          evento: Database["public"]["Enums"]["om_evento"]
          id?: string
          occurred_at?: string
          pontos?: number
          producer_id: string
          raw?: Json | null
          trello_card_id?: string | null
        }
        Update: {
          card_key?: string
          card_name?: string
          created_at?: string
          evento?: Database["public"]["Enums"]["om_evento"]
          id?: string
          occurred_at?: string
          pontos?: number
          producer_id?: string
          raw?: Json | null
          trello_card_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "om_eventos_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      om_scoring: {
        Row: {
          created_at: string
          evento: Database["public"]["Enums"]["om_evento"]
          multiplicador: number
          pontos: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          evento: Database["public"]["Enums"]["om_evento"]
          multiplicador?: number
          pontos?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          evento?: Database["public"]["Enums"]["om_evento"]
          multiplicador?: number
          pontos?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      om_settings: {
        Row: {
          base_daily_goal: number
          created_at: string
          holidays: string[]
          id: boolean
          trello_webhook_secret: string | null
          updated_at: string
          workdays: number[]
        }
        Insert: {
          base_daily_goal?: number
          created_at?: string
          holidays?: string[]
          id?: boolean
          trello_webhook_secret?: string | null
          updated_at?: string
          workdays?: number[]
        }
        Update: {
          base_daily_goal?: number
          created_at?: string
          holidays?: string[]
          id?: boolean
          trello_webhook_secret?: string | null
          updated_at?: string
          workdays?: number[]
        }
        Relationships: []
      }
      om_trello_list_map: {
        Row: {
          created_at: string
          evento: Database["public"]["Enums"]["om_evento"]
          id: string
          list_id: string
          list_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evento: Database["public"]["Enums"]["om_evento"]
          id?: string
          list_id: string
          list_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evento?: Database["public"]["Enums"]["om_evento"]
          id?: string
          list_id?: string
          list_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      om_trello_member_map: {
        Row: {
          created_at: string
          id: string
          producer_id: string
          trello_member_id: string
          trello_username: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          producer_id: string
          trello_member_id: string
          trello_username?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          producer_id?: string
          trello_member_id?: string
          trello_username?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "om_trello_member_map_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          active: boolean
          created_at: string
          default_price: number | null
          id: string
          name: string
          points_value: number
          quantity: number
          service_type_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_price?: number | null
          id?: string
          name: string
          points_value?: number
          quantity?: number
          service_type_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          default_price?: number | null
          id?: string
          name?: string
          points_value?: number
          quantity?: number
          service_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packages_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      pagarme_settings: {
        Row: {
          api_key: string | null
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          api_key?: string | null
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          api_key?: string | null
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      pagarme_webhooks: {
        Row: {
          created_at: string | null
          error_message: string | null
          event_type: string | null
          id: string
          pagarme_id: string | null
          payload: Json
          processed: boolean | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          pagarme_id?: string | null
          payload: Json
          processed?: boolean | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          pagarme_id?: string | null
          payload?: Json
          processed?: boolean | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          billing_period: string
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          is_highlight: boolean
          limits: Json
          name: string
          pagarme_plan_id: string | null
          price_cents: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          billing_period?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_highlight?: boolean
          limits?: Json
          name: string
          pagarme_plan_id?: string | null
          price_cents?: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          billing_period?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          is_highlight?: boolean
          limits?: Json
          name?: string
          pagarme_plan_id?: string | null
          price_cents?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      producers: {
        Row: {
          active: boolean
          avatar_url: string | null
          average_delivery_days: number | null
          commission_rate: number
          created_at: string
          custom_kanban_columns: Json | null
          daily_points_goal: number
          email: string | null
          id: string
          name: string
          phone: string | null
          quality_score: number | null
          specialty: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          average_delivery_days?: number | null
          commission_rate?: number
          created_at?: string
          custom_kanban_columns?: Json | null
          daily_points_goal?: number
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          quality_score?: number | null
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          average_delivery_days?: number | null
          commission_rate?: number
          created_at?: string
          custom_kanban_columns?: Json | null
          daily_points_goal?: number
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          quality_score?: number | null
          specialty?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_folder_files: {
        Row: {
          created_at: string
          file_category: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          folder_id: string
          id: string
          kanban_card_id: string | null
          sale_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_category: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          folder_id: string
          id?: string
          kanban_card_id?: string | null
          sale_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_category?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          folder_id?: string
          id?: string
          kanban_card_id?: string | null
          sale_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_folder_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      project_folder_messages: {
        Row: {
          audio_url: string | null
          created_at: string
          file_id: string | null
          file_url: string | null
          folder_id: string
          id: string
          kanban_card_id: string | null
          message: string | null
          sale_id: string | null
          sender_id: string | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          file_id?: string | null
          file_url?: string | null
          folder_id: string
          id?: string
          kanban_card_id?: string | null
          message?: string | null
          sale_id?: string | null
          sender_id?: string | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          file_id?: string | null
          file_url?: string | null
          folder_id?: string
          id?: string
          kanban_card_id?: string | null
          message?: string | null
          sale_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_folder_messages_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "project_folder_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_folder_messages_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      project_folders: {
        Row: {
          client_name: string | null
          created_at: string
          created_by: string | null
          folder_name: string
          google_drive_link: string | null
          id: string
          kanban_card_id: string | null
          parent_id: string | null
          platform_link: string | null
          sale_id: string | null
          service_type: string | null
          updated_at: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          folder_name: string
          google_drive_link?: string | null
          id?: string
          kanban_card_id?: string | null
          parent_id?: string | null
          platform_link?: string | null
          sale_id?: string | null
          service_type?: string | null
          updated_at?: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          folder_name?: string
          google_drive_link?: string | null
          id?: string
          kanban_card_id?: string | null
          parent_id?: string | null
          platform_link?: string | null
          sale_id?: string | null
          service_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_folders_kanban_card_id_fkey"
            columns: ["kanban_card_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_folders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_receipts: {
        Row: {
          amount: number
          created_at: string
          file_path: string
          id: string
          notes: string | null
          paid_at: string
          sale_id: string
          uploaded_by: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          file_path: string
          id?: string
          notes?: string | null
          paid_at?: string
          sale_id: string
          uploaded_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          file_path?: string
          id?: string
          notes?: string | null
          paid_at?: string
          sale_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_receipts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          delivery_deadline: string | null
          expected_delivery_date: string | null
          google_drive_link: string | null
          id: string
          is_payment_link: boolean | null
          lead_source: string | null
          notes: string | null
          package_id: string | null
          package_name: string | null
          pagarme_id: string | null
          paid_amount: number
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          platform_link: string | null
          producer_id: string | null
          receipt_url: string | null
          sale_date: string
          seller_id: string | null
          service_quantity: number
          service_type_id: string | null
          total_amount: number
          trello_link: string | null
          updated_at: string
          video_duration_seconds: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          delivery_deadline?: string | null
          expected_delivery_date?: string | null
          google_drive_link?: string | null
          id?: string
          is_payment_link?: boolean | null
          lead_source?: string | null
          notes?: string | null
          package_id?: string | null
          package_name?: string | null
          pagarme_id?: string | null
          paid_amount?: number
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          platform_link?: string | null
          producer_id?: string | null
          receipt_url?: string | null
          sale_date?: string
          seller_id?: string | null
          service_quantity?: number
          service_type_id?: string | null
          total_amount?: number
          trello_link?: string | null
          updated_at?: string
          video_duration_seconds?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          delivery_deadline?: string | null
          expected_delivery_date?: string | null
          google_drive_link?: string | null
          id?: string
          is_payment_link?: boolean | null
          lead_source?: string | null
          notes?: string | null
          package_id?: string | null
          package_name?: string | null
          pagarme_id?: string | null
          paid_amount?: number
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          platform_link?: string | null
          producer_id?: string | null
          receipt_url?: string | null
          sale_date?: string
          seller_id?: string | null
          service_quantity?: number
          service_type_id?: string | null
          total_amount?: number
          trello_link?: string | null
          updated_at?: string
          video_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          active: boolean
          avatar_url: string | null
          commission_rate: number | null
          created_at: string
          email: string | null
          id: string
          monthly_goal: number | null
          name: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string
          email?: string | null
          id?: string
          monthly_goal?: number | null
          name: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          commission_rate?: number | null
          created_at?: string
          email?: string | null
          id?: string
          monthly_goal?: number | null
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      service_order_history: {
        Row: {
          created_at: string
          from_column_id: string | null
          from_column_name: string | null
          id: string
          moved_by: string | null
          moved_by_email: string | null
          service_order_id: string
          to_column_id: string | null
          to_column_name: string | null
        }
        Insert: {
          created_at?: string
          from_column_id?: string | null
          from_column_name?: string | null
          id?: string
          moved_by?: string | null
          moved_by_email?: string | null
          service_order_id: string
          to_column_id?: string | null
          to_column_name?: string | null
        }
        Update: {
          created_at?: string
          from_column_id?: string | null
          from_column_name?: string | null
          id?: string
          moved_by?: string | null
          moved_by_email?: string | null
          service_order_id?: string
          to_column_id?: string | null
          to_column_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_order_history_from_column_id_fkey"
            columns: ["from_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_history_service_order_id_fkey"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_order_history_to_column_id_fkey"
            columns: ["to_column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
        ]
      }
      service_orders: {
        Row: {
          color: string | null
          column_id: string
          created_at: string
          customer_id: string | null
          customer_seq: number | null
          delivered_at: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          expected_delivery_date: string | null
          google_drive_link: string | null
          id: string
          labels: string[]
          last_redo_at: string | null
          platform_link: string | null
          priority: number
          producer_id: string | null
          redo_count: number
          sale_id: string | null
          service_index: number
          service_type_id: string | null
          sort_order: number
          title: string
          trello_link: string | null
          updated_at: string
          video_duration_seconds: number | null
        }
        Insert: {
          color?: string | null
          column_id: string
          created_at?: string
          customer_id?: string | null
          customer_seq?: number | null
          delivered_at?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          expected_delivery_date?: string | null
          google_drive_link?: string | null
          id?: string
          labels?: string[]
          last_redo_at?: string | null
          platform_link?: string | null
          priority?: number
          producer_id?: string | null
          redo_count?: number
          sale_id?: string | null
          service_index?: number
          service_type_id?: string | null
          sort_order?: number
          title: string
          trello_link?: string | null
          updated_at?: string
          video_duration_seconds?: number | null
        }
        Update: {
          color?: string | null
          column_id?: string
          created_at?: string
          customer_id?: string | null
          customer_seq?: number | null
          delivered_at?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          expected_delivery_date?: string | null
          google_drive_link?: string | null
          id?: string
          labels?: string[]
          last_redo_at?: string | null
          platform_link?: string | null
          priority?: number
          producer_id?: string | null
          redo_count?: number
          sale_id?: string | null
          service_index?: number
          service_type_id?: string | null
          sort_order?: number
          title?: string
          trello_link?: string | null
          updated_at?: string
          video_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_orders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          points: number
          points_value: number
          sort_order: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          points?: number
          points_value?: number
          sort_order?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          points?: number
          points_value?: number
          sort_order?: number | null
        }
        Relationships: []
      }
      subscription: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: boolean
          notes: string | null
          pagarme_subscription_id: string | null
          plan_id: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: boolean
          notes?: string | null
          pagarme_subscription_id?: string | null
          plan_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: boolean
          notes?: string | null
          pagarme_subscription_id?: string | null
          plan_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      system_announcements: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          message: string
          title: string
          type: Database["public"]["Enums"]["announcement_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          title: string
          type?: Database["public"]["Enums"]["announcement_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          title?: string
          type?: Database["public"]["Enums"]["announcement_type"]
          updated_at?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          context: string | null
          created_at: string
          details: Json | null
          id: string
          level: Database["public"]["Enums"]["log_level"]
          message: string
          user_id: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message: string
          user_id?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message?: string
          user_id?: string | null
        }
        Relationships: []
      }
      telao_settings: {
        Row: {
          big_seller_overlay_seconds: number
          celebration_confetti_enabled: boolean
          celebration_sound_enabled: boolean
          celebration_volume: number
          id: boolean
          loop_duplicate_threshold: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          big_seller_overlay_seconds?: number
          celebration_confetti_enabled?: boolean
          celebration_sound_enabled?: boolean
          celebration_volume?: number
          id?: boolean
          loop_duplicate_threshold?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          big_seller_overlay_seconds?: number
          celebration_confetti_enabled?: boolean
          celebration_sound_enabled?: boolean
          celebration_volume?: number
          id?: boolean
          loop_duplicate_threshold?: number
          updated_at?: string
          updated_by?: string | null
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
      whatsapp_status: {
        Row: {
          instance_name: string
          last_event: string | null
          number: string | null
          state: string
          updated_at: string
        }
        Insert: {
          instance_name: string
          last_event?: string | null
          number?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          instance_name?: string
          last_event?: string | null
          number?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_daily_financials: {
        Row: {
          dia: string | null
          saldo_em_aberto: number | null
          sinal: number | null
          total_vendido: number | null
          vendas: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_reset_platform: { Args: never; Returns: Json }
      compute_service_order_title: {
        Args: { _service_order_id: string }
        Returns: string
      }
      get_om_settings_public: {
        Args: never
        Returns: {
          base_daily_goal: number
          holidays: string[]
          workdays: number[]
        }[]
      }
      get_sinal_totals: {
        Args: { _from: string; _to: string }
        Returns: {
          dia: string
          sinal: number
          total_vendido: number
          vendas_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purge_old_project_folders: { Args: never; Returns: Json }
      renumber_service_orders_for_customer: {
        Args: { _customer_id: string }
        Returns: undefined
      }
      user_can_access_card: {
        Args: { _card_id: string; _sale_id: string; _user_id: string }
        Returns: boolean
      }
      user_can_access_project_scope: {
        Args: { _scope_id: string; _user_id: string }
        Returns: boolean
      }
      user_can_access_sale: {
        Args: { _sale_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      announcement_type: "info" | "warning" | "maintenance" | "update"
      app_role: "admin" | "vendedor" | "produtor" | "financeiro"
      cash_movement_type: "entrada" | "saida"
      expense_category:
        | "trafego_pago"
        | "impostos"
        | "nota_fiscal"
        | "aluguel"
        | "agua"
        | "luz"
        | "internet"
        | "limpeza"
        | "folha_pagamento"
        | "comissoes"
        | "ferramentas"
        | "producao"
        | "outras"
      expense_status: "pago" | "pendente" | "atrasado"
      invoice_status:
        | "emitida"
        | "pendente"
        | "cancelada"
        | "aguardando_emissao"
        | "pronto_para_envio"
        | "a_fazer"
      log_level: "INFO" | "WARN" | "ERROR" | "CRITICAL"
      om_evento: "pronto" | "alteracao" | "entregue" | "distribuicao_edicao"
      payment_method: "pix" | "cartao" | "boleto"
      payment_status: "pago_total" | "pago_parcial" | "pendente"
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
      announcement_type: ["info", "warning", "maintenance", "update"],
      app_role: ["admin", "vendedor", "produtor", "financeiro"],
      cash_movement_type: ["entrada", "saida"],
      expense_category: [
        "trafego_pago",
        "impostos",
        "nota_fiscal",
        "aluguel",
        "agua",
        "luz",
        "internet",
        "limpeza",
        "folha_pagamento",
        "comissoes",
        "ferramentas",
        "producao",
        "outras",
      ],
      expense_status: ["pago", "pendente", "atrasado"],
      invoice_status: [
        "emitida",
        "pendente",
        "cancelada",
        "aguardando_emissao",
        "pronto_para_envio",
        "a_fazer",
      ],
      log_level: ["INFO", "WARN", "ERROR", "CRITICAL"],
      om_evento: ["pronto", "alteracao", "entregue", "distribuicao_edicao"],
      payment_method: ["pix", "cartao", "boleto"],
      payment_status: ["pago_total", "pago_parcial", "pendente"],
    },
  },
} as const
