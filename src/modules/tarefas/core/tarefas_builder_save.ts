import {
  buildActiveFieldIds,
  buildActiveFieldSnapshot,
} from "./tarefas_builder_fields";

/**
 * Monta o snapshot oficial dos checklists.
 *
 * IMPORTANTE: chamar APENAS após persistir fields no banco (para que `field.id`
 * esteja disponível em todos os itens). Field sem id é descartado pelo `buildActiveFieldIds`.
 */
export function buildChecklistSnapshot(
  fields: any[],
  aprovadorChecks: any[],
  validadorChecks: any[]
) {
  return {
    avaliado_fields: buildActiveFieldSnapshot(fields),
    avaliado_field_ids: buildActiveFieldIds(fields),
    aprovador: aprovadorChecks,
    validador: validadorChecks,
  };
}
