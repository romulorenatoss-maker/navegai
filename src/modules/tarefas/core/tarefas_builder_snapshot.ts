import { normalizeRemovedFieldIds } from "./tarefas_builder_fields";

export function getChecklistSnapshot(snapshot: any) {
  return snapshot?.checklists ?? {};
}

export function getActiveFieldIds(snapshot: any): string[] {
  const ids = snapshot?.checklists?.avaliado_field_ids;
  return Array.isArray(ids) ? ids.filter(Boolean).map(String) : [];
}

export function getRemovedFieldIds(snapshot: any): string[] {
  const ids = snapshot?.checklists?.removed_field_ids;
  return normalizeRemovedFieldIds(Array.isArray(ids) ? ids : []);
}

export function hasChecklistFieldSource(snapshot: any): boolean {
  return Array.isArray(snapshot?.checklists?.avaliado_field_ids);
}

export const extractChecklistSnapshot = getChecklistSnapshot;
export const extractAvaliadoFieldIds = getActiveFieldIds;
