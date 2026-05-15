import { FieldForm } from "@/modules/tarefas/types/tarefas_types";
import { filterActiveFields } from "./tarefas_builder_fields";

export function hydrateFields(
  dbFields: FieldForm[],
  activeFieldIds: string[]
): FieldForm[] {
  return filterActiveFields(dbFields, activeFieldIds);
}

// Alias retrocompatível.
export const hydrateActiveFields = hydrateFields;
