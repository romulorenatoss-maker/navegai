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
      actions: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
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
          concluida_em: string | null
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
          concluida_em?: string | null
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
          concluida_em?: string | null
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
      bairros: {
        Row: {
          cidade_id: string
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          cidade_id: string
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          cidade_id?: string
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "bairros_cidade_id_fkey"
            columns: ["cidade_id"]
            isOneToOne: false
            referencedRelation: "cidades"
            referencedColumns: ["id"]
          },
        ]
      }
      cadencia_tentativas: {
        Row: {
          created_at: string
          dias_apos: number
          id: string
          numero_tentativa: number
          periodo: string
          prioridade: number
        }
        Insert: {
          created_at?: string
          dias_apos?: number
          id?: string
          numero_tentativa: number
          periodo: string
          prioridade?: number
        }
        Update: {
          created_at?: string
          dias_apos?: number
          id?: string
          numero_tentativa?: number
          periodo?: string
          prioridade?: number
        }
        Relationships: []
      }
      campanhas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
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
      cidades: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      cliente_contatos: {
        Row: {
          cliente_id: string
          created_at: string
          id: string
          tem_whatsapp: boolean
          tipo: string
          valor: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          id?: string
          tem_whatsapp?: boolean
          tipo: string
          valor: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          id?: string
          tem_whatsapp?: boolean
          tipo?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          bairro_id: string | null
          cep: string | null
          cidade: string | null
          cidade_id: string | null
          cpf: string | null
          created_at: string
          endereco: string | null
          id: string
          nome: string
          nome_mae: string | null
          numero: string | null
          referencia: string | null
          rg: string | null
          rua_id: string | null
          updated_at: string
        }
        Insert: {
          bairro_id?: string | null
          cep?: string | null
          cidade?: string | null
          cidade_id?: string | null
          cpf?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
          nome_mae?: string | null
          numero?: string | null
          referencia?: string | null
          rg?: string | null
          rua_id?: string | null
          updated_at?: string
        }
        Update: {
          bairro_id?: string | null
          cep?: string | null
          cidade?: string | null
          cidade_id?: string | null
          cpf?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome?: string
          nome_mae?: string | null
          numero?: string | null
          referencia?: string | null
          rg?: string | null
          rua_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_bairro_id_fkey"
            columns: ["bairro_id"]
            isOneToOne: false
            referencedRelation: "bairros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_cidade_id_fkey"
            columns: ["cidade_id"]
            isOneToOne: false
            referencedRelation: "cidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_rua_id_fkey"
            columns: ["rua_id"]
            isOneToOne: false
            referencedRelation: "ruas"
            referencedColumns: ["id"]
          },
        ]
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
      configuracao_fluxo_leads: {
        Row: {
          acao_apos_finalizar_tentativas: string
          acao_quando_atrasar: string
          created_at: string
          id: string
          permitir_reiniciar_rotina: boolean
          quantidade_tentativas: number
          tempo_exibicao_leads_horas: number
          tempo_expiracao_captura_segundos: number
          tipo_servico_conversao_id: string | null
          updated_at: string
        }
        Insert: {
          acao_apos_finalizar_tentativas?: string
          acao_quando_atrasar?: string
          created_at?: string
          id?: string
          permitir_reiniciar_rotina?: boolean
          quantidade_tentativas?: number
          tempo_exibicao_leads_horas?: number
          tempo_expiracao_captura_segundos?: number
          tipo_servico_conversao_id?: string | null
          updated_at?: string
        }
        Update: {
          acao_apos_finalizar_tentativas?: string
          acao_quando_atrasar?: string
          created_at?: string
          id?: string
          permitir_reiniciar_rotina?: boolean
          quantidade_tentativas?: number
          tempo_exibicao_leads_horas?: number
          tempo_expiracao_captura_segundos?: number
          tipo_servico_conversao_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracao_fluxo_leads_tipo_servico_conversao_id_fkey"
            columns: ["tipo_servico_conversao_id"]
            isOneToOne: false
            referencedRelation: "tipos_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      group_permissions: {
        Row: {
          can_assign: boolean
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_export: boolean
          can_view: boolean
          created_at: string
          data_scope: Database["public"]["Enums"]["data_scope"]
          group_id: string
          id: string
          resource_id: string
        }
        Insert: {
          can_assign?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_export?: boolean
          can_view?: boolean
          created_at?: string
          data_scope?: Database["public"]["Enums"]["data_scope"]
          group_id: string
          id?: string
          resource_id: string
        }
        Update: {
          can_assign?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_export?: boolean
          can_view?: boolean
          created_at?: string
          data_scope?: Database["public"]["Enums"]["data_scope"]
          group_id?: string
          id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_permissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "permission_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_permissions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "permission_resources"
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
      lead_contatos: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          tem_whatsapp: boolean
          tipo_contato: string
          valor: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          tem_whatsapp?: boolean
          tipo_contato: string
          valor: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          tem_whatsapp?: boolean
          tipo_contato?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_historico: {
        Row: {
          ciencia_em: string | null
          ciencia_por: string | null
          created_at: string
          data_evento: string
          descricao: string | null
          id: string
          lead_id: string
          tipo_evento: string
          usuario_id: string
        }
        Insert: {
          ciencia_em?: string | null
          ciencia_por?: string | null
          created_at?: string
          data_evento?: string
          descricao?: string | null
          id?: string
          lead_id: string
          tipo_evento: string
          usuario_id: string
        }
        Update: {
          ciencia_em?: string | null
          ciencia_por?: string | null
          created_at?: string
          data_evento?: string
          descricao?: string | null
          id?: string
          lead_id?: string
          tipo_evento?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_historico_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historico_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_interacoes: {
        Row: {
          colaborador_id: string
          created_at: string
          data_interacao: string
          id: string
          lead_id: string
          numero_utilizado: string | null
          resultado: string | null
          tipo_contato: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data_interacao?: string
          id?: string
          lead_id: string
          numero_utilizado?: string | null
          resultado?: string | null
          tipo_contato: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data_interacao?: string
          id?: string
          lead_id?: string
          numero_utilizado?: string | null
          resultado?: string | null
          tipo_contato?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_interacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_objecoes: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string
          id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao: string
          id?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          id?: string
        }
        Relationships: []
      }
      lead_tarefas_contato: {
        Row: {
          created_at: string
          data_contato: string
          data_criacao: string
          fora_do_prazo: boolean
          id: string
          lead_id: string
          periodo: string
          responsavel_id: string | null
          status: string
          tentativa: number
        }
        Insert: {
          created_at?: string
          data_contato?: string
          data_criacao?: string
          fora_do_prazo?: boolean
          id?: string
          lead_id: string
          periodo?: string
          responsavel_id?: string | null
          status?: string
          tentativa?: number
        }
        Update: {
          created_at?: string
          data_contato?: string
          data_criacao?: string
          fora_do_prazo?: boolean
          id?: string
          lead_id?: string
          periodo?: string
          responsavel_id?: string | null
          status?: string
          tentativa?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_tarefas_contato_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tarefas_contato_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          agendamento_retorno: string | null
          bairro_id: string | null
          campanha_id: string | null
          cidade_id: string | null
          cliente_id: string | null
          convertido_por: string | null
          convertido_registrado_por: string | null
          created_at: string
          data_criacao: string
          descricao: string | null
          id: string
          nome: string
          notificacao_vista: boolean
          notificacao_vista_em: string | null
          notificacao_vista_por: string | null
          numero_endereco: string | null
          origem_lead: string | null
          plano_id: string | null
          repetidor: string | null
          reserved_at: string | null
          reserved_by: string | null
          responsavel_id: string | null
          rua_id: string | null
          status_lead: string
          updated_at: string
        }
        Insert: {
          agendamento_retorno?: string | null
          bairro_id?: string | null
          campanha_id?: string | null
          cidade_id?: string | null
          cliente_id?: string | null
          convertido_por?: string | null
          convertido_registrado_por?: string | null
          created_at?: string
          data_criacao?: string
          descricao?: string | null
          id?: string
          nome: string
          notificacao_vista?: boolean
          notificacao_vista_em?: string | null
          notificacao_vista_por?: string | null
          numero_endereco?: string | null
          origem_lead?: string | null
          plano_id?: string | null
          repetidor?: string | null
          reserved_at?: string | null
          reserved_by?: string | null
          responsavel_id?: string | null
          rua_id?: string | null
          status_lead?: string
          updated_at?: string
        }
        Update: {
          agendamento_retorno?: string | null
          bairro_id?: string | null
          campanha_id?: string | null
          cidade_id?: string | null
          cliente_id?: string | null
          convertido_por?: string | null
          convertido_registrado_por?: string | null
          created_at?: string
          data_criacao?: string
          descricao?: string | null
          id?: string
          nome?: string
          notificacao_vista?: boolean
          notificacao_vista_em?: string | null
          notificacao_vista_por?: string | null
          numero_endereco?: string | null
          origem_lead?: string | null
          plano_id?: string | null
          repetidor?: string | null
          reserved_at?: string | null
          reserved_by?: string | null
          responsavel_id?: string | null
          rua_id?: string | null
          status_lead?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_bairro_id_fkey"
            columns: ["bairro_id"]
            isOneToOne: false
            referencedRelation: "bairros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_cidade_id_fkey"
            columns: ["cidade_id"]
            isOneToOne: false
            referencedRelation: "cidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_convertido_por_fkey"
            columns: ["convertido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_convertido_registrado_por_fkey"
            columns: ["convertido_registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_reserved_by_fkey"
            columns: ["reserved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_rua_id_fkey"
            columns: ["rua_id"]
            isOneToOne: false
            referencedRelation: "ruas"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_assignments: {
        Row: {
          aprovador_id: string | null
          avaliado_id: string | null
          avaliador_fim_em: string | null
          avaliador_id: string | null
          avaliador_inicio_em: string | null
          created_at: string
          data_prevista: string
          evidencia_url: string | null
          fim_em: string | null
          horario_inicio_previsto: string | null
          horario_limite: string | null
          id: string
          inicio_em: string | null
          observacao: string | null
          pontuacao_obtida: number | null
          responsavel_id: string | null
          score_avaliado: number | null
          score_avaliador: number | null
          score_executor: number | null
          setor_avaliado_id: string | null
          setor_avaliador_id: string | null
          setor_executor_id: string | null
          status: string
          template_id: string
          tempo_gasto_minutos: number | null
          updated_at: string
          validador_contingencia_id: string | null
        }
        Insert: {
          aprovador_id?: string | null
          avaliado_id?: string | null
          avaliador_fim_em?: string | null
          avaliador_id?: string | null
          avaliador_inicio_em?: string | null
          created_at?: string
          data_prevista?: string
          evidencia_url?: string | null
          fim_em?: string | null
          horario_inicio_previsto?: string | null
          horario_limite?: string | null
          id?: string
          inicio_em?: string | null
          observacao?: string | null
          pontuacao_obtida?: number | null
          responsavel_id?: string | null
          score_avaliado?: number | null
          score_avaliador?: number | null
          score_executor?: number | null
          setor_avaliado_id?: string | null
          setor_avaliador_id?: string | null
          setor_executor_id?: string | null
          status?: string
          template_id: string
          tempo_gasto_minutos?: number | null
          updated_at?: string
          validador_contingencia_id?: string | null
        }
        Update: {
          aprovador_id?: string | null
          avaliado_id?: string | null
          avaliador_fim_em?: string | null
          avaliador_id?: string | null
          avaliador_inicio_em?: string | null
          created_at?: string
          data_prevista?: string
          evidencia_url?: string | null
          fim_em?: string | null
          horario_inicio_previsto?: string | null
          horario_limite?: string | null
          id?: string
          inicio_em?: string | null
          observacao?: string | null
          pontuacao_obtida?: number | null
          responsavel_id?: string | null
          score_avaliado?: number | null
          score_avaliador?: number | null
          score_executor?: number | null
          setor_avaliado_id?: string | null
          setor_avaliador_id?: string | null
          setor_executor_id?: string | null
          status?: string
          template_id?: string
          tempo_gasto_minutos?: number | null
          updated_at?: string
          validador_contingencia_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_assignments_aprovador_id_fkey"
            columns: ["aprovador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_avaliado_id_fkey"
            columns: ["avaliado_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_avaliador_id_fkey"
            columns: ["avaliador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_setor_avaliado_id_fkey"
            columns: ["setor_avaliado_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_setor_avaliador_id_fkey"
            columns: ["setor_avaliador_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_setor_executor_id_fkey"
            columns: ["setor_executor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "operational_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_assignments_validador_contingencia_id_fkey"
            columns: ["validador_contingencia_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_audit_trail: {
        Row: {
          assignment_id: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          executado_por: string | null
          id: string
          motivo: string | null
          tipo_evento: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          executado_por?: string | null
          id?: string
          motivo?: string | null
          tipo_evento: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          executado_por?: string | null
          id?: string
          motivo?: string | null
          tipo_evento?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_audit_trail_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operational_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_audit_trail_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_contingencies: {
        Row: {
          assignment_id: string
          check_answer_id: string | null
          created_at: string
          descricao: string
          id: string
          prazo_sla: string | null
          resolvida_em: string | null
          responsavel_id: string | null
          status: string
          step_log_id: string | null
          updated_at: string
          validada_em: string | null
          validada_por: string | null
        }
        Insert: {
          assignment_id: string
          check_answer_id?: string | null
          created_at?: string
          descricao: string
          id?: string
          prazo_sla?: string | null
          resolvida_em?: string | null
          responsavel_id?: string | null
          status?: string
          step_log_id?: string | null
          updated_at?: string
          validada_em?: string | null
          validada_por?: string | null
        }
        Update: {
          assignment_id?: string
          check_answer_id?: string | null
          created_at?: string
          descricao?: string
          id?: string
          prazo_sla?: string | null
          resolvida_em?: string | null
          responsavel_id?: string | null
          status?: string
          step_log_id?: string | null
          updated_at?: string
          validada_em?: string | null
          validada_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_contingencies_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operational_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_contingencies_check_answer_id_fkey"
            columns: ["check_answer_id"]
            isOneToOne: false
            referencedRelation: "operational_execution_check_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_contingencies_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_contingencies_step_log_id_fkey"
            columns: ["step_log_id"]
            isOneToOne: false
            referencedRelation: "operational_execution_step_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_contingencies_validada_por_fkey"
            columns: ["validada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_contingency_resolution_logs: {
        Row: {
          acao: string
          contingency_id: string
          created_at: string
          evidencia_url: string | null
          executado_por: string | null
          id: string
          observacao: string | null
        }
        Insert: {
          acao: string
          contingency_id: string
          created_at?: string
          evidencia_url?: string | null
          executado_por?: string | null
          id?: string
          observacao?: string | null
        }
        Update: {
          acao?: string
          contingency_id?: string
          created_at?: string
          evidencia_url?: string | null
          executado_por?: string | null
          id?: string
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_contingency_resolution_logs_contingency_id_fkey"
            columns: ["contingency_id"]
            isOneToOne: false
            referencedRelation: "operational_contingencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_contingency_resolution_logs_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_execution_check_answers: {
        Row: {
          assignment_id: string
          check_item_id: string
          conforme: boolean | null
          created_at: string
          evidencia_url: string | null
          id: string
          observacao: string | null
          resposta: string | null
        }
        Insert: {
          assignment_id: string
          check_item_id: string
          conforme?: boolean | null
          created_at?: string
          evidencia_url?: string | null
          id?: string
          observacao?: string | null
          resposta?: string | null
        }
        Update: {
          assignment_id?: string
          check_item_id?: string
          conforme?: boolean | null
          created_at?: string
          evidencia_url?: string | null
          id?: string
          observacao?: string | null
          resposta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_execution_check_answers_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operational_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_execution_check_answers_check_item_id_fkey"
            columns: ["check_item_id"]
            isOneToOne: false
            referencedRelation: "operational_template_check_items"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_execution_logs: {
        Row: {
          acao: string
          assignment_id: string
          created_at: string
          detalhes: Json | null
          executado_por: string | null
          id: string
        }
        Insert: {
          acao: string
          assignment_id: string
          created_at?: string
          detalhes?: Json | null
          executado_por?: string | null
          id?: string
        }
        Update: {
          acao?: string
          assignment_id?: string
          created_at?: string
          detalhes?: Json | null
          executado_por?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_execution_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operational_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_execution_logs_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_execution_step_logs: {
        Row: {
          assignment_id: string
          created_at: string
          evidencia_url: string | null
          fim_em: string | null
          id: string
          inicio_em: string | null
          observacao: string | null
          status: string
          step_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          evidencia_url?: string | null
          fim_em?: string | null
          id?: string
          inicio_em?: string | null
          observacao?: string | null
          status?: string
          step_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          evidencia_url?: string | null
          fim_em?: string | null
          id?: string
          inicio_em?: string | null
          observacao?: string | null
          status?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_execution_step_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operational_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_execution_step_logs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "operational_template_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_rankings: {
        Row: {
          contingencias_abertas: number | null
          contingencias_resolvidas: number | null
          created_at: string
          id: string
          periodo_fim: string
          periodo_inicio: string
          periodo_tipo: string
          profile_id: string
          rotinas_atrasadas: number | null
          rotinas_no_prazo: number | null
          score_medio: number | null
          total_rotinas: number | null
        }
        Insert: {
          contingencias_abertas?: number | null
          contingencias_resolvidas?: number | null
          created_at?: string
          id?: string
          periodo_fim: string
          periodo_inicio: string
          periodo_tipo: string
          profile_id: string
          rotinas_atrasadas?: number | null
          rotinas_no_prazo?: number | null
          score_medio?: number | null
          total_rotinas?: number | null
        }
        Update: {
          contingencias_abertas?: number | null
          contingencias_resolvidas?: number | null
          created_at?: string
          id?: string
          periodo_fim?: string
          periodo_inicio?: string
          periodo_tipo?: string
          profile_id?: string
          rotinas_atrasadas?: number | null
          rotinas_no_prazo?: number | null
          score_medio?: number | null
          total_rotinas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_rankings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_score_logs: {
        Row: {
          assignment_id: string
          conformidade: number | null
          created_at: string
          detalhe_calculo: Json | null
          id: string
          peso_item: number | null
          pontualidade: number | null
          profile_id: string
          qualidade_evidencia: number | null
          score_final: number | null
          sla_correcoes: number | null
          target_profile_id: string | null
          target_setor_id: string | null
          tipo_score: string
        }
        Insert: {
          assignment_id: string
          conformidade?: number | null
          created_at?: string
          detalhe_calculo?: Json | null
          id?: string
          peso_item?: number | null
          pontualidade?: number | null
          profile_id: string
          qualidade_evidencia?: number | null
          score_final?: number | null
          sla_correcoes?: number | null
          target_profile_id?: string | null
          target_setor_id?: string | null
          tipo_score?: string
        }
        Update: {
          assignment_id?: string
          conformidade?: number | null
          created_at?: string
          detalhe_calculo?: Json | null
          id?: string
          peso_item?: number | null
          pontualidade?: number | null
          profile_id?: string
          qualidade_evidencia?: number | null
          score_final?: number | null
          sla_correcoes?: number | null
          target_profile_id?: string | null
          target_setor_id?: string | null
          tipo_score?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_score_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "operational_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_score_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_score_logs_target_profile_id_fkey"
            columns: ["target_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_score_logs_target_setor_id_fkey"
            columns: ["target_setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_template_check_items: {
        Row: {
          created_at: string
          exige_foto: boolean | null
          exige_observacao: boolean | null
          gera_contingencia_se_reprovado: boolean | null
          id: string
          nota_maxima: number
          ordem: number
          penalidade_reprovacao: number
          pergunta: string
          peso: number
          template_id: string
          tipo_resposta: string
        }
        Insert: {
          created_at?: string
          exige_foto?: boolean | null
          exige_observacao?: boolean | null
          gera_contingencia_se_reprovado?: boolean | null
          id?: string
          nota_maxima?: number
          ordem?: number
          penalidade_reprovacao?: number
          pergunta: string
          peso?: number
          template_id: string
          tipo_resposta?: string
        }
        Update: {
          created_at?: string
          exige_foto?: boolean | null
          exige_observacao?: boolean | null
          gera_contingencia_se_reprovado?: boolean | null
          id?: string
          nota_maxima?: number
          ordem?: number
          penalidade_reprovacao?: number
          pergunta?: string
          peso?: number
          template_id?: string
          tipo_resposta?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_template_check_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "operational_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_template_steps: {
        Row: {
          created_at: string
          exige_foto: boolean | null
          exige_observacao: boolean | null
          exige_video: boolean | null
          horario_previsto: string | null
          id: string
          nome: string
          ordem: number
          peso: number
          prazo_limite_minutos: number | null
          template_id: string
        }
        Insert: {
          created_at?: string
          exige_foto?: boolean | null
          exige_observacao?: boolean | null
          exige_video?: boolean | null
          horario_previsto?: string | null
          id?: string
          nome: string
          ordem?: number
          peso?: number
          prazo_limite_minutos?: number | null
          template_id: string
        }
        Update: {
          created_at?: string
          exige_foto?: boolean | null
          exige_observacao?: boolean | null
          exige_video?: boolean | null
          horario_previsto?: string | null
          id?: string
          nome?: string
          ordem?: number
          peso?: number
          prazo_limite_minutos?: number | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_template_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "operational_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_templates: {
        Row: {
          aprovador_profile_id: string | null
          aprovador_setor_id: string | null
          ativo: boolean | null
          avaliado_profile_id: string | null
          avaliado_setor_id: string | null
          avaliador_profile_id: string | null
          avaliador_setor_id: string | null
          bloquear_fechamento_com_contingencia: boolean
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          destino_score: string
          dia_fixo_mes: number | null
          dias_da_semana: number[] | null
          executor_profile_id: string | null
          executor_setor_id: string | null
          exigir_foto: boolean | null
          exigir_observacao: boolean | null
          exigir_video: boolean | null
          gerar_contingencia_automatica: boolean | null
          horario_inicio_previsto: string | null
          horario_limite_execucao: string | null
          id: string
          intervalo_dias: number | null
          modo_pontuacao: string
          nome: string
          peso_recorrencia: number
          prazo_sla_correcao_horas: number | null
          pular_semanas: number | null
          recorrencia_tipo: string
          requer_aprovacao_gestor: boolean
          responsavel_contingencia_id: string | null
          responsavel_id: string | null
          setor_id: string | null
          tipo_execucao: string
          tolerancia_minutos: number | null
          updated_at: string
          validador_contingencia_profile_id: string | null
          validador_contingencia_setor_id: string | null
        }
        Insert: {
          aprovador_profile_id?: string | null
          aprovador_setor_id?: string | null
          ativo?: boolean | null
          avaliado_profile_id?: string | null
          avaliado_setor_id?: string | null
          avaliador_profile_id?: string | null
          avaliador_setor_id?: string | null
          bloquear_fechamento_com_contingencia?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          destino_score?: string
          dia_fixo_mes?: number | null
          dias_da_semana?: number[] | null
          executor_profile_id?: string | null
          executor_setor_id?: string | null
          exigir_foto?: boolean | null
          exigir_observacao?: boolean | null
          exigir_video?: boolean | null
          gerar_contingencia_automatica?: boolean | null
          horario_inicio_previsto?: string | null
          horario_limite_execucao?: string | null
          id?: string
          intervalo_dias?: number | null
          modo_pontuacao?: string
          nome: string
          peso_recorrencia?: number
          prazo_sla_correcao_horas?: number | null
          pular_semanas?: number | null
          recorrencia_tipo?: string
          requer_aprovacao_gestor?: boolean
          responsavel_contingencia_id?: string | null
          responsavel_id?: string | null
          setor_id?: string | null
          tipo_execucao?: string
          tolerancia_minutos?: number | null
          updated_at?: string
          validador_contingencia_profile_id?: string | null
          validador_contingencia_setor_id?: string | null
        }
        Update: {
          aprovador_profile_id?: string | null
          aprovador_setor_id?: string | null
          ativo?: boolean | null
          avaliado_profile_id?: string | null
          avaliado_setor_id?: string | null
          avaliador_profile_id?: string | null
          avaliador_setor_id?: string | null
          bloquear_fechamento_com_contingencia?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          destino_score?: string
          dia_fixo_mes?: number | null
          dias_da_semana?: number[] | null
          executor_profile_id?: string | null
          executor_setor_id?: string | null
          exigir_foto?: boolean | null
          exigir_observacao?: boolean | null
          exigir_video?: boolean | null
          gerar_contingencia_automatica?: boolean | null
          horario_inicio_previsto?: string | null
          horario_limite_execucao?: string | null
          id?: string
          intervalo_dias?: number | null
          modo_pontuacao?: string
          nome?: string
          peso_recorrencia?: number
          prazo_sla_correcao_horas?: number | null
          pular_semanas?: number | null
          recorrencia_tipo?: string
          requer_aprovacao_gestor?: boolean
          responsavel_contingencia_id?: string | null
          responsavel_id?: string | null
          setor_id?: string | null
          tipo_execucao?: string
          tolerancia_minutos?: number | null
          updated_at?: string
          validador_contingencia_profile_id?: string | null
          validador_contingencia_setor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_templates_aprovador_profile_id_fkey"
            columns: ["aprovador_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_aprovador_setor_id_fkey"
            columns: ["aprovador_setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_avaliado_profile_id_fkey"
            columns: ["avaliado_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_avaliado_setor_id_fkey"
            columns: ["avaliado_setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_avaliador_profile_id_fkey"
            columns: ["avaliador_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_avaliador_setor_id_fkey"
            columns: ["avaliador_setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_executor_profile_id_fkey"
            columns: ["executor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_executor_setor_id_fkey"
            columns: ["executor_setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_responsavel_contingencia_id_fkey"
            columns: ["responsavel_contingencia_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_validador_contingencia_profile_id_fkey"
            columns: ["validador_contingencia_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_templates_validador_contingencia_setor_id_fkey"
            columns: ["validador_contingencia_setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
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
          numero_os: string | null
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
          numero_os?: string | null
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
          numero_os?: string | null
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
      os_perguntas: {
        Row: {
          created_at: string
          id: string
          os_id: string
          pergunta_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          os_id: string
          pergunta_id: string
        }
        Update: {
          created_at?: string
          id?: string
          os_id?: string
          pergunta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_perguntas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_perguntas_pergunta_id_fkey"
            columns: ["pergunta_id"]
            isOneToOne: false
            referencedRelation: "perguntas_avaliacao"
            referencedColumns: ["id"]
          },
        ]
      }
      os_reaberturas: {
        Row: {
          campos_alterados: string[] | null
          created_at: string
          id: string
          motivo: string | null
          ordem_servico_id: string
          reaberta_por: string
        }
        Insert: {
          campos_alterados?: string[] | null
          created_at?: string
          id?: string
          motivo?: string | null
          ordem_servico_id: string
          reaberta_por: string
        }
        Update: {
          campos_alterados?: string[] | null
          created_at?: string
          id?: string
          motivo?: string | null
          ordem_servico_id?: string
          reaberta_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_reaberturas_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_reaberturas_reaberta_por_fkey"
            columns: ["reaberta_por"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          setor_nota_id: string | null
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
          setor_nota_id?: string | null
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
          setor_nota_id?: string | null
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
            foreignKeyName: "perguntas_avaliacao_setor_nota_id_fkey"
            columns: ["setor_nota_id"]
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
      permission_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      permission_resources: {
        Row: {
          code: string
          created_at: string
          id: string
          label: string
          module: string
          path: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          label: string
          module: string
          path?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          label?: string
          module?: string
          path?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          action_id: string | null
          id: string
          resource_id: string | null
          scope: string | null
        }
        Insert: {
          action_id?: string | null
          id?: string
          resource_id?: string | null
          scope?: string | null
        }
        Update: {
          action_id?: string | null
          id?: string
          resource_id?: string | null
          scope?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permissions_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      permissoes_tela: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          tela_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          tela_path: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          tela_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissoes_tela_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome_plano: string
          velocidade: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome_plano: string
          velocidade?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome_plano?: string
          velocidade?: string | null
        }
        Relationships: []
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
      registro_atraso_tentativa: {
        Row: {
          colaborador_id: string
          created_at: string
          data_programada: string
          data_registro: string
          id: string
          lead_id: string
          periodo: string
          tentativa: number
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data_programada: string
          data_registro?: string
          id?: string
          lead_id: string
          periodo: string
          tentativa: number
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data_programada?: string
          data_registro?: string
          id?: string
          lead_id?: string
          periodo?: string
          tentativa?: number
        }
        Relationships: [
          {
            foreignKeyName: "registro_atraso_tentativa_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registro_atraso_tentativa_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      registro_objecao_lead: {
        Row: {
          colaborador_id: string
          created_at: string
          data_registro: string
          id: string
          lead_id: string
          objecao_id: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data_registro?: string
          id?: string
          lead_id: string
          objecao_id: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data_registro?: string
          id?: string
          lead_id?: string
          objecao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registro_objecao_lead_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registro_objecao_lead_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registro_objecao_lead_objecao_id_fkey"
            columns: ["objecao_id"]
            isOneToOne: false
            referencedRelation: "lead_objecoes"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      respostas_avaliacao: {
        Row: {
          audio_url: string | null
          avaliacao_id: string | null
          avaliador_id: string | null
          avaliador_setor_id: string | null
          created_at: string
          evidencia_url: string | null
          id: string
          is_audit_only: boolean
          observacao: string | null
          ordem_servico_id: string | null
          pergunta_id: string
          resposta: string | null
        }
        Insert: {
          audio_url?: string | null
          avaliacao_id?: string | null
          avaliador_id?: string | null
          avaliador_setor_id?: string | null
          created_at?: string
          evidencia_url?: string | null
          id?: string
          is_audit_only?: boolean
          observacao?: string | null
          ordem_servico_id?: string | null
          pergunta_id: string
          resposta?: string | null
        }
        Update: {
          audio_url?: string | null
          avaliacao_id?: string | null
          avaliador_id?: string | null
          avaliador_setor_id?: string | null
          created_at?: string
          evidencia_url?: string | null
          id?: string
          is_audit_only?: boolean
          observacao?: string | null
          ordem_servico_id?: string | null
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
            foreignKeyName: "respostas_avaliacao_avaliador_id_fkey"
            columns: ["avaliador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_avaliacao_avaliador_setor_id_fkey"
            columns: ["avaliador_setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "respostas_avaliacao_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
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
      rotina_tentativas_leads: {
        Row: {
          ativo: boolean
          created_at: string
          dias_apos_anterior: number
          id: string
          periodo_contato: string
          prioridade: string
          tentativa_numero: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dias_apos_anterior?: number
          id?: string
          periodo_contato?: string
          prioridade?: string
          tentativa_numero: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dias_apos_anterior?: number
          id?: string
          periodo_contato?: string
          prioridade?: string
          tentativa_numero?: number
        }
        Relationships: []
      }
      ruas: {
        Row: {
          bairro_id: string
          cep: string[] | null
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          bairro_id: string
          cep?: string[] | null
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          bairro_id?: string
          cep?: string[] | null
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruas_bairro_id_fkey"
            columns: ["bairro_id"]
            isOneToOne: false
            referencedRelation: "bairros"
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
      task_assignments: {
        Row: {
          created_at: string
          data_prevista: string
          evidencia_url: string | null
          fim_em: string | null
          id: string
          inicio_em: string | null
          motivo_bloqueio: string | null
          observacao: string | null
          pontuacao_obtida: number | null
          prazo_limite: string | null
          responsavel_id: string | null
          status: string
          template_id: string
          tempo_gasto_minutos: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_prevista?: string
          evidencia_url?: string | null
          fim_em?: string | null
          id?: string
          inicio_em?: string | null
          motivo_bloqueio?: string | null
          observacao?: string | null
          pontuacao_obtida?: number | null
          prazo_limite?: string | null
          responsavel_id?: string | null
          status?: string
          template_id: string
          tempo_gasto_minutos?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_prevista?: string
          evidencia_url?: string | null
          fim_em?: string | null
          id?: string
          inicio_em?: string | null
          motivo_bloqueio?: string | null
          observacao?: string | null
          pontuacao_obtida?: number | null
          prazo_limite?: string | null
          responsavel_id?: string | null
          status?: string
          template_id?: string
          tempo_gasto_minutos?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignments_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      task_execution_logs: {
        Row: {
          acao: string
          assignment_id: string
          created_at: string
          detalhes: Json | null
          id: string
          profile_id: string
        }
        Insert: {
          acao: string
          assignment_id: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          profile_id: string
        }
        Update: {
          acao?: string
          assignment_id?: string
          created_at?: string
          detalhes?: Json | null
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_execution_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "task_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_execution_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_score_logs: {
        Row: {
          assignment_id: string
          created_at: string
          descricao: string | null
          id: string
          profile_id: string
          tipo: string
          valor: number
        }
        Insert: {
          assignment_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          profile_id: string
          tipo: string
          valor?: number
        }
        Update: {
          assignment_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          profile_id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_score_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "task_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_score_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          ativo: boolean
          bonus_antecipacao: number
          created_at: string
          descricao: string | null
          dias_execucao: number[] | null
          dificuldade: string
          exigir_evidencia_foto: boolean
          id: string
          meta_execucao_minutos: number | null
          obrigar_observacao: boolean
          penalidade_atraso: number
          penalidade_nao_execucao: number
          pontuacao_base: number
          prazo_horas: number
          prioridade: string
          setor_id: string | null
          tipo_recorrencia: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bonus_antecipacao?: number
          created_at?: string
          descricao?: string | null
          dias_execucao?: number[] | null
          dificuldade?: string
          exigir_evidencia_foto?: boolean
          id?: string
          meta_execucao_minutos?: number | null
          obrigar_observacao?: boolean
          penalidade_atraso?: number
          penalidade_nao_execucao?: number
          pontuacao_base?: number
          prazo_horas?: number
          prioridade?: string
          setor_id?: string | null
          tipo_recorrencia?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bonus_antecipacao?: number
          created_at?: string
          descricao?: string | null
          dias_execucao?: number[] | null
          dificuldade?: string
          exigir_evidencia_foto?: boolean
          id?: string
          meta_execucao_minutos?: number | null
          obrigar_observacao?: boolean
          penalidade_atraso?: number
          penalidade_nao_execucao?: number
          pontuacao_base?: number
          prazo_horas?: number
          prioridade?: string
          setor_id?: string | null
          tipo_recorrencia?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      task_user_streaks: {
        Row: {
          id: string
          nivel: string
          pontuacao_total: number
          profile_id: string
          streak_atual: number
          streak_maximo: number
          ultima_execucao_no_prazo: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          nivel?: string
          pontuacao_total?: number
          profile_id: string
          streak_atual?: number
          streak_maximo?: number
          ultima_execucao_no_prazo?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          nivel?: string
          pontuacao_total?: number
          profile_id?: string
          streak_atual?: number
          streak_maximo?: number
          ultima_execucao_no_prazo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_user_streaks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      user_group_assignments: {
        Row: {
          created_at: string
          group_id: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_group_assignments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "permission_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_group_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          can_assign: boolean | null
          can_create: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_export: boolean | null
          can_view: boolean | null
          created_at: string
          data_scope: Database["public"]["Enums"]["data_scope"] | null
          id: string
          profile_id: string
          resource_id: string
        }
        Insert: {
          can_assign?: boolean | null
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_export?: boolean | null
          can_view?: boolean | null
          created_at?: string
          data_scope?: Database["public"]["Enums"]["data_scope"] | null
          id?: string
          profile_id: string
          resource_id: string
        }
        Update: {
          can_assign?: boolean | null
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_export?: boolean | null
          can_view?: boolean | null
          created_at?: string
          data_scope?: Database["public"]["Enums"]["data_scope"] | null
          id?: string
          profile_id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_overrides_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "permission_resources"
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
      atomic_reserve_lead: {
        Args: { _lead_id: string; _profile_id: string; _user_id: string }
        Returns: boolean
      }
      calcular_media_operacional_ponderada: {
        Args: {
          _data_fim?: string
          _data_inicio?: string
          _profile_id: string
          _tipo?: string
        }
        Returns: number
      }
      calcular_nota_global: {
        Args: { _data_fim?: string; _data_inicio?: string; _profile_id: string }
        Returns: {
          nota_global: number
          nota_operacional: number
          nota_os: number
        }[]
      }
      calcular_notas_por_setor: {
        Args: { p_data_fim?: string; p_data_inicio?: string }
        Returns: {
          nota: number
          os_id: string
          profile_id: string
          profile_nome: string
          setor_id: string
          setor_nome: string
          tipo: string
        }[]
      }
      dashboard_metricas_agregadas: {
        Args: { p_data_fim?: string; p_data_inicio?: string }
        Returns: {
          media_nota: number
          nome: string
          profile_id: string
          setor_nome: string
          tipo: string
          total_os: number
        }[]
      }
      get_user_effective_permissions: {
        Args: { _profile_id: string }
        Returns: {
          can_assign: boolean
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_export: boolean
          can_view: boolean
          data_scope: Database["public"]["Enums"]["data_scope"]
          resource_code: string
          resource_path: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      normalize_cpf: { Args: { cpf_input: string }; Returns: string }
      sync_user_role: {
        Args: { _cargo: string; _user_id: string }
        Returns: undefined
      }
      user_has_avaliacao_on_os: {
        Args: { _os_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "avaliador" | "executor" | "gestor" | "avaliado"
      data_scope: "none" | "own" | "team" | "all"
      os_status: "aberta" | "em_andamento" | "concluida" | "aguardando_numero"
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
      app_role: ["admin", "avaliador", "executor", "gestor", "avaliado"],
      data_scope: ["none", "own", "team", "all"],
      os_status: ["aberta", "em_andamento", "concluida", "aguardando_numero"],
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
