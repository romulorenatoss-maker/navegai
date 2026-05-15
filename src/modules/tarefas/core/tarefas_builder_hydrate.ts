import { FieldForm } from "@/modules/tarefas/types/tarefas_types";
import { filterActiveFields } from "./tarefas_builder_fields";

export function hydrateFields(
  dbFields: FieldForm[],
  activeFieldIds: string[],
  removedFieldIds: string[] = [],
  allowLegacyWithoutSnapshot = false,
): FieldForm[] {
  return filterActiveFields(dbFields, activeFieldIds, removedFieldIds, allowLegacyWithoutSnapshot);
}

export const hydrateActiveFields = hydrateFields;
