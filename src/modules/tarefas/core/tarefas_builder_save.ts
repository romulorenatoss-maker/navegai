import {
  buildActiveFieldIds,
  buildActiveFieldSnapshot,
  normalizeRemovedFieldIds,
} from "./tarefas_builder_fields";

export function buildChecklistSnapshot(
  fields: any[],
  aprovadorChecks: any[],
  validadorChecks: any[],
  removedFieldIds: string[] = [],
) {
  const removed = normalizeRemovedFieldIds(removedFieldIds);
  return {
    avaliado_fields: buildActiveFieldSnapshot(fields, removed),
    avaliado_field_ids: buildActiveFieldIds(fields, removed),
    removed_field_ids: removed,
    aprovador: aprovadorChecks,
    validador: validadorChecks,
  };
}
