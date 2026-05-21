/**
 * tarefas_fluxoTypes.ts
 *
 * Tipos oficiais do fluxo executor → aprovador → auditor.
 * Toda a pasta `src/modules/tarefas/fluxo/` consome esses tipos.
 *
 * Doc: src/modules/tarefas/docs/tarefas_arquitetura_planos_acao.md
 */

// ============================================================================
// Status
// ============================================================================
export const TAREFAS_FLUXO_STATUS = {
  PENDENTE: "pendente",
  EM_ANDAMENTO: "em_andamento",
  AGUARDANDO_APROVACAO: "aguardando_aprovacao",
  DEVOLVIDA: "devolvida",
  AGUARDANDO_AUDITORIA: "aguardando_auditoria",
  CONCLUIDA: "concluida",
  APROVADA: "aprovada",
  REPROVADA: "reprovada",
} as const;

export type TarefasFluxoStatus =
  (typeof TAREFAS_FLUXO_STATUS)[keyof typeof TAREFAS_FLUXO_STATUS];

// ============================================================================
// Papéis
// ============================================================================
export type TarefasFluxoPapel =
  | "executor"
  | "aprovador"
  | "auditor"
  | "criador"
  | "admin"
  | "spectator";

// ============================================================================
// Itens de plano de ação
// ============================================================================
export interface ItemPlano {
  tipo: "foto" | "video" | "audio" | "texto";
  titulo: string;
  obrigatorio: boolean;
}

export interface RespostaItemPlano {
  tipo?: "foto" | "video" | "audio" | "texto";
  evidencia_url?: string;
  evidencia_anexo_id?: string;
  evidencia_mime_type?: string;
  valor_texto?: string;
}

/** Estrutura indexada por POSIÇÃO do item no itens_plano. */
export type RespostaPlanoValorJson = Record<string, RespostaItemPlano>;

// ============================================================================
// Plano de ação (aprovador e auditor compartilham estrutura)
// ============================================================================
export interface PlanoAcaoBase {
  id: string;
  assignment_id: string;
  field_id: string;
  rodada: number;
  instrucao: string | null;
  itens_plano: ItemPlano[];
  prazo_resolucao: string | null;
  criticidade: "baixa" | "media" | "alta" | null;
  criado_em: string;
  criado_por: string | null;
  respondido: boolean;
  respondido_em: string | null;
  respondido_por: string | null;
  resposta_valor_json: RespostaPlanoValorJson | null;
  deleted_at: string | null;
}

export type PlanoAprovador = PlanoAcaoBase & { __papel?: "aprovador" };
export type PlanoAuditor = PlanoAcaoBase & { __papel?: "auditor" };

// ============================================================================
// Resposta original do executor
// ============================================================================
export interface RespostaOriginal {
  field_id: string;
  valor_booleano: boolean | null;
  valor_texto: string | null;
  valor_numero: number | null;
  valor_json: unknown;
  evidencia_url: string | null;
  evidencia_anexo_id: string | null;
  evidencia_mime_type: string | null;
  observacao: string | null;
  respondido_por: string | null;
  respondido_em: string | null;
}

// ============================================================================
// Snapshot da pergunta (do template_snapshot)
// ============================================================================
export interface PerguntaSnapshot {
  id: string;
  label: string;
  tipo: string;
  obrigatorio: boolean;
  ordem: number;
  section_id?: string;
  exige_evidencia?: boolean;
  tipo_evidencia?: string;
  opcoes?: string[];
  // outros campos do SnapshotField — usados only quando necessário
  [key: string]: unknown;
}

// ============================================================================
// Pergunta consolidada — tudo que o frontend precisa para renderizar
// ============================================================================
export interface TarefaFluxoPergunta {
  fieldId: string;
  label: string;
  tipo: string;
  obrigatorio: boolean;
  ordem: number;
  /** Snapshot bruto da pergunta, caso o componente precise de campos avançados. */
  snapshot: PerguntaSnapshot;
  /** Resposta original do executor (R0). Null se ainda não respondeu. */
  respostaOriginalExecutor: RespostaOriginal | null;
  /** Planos do aprovador (R1, R2...) ordenados por rodada. */
  planosAprovador: PlanoAprovador[];
  /** Planos do auditor (R1 auditor, R2 auditor...) ordenados por rodada. */
  planosAuditor: PlanoAuditor[];
  // Permissões derivadas (status + papel + planos pendentes do auditor)
  podeExecutorResponderPlano: boolean;
  podeAprovadorCriarPlanoExecutor: boolean;
  podeAprovadorResponderPlanoAuditor: boolean;
  podeAuditorCriarPlanoAprovador: boolean;
}

// ============================================================================
// Resumo do assignment
// ============================================================================
export interface TarefaFluxoAssignment {
  id: string;
  status: TarefasFluxoStatus | string;
  rodada_atual: number | null;
  origem: "rotina" | "ad_hoc" | string;
  numero_tarefa: number | null;
  nome: string;
  data_prevista: string | null;
  prazo_execucao: string | null;
  finalizado_em: string | null;
  concluida_em: string | null;
  responsavel_id: string | null;
  aprovador_id: string | null;
  avaliador_id: string | null;
  auditor_id: string | null;
  setor_executor_id: string | null;
  setor_aprovador_id: string | null;
  setor_auditor_id: string | null;
  created_by: string | null;
  /** Snapshot completo do template, para fields. */
  template_snapshot: any;
  /** Snapshot ao vivo do template (para tarefas não-finais). */
  operational_templates?: any;
  /** Scores eventualmente preenchidos. */
  score_executor?: number | null;
  score_aprovacao?: number | null;
  score_aprovador?: number | null;
  score_auditor?: number | null;
}

// ============================================================================
// Estrutura ÚNICA retornada pelo hook useFluxoTarefa
// ============================================================================
export interface TarefaFluxoData {
  assignment: TarefaFluxoAssignment;
  perguntas: TarefaFluxoPergunta[];
  papelUsuario: TarefasFluxoPapel;
  planosAprovadorPendentes: PlanoAprovador[];
  planosAuditorPendentes: PlanoAuditor[];
}
