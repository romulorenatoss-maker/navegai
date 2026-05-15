import { syncAprovadorReplicadasFromFields } from "@/modules/tarefas/components/builder/checklistNormalizers";

export function rebuildAprovadorFromActiveFields(
  aprovadorChecks: any[],
  activeFields: any[]
) {
  return syncAprovadorReplicadasFromFields(
    aprovadorChecks,
    activeFields
  );
}
