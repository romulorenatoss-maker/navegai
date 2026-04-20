/**
 * RBAC do módulo operacional.
 *
 * Perfis: EXECUTOR | AVALIADOR | APROVADOR | GESTOR | ADMIN
 *
 * Estratégia aprovada:
 *  - Reutiliza o sistema de permission_resources / group_permissions já existente.
 *  - Deriva o papel efetivo para UMA tarefa específica a partir dos IDs
 *    (responsavel_id / avaliador_id / aprovador_id) combinados com permissões globais.
 *
 * NÃO altera o banco. Apenas lê.
 */
import type { EffectivePermission } from "@/hooks/usePermissions";

export type OperationalRole = "EXECUTOR" | "AVALIADOR" | "APROVADOR" | "GESTOR" | "ADMIN" | "CRIADOR_DESIGNANTE";

export type OperationalAction =
  | "executar_tarefa"
  | "avaliar_tarefa"
  | "aprovar_tarefa"
  | "validar_designada"
  | "gerenciar_contingencia"
  | "ver_gestao_operacional"
  | "cadastrar_template_operacional";

/** Mapa declarativo ação → perfis autorizados (documentação viva). */
export const ACTION_ROLES: Record<OperationalAction, OperationalRole[]> = {
  executar_tarefa:                ["EXECUTOR", "ADMIN"],
  avaliar_tarefa:                 ["AVALIADOR", "ADMIN"],
  aprovar_tarefa:                 ["APROVADOR", "ADMIN"],
  validar_designada:              ["CRIADOR_DESIGNANTE", "ADMIN"],
  gerenciar_contingencia:         ["AVALIADOR", "APROVADOR", "GESTOR", "ADMIN"],
  ver_gestao_operacional:         ["GESTOR", "ADMIN"],
  cadastrar_template_operacional: ["GESTOR", "ADMIN"],
};

interface AssignmentRoleInput {
  profileId: string | null | undefined;
  assignment?: {
    responsavel_id?: string | null;
    avaliador_id?: string | null;
    aprovador_id?: string | null;
  } | null;
}

/**
 * Determina o papel efetivo do usuário para um assignment específico.
 * Admin sempre vence. Caso contrário, deriva dos campos do assignment.
 */
export function resolveAssignmentRole(
  input: AssignmentRoleInput,
  isAdmin: boolean,
): OperationalRole | null {
  if (isAdmin) return "ADMIN";
  const pid = input.profileId;
  if (!pid) return null;
  const a = input.assignment;
  if (!a) return null;
  if (a.aprovador_id === pid) return "APROVADOR";
  if (a.avaliador_id === pid) return "AVALIADOR";
  if (a.responsavel_id === pid) return "EXECUTOR";
  return null;
}

/**
 * Verifica se o usuário pode executar uma ação, combinando:
 *  - permissões globais (permission_resources)
 *  - papel efetivo na tarefa (quando fornecida)
 */
export function hasOperationalPermission(params: {
  action: OperationalAction;
  isAdmin: boolean;
  permissions: EffectivePermission[];
  assignmentRole?: OperationalRole | null;
}): boolean {
  const { action, isAdmin, permissions, assignmentRole } = params;
  if (isAdmin) return true;

  // 1) permissão global por resource_code
  const perm = permissions.find((p) => p.resource_code === action);
  if (perm?.can_view || perm?.can_edit || perm?.can_create) return true;

  // 2) papel efetivo no próprio assignment
  if (assignmentRole && ACTION_ROLES[action].includes(assignmentRole)) return true;

  return false;
}
