import { FieldForm } from "@/modules/tarefas/types/tarefas_types";
import { filterOnlyActiveFields } from "./tarefas_builder_fields";

export function hydrateActiveFields(
  loadedFields: FieldForm[],
  activeFieldIds: string[]
): FieldForm[] {
  return filterOnlyActiveFields(
    loadedFields,
    activeFieldIds
  );
}
