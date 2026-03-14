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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          acao: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          registro_id: string | null
          tabela: string
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          registro_id?: string | null
          tabela: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          registro_id?: string | null
          tabela?: string
          user_id?: string | null
        }
        Relationships: []
      }
      avaliacoes: {
        Row: {
          avaliador_id: string
          concluida: boolean
          created_at: string
          id: string
          nota_final: number | null
          observacao_geral: string | null
          ordem_servico_id: string
          tipo_avaliacao_id: string | null
          updated_at: string
        }
        Insert: {
          avaliador_id: string
          concluida?: boolean
          created_at?: string
          id?: string
          nota_final?: number | null
          observacao_geral?: string | null
          ordem_servico_id: string
          tipo_avaliacao_id?: string | null
          updated_at?: string
        }
        Update: {
          avaliador_id?: string
          concluida?: boolean
          created_at?: string
          id?: string
          nota_final?: number | null
          observacao_geral?: string | null
          ordem_servico_id?: string
          tipo_avaliacao_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_avaliador_id_fkey"
            columns: ["avaliador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_tipo_avaliacao_id_fkey"
            columns: ["tipo_avaliacao_id"]
            isOneToOne: false
            referencedRelation: "tipos_avaliacao"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacoes_inconsistencias: {
        Row: {
          created_at: string
          detectada_em: string
          id: string
          ordem_servico_id: string
          pergunta_id: string
          resolvida: boolean
          respostas_por_avaliador: Json
          setor_responsavel_id: string | null
          tipo_avaliacao_responsavel_id: string | null
        }
        Insert: {
          created_at?: string
          detectada_em?: string
          id?: string
          ordem_servico_id: string
          pergunta_id: string
          resolvida?: boolean
          respostas_por_avaliador?: Json
          setor_responsavel_id?: string | null
          tipo_avaliacao_responsavel_id?: string | null
        }
        Update: {
          created_at?: string
          detectada_em?: string
          id?: string
          ordem_servico_id?: string
          pergunta_id?: string
          resolvida?: boolean
          respostas_por_avaliador?: Json
          setor_responsavel_id?: string | null
          tipo_avaliacao_responsavel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_inconsistencias_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_inconsistencias_pergunta_id_fkey"
            columns: ["pergunta_id"]
            isOneToOne: false
            referencedRelation: "perguntas_avaliacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_inconsistencias_setor_responsavel_id_fkey"
            columns: ["setor_responsavel_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_inconsistencias_tipo_avaliacao_responsavel_id_fkey"
            columns: ["tipo_avaliacao_responsavel_id"]
            isOneToOne: false
            referencedRelation: "tipos_avaliacao"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliador_tipos_servico: {
        Row: {
          avaliador_id: string
          created_at: string
          id: string
          tipo_servico_id: string
        }
        Insert: {
          avaliador_id: string
          created_at?: string
          id?: string
          tipo_servico_id: string
        }
        Update: {
          avaliador_id?: string
          created_at?: string
          id?: string
          tipo_servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avaliador_tipos_servico_avaliador_id_fkey"
            columns: ["avaliador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliador_tipos_servico_tipo_servico_id_fkey"
            columns: ["tipo_servico_id"]
            isOneToOne: false
            referencedRelation: "tipos_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_itens: {
        Row: {
          checklist_id: string
          created_at: string
          descricao: string
          id: string
          obrigatorio: boolean
          ordem: number
        }
        Insert: {
          checklist_id: string
          created_at?: string
          descricao: string
          id?: string
          obrigatorio?: boolean
          ordem?: number
        }
        Update: {
          checklist_id?: string
          created_at?: string
          descricao?: string
          id?: string
          obrigatorio?: boolean
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_itens_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_perguntas: {
        Row: {
          checklist_id: string
          created_at: string
          id: string
          ordem: number
          pergunta_id: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          id?: string
          ordem?: number
          pergunta_id: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          id?: string
          ordem?: number
          pergunta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_perguntas_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_perguntas_pergunta_id_fkey"
            columns: ["pergunta_id"]
            isOneToOne: false
            referencedRelation: "perguntas_avaliacao"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          prazo_horas: number | null
          recorrencia: Database["public"]["Enums"]["recorrencia_tipo"]
          recorrencia_dias: number[] | null
          setor_id: string | null
          tipo_servico_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          prazo_horas?: number | null
          recorrencia?: Database["public"]["Enums"]["recorrencia_tipo"]
          recorrencia_dias?: number[] | null
          setor_id?: string | null
          tipo_servico_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          prazo_horas?: number | null
          recorrencia?: Database["public"]["Enums"]["recorrencia_tipo"]
          recorrencia_dias?: number[] | null
          setor_id?: string | null
          tipo_servico_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_tipo_servico_id_fkey"
            columns: ["tipo_servico_id"]
            isOneToOne: false
            referencedRelation: "tipos_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          cpf: string | null
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      colaborador_setores: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          setor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          setor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          setor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_setores_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_setores_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      inconsistencias_vinculadas: {
        Row: {
          avaliacao_id: string | null
          created_at: string
          detectada_em: string
          id: string
          ordem_servico_id: string
          pergunta_a_id: string
          pergunta_b_id: string
          resposta_a: string
          resposta_b: string
        }
        Insert: {
          avaliacao_id?: string | null
          created_at?: string
          detectada_em?: string
          id?: string
          ordem_servico_id: string
          pergunta_a_id: string
          pergunta_b_id: string
          resposta_a: string
          resposta_b: string
        }
        Update: {
          avaliacao_id?: string | null
          created_at?: string
          detectada_em?: string
          id?: string
          ordem_servico_id?: string
          pergunta_a_id?: string
          pergunta_b_id?: string
          resposta_a?: string
          resposta_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "inconsistencias_vinculadas_avaliacao_id_fkey"
            columns: ["avaliacao_id"]
            isOneToOne: false
            referencedRelation: "avaliacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inconsistencias_vinculadas_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inconsistencias_vinculadas_pergunta_a_id_fkey"
            columns: ["pergunta_a_id"]
            isOneToOne: false
            referencedRelation: "perguntas_avaliacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inconsistencias_vinculadas_pergunta_b_id_fkey"
            columns: ["pergunta_b_id"]
            isOneToOne: false
            referencedRelation: "perguntas_avaliacao"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_servico: {
        Row: {
          atendente_id: string | null
          cliente_cpf: string | null
          cliente_id: string | null
          cliente_nome: string | null
          colaborador_avaliado_id: string | null
          created_at: string
          data_abertura: string
          data_conclusao: string | null
          id: string
          numero_os: string
          status: Database["public"]["Enums"]["os_status"]
          tecnico_id: string | null
          tipo_servico_id: string | null
          updated_at: string
        }
        Insert: {
          atendente_id?: string | null
          cliente_cpf?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          colaborador_avaliado_id?: string | null
          created_at?: string
          data_abertura?: string
          data_conclusao?: string | null
          id?: string
          numero_os: string
          status?: Database["public"]["Enums"]["os_status"]
          tecnico_id?: string | null
          tipo_servico_id?: string | null
          updated_at?: string
        }
        Update: {
          atendente_id?: string | null
          cliente_cpf?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          colaborador_avaliado_id?: string | null
          created_at?: string
          data_abertura?: string
          data_conclusao?: string | null
          id?: string
          numero_os?: string
          status?: Database["public"]["Enums"]["os_status"]
          tecnico_id?: string | null
          tipo_servico_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_atendente_id_fkey"
            columns: ["atendente_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_colaborador_avaliado_id_fkey"
            columns: ["colaborador_avaliado_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_tecnico_id_fkey"
            columns: ["tecnico_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_tipo_servico_id_fkey"
            columns: ["tipo_servico_id"]
            isOneToOne: false
            referencedRelation: "tipos_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      perguntas_avaliacao: {
        Row: {
          ativo: boolean
          avaliador_id: string | null
          checklist_id: string | null
          correlacao_pergunta_id: string | null
          created_at: string
          id: string
          ordem: number
          pergunta: string
          peso: number
          setor_avaliado_id: string | null
          target_employee_type: string
          tipo_avaliacao_id: string | null
          tipo_avaliado: string
          tipo_servico_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          avaliador_id?: string | null
          checklist_id?: string | null
          correlacao_pergunta_id?: string | null
          created_at?: string
          id?: string
          ordem?: number
          pergunta: string
          peso?: number
          setor_avaliado_id?: string | null
          target_employee_type?: string
          tipo_avaliacao_id?: string | null
          tipo_avaliado?: string
          tipo_servico_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          avaliador_id?: string | null
          checklist_id?: string | null
          correlacao_pergunta_id?: string | null
          created_at?: string
          id?: string
          ordem?: number
          pergunta?: string
          peso?: number
          setor_avaliado_id?: string | null
          target_employee_type?: string
          tipo_avaliacao_id?: string | null
          tipo_avaliado?: string
          tipo_servico_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perguntas_avaliacao_avaliador_id_fkey"
            columns: ["avaliador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perguntas_avaliacao_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perguntas_avaliacao_correlacao_pergunta_id_fkey"
            columns: ["correlacao_pergunta_id"]
            isOneToOne: false
            referencedRelation: "perguntas_avaliacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perguntas_avaliacao_setor_avaliado_id_fkey"
            columns: ["setor_avaliado_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perguntas_avaliacao_tipo_avaliacao_id_fkey"
            columns: ["tipo_avaliacao_id"]
            isOneToOne: false
            referencedRelation: "tipos_avaliacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perguntas_avaliacao_tipo_servico_id_fkey"
            columns: ["tipo_servico_id"]
            isOneToOne: false
            referencedRelation: "tipos_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          cargo: string | null
          created_at: string
          email: string
          id: string
          nome: string
          pode_editar_avaliacoes: boolean
          pode_excluir_avaliacoes: boolean
          setor_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          created_at?: string
          email: string
          id?: string
          nome: string
          pode_editar_avaliacoes?: boolean
          pode_excluir_avaliacoes?: boolean
          setor_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string
          pode_editar_avaliacoes?: boolean
          pode_excluir_avaliacoes?: boolean
          setor_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      respostas_avaliacao: {
        Row: {
          avaliacao_id: string
          created_at: string
          evidencia_url: string | null
          id: string
          is_audit_only: boolean
          observacao: string | null
          pergunta_id: string
          resposta: string | null
        }
        Insert: {
          avaliacao_id: string
          created_at?: string
          evidencia_url?: string | null
          id?: string
          is_audit_only?: boolean
          observacao?: string | null
          pergunta_id: string
          resposta?: string | null
        }
        Update: {
          avaliacao_id?: string
          created_at?: string
          evidencia_url?: string | null
          id?: string
          is_audit_only?: boolean
          observacao?: string | null
          pergunta_id?: string
          resposta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "respostas_avaliacao_avaliacao_id_fkey"
            columns: ["avaliacao_id"]
            isOneToOne: false
            referencedRelation: "avaliacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_avaliacao_pergunta_id_fkey"
            columns: ["pergunta_id"]
            isOneToOne: false
            referencedRelation: "perguntas_avaliacao"
            referencedColumns: ["id"]
          },
        ]
      }
      sessoes_usuario: {
        Row: {
          created_at: string
          duracao_segundos: number | null
          id: string
          login_at: string
          logout_at: string | null
          logout_reason: string | null
          profile_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duracao_segundos?: number | null
          id?: string
          login_at?: string
          logout_at?: string | null
          logout_reason?: string | null
          profile_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duracao_segundos?: number | null
          id?: string
          login_at?: string
          logout_at?: string | null
          logout_reason?: string | null
          profile_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessoes_usuario_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      setores: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      tipo_servico_checklists: {
        Row: {
          checklist_id: string
          created_at: string
          id: string
          tipo_servico_id: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          id?: string
          tipo_servico_id: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          id?: string
          tipo_servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipo_servico_checklists_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipo_servico_checklists_tipo_servico_id_fkey"
            columns: ["tipo_servico_id"]
            isOneToOne: false
            referencedRelation: "tipos_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_servico_tipos_avaliacao: {
        Row: {
          created_at: string
          id: string
          tipo_avaliacao_id: string
          tipo_servico_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tipo_avaliacao_id: string
          tipo_servico_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tipo_avaliacao_id?: string
          tipo_servico_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipo_servico_tipos_avaliacao_tipo_avaliacao_id_fkey"
            columns: ["tipo_avaliacao_id"]
            isOneToOne: false
            referencedRelation: "tipos_avaliacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipo_servico_tipos_avaliacao_tipo_servico_id_fkey"
            columns: ["tipo_servico_id"]
            isOneToOne: false
            referencedRelation: "tipos_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_avaliacao: {
        Row: {
          ativo: boolean
          cargo_responsavel: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          cargo_responsavel?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          cargo_responsavel?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      tipos_servico: {
        Row: {
          ativo: boolean
          checklist_id: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
          setor_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          checklist_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          setor_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          checklist_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          setor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipos_servico_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipos_servico_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      sync_user_role: {
        Args: { _cargo: string; _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "avaliador" | "executor" | "gestor"
      os_status: "aberta" | "em_andamento" | "concluida"
      recorrencia_tipo:
        | "diaria"
        | "semanal"
        | "mensal"
        | "personalizada"
        | "quando_criada"
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
      app_role: ["admin", "avaliador", "executor", "gestor"],
      os_status: ["aberta", "em_andamento", "concluida"],
      recorrencia_tipo: [
        "diaria",
        "semanal",
        "mensal",
        "personalizada",
        "quando_criada",
      ],
    },
  },
} as const
