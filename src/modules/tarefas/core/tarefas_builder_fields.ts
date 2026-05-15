import { FieldForm } from "@/modules/tarefas/types/tarefas_types";

export function buildFieldKey(field: FieldForm) {
  return `${field.label}_${field.tipo}_${field.ordem}`;
}

export function buildActiveFieldIds(fields: FieldForm[]): string[] {
  return fields
    .filter(field => !!field.id)
    .map(field => field.id as string);
}

export function buildActiveFieldSnapshot(fields: FieldForm[]) {
  return fields.map(field => ({
    id: field.id ?? null,
    key: buildFieldKey(field),
  }));
}

// Alias retrocompatível.
export const buildActiveFieldsSnapshot = buildActiveFieldSnapshot;

export function filterActiveFields(
  dbFields: FieldForm[],
  activeIds: string[]
): FieldForm[] {
  if (!Array.isArray(activeIds)) {
    return [];
  }

  if (activeIds.length === 0) {
    return [];
  }

  const activeSet = new Set(activeIds);

  return dbFields.filter(field => {
    if (!field.id) {
      return false;
    }

    return activeSet.has(field.id);
  });
}

export const filterOnlyActiveFields = filterActiveFields;
