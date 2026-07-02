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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      checklist_answers: {
        Row: {
          checked: boolean
          created_at: string
          id: string
          photo_url: string | null
          question_id: string
          score: number
          submission_id: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          id?: string
          photo_url?: string | null
          question_id: string
          score?: number
          submission_id: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          id?: string
          photo_url?: string | null
          question_id?: string
          score?: number
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "checklist_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "checklist_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_questions: {
        Row: {
          created_at: string
          department_id: string
          id: string
          points: number
          requires_photo: boolean
          sort_order: number
          text: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          points?: number
          requires_photo?: boolean
          sort_order?: number
          text: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          points?: number
          requires_photo?: boolean
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_questions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_submissions: {
        Row: {
          completed_at: string
          department_id: string
          id: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string
          department_id: string
          id?: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string
          department_id?: string
          id?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_submissions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_submissions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      encarte_itens: {
        Row: {
          created_at: string
          destaque: boolean
          encarte_id: string
          id: string
          observacao: string | null
          ordem: number
          preco_de: number | null
          preco_oferta: number
          produto_id: string | null
        }
        Insert: {
          created_at?: string
          destaque?: boolean
          encarte_id: string
          id?: string
          observacao?: string | null
          ordem?: number
          preco_de?: number | null
          preco_oferta: number
          produto_id?: string | null
        }
        Update: {
          created_at?: string
          destaque?: boolean
          encarte_id?: string
          id?: string
          observacao?: string | null
          ordem?: number
          preco_de?: number | null
          preco_oferta?: number
          produto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "encarte_itens_encarte_id_fkey"
            columns: ["encarte_id"]
            isOneToOne: false
            referencedRelation: "encartes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encarte_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      encartes: {
        Row: {
          colunas: number
          created_at: string
          formato: string
          id: string
          loja_endereco: string | null
          loja_logo_url: string | null
          loja_nome: string | null
          loja_telefone: string | null
          nome: string
          tema: string
          titulo: string | null
          updated_at: string
          validade_ate: string | null
          validade_de: string | null
        }
        Insert: {
          colunas?: number
          created_at?: string
          formato?: string
          id?: string
          loja_endereco?: string | null
          loja_logo_url?: string | null
          loja_nome?: string | null
          loja_telefone?: string | null
          nome: string
          tema?: string
          titulo?: string | null
          updated_at?: string
          validade_ate?: string | null
          validade_de?: string | null
        }
        Update: {
          colunas?: number
          created_at?: string
          formato?: string
          id?: string
          loja_endereco?: string | null
          loja_logo_url?: string | null
          loja_nome?: string | null
          loja_telefone?: string | null
          nome?: string
          tema?: string
          titulo?: string | null
          updated_at?: string
          validade_ate?: string | null
          validade_de?: string | null
        }
        Relationships: []
      }
      lancamentos: {
        Row: {
          competencia_ano: number
          competencia_mes: number
          created_at: string
          data: string
          descricao: string | null
          id: string
          observacao: string | null
          status: string
          store_id: string
          subtipo: string
          tipo: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          competencia_ano: number
          competencia_mes: number
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          observacao?: string | null
          status?: string
          store_id: string
          subtipo: string
          tipo: string
          updated_at?: string
          user_id: string
          valor?: number
        }
        Update: {
          competencia_ano?: number
          competencia_mes?: number
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          observacao?: string | null
          status?: string
          store_id?: string
          subtipo?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          categoria: string | null
          codigo_interno: string | null
          created_at: string
          descricao: string
          ean: string | null
          id: string
          imagem_url: string | null
          preco_regular: number | null
          secao: string | null
          subcategoria: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          codigo_interno?: string | null
          created_at?: string
          descricao: string
          ean?: string | null
          id?: string
          imagem_url?: string | null
          preco_regular?: number | null
          secao?: string | null
          subcategoria?: string | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          codigo_interno?: string | null
          created_at?: string
          descricao?: string
          ean?: string | null
          id?: string
          imagem_url?: string | null
          preco_regular?: number | null
          secao?: string | null
          subcategoria?: string | null
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          blocked: boolean
          created_at: string
          full_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          blocked?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      scrape_jobs: {
        Row: {
          competitor_name: string | null
          competitor_url: string
          created_at: string
          error_message: string | null
          firecrawl_crawl_id: string | null
          id: string
          pages_crawled: number | null
          products_found: number | null
          products_json: Json | null
          progress_pct: number | null
          status: string
          total_urls_found: number | null
          updated_at: string
        }
        Insert: {
          competitor_name?: string | null
          competitor_url: string
          created_at?: string
          error_message?: string | null
          firecrawl_crawl_id?: string | null
          id?: string
          pages_crawled?: number | null
          products_found?: number | null
          products_json?: Json | null
          progress_pct?: number | null
          status?: string
          total_urls_found?: number | null
          updated_at?: string
        }
        Update: {
          competitor_name?: string | null
          competitor_url?: string
          created_at?: string
          error_message?: string | null
          firecrawl_crawl_id?: string | null
          id?: string
          pages_crawled?: number | null
          products_found?: number | null
          products_json?: Json | null
          progress_pct?: number | null
          status?: string
          total_urls_found?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      store_daily_metrics: {
        Row: {
          created_at: string
          date: string
          department: string
          id: string
          meta_lucro: number | null
          meta_margem_pct: number | null
          meta_vendas: number | null
          meta_volume: number | null
          projecao_lucro: number | null
          projecao_margem_pct: number | null
          projecao_vendas: number | null
          projecao_volume: number | null
          realizado_lucro: number | null
          realizado_margem_pct: number | null
          realizado_vendas: number | null
          realizado_volume: number | null
          store_id: string
          tipo_dia: string
        }
        Insert: {
          created_at?: string
          date: string
          department: string
          id?: string
          meta_lucro?: number | null
          meta_margem_pct?: number | null
          meta_vendas?: number | null
          meta_volume?: number | null
          projecao_lucro?: number | null
          projecao_margem_pct?: number | null
          projecao_vendas?: number | null
          projecao_volume?: number | null
          realizado_lucro?: number | null
          realizado_margem_pct?: number | null
          realizado_vendas?: number | null
          realizado_volume?: number | null
          store_id: string
          tipo_dia?: string
        }
        Update: {
          created_at?: string
          date?: string
          department?: string
          id?: string
          meta_lucro?: number | null
          meta_margem_pct?: number | null
          meta_vendas?: number | null
          meta_volume?: number | null
          projecao_lucro?: number | null
          projecao_margem_pct?: number | null
          projecao_vendas?: number | null
          projecao_volume?: number | null
          realizado_lucro?: number | null
          realizado_margem_pct?: number | null
          realizado_vendas?: number | null
          realizado_volume?: number | null
          store_id?: string
          tipo_dia?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_daily_metrics_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_department_metrics: {
        Row: {
          created_at: string
          department: string
          faturamento: number | null
          faturamento_promocao: number | null
          id: string
          margem: number | null
          month: number
          store_id: string
          year: number
        }
        Insert: {
          created_at?: string
          department: string
          faturamento?: number | null
          faturamento_promocao?: number | null
          id?: string
          margem?: number | null
          month: number
          store_id: string
          year: number
        }
        Update: {
          created_at?: string
          department?: string
          faturamento?: number | null
          faturamento_promocao?: number | null
          id?: string
          margem?: number | null
          month?: number
          store_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_department_metrics_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_metrics: {
        Row: {
          clientes: number | null
          created_at: string
          faturamento: number | null
          id: string
          margem: number | null
          meta_faturamento: number | null
          month: number
          store_id: string
          ticket_medio: number | null
          updated_at: string
          year: number
        }
        Insert: {
          clientes?: number | null
          created_at?: string
          faturamento?: number | null
          id?: string
          margem?: number | null
          meta_faturamento?: number | null
          month: number
          store_id: string
          ticket_medio?: number | null
          updated_at?: string
          year: number
        }
        Update: {
          clientes?: number | null
          created_at?: string
          faturamento?: number | null
          id?: string
          margem?: number | null
          meta_faturamento?: number | null
          month?: number
          store_id?: string
          ticket_medio?: number | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_metrics_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_product_metrics: {
        Row: {
          category: string
          created_at: string
          id: string
          month: number
          product_name: string
          store_id: string
          vendas_valor: number | null
          vendas_volume: number | null
          year: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          month: number
          product_name: string
          store_id: string
          vendas_valor?: number | null
          vendas_volume?: number | null
          year: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          month?: number
          product_name?: string
          store_id?: string
          vendas_valor?: number | null
          vendas_volume?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_product_metrics_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_module_access: {
        Row: {
          allowed: boolean
          created_at: string
          id: string
          module: string
          user_id: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          id?: string
          module: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          id?: string
          module?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_store_access: {
        Row: {
          approved: boolean
          created_at: string
          id: string
          store_id: string
          user_id: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          id?: string
          store_id: string
          user_id: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          id?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_store_access_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_padaria: {
        Row: {
          ano: number | null
          created_at: string
          data: string
          dia_sem: string | null
          id: string
          loja: string | null
          lucro: number | null
          lucro_meta: number | null
          margem_meta: number | null
          margem_realizada: number | null
          mes: number | null
          mes_nome: string | null
          part_percent: number | null
          ranking_dia_semana: string | null
          tipo: string | null
          updated_at: string
          vendas_meta: number | null
          vendas_realizada: number | null
          volume: number | null
        }
        Insert: {
          ano?: number | null
          created_at?: string
          data: string
          dia_sem?: string | null
          id?: string
          loja?: string | null
          lucro?: number | null
          lucro_meta?: number | null
          margem_meta?: number | null
          margem_realizada?: number | null
          mes?: number | null
          mes_nome?: string | null
          part_percent?: number | null
          ranking_dia_semana?: string | null
          tipo?: string | null
          updated_at?: string
          vendas_meta?: number | null
          vendas_realizada?: number | null
          volume?: number | null
        }
        Update: {
          ano?: number | null
          created_at?: string
          data?: string
          dia_sem?: string | null
          id?: string
          loja?: string | null
          lucro?: number | null
          lucro_meta?: number | null
          margem_meta?: number | null
          margem_realizada?: number | null
          mes?: number | null
          mes_nome?: string | null
          part_percent?: number | null
          ranking_dia_semana?: string | null
          tipo?: string | null
          updated_at?: string
          vendas_meta?: number | null
          vendas_realizada?: number | null
          volume?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
