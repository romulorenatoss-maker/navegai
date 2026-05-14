/**
 * Serviço de configuração global de Pontuação/SLA das Tarefas.
 * Singleton em public.tarefas_pontuacao_config.
 *
 * Regra:
 *   - Configuração global = padrão usado na criação de novas tarefas.
 *   - Cada tarefa criada salva seu próprio snapshot editável.
 *   - Editar valores na tarefa NÃO altera o padrão global.
 *
 * Fase A: adicionados blocos por camada (executor, aprovador, plano_acao, validador).
 * Campos legados continuam preservados e em uso pelo trigger atual.
 */
import { supabase } from "@/integrations/supabase/client";

export interface CamadaSlaConfig {
  nota_max: number;
  nota_min: number;
  sla_horas: number;
  penalidade_atraso: number;
  penalidade_nao_resposta: number;
  penalidade_nao_conformidade: number;
  permite_ponderacao: boolean;
  exige_justificativa_ponderacao: boolean;
  gera_plano_acao_auto: boolean;
  permite_reabertura: boolean;
}

export interface TarefasPontuacaoConfig {
  id?: string;
  // Legado (mantido)
  penalidade_fora_prazo: number;
  penalidade_contingencia: number;
  penalidade_sla_contingencia: number;
  nota_minima: number;
  nota_maxima: number;
  pontuacao_automatica_padrao: boolean;
  descricao: string | null;
  updated_at?: string;
  updated_by?: string | null;
  // Novo: blocos por camada
  sla_executor: CamadaSlaConfig;
  sla_aprovador: CamadaSlaConfig;
  sla_plano_acao: CamadaSlaConfig;
  sla_validador: CamadaSlaConfig;
  // Pacote padrão de perguntas do Aprovador (carregado em novas rotinas).
  aprovador_pacote_padrao: AprovadorPerguntaPadrao[];
  // Pacote padrão de perguntas do Validador/Auditor (carregado em novas rotinas).
  // Reusa o shape AprovadorPerguntaPadrao p/ compartilhar UI/modal/normalizers.
  validador_pacote_padrao: AprovadorPerguntaPadrao[];
}

/**
 * Métricas calculáveis automaticamente na execução/encerramento.
 * O engine de cálculo entra em segunda etapa; por ora a UI permite override manual.
 */
export type AprovadorMetricaCalculo =
  // Legado (mantido p/ compat)
  | "prazo_global"
  | "atraso_etapa"
  | "obrigatorias_respondidas"
  | "evidencias_anexadas"
  | "respostas_nao_conformes"
  | "devolucao"
  | "plano_acao_aberto"
  | "plano_acao_sla"
  | "plano_acao_prorrogacao"
  | "plano_acao_prorrogacao_multipla"
  | "manual"
  // Novas metric_keys do Pacote padrão do Validador
  | "aprovador_fora_sla"
  | "aprovou_com_alerta_pendente"
  | "nao_conformidade_sem_regra_obrigatoria"
  | "ponderacao_manual_realizada"
  | "prorrogacao_plano_acao"
  | "prorrogacao_plano_acao_recorrente"
  | "plano_acao_vencido"
  | "aprovador_reabriu_ou_devolveu";

export type AprovadorTipoPadrao = "sim_nao" | "conforme_nao_conforme" | "nota";

/** Origem da pergunta no pacote padrão. */
export type AprovadorOrigemPergunta =
  | "automatica_sistema"           // calculada pelo motor de auditoria
  | "manual_padrao_configuracao"   // padrão manual entregue pelo Validador/Auditor
  | "automatica_configuracao";     // legado — perguntas auto-configuráveis do Aprovador

export interface AprovadorPerguntaPadrao {
  id: string;                          // estável, usado como config_global_origem_id
  ordem: number;
  pergunta: string;
  tipo: AprovadorTipoPadrao;
  peso: number;
  ativo: boolean;
  metrica_calculo: AprovadorMetricaCalculo;
  // Regras herdáveis pelo snapshot da rotina (mesmo shape de AprovadorCheckItemForm)
  exige_observacao?: boolean;
  exige_evidencia?: boolean;
  permite_devolucao?: boolean;
  gera_plano_acao?: boolean;
  permite_conclusao?: boolean;
  permite_aumento_prazo?: boolean;
  permite_ponderacao_auditor?: boolean;
  exige_justificativa_ponderacao?: boolean;
  // ── Auditoria / metadados (novos — JSON, sem migration) ──
  origem_pergunta?: AprovadorOrigemPergunta;
  camada_alvo?: "aprovador" | "executor" | "plano_acao";
  fonte_dados?: string;        // descrição curta da fonte real (tabela/coluna/evento)
  regra_calculo?: string;      // descrição humana da regra
  metrica_pendente?: boolean;  // true → mostra chip "métrica pendente de implementação"
}

/**
 * Pacote padrão = SOMENTE métricas gerais.
 * Avaliação por pergunta (NC, plano de ação, devolução, ponderação, evidência específica)
 * acontece nas perguntas REPLICADAS do Aprovador (uma por pergunta do Avaliado),
 * não aqui — para não duplicar penalidades.
 */
export const APROVADOR_PACOTE_PADRAO_DEFAULT: AprovadorPerguntaPadrao[] = [
  { id: "apr-prazo-global", ordem: 1, pergunta: "Executor entregou a tarefa dentro do prazo global?", tipo: "sim_nao", peso: 25, ativo: true, metrica_calculo: "prazo_global", permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true, gera_plano_acao: false },
  { id: "apr-atraso-etapa", ordem: 2, pergunta: "Houve atraso em alguma etapa da execução?", tipo: "sim_nao", peso: 20, ativo: true, metrica_calculo: "atraso_etapa", permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true, gera_plano_acao: false },
  { id: "apr-obrigatorias", ordem: 3, pergunta: "Todas as perguntas obrigatórias foram respondidas?", tipo: "sim_nao", peso: 20, ativo: true, metrica_calculo: "obrigatorias_respondidas", permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true, gera_plano_acao: false },
  { id: "apr-evidencias", ordem: 4, pergunta: "As evidências obrigatórias foram anexadas corretamente?", tipo: "sim_nao", peso: 20, ativo: true, metrica_calculo: "evidencias_anexadas", permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true, gera_plano_acao: false },
  { id: "apr-devolucao", ordem: 5, pergunta: "A execução precisou ser devolvida ou reaberta?", tipo: "sim_nao", peso: 15, ativo: true, metrica_calculo: "devolucao", permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true, gera_plano_acao: false },
];

/**
 * Pacote padrão do Validador / Auditor.
 * O Validador audita a ATUAÇÃO DO APROVADOR — nunca avalia o Executor diretamente.
 *
 * Bloco AUTO (8 itens, soma 100) — perguntas calculadas a partir de fontes reais.
 * Bloco MANUAL (4 itens, soma 100) — julgamento humano do auditor, sem cálculo.
 *
 * Quando uma metric_key ainda não tem fonte confiável cabeada, a pergunta entra
 * com `metrica_pendente: true` e `ativo: false` para evitar cálculo falso.
 */
export const VALIDADOR_PACOTE_PADRAO_DEFAULT: AprovadorPerguntaPadrao[] = [
  // ── AUTO (8) ─────────────────────────────────────────────────────
  {
    id: "val-aprovador-fora-sla", ordem: 1,
    pergunta: "Aprovador avaliou fora do SLA?",
    tipo: "sim_nao", peso: 20, ativo: true,
    metrica_calculo: "aprovador_fora_sla",
    origem_pergunta: "automatica_sistema", camada_alvo: "aprovador",
    fonte_dados: "operational_assignments.avaliador_fim_em vs prazo SLA do aprovador",
    regra_calculo: "Comparar prazo limite da avaliação do aprovador com data/hora real de conclusão.",
    permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
  {
    id: "val-aprovou-alerta-pendente", ordem: 2,
    pergunta: "Aprovador aprovou item com alerta automático pendente?",
    tipo: "sim_nao", peso: 15, ativo: true, metrica_pendente: true,
    metrica_calculo: "aprovou_com_alerta_pendente",
    origem_pergunta: "automatica_sistema", camada_alvo: "aprovador",
    fonte_dados: "operational_field_reviews + operational_contingencies + alertas",
    regra_calculo: "Detectar aprovação (conforme=true) com alerta ativo (atraso, evidência ausente, SLA vencido, NC) sem tratamento/justificativa.",
    permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
  {
    id: "val-nc-sem-regra", ordem: 3,
    pergunta: "Aprovador marcou não conformidade sem cumprir regra exigida?",
    tipo: "sim_nao", peso: 15, ativo: true, metrica_pendente: true,
    metrica_calculo: "nao_conformidade_sem_regra_obrigatoria",
    origem_pergunta: "automatica_sistema", camada_alvo: "aprovador",
    fonte_dados: "operational_field_reviews.conforme=false + regras do snapshot (exige_observacao/exige_evidencia/gera_plano_acao)",
    regra_calculo: "Quando NC, validar se justificativa, evidência, plano de ação ou anexo obrigatórios foram cumpridos.",
    permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
  {
    id: "val-ponderacao-manual", ordem: 4,
    pergunta: "Aprovador alterou/ponderou nota manualmente?",
    tipo: "sim_nao", peso: 10, ativo: false, metrica_pendente: true,
    metrica_calculo: "ponderacao_manual_realizada",
    origem_pergunta: "automatica_sistema", camada_alvo: "aprovador",
    fonte_dados: "operational_score_logs.detalhe_calculo (nota automática) vs score_final aplicado",
    regra_calculo: "Comparar nota automática sugerida com nota final aplicada — se diferentes, marcar Sim.",
    permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
  {
    id: "val-prorrogacao-plano", ordem: 5,
    pergunta: "Aprovador prorrogou prazo do plano de ação?",
    tipo: "sim_nao", peso: 10, ativo: true, metrica_pendente: true,
    metrica_calculo: "prorrogacao_plano_acao",
    origem_pergunta: "automatica_sistema", camada_alvo: "aprovador",
    fonte_dados: "operational_assignment_history.tipo_evento = 'contingencia_prazo_definido'",
    regra_calculo: "Existe ao menos 1 evento de alteração de prazo do plano de ação criado pelo aprovador.",
    permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
  {
    id: "val-prorrogacao-recorrente", ordem: 6,
    pergunta: "Aprovador prorrogou mais de uma vez?",
    tipo: "sim_nao", peso: 10, ativo: true, metrica_pendente: true,
    metrica_calculo: "prorrogacao_plano_acao_recorrente",
    origem_pergunta: "automatica_sistema", camada_alvo: "aprovador",
    fonte_dados: "operational_assignment_history.tipo_evento = 'contingencia_prazo_definido' (count > 1)",
    regra_calculo: "Contar prorrogações de prazo do plano de ação; se quantidade > 1, marcar Sim.",
    permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
  {
    id: "val-plano-vencido", ordem: 7,
    pergunta: "Plano de ação aberto pelo aprovador venceu o SLA?",
    tipo: "sim_nao", peso: 10, ativo: true,
    metrica_calculo: "plano_acao_vencido",
    origem_pergunta: "automatica_sistema", camada_alvo: "plano_acao",
    fonte_dados: "operational_contingencies.dentro_prazo = false OU prazo_sla < now() AND status NOT IN (validada, descartada)",
    regra_calculo: "Comparar prazo limite do plano de ação com data/hora de conclusão; se não concluído ou concluído após prazo, marcar Sim.",
    permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
  {
    id: "val-reabriu-devolveu", ordem: 8,
    pergunta: "Aprovador reabriu/devolveu tarefa?",
    tipo: "sim_nao", peso: 10, ativo: true,
    metrica_calculo: "aprovador_reabriu_ou_devolveu",
    origem_pergunta: "automatica_sistema", camada_alvo: "aprovador",
    fonte_dados: "operational_assignment_history.tipo_evento IN ('reabertura','avaliacao_devolvida','aprovacao_devolucao')",
    regra_calculo: "Existe ao menos 1 evento de reabertura ou devolução praticado pelo aprovador.",
    permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
  // ── MANUAL (4) — soma 100 ───────────────────────────────────────
  {
    id: "val-man-justificativa", ordem: 9,
    pergunta: "Justificativa do aprovador é plausível?",
    tipo: "conforme_nao_conforme", peso: 25, ativo: true,
    metrica_calculo: "manual",
    origem_pergunta: "manual_padrao_configuracao", camada_alvo: "aprovador",
    exige_observacao: true, permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
  {
    id: "val-man-evidencia", ordem: 10,
    pergunta: "Evidência comprova a decisão?",
    tipo: "conforme_nao_conforme", peso: 25, ativo: true,
    metrica_calculo: "manual",
    origem_pergunta: "manual_padrao_configuracao", camada_alvo: "aprovador",
    exige_observacao: true, exige_evidencia: true,
    permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
  {
    id: "val-man-ponderacao", ordem: 11,
    pergunta: "Ponderação aplicada foi correta?",
    tipo: "conforme_nao_conforme", peso: 25, ativo: true,
    metrica_calculo: "manual",
    origem_pergunta: "manual_padrao_configuracao", camada_alvo: "aprovador",
    exige_observacao: true, permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
  {
    id: "val-man-nota-final", ordem: 12,
    pergunta: "Nota final do aprovador deve ser mantida?",
    tipo: "conforme_nao_conforme", peso: 25, ativo: true,
    metrica_calculo: "manual",
    origem_pergunta: "manual_padrao_configuracao", camada_alvo: "aprovador",
    exige_observacao: true, permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true,
  },
];


const camadaDefault = (over: Partial<CamadaSlaConfig> = {}): CamadaSlaConfig => ({
  nota_max: 100,
  nota_min: 0,
  sla_horas: 24,
  penalidade_atraso: 20,
  penalidade_nao_resposta: 50,
  penalidade_nao_conformidade: 30,
  permite_ponderacao: true,
  exige_justificativa_ponderacao: true,
  gera_plano_acao_auto: true,
  permite_reabertura: true,
  ...over,
});

export const TAREFAS_PONTUACAO_DEFAULTS: TarefasPontuacaoConfig = {
  penalidade_fora_prazo: 20,
  penalidade_contingencia: 10,
  penalidade_sla_contingencia: 15,
  nota_minima: 0,
  nota_maxima: 100,
  pontuacao_automatica_padrao: true,
  descricao: null,
  sla_executor: camadaDefault({ sla_horas: 24 }),
  sla_aprovador: camadaDefault({ sla_horas: 24 }),
  sla_plano_acao: camadaDefault({ sla_horas: 48, penalidade_atraso: 15, penalidade_nao_resposta: 40, penalidade_nao_conformidade: 25, gera_plano_acao_auto: false }),
  sla_validador: camadaDefault({ sla_horas: 72, penalidade_atraso: 10, penalidade_nao_resposta: 30, penalidade_nao_conformidade: 20, gera_plano_acao_auto: false }),
  aprovador_pacote_padrao: APROVADOR_PACOTE_PADRAO_DEFAULT,
  validador_pacote_padrao: VALIDADOR_PACOTE_PADRAO_DEFAULT,
};

const mergeCamada = (raw: any, fallback: CamadaSlaConfig): CamadaSlaConfig => ({
  ...fallback,
  ...(raw && typeof raw === "object" ? raw : {}),
});

export async function getPontuacaoConfig(): Promise<TarefasPontuacaoConfig> {
  const { data, error } = await (supabase as any)
    .from("tarefas_pontuacao_config")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return TAREFAS_PONTUACAO_DEFAULTS;
  return {
    ...TAREFAS_PONTUACAO_DEFAULTS,
    ...data,
    sla_executor: mergeCamada(data.sla_executor, TAREFAS_PONTUACAO_DEFAULTS.sla_executor),
    sla_aprovador: mergeCamada(data.sla_aprovador, TAREFAS_PONTUACAO_DEFAULTS.sla_aprovador),
    sla_plano_acao: mergeCamada(data.sla_plano_acao, TAREFAS_PONTUACAO_DEFAULTS.sla_plano_acao),
    sla_validador: mergeCamada(data.sla_validador, TAREFAS_PONTUACAO_DEFAULTS.sla_validador),
    aprovador_pacote_padrao: Array.isArray(data.aprovador_pacote_padrao) && data.aprovador_pacote_padrao.length > 0
      ? data.aprovador_pacote_padrao
      : APROVADOR_PACOTE_PADRAO_DEFAULT,
    validador_pacote_padrao: Array.isArray(data.validador_pacote_padrao) && data.validador_pacote_padrao.length > 0
      ? data.validador_pacote_padrao
      : VALIDADOR_PACOTE_PADRAO_DEFAULT,
  } as TarefasPontuacaoConfig;
}

export async function setPontuacaoConfig(
  patch: Partial<TarefasPontuacaoConfig>,
  updatedBy?: string | null,
): Promise<TarefasPontuacaoConfig> {
  const current = await getPontuacaoConfig();
  const merged = { ...current, ...patch, singleton: true, updated_by: updatedBy ?? null };
  const { data, error } = await (supabase as any)
    .from("tarefas_pontuacao_config")
    .upsert(merged, { onConflict: "singleton" })
    .select("*")
    .single();
  if (error) throw error;
  return data as TarefasPontuacaoConfig;
}
