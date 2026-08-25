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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      analise_anual: {
        Row: {
          ano: number
          created_at: string
          faturamento: number
          id: string
          lucro: number
          mes: number
          store_id: string
          volume: number
        }
        Insert: {
          ano: number
          created_at?: string
          faturamento?: number
          id?: string
          lucro?: number
          mes: number
          store_id: string
          volume?: number
        }
        Update: {
          ano?: number
          created_at?: string
          faturamento?: number
          id?: string
          lucro?: number
          mes?: number
          store_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "analise_anual_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_embu_20260731: {
        Row: {
          created_at: string | null
          date: string | null
          department: string | null
          id: string | null
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
          store_id: string | null
          tipo_dia: string | null
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          department?: string | null
          id?: string | null
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
          store_id?: string | null
          tipo_dia?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string | null
          department?: string | null
          id?: string | null
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
          store_id?: string | null
          tipo_dia?: string | null
        }
        Relationships: []
      }
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
      cliente_concorrentes: {
        Row: {
          apelido: string | null
          ativo: boolean
          created_at: string
          id: string
          prioridade: number
          site_concorrente_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          apelido?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          prioridade?: number
          site_concorrente_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          apelido?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          prioridade?: number
          site_concorrente_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_concorrentes_site_concorrente_id_fkey"
            columns: ["site_concorrente_id"]
            isOneToOne: false
            referencedRelation: "sites_concorrentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_concorrentes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_config: {
        Row: {
          ano: number
          hist_fim: string
          hist_inicio: string
          id: string
          mes: number
          meta_venda_mes: number
          parcelas_excesso: number
          store_id: string
        }
        Insert: {
          ano: number
          hist_fim: string
          hist_inicio: string
          id?: string
          mes: number
          meta_venda_mes?: number
          parcelas_excesso?: number
          store_id: string
        }
        Update: {
          ano?: number
          hist_fim?: string
          hist_inicio?: string
          id?: string
          mes?: number
          meta_venda_mes?: number
          parcelas_excesso?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_departamento: {
        Row: {
          ativo: boolean
          departamento: string
          id: string
          store_id: string
          tx_perdas: number
          tx_recuperacao: number
        }
        Insert: {
          ativo?: boolean
          departamento: string
          id?: string
          store_id: string
          tx_perdas?: number
          tx_recuperacao?: number
        }
        Update: {
          ativo?: boolean
          departamento?: string
          id?: string
          store_id?: string
          tx_perdas?: number
          tx_recuperacao?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_departamento_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_historico: {
        Row: {
          ano: number
          atualizado_em: string
          cmv: number
          compra: number
          departamento: string
          id: string
          mes: number
          store_id: string
          venda: number
        }
        Insert: {
          ano: number
          atualizado_em?: string
          cmv?: number
          compra?: number
          departamento: string
          id?: string
          mes: number
          store_id: string
          venda?: number
        }
        Update: {
          ano?: number
          atualizado_em?: string
          cmv?: number
          compra?: number
          departamento?: string
          id?: string
          mes?: number
          store_id?: string
          venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_historico_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_meta: {
        Row: {
          ano: number
          compra_sobre_venda: number
          departamento: string
          gerado_em: string
          id: string
          mes: number
          meta_compra: number
          meta_venda: number
          parcela_excesso: number
          participacao: number
          store_id: string
        }
        Insert: {
          ano: number
          compra_sobre_venda?: number
          departamento: string
          gerado_em?: string
          id?: string
          mes: number
          meta_compra?: number
          meta_venda?: number
          parcela_excesso?: number
          participacao?: number
          store_id: string
        }
        Update: {
          ano?: number
          compra_sobre_venda?: number
          departamento?: string
          gerado_em?: string
          id?: string
          mes?: number
          meta_compra?: number
          meta_venda?: number
          parcela_excesso?: number
          participacao?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_meta_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      concorrentes: {
        Row: {
          ativo: boolean
          cep_referencia: string | null
          created_at: string
          host: string
          id: string
          nome: string
          plataforma: string
          praca_esperada: string | null
          region_id: string | null
          sales_channel: number
          seller_id: string | null
          seller_nome: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cep_referencia?: string | null
          created_at?: string
          host: string
          id?: string
          nome: string
          plataforma?: string
          praca_esperada?: string | null
          region_id?: string | null
          sales_channel?: number
          seller_id?: string | null
          seller_nome?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cep_referencia?: string | null
          created_at?: string
          host?: string
          id?: string
          nome?: string
          plataforma?: string
          praca_esperada?: string | null
          region_id?: string | null
          sales_channel?: number
          seller_id?: string | null
          seller_nome?: string | null
          updated_at?: string
        }
        Relationships: []
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
      encarte_calendario: {
        Row: {
          agressivo: boolean
          agv_pct: number
          created_at: string
          dia_fim: number
          dia_inicio: number
          id: string
          modelo_id: string | null
          nome: string
          ordem: number
          tipo_faixa: string
          updated_at: string
        }
        Insert: {
          agressivo?: boolean
          agv_pct?: number
          created_at?: string
          dia_fim: number
          dia_inicio: number
          id?: string
          modelo_id?: string | null
          nome: string
          ordem?: number
          tipo_faixa?: string
          updated_at?: string
        }
        Update: {
          agressivo?: boolean
          agv_pct?: number
          created_at?: string
          dia_fim?: number
          dia_inicio?: number
          id?: string
          modelo_id?: string | null
          nome?: string
          ordem?: number
          tipo_faixa?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "encarte_calendario_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "encarte_modelo"
            referencedColumns: ["id"]
          },
        ]
      }
      encarte_categoria: {
        Row: {
          amarelo: boolean
          created_at: string
          departamento: string | null
          id: string
          neutro: boolean
          nome: string
          ordem: number
          termos: string[]
          updated_at: string
          vermelho: boolean
        }
        Insert: {
          amarelo?: boolean
          created_at?: string
          departamento?: string | null
          id?: string
          neutro?: boolean
          nome: string
          ordem?: number
          termos?: string[]
          updated_at?: string
          vermelho?: boolean
        }
        Update: {
          amarelo?: boolean
          created_at?: string
          departamento?: string | null
          id?: string
          neutro?: boolean
          nome?: string
          ordem?: number
          termos?: string[]
          updated_at?: string
          vermelho?: boolean
        }
        Relationships: []
      }
      encarte_categoria_map: {
        Row: {
          categoria_id: string
          created_at: string
          grupo: string | null
          id: string
          secao: string | null
          store_id: string
          subgrupo: string | null
        }
        Insert: {
          categoria_id: string
          created_at?: string
          grupo?: string | null
          id?: string
          secao?: string | null
          store_id: string
          subgrupo?: string | null
        }
        Update: {
          categoria_id?: string
          created_at?: string
          grupo?: string | null
          id?: string
          secao?: string | null
          store_id?: string
          subgrupo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "encarte_categoria_map_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "encarte_categoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encarte_categoria_map_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      encarte_config_loja: {
        Row: {
          carga_tributaria_pct: number
          created_at: string
          fecha_domingo: boolean
          id: string
          janela_nao_repetir_semanas: number
          split_capa: number
          split_verso: number
          store_id: string
          total_itens: number
          updated_at: string
          variacao_max_pct: number
        }
        Insert: {
          carga_tributaria_pct?: number
          created_at?: string
          fecha_domingo?: boolean
          id?: string
          janela_nao_repetir_semanas?: number
          split_capa?: number
          split_verso?: number
          store_id: string
          total_itens?: number
          updated_at?: string
          variacao_max_pct?: number
        }
        Update: {
          carga_tributaria_pct?: number
          created_at?: string
          fecha_domingo?: boolean
          id?: string
          janela_nao_repetir_semanas?: number
          split_capa?: number
          split_verso?: number
          store_id?: string
          total_itens?: number
          updated_at?: string
          variacao_max_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "encarte_config_loja_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      encarte_gerado: {
        Row: {
          agv_pct: number | null
          calendario_id: string | null
          criado_em: string
          criado_por: string | null
          data_fim: string | null
          data_inicio: string | null
          id: string
          modelo_id: string | null
          nome: string
          status: string
          store_id: string
          tipo_faixa: string | null
          updated_at: string
        }
        Insert: {
          agv_pct?: number | null
          calendario_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          modelo_id?: string | null
          nome: string
          status?: string
          store_id: string
          tipo_faixa?: string | null
          updated_at?: string
        }
        Update: {
          agv_pct?: number | null
          calendario_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          modelo_id?: string | null
          nome?: string
          status?: string
          store_id?: string
          tipo_faixa?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "encarte_gerado_calendario_id_fkey"
            columns: ["calendario_id"]
            isOneToOne: false
            referencedRelation: "encarte_calendario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encarte_gerado_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "encarte_modelo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encarte_gerado_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      encarte_item: {
        Row: {
          alerta: string | null
          aprovado: boolean
          categoria: string | null
          ciente: boolean
          codigo: string | null
          created_at: string
          custo: number | null
          departamento: string | null
          descricao: string | null
          ean: string | null
          encarte_id: string
          estoque: number | null
          face: string | null
          giro_90d: number | null
          id: string
          indice_elast: number | null
          margem_atual: number | null
          margem_oferta: number | null
          motivo: Json | null
          observacao: string | null
          ordem: number
          origem: string
          pmz: number | null
          posicao: number | null
          preco_oferta: number | null
          score: number | null
          tipo_faixa: string | null
          travado: boolean
          venda_atual: number | null
          volume_30d: number | null
        }
        Insert: {
          alerta?: string | null
          aprovado?: boolean
          categoria?: string | null
          ciente?: boolean
          codigo?: string | null
          created_at?: string
          custo?: number | null
          departamento?: string | null
          descricao?: string | null
          ean?: string | null
          encarte_id: string
          estoque?: number | null
          face?: string | null
          giro_90d?: number | null
          id?: string
          indice_elast?: number | null
          margem_atual?: number | null
          margem_oferta?: number | null
          motivo?: Json | null
          observacao?: string | null
          ordem?: number
          origem?: string
          pmz?: number | null
          posicao?: number | null
          preco_oferta?: number | null
          score?: number | null
          tipo_faixa?: string | null
          travado?: boolean
          venda_atual?: number | null
          volume_30d?: number | null
        }
        Update: {
          alerta?: string | null
          aprovado?: boolean
          categoria?: string | null
          ciente?: boolean
          codigo?: string | null
          created_at?: string
          custo?: number | null
          departamento?: string | null
          descricao?: string | null
          ean?: string | null
          encarte_id?: string
          estoque?: number | null
          face?: string | null
          giro_90d?: number | null
          id?: string
          indice_elast?: number | null
          margem_atual?: number | null
          margem_oferta?: number | null
          motivo?: Json | null
          observacao?: string | null
          ordem?: number
          origem?: string
          pmz?: number | null
          posicao?: number | null
          preco_oferta?: number | null
          score?: number | null
          tipo_faixa?: string | null
          travado?: boolean
          venda_atual?: number | null
          volume_30d?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "encarte_item_encarte_id_fkey"
            columns: ["encarte_id"]
            isOneToOne: false
            referencedRelation: "encarte_gerado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encarte_item_encarte_id_fkey"
            columns: ["encarte_id"]
            isOneToOne: false
            referencedRelation: "encarte_historico_itens"
            referencedColumns: ["encarte_id"]
          },
        ]
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
      encarte_modelo: {
        Row: {
          created_at: string
          id: string
          nome: string
          padrao: boolean
          store_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          padrao?: boolean
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          padrao?: boolean
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "encarte_modelo_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      encarte_modelo_slot: {
        Row: {
          categoria: string | null
          created_at: string
          departamento: string | null
          face: string
          id: string
          modelo_id: string
          posicao: number
          tipo_faixa: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          departamento?: string | null
          face: string
          id?: string
          modelo_id: string
          posicao: number
          tipo_faixa?: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          departamento?: string | null
          face?: string
          id?: string
          modelo_id?: string
          posicao?: number
          tipo_faixa?: string
        }
        Relationships: [
          {
            foreignKeyName: "encarte_modelo_slot_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "encarte_modelo"
            referencedColumns: ["id"]
          },
        ]
      }
      encarte_regra_faixa: {
        Row: {
          desconto_max_pct: number
          id: string
          janela_giro_dias: number
          margem_minima_pct: number
          peso_concorrente: number
          peso_estoque: number
          peso_giro: number
          peso_margem: number
          tipo_faixa: string
          updated_at: string
        }
        Insert: {
          desconto_max_pct?: number
          id?: string
          janela_giro_dias?: number
          margem_minima_pct?: number
          peso_concorrente?: number
          peso_estoque?: number
          peso_giro?: number
          peso_margem?: number
          tipo_faixa: string
          updated_at?: string
        }
        Update: {
          desconto_max_pct?: number
          id?: string
          janela_giro_dias?: number
          margem_minima_pct?: number
          peso_concorrente?: number
          peso_estoque?: number
          peso_giro?: number
          peso_margem?: number
          tipo_faixa?: string
          updated_at?: string
        }
        Relationships: []
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
          origem: string
          origem_ref: string | null
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
          origem?: string
          origem_ref?: string | null
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
          origem?: string
          origem_ref?: string | null
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
      meta_mix: {
        Row: {
          ano: number
          base_trimestre: number
          department: string
          gerado_em: string
          id: string
          mes: number
          meta_mix: number
          pct_reducao: number
          store_id: string
        }
        Insert: {
          ano: number
          base_trimestre?: number
          department: string
          gerado_em?: string
          id?: string
          mes: number
          meta_mix?: number
          pct_reducao?: number
          store_id: string
        }
        Update: {
          ano?: number
          base_trimestre?: number
          department?: string
          gerado_em?: string
          id?: string
          mes?: number
          meta_mix?: number
          pct_reducao?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_mix_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_taxas: {
        Row: {
          department: string
          id: string
          store_id: string
          tipo: string
          tx_margem: number
          tx_venda: number
          tx_volume: number
        }
        Insert: {
          department: string
          id?: string
          store_id: string
          tipo: string
          tx_margem?: number
          tx_venda?: number
          tx_volume?: number
        }
        Update: {
          department?: string
          id?: string
          store_id?: string
          tipo?: string
          tx_margem?: number
          tx_venda?: number
          tx_volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "meta_taxas_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      plataformas_detectadas: {
        Row: {
          coletor_disponivel: boolean
          corrigida_manualmente: boolean
          detectada_em: string
          evidencia: string | null
          host: string
          id: string
          plataforma: string
          plataforma_corrigida: string | null
          provedor: string | null
          site_concorrente_id: string | null
          suporta_regiao: boolean
        }
        Insert: {
          coletor_disponivel?: boolean
          corrigida_manualmente?: boolean
          detectada_em?: string
          evidencia?: string | null
          host: string
          id?: string
          plataforma: string
          plataforma_corrigida?: string | null
          provedor?: string | null
          site_concorrente_id?: string | null
          suporta_regiao?: boolean
        }
        Update: {
          coletor_disponivel?: boolean
          corrigida_manualmente?: boolean
          detectada_em?: string
          evidencia?: string | null
          host?: string
          id?: string
          plataforma?: string
          plataforma_corrigida?: string | null
          provedor?: string | null
          site_concorrente_id?: string | null
          suporta_regiao?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "plataformas_detectadas_site_concorrente_id_fkey"
            columns: ["site_concorrente_id"]
            isOneToOne: false
            referencedRelation: "sites_concorrentes"
            referencedColumns: ["id"]
          },
        ]
      }
      precos_concorrente: {
        Row: {
          arvore_categoria: string | null
          categoria: string | null
          cep_referencia: string | null
          colecoes: string[] | null
          coletado_em: string
          concorrente_id: string | null
          created_at: string
          disponivel: boolean
          ean: string | null
          em_promocao: boolean
          id: string
          imagem_url: string | null
          job_id: string | null
          lojista: string | null
          marca: string | null
          nome: string | null
          preco: number | null
          preco_auditoria: number | null
          preco_de: number | null
          produto_id: string | null
          promocao_multipla: string[] | null
          region_id: string | null
          sales_channel: number
          seller_id: string | null
          seller_nome: string | null
          site_concorrente_id: string | null
          sku: string
          updated_at: string
          url: string | null
        }
        Insert: {
          arvore_categoria?: string | null
          categoria?: string | null
          cep_referencia?: string | null
          colecoes?: string[] | null
          coletado_em?: string
          concorrente_id?: string | null
          created_at?: string
          disponivel?: boolean
          ean?: string | null
          em_promocao?: boolean
          id?: string
          imagem_url?: string | null
          job_id?: string | null
          lojista?: string | null
          marca?: string | null
          nome?: string | null
          preco?: number | null
          preco_auditoria?: number | null
          preco_de?: number | null
          produto_id?: string | null
          promocao_multipla?: string[] | null
          region_id?: string | null
          sales_channel?: number
          seller_id?: string | null
          seller_nome?: string | null
          site_concorrente_id?: string | null
          sku: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          arvore_categoria?: string | null
          categoria?: string | null
          cep_referencia?: string | null
          colecoes?: string[] | null
          coletado_em?: string
          concorrente_id?: string | null
          created_at?: string
          disponivel?: boolean
          ean?: string | null
          em_promocao?: boolean
          id?: string
          imagem_url?: string | null
          job_id?: string | null
          lojista?: string | null
          marca?: string | null
          nome?: string | null
          preco?: number | null
          preco_auditoria?: number | null
          preco_de?: number | null
          produto_id?: string | null
          promocao_multipla?: string[] | null
          region_id?: string | null
          sales_channel?: number
          seller_id?: string | null
          seller_nome?: string | null
          site_concorrente_id?: string | null
          sku?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "precos_concorrente_concorrente_id_fkey"
            columns: ["concorrente_id"]
            isOneToOne: false
            referencedRelation: "concorrentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precos_concorrente_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precos_concorrente_site_concorrente_id_fkey"
            columns: ["site_concorrente_id"]
            isOneToOne: false
            referencedRelation: "sites_concorrentes"
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
          categorias_erro: Json
          categorias_incompletas: Json | null
          cep_referencia: string | null
          competitor_name: string | null
          competitor_url: string
          concorrente_id: string | null
          created_at: string
          error_message: string | null
          fila: Json
          finished_at: string | null
          firecrawl_crawl_id: string | null
          host: string | null
          id: string
          log_lines: Json | null
          lojista_detectado: string | null
          pages_crawled: number | null
          products_found: number | null
          products_json: Json | null
          progress_pct: number | null
          rate_limit_hits: number | null
          region_id: string | null
          sales_channel: number | null
          seller_esperado: string | null
          site_concorrente_id: string | null
          skus_indisponiveis: number | null
          skus_sem_ean: number | null
          skus_validos: number | null
          status: string
          total_pages: number | null
          total_urls_found: number | null
          ultima_atividade: string | null
          updated_at: string
        }
        Insert: {
          categorias_erro?: Json
          categorias_incompletas?: Json | null
          cep_referencia?: string | null
          competitor_name?: string | null
          competitor_url: string
          concorrente_id?: string | null
          created_at?: string
          error_message?: string | null
          fila?: Json
          finished_at?: string | null
          firecrawl_crawl_id?: string | null
          host?: string | null
          id?: string
          log_lines?: Json | null
          lojista_detectado?: string | null
          pages_crawled?: number | null
          products_found?: number | null
          products_json?: Json | null
          progress_pct?: number | null
          rate_limit_hits?: number | null
          region_id?: string | null
          sales_channel?: number | null
          seller_esperado?: string | null
          site_concorrente_id?: string | null
          skus_indisponiveis?: number | null
          skus_sem_ean?: number | null
          skus_validos?: number | null
          status?: string
          total_pages?: number | null
          total_urls_found?: number | null
          ultima_atividade?: string | null
          updated_at?: string
        }
        Update: {
          categorias_erro?: Json
          categorias_incompletas?: Json | null
          cep_referencia?: string | null
          competitor_name?: string | null
          competitor_url?: string
          concorrente_id?: string | null
          created_at?: string
          error_message?: string | null
          fila?: Json
          finished_at?: string | null
          firecrawl_crawl_id?: string | null
          host?: string | null
          id?: string
          log_lines?: Json | null
          lojista_detectado?: string | null
          pages_crawled?: number | null
          products_found?: number | null
          products_json?: Json | null
          progress_pct?: number | null
          rate_limit_hits?: number | null
          region_id?: string | null
          sales_channel?: number | null
          seller_esperado?: string | null
          site_concorrente_id?: string | null
          skus_indisponiveis?: number | null
          skus_sem_ean?: number | null
          skus_validos?: number | null
          status?: string
          total_pages?: number | null
          total_urls_found?: number | null
          ultima_atividade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scrape_jobs_concorrente_id_fkey"
            columns: ["concorrente_id"]
            isOneToOne: false
            referencedRelation: "concorrentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scrape_jobs_site_concorrente_id_fkey"
            columns: ["site_concorrente_id"]
            isOneToOne: false
            referencedRelation: "sites_concorrentes"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sites_concorrentes: {
        Row: {
          ativo: boolean
          cep_referencia: string
          coletor_disponivel: boolean
          created_at: string
          deteccao_evidencia: string | null
          host: string
          id: string
          loja_externa_id: string | null
          loja_externa_param: string | null
          nome: string
          plataforma: string
          praca_esperada: string | null
          provedor: string | null
          region_id: string | null
          sc: number
          status_ultima_coleta: string | null
          ultima_coleta: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cep_referencia?: string
          coletor_disponivel?: boolean
          created_at?: string
          deteccao_evidencia?: string | null
          host: string
          id?: string
          loja_externa_id?: string | null
          loja_externa_param?: string | null
          nome: string
          plataforma?: string
          praca_esperada?: string | null
          provedor?: string | null
          region_id?: string | null
          sc?: number
          status_ultima_coleta?: string | null
          ultima_coleta?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cep_referencia?: string
          coletor_disponivel?: boolean
          created_at?: string
          deteccao_evidencia?: string | null
          host?: string
          id?: string
          loja_externa_id?: string | null
          loja_externa_param?: string | null
          nome?: string
          plataforma?: string
          praca_esperada?: string | null
          provedor?: string | null
          region_id?: string | null
          sc?: number
          status_ultima_coleta?: string | null
          ultima_coleta?: string | null
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
          meta_mix: number | null
          meta_vendas: number | null
          meta_volume: number | null
          projecao_lucro: number | null
          projecao_margem_pct: number | null
          projecao_mix: number | null
          projecao_vendas: number | null
          projecao_volume: number | null
          realizado_lucro: number | null
          realizado_margem_pct: number | null
          realizado_mix: number | null
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
          meta_mix?: number | null
          meta_vendas?: number | null
          meta_volume?: number | null
          projecao_lucro?: number | null
          projecao_margem_pct?: number | null
          projecao_mix?: number | null
          projecao_vendas?: number | null
          projecao_volume?: number | null
          realizado_lucro?: number | null
          realizado_margem_pct?: number | null
          realizado_mix?: number | null
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
          meta_mix?: number | null
          meta_vendas?: number | null
          meta_volume?: number | null
          projecao_lucro?: number | null
          projecao_margem_pct?: number | null
          projecao_mix?: number | null
          projecao_vendas?: number | null
          projecao_volume?: number | null
          realizado_lucro?: number | null
          realizado_margem_pct?: number | null
          realizado_mix?: number | null
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
      store_vr_config: {
        Row: {
          api_key: string
          api_url: string
          codigo_loja: number | null
          created_at: string
          enabled: boolean
          health_error: string | null
          last_check_at: string | null
          last_error: string | null
          last_sync_at: string | null
          latency_ms: number | null
          online: boolean | null
          sistema: string
          store_id: string
        }
        Insert: {
          api_key: string
          api_url: string
          codigo_loja?: number | null
          created_at?: string
          enabled?: boolean
          health_error?: string | null
          last_check_at?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          latency_ms?: number | null
          online?: boolean | null
          sistema?: string
          store_id: string
        }
        Update: {
          api_key?: string
          api_url?: string
          codigo_loja?: number | null
          created_at?: string
          enabled?: boolean
          health_error?: string | null
          last_check_at?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          latency_ms?: number | null
          online?: boolean | null
          sistema?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_vr_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
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
      titulo_planejamento: {
        Row: {
          categoria: string | null
          created_at: string
          data_prevista: string | null
          documento: string | null
          fornecedor: string | null
          id: string
          observacao: string | null
          prioridade: string
          responsavel: string | null
          situacao: string
          store_id: string
          titulo_ref: string
          updated_at: string
          updated_by: string | null
          valor: number | null
          vencimento: string | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          data_prevista?: string | null
          documento?: string | null
          fornecedor?: string | null
          id?: string
          observacao?: string | null
          prioridade?: string
          responsavel?: string | null
          situacao?: string
          store_id: string
          titulo_ref: string
          updated_at?: string
          updated_by?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string
          data_prevista?: string | null
          documento?: string | null
          fornecedor?: string | null
          id?: string
          observacao?: string | null
          prioridade?: string
          responsavel?: string | null
          situacao?: string
          store_id?: string
          titulo_ref?: string
          updated_at?: string
          updated_by?: string | null
          valor?: number | null
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "titulo_planejamento_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
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
      vr_calendario: {
        Row: {
          data: string
          dia_sem: string
          editado: boolean
          id: string
          semana: number
          store_id: string
          tipo: string
        }
        Insert: {
          data: string
          dia_sem: string
          editado?: boolean
          id?: string
          semana: number
          store_id: string
          tipo: string
        }
        Update: {
          data?: string
          dia_sem?: string
          editado?: boolean
          id?: string
          semana?: number
          store_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "vr_calendario_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      vr_lancamento_map: {
        Row: {
          created_at: string
          descricao_vr: string | null
          id: string
          id_tipo: number
          store_id: string | null
          subtipo: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao_vr?: string | null
          id?: string
          id_tipo: number
          store_id?: string | null
          subtipo: string
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao_vr?: string | null
          id?: string
          id_tipo?: number
          store_id?: string | null
          subtipo?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vr_lancamento_map_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      vr_secao_departamento: {
        Row: {
          department: string
          id: string
          secao_vr: string
          store_id: string
        }
        Insert: {
          department: string
          id?: string
          secao_vr: string
          store_id: string
        }
        Update: {
          department?: string
          id?: string
          secao_vr?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vr_secao_departamento_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      websac_relatorios: {
        Row: {
          atualizado_em: string
          descricao: string | null
          nome: string
          sql: string
        }
        Insert: {
          atualizado_em?: string
          descricao?: string | null
          nome: string
          sql: string
        }
        Update: {
          atualizado_em?: string
          descricao?: string | null
          nome?: string
          sql?: string
        }
        Relationships: []
      }
    }
    Views: {
      encarte_historico_itens: {
        Row: {
          codigo: string | null
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          ean: string | null
          encarte_id: string | null
          preco_oferta: number | null
          status: string | null
          store_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "encarte_gerado_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      vr_sync_status: {
        Row: {
          enabled: boolean | null
          health_error: string | null
          last_check_at: string | null
          last_sync_at: string | null
          latency_ms: number | null
          online: boolean | null
          store_id: string | null
        }
        Insert: {
          enabled?: boolean | null
          health_error?: string | null
          last_check_at?: string | null
          last_sync_at?: string | null
          latency_ms?: number | null
          online?: boolean | null
          store_id?: string | null
        }
        Update: {
          enabled?: boolean | null
          health_error?: string | null
          last_check_at?: string | null
          last_sync_at?: string | null
          latency_ms?: number | null
          online?: boolean | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_vr_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      distribuir_metas: {
        Args: {
          p_ano: number
          p_department: string
          p_faturamento: number
          p_margem_pct: number
          p_mes: number
          p_mix: number
          p_store_id: string
          p_volume: number
        }
        Returns: {
          dias_gerados: number
          total_meta: number
        }[]
      }
      gerar_calendario: {
        Args: { p_fim: string; p_inicio: string; p_store_id: string }
        Returns: number
      }
      gerar_meta_mix: {
        Args: {
          p_ano: number
          p_bases: Json
          p_mes: number
          p_pct?: number
          p_store_id: string
        }
        Returns: {
          departamentos: number
          total_meta: number
        }[]
      }
      gerar_metas: {
        Args: {
          p_ano: number
          p_base?: string
          p_department: string
          p_mes: number
          p_store_id: string
        }
        Returns: {
          dias_gerados: number
          total_meta: number
        }[]
      }
      gerar_metas_compra: {
        Args: { p_ano: number; p_mes: number; p_store_id: string }
        Returns: {
          departamentos: number
          meta_compra_total: number
          meta_venda_total: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      importar_lancamentos_vr: {
        Args: {
          p_fim: string
          p_inicio: string
          p_store_id: string
          p_user_id?: string
        }
        Returns: {
          gravados: number
          linhas: number
        }[]
      }
      importar_lancamentos_vr_auto: { Args: never; Returns: number }
      semear_taxas_padrao: {
        Args: {
          p_department: string
          p_store_id: string
          p_tx_base?: number
          p_tx_forte?: number
          p_tx_margem?: number
        }
        Returns: number
      }
      store_sistema: { Args: { _store_id: string }; Returns: string }
      tem_acesso_loja: { Args: { _store_id: string }; Returns: boolean }
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
