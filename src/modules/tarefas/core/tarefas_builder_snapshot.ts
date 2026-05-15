export function getChecklistSnapshot(snapshot: any) {
  return snapshot?.checklists ?? {};
}

export function getActiveFieldIds(snapshot: any): string[] {
  const ids = snapshot?.checklists?.avaliado_field_ids;

  if (!Array.isArray(ids)) {
    return [];
  }

  return ids.filter(Boolean);
}

// Aliases retrocompatíveis.
export const extractChecklistSnapshot = getChecklistSnapshot;
export const extractAvaliadoFieldIds = getActiveFieldIds;
