export function extractChecklistSnapshot(snapshot: any) {
  return snapshot?.checklists ?? {};
}

export function extractAvaliadoFieldIds(snapshot: any): string[] {
  const ids = snapshot?.checklists?.avaliado_field_ids;

  if (!Array.isArray(ids)) {
    return [];
  }

  return ids.filter(Boolean);
}
