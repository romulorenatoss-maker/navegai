/**
 * RBAC do módulo operacional.
 *
 * Perfis: EXECUTOR | AVALIADOR | APROVADOR | GESTOR | ADMIN | CRIADOR_DESIGNANTE
 *
 * Estratégia aprovada:
 *  - Reutiliza permission_resources / group_permissions já existente.
 *  - Deriva o papel efetivo para UMA tarefa específica a partir dos IDs.
 *
 * NÃO altera o banco. Apenas lê. Adições da Fase 1 são puramente aditivas.
 */
import type { EffectivePermission } from "@/hooks/usePermissions";

export type OperationalRole = "EXECUTOR" | "AVALIADOR" | "APROVADOR" | "GESTOR" | "ADMIN" | "CRIADOR_DESIGNANTE";

export type OperationalAction =
  // legados — mantidos
  | "executar_tarefa"
  | "avaliar_tarefa"
  | "aprovar_tarefa"
  | "validar_designada"
  | "gerenciar_contingencia"
  | "ver_gestao_operacional"
  | "cadastrar_template_operacional"
  // Fase 1 — fluxo avulsa
  | "aceitar_tarefa"
  | "negociar_prazo_executor"
  | "decidir_renegociacao"
  | "aprovar_renegociacao_excedida"
  | "responder_executor"
  | "validar_solicitante_aprovar"
  | "validar_solicitante_devolver"
  | "solicitar_plano_acao"
  | "concluir_plano_acao"
  | "cancelar_tarefa_solicitante"
  | "cancelar_tarefa_admin"
  | "reabrir_tarefa_solicitante"
  | "reabrir_tarefa_admin"
  | "invalidar_tarefa";

/** Mapa declarativo ação → perfis autorizados (documentação viva). */
export const ACTION_ROLES: Record<OperationalAction, OperationalRole[]> = {
  executar_tarefa:                ["EXECUTOR", "ADMIN"],
  avaliar_tarefa:                 ["AVALIADOR", "ADMIN"],
  aprovar_tarefa:                 ["APROVADOR", "ADMIN"],
  validar_designada:              ["CRIADOR_DESIGNANTE", "ADMIN"],
  gerenciar_contingencia:         ["AVALIADOR", "APROVADOR", "GESTOR", "ADMIN"],
  ver_gestao_operacional:         ["GESTOR", "ADMIN"],
  cadastrar_template_operacional: ["GESTOR", "ADMIN"],

  // Fase 1
  aceitar_tarefa:                 ["EXECUTOR", "ADMIN"],
  negociar_prazo_executor:        ["EXECUTOR", "ADMIN"],
  decidir_renegociacao:           ["CRIADOR_DESIGNANTE", "ADMIN"],
  aprovar_renegociacao_excedida:  ["ADMIN"],
  responder_executor:             ["EXECUTOR", "ADMIN"],
  validar_solicitante_aprovar:    ["CRIADOR_DESIGNANTE", "ADMIN"],
  validar_solicitante_devolver:   ["CRIADOR_DESIGNANTE", "ADMIN"],
  solicitar_plano_acao:           ["CRIADOR_DESIGNANTE", "AVALIADOR", "ADMIN"],
  concluir_plano_acao:            ["EXECUTOR", "ADMIN"],
  cancelar_tarefa_solicitante:    ["CRIADOR_DESIGNANTE", "ADMIN"],
  cancelar_tarefa_admin:          ["ADMIN"],
  reabrir_tarefa_solicitante:     ["CRIADOR_DESIGNANTE", "ADMIN"],
  reabrir_tarefa_admin:           ["ADMIN"],
  invalidar_tarefa:               ["ADMIN"],
};

interface AssignmentRoleInput {
  profileId: string | null | undefined;
  assignment?: {
    responsavel_id?: string | null;
    avaliador_id?: string | null;
    aprovador_id?: string | null;
    created_by?: string | null;
  } | null;
}

/**
 * Determina o papel efetivo do usuário para um assignment específico.
 * Admin sempre vence. Caso contrário, deriva dos campos do assignment.
 *
 * Prioridade: ADMIN > APROVADOR > AVALIADOR > CRIADOR_DESIGNANTE > EXECUTOR.
 * CRIADOR_DESIGNANTE = created_by == profileId E executor != profileId
 * (auto-criação não conta como "designada").
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
  if (a.created_by === pid && a.responsavel_id !== pid) return "CRIADOR_DESIGNANTE";
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
