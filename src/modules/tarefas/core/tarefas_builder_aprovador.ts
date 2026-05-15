const REPLICADA = "replicada_avaliado";

function fieldId(field: any): string | null {
  return field?.id || field?.tempId || null;
}

function fieldLabel(field: any): string {
  return field?.label || field?.field_label || "Pergunta sem nome";
}

function isReplicada(check: any): boolean {
  return check?.origem_pergunta === REPLICADA || (!!check?.field_id && !check?.config_global_origem_id);
}

function buildReplicada(field: any, existing?: any) {
  const id = fieldId(field);
  const label = fieldLabel(field);
  return {
    tempId: existing?.tempId || crypto.randomUUID(),
    ...existing,
    field_id: id,
    field_label: label,
    pergunta_padrao: `Aprovador confirma: ${label}?`,
    tipo_resposta: existing?.tipo_resposta || "conforme_nao_conforme",
    tipo: existing?.tipo,
    opcoes: existing?.opcoes,
    regras_por_opcao: existing?.regras_por_opcao,
    peso: existing?.peso ?? 1,
    exige_observacao: existing?.exige_observacao ?? false,
    exige_evidencia: existing?.exige_evidencia ?? false,
    permite_devolucao: existing?.permite_devolucao ?? true,
    gera_plano_acao: existing?.gera_plano_acao ?? true,
    permite_conclusao: existing?.permite_conclusao ?? true,
    permite_aumento_prazo: existing?.permite_aumento_prazo ?? true,
    origem_pergunta: REPLICADA,
    pergunta_origem_id: id,
    ativo: existing?.ativo ?? true,
    editado_manual: existing?.editado_manual,
    editado_por: existing?.editado_por,
    editado_em: existing?.editado_em,
  };
}

export function rebuildAprovadorChecks(
  checks: any[],
  activeFields: any[],
  options: { shouldReplicate?: boolean } = {},
) {
  const fields = (activeFields || []).filter(fieldId);
  const activeIds = new Set<string>(fields.map(field => fieldId(field) as string));
  const byField = new Map<string, any>();
  const preserved: any[] = [];

  for (const check of checks || []) {
    if (!check) continue;
    if (isReplicada(check)) {
      const id = check.field_id || check.pergunta_origem_id;
      if (id && activeIds.has(id) && !byField.has(id)) {
        byField.set(id, check);
      }
      continue;
    }
    preserved.push(check);
  }

  const replicated = options.shouldReplicate === false
    ? Array.from(byField.entries()).map(([id, check]) => {
        const field = fields.find(f => fieldId(f) === id);
        return field ? buildReplicada(field, check) : check;
      })
    : fields.map(field => buildReplicada(field, byField.get(fieldId(field) as string)));

  return [...replicated, ...preserved];
}

export const rebuildAprovadorFromActiveFields = rebuildAprovadorChecks;
