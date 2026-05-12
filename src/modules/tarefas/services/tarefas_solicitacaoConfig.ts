/**
 * SolicitacaoConfig — schema e parser defensivo do JSON
 * persistido em operational_templates.template_snapshot.solicitacao_config.
 *
 * Sem migration. Lido em runtime. Tolera ausência/legado.
 */

export interface SolicitacaoConfig {
  exige_aceite_executor: boolean;
  exige_validacao_solicitante: boolean;
  permite_devolver: boolean;
  permite_plano_acao: boolean;
  avaliacao: { obrigatoria: boolean; avaliador_id: string | null };
  aprovacao: { obrigatoria: boolean; aprovador_id: string | null };
  nota: { obrigatoria: boolean };
  renegociacao: { permite: boolean; limite: number };
  /** Em horas. null => usa global. */
  sem_movimento_horas: number | null;
  janela_reabertura_horas: number;
  exige_reauth_reabertura: boolean;
  sla: {
    validacao_horas: number;
    avaliacao_horas: number;
    aprovacao_horas: number;
  };
  /** Quem pode reabrir após terminal: 'solicitante' | 'admin' | 'ambos'. */
  quem_pode_reabrir: "solicitante" | "admin" | "ambos";
  /** Responsável pelo plano de ação (profile_id). */
  responsavel_plano_acao_id: string | null;
  /** Exigir justificativa quando atrasada. */
  exigir_justificativa_atraso: boolean;
}

export const DEFAULT_SOLICITACAO_CONFIG: SolicitacaoConfig = {
  exige_aceite_executor: true,
  exige_validacao_solicitante: true,
  permite_devolver: true,
  permite_plano_acao: true,
  avaliacao: { obrigatoria: false, avaliador_id: null },
  aprovacao: { obrigatoria: false, aprovador_id: null },
  nota: { obrigatoria: false },
  renegociacao: { permite: true, limite: 3 },
  sem_movimento_horas: null,
  janela_reabertura_horas: 72,
  exige_reauth_reabertura: true,
  sla: {
    validacao_horas: 24,
    avaliacao_horas: 48,
    aprovacao_horas: 48,
  },
  quem_pode_reabrir: "ambos",
  responsavel_plano_acao_id: null,
  exigir_justificativa_atraso: false,
};

/** Parser tolerante: nunca lança; preenche faltantes com defaults. */
export function parseSolicitacaoConfig(raw: any): SolicitacaoConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SOLICITACAO_CONFIG };
  const d = DEFAULT_SOLICITACAO_CONFIG;
  return {
    exige_aceite_executor: !!(raw.exige_aceite_executor ?? d.exige_aceite_executor),
    exige_validacao_solicitante: !!(raw.exige_validacao_solicitante ?? d.exige_validacao_solicitante),
    permite_devolver: !!(raw.permite_devolver ?? d.permite_devolver),
    permite_plano_acao: !!(raw.permite_plano_acao ?? d.permite_plano_acao),
    avaliacao: {
      obrigatoria: !!raw.avaliacao?.obrigatoria,
      avaliador_id: raw.avaliacao?.avaliador_id ?? null,
    },
    aprovacao: {
      obrigatoria: !!raw.aprovacao?.obrigatoria,
      aprovador_id: raw.aprovacao?.aprovador_id ?? null,
    },
    nota: { obrigatoria: !!raw.nota?.obrigatoria },
    renegociacao: {
      permite: raw.renegociacao?.permite ?? d.renegociacao.permite,
      limite: Number.isFinite(raw.renegociacao?.limite) ? Number(raw.renegociacao.limite) : d.renegociacao.limite,
    },
    sem_movimento_horas: raw.sem_movimento_horas == null ? null : Number(raw.sem_movimento_horas),
    janela_reabertura_horas: Number(raw.janela_reabertura_horas ?? d.janela_reabertura_horas),
    exige_reauth_reabertura: !!(raw.exige_reauth_reabertura ?? d.exige_reauth_reabertura),
    sla: {
      validacao_horas: Number(raw.sla?.validacao_horas ?? d.sla.validacao_horas),
      avaliacao_horas: Number(raw.sla?.avaliacao_horas ?? d.sla.avaliacao_horas),
      aprovacao_horas: Number(raw.sla?.aprovacao_horas ?? d.sla.aprovacao_horas),
    },
    quem_pode_reabrir: (raw.quem_pode_reabrir as any) ?? d.quem_pode_reabrir,
    responsavel_plano_acao_id: raw.responsavel_plano_acao_id ?? null,
    exigir_justificativa_atraso: !!raw.exigir_justificativa_atraso,
  };
}

/** Extrai config a partir do assignment já carregado (joins existentes). */
export function getSolicitacaoConfig(assignment: any): SolicitacaoConfig {
  const snap = assignment?.template_snapshot ?? assignment?.operational_templates?.template_snapshot;
  return parseSolicitacaoConfig(snap?.solicitacao_config);
}

/** Auto-conclusão (D3): solicitante == executor E nenhuma flag de validação ativa. */
export function canAutoConclude(assignment: any, cfg: SolicitacaoConfig): boolean {
  if (!assignment?.created_by || !assignment?.responsavel_id) return false;
  if (assignment.created_by !== assignment.responsavel_id) return false;
  if (cfg.avaliacao.obrigatoria) return false;
  if (cfg.aprovacao.obrigatoria) return false;
  if (cfg.nota.obrigatoria) return false;
  if (cfg.permite_plano_acao && cfg.responsavel_plano_acao_id) {
    // Se plano é configurado como obrigatório (responsável definido), não auto-conclui
    return false;
  }
  return true;
}
