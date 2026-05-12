/**
 * Hook de conveniência: expõe RBAC + helper de transição para a UI operacional.
 *
 * - Não altera banco, não altera hooks existentes.
 * - Consome usePermissions (já existente) e AuthContext (isAdmin).
 * - Retorna API estável para desabilitar botões, esconder menus, validar submit.
 */
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  hasOperationalPermission,
  resolveAssignmentRole,
  canTransition,
  type OperationalAction,
  type OperationalRole,
  type TransitionCheck,
} from "@/modules/tarefas/services";

interface AssignmentLike {
  responsavel_id?: string | null;
  avaliador_id?: string | null;
  aprovador_id?: string | null;
  status?: string;
}

export function useOperationalAccess(assignment?: AssignmentLike | null) {
  const { profile, isAdmin } = useAuth();
  const { permissions, isLoading } = usePermissions(profile?.id ?? null);

  const role: OperationalRole | null = useMemo(
    () => resolveAssignmentRole({ profileId: profile?.id, assignment }, !!isAdmin),
    [profile?.id, assignment, isAdmin]
  );

  const can = (action: OperationalAction): boolean =>
    hasOperationalPermission({
      action,
      isAdmin: !!isAdmin,
      permissions,
      assignmentRole: role,
    });

  const checkTransition = (nextStatus: string): TransitionCheck =>
    canTransition(assignment?.status ?? "", nextStatus, role);

  return { isLoading, role, can, checkTransition, isAdmin: !!isAdmin };
}
