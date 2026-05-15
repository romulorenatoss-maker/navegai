/**
 * Núcleo Aprovador: filtragem determinística (sem sync automático invisível).
 *
 * Regras:
 *  - Itens com `field_id` (replicadas do Avaliado) só permanecem se o `field_id`
 *    estiver entre os fields ativos.
 *  - Itens sem `field_id` (manuais e automáticas do pacote padrão) são preservados.
 *
 * Mantém TODA a configuração visível ao usuário (peso, SLA, evidência, opções,
 * regras_por_opcao, ponderação). Não recria, não replica, não muta nada.
 */
export function rebuildAprovadorChecks(
  checks: any[],
  activeFields: any[]
) {
  const activeIds = new Set<string>(
    (activeFields || [])
      .map(field => field?.id ?? field?.tempId)
      .filter(Boolean)
  );

  return (checks || []).filter(check => {
    if (!check?.field_id) {
      return true;
    }
    return activeIds.has(check.field_id);
  });
}

// Alias retrocompatível com a Etapa 2.
export const rebuildAprovadorFromActiveFields = rebuildAprovadorChecks;
