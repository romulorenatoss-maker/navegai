import { FieldForm } from "@/modules/tarefas/types/tarefas_types";

export type BuilderFieldIdentity = {
  id: string | null;
  key: string;
  section_id?: string | null;
  ordem?: number | null;
};

export function getFieldId(field: Partial<FieldForm> | any): string | null {
  return field?.id || null;
}

export function getFieldRuntimeKey(field: Partial<FieldForm> | any): string {
  return field?.id || field?.tempId || buildFieldKey(field as FieldForm);
}

export function buildFieldKey(field: Partial<FieldForm> | any) {
  return `${field?.label ?? ""}_${field?.tipo ?? ""}_${field?.ordem ?? 0}`;
}

export function normalizeRemovedFieldIds(ids: any[]): string[] {
  return Array.from(new Set((ids || []).filter(Boolean).map(String)));
}

export function buildActiveFieldIds(fields: FieldForm[], removedFieldIds: string[] = []): string[] {
  const removed = new Set(normalizeRemovedFieldIds(removedFieldIds));
  return (fields || [])
    .filter(field => !!field.id && !removed.has(field.id as string))
    .map(field => field.id as string);
}

export function buildActiveFieldSnapshot(fields: FieldForm[], removedFieldIds: string[] = []): BuilderFieldIdentity[] {
  const removed = new Set(normalizeRemovedFieldIds(removedFieldIds));
  return (fields || [])
    .filter(field => !!field.id && !removed.has(field.id as string))
    .map(field => ({
      id: field.id ?? null,
      key: buildFieldKey(field),
      section_id: field.sectionTempId ?? null,
      ordem: field.ordem ?? null,
    }));
}

export const buildActiveFieldsSnapshot = buildActiveFieldSnapshot;

export function filterActiveFields(
  dbFields: FieldForm[],
  activeIds: string[],
  removedFieldIds: string[] = [],
  allowLegacyWithoutSnapshot = false,
): FieldForm[] {
  const removed = new Set(normalizeRemovedFieldIds(removedFieldIds));
  const active = new Set((activeIds || []).filter(Boolean).map(String));

  return (dbFields || []).filter(field => {
    if (!field.id) return false;
    if (removed.has(field.id)) return false;
    if (active.size === 0) return allowLegacyWithoutSnapshot;
    return active.has(field.id);
  });
}

export const filterOnlyActiveFields = filterActiveFields;

export function mergeRemovedFieldIds(...groups: Array<string[] | undefined | null>): string[] {
  return normalizeRemovedFieldIds(groups.flatMap(group => group || []));
}
