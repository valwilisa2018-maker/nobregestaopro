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
          sort_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          is_done?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          is_done?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      packages: {
        Row: {
          active: boolean
          created_at: string
          default_price: number | null
          id: string
          name: string
          quantity: number
          service_type_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_price?: number | null
          id?: string
          name: string
          quantity?: number
          service_type_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          default_price?: number | null
          id?: string
          name?: string
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
      producers: {
        Row: {
          active: boolean
          average_delivery_days: number | null
          created_at: string
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
          average_delivery_days?: number | null
          created_at?: string
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
          average_delivery_days?: number | null
          created_at?: string
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
          id: string
          notes: string | null
          package_id: string | null
          package_name: string | null
          paid_amount: number
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          producer_id: string | null
          receipt_url: string | null
          sale_date: string
          seller_id: string | null
          service_quantity: number
          service_type_id: string | null
          total_amount: number
          trello_link: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          package_id?: string | null
          package_name?: string | null
          paid_amount?: number
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          producer_id?: string | null
          receipt_url?: string | null
          sale_date?: string
          seller_id?: string | null
          service_quantity?: number
          service_type_id?: string | null
          total_amount?: number
          trello_link?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          package_id?: string | null
          package_name?: string | null
          paid_amount?: number
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          producer_id?: string | null
          receipt_url?: string | null
          sale_date?: string
          seller_id?: string | null
          service_quantity?: number
          service_type_id?: string | null
          total_amount?: number
          trello_link?: string | null
          updated_at?: string
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
      service_orders: {
        Row: {
          color: string | null
          column_id: string
          created_at: string
          delivered_at: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          labels: string[]
          priority: number
          producer_id: string | null
          sale_id: string | null
          service_index: number
          sort_order: number
          title: string
          trello_link: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          column_id: string
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          labels?: string[]
          priority?: number
          producer_id?: string | null
          sale_id?: string | null
          service_index?: number
          sort_order?: number
          title: string
          trello_link?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          column_id?: string
          created_at?: string
          delivered_at?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          labels?: string[]
          priority?: number
          producer_id?: string | null
          sale_id?: string | null
          service_index?: number
          sort_order?: number
          title?: string
          trello_link?: string | null
          updated_at?: string
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
          sort_order: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_reset_platform: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
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
      payment_method: ["pix", "cartao", "boleto"],
      payment_status: ["pago_total", "pago_parcial", "pendente"],
    },
  },
} as const
