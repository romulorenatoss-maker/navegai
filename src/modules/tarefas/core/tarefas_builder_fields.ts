import { FieldForm } from "@/modules/tarefas/types/tarefas_types";

export function buildActiveFieldIds(fields: FieldForm[]): string[] {
  return fields
    .filter(field => !!field.id)
    .map(field => field.id as string);
}

export function buildActiveFieldsSnapshot(fields: FieldForm[]) {
  return fields.map(field => ({
    id: field.id ?? null,
    key: `${field.label}_${field.tipo}_${field.ordem}`,
  }));
}

export function filterOnlyActiveFields(
  allFields: FieldForm[],
  activeFieldIds: string[] | null | undefined
): FieldForm[] {
  if (!activeFieldIds) {
    return [];
  }

  if (activeFieldIds.length === 0) {
    return [];
  }

  const activeSet = new Set(activeFieldIds);

  return allFields.filter(field => {
    if (!field.id) {
      return false;
    }

    return activeSet.has(field.id);
  });
}
