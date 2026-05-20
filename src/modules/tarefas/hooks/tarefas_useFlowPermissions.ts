/**
 * tarefas_useFlowPermissions.ts
 *
 * ============================================================================
 * FONTE ÚNICA DE VERDADE — PERMISSÕES DO FLUXO PÓS-CRIAÇÃO
 * ============================================================================
 *
 * Este hook é o ÚNICO lugar que decide o que cada papel pode fazer em cada
 * status. Todos os painéis (Aprovação, Auditor, Execução) DEVEM consumir
 * estas permissões — nada de checar `assignment.status === "..."` direto na UI.
 *
 * ----------------------------------------------------------------------------
 * MAPA DE PERMISSÕES POR FASE DO FLUXO
 * ----------------------------------------------------------------------------
 *
 * FASE 1 — Executor preenche
 *   status: pendente | em_andamento | reaberta
 *   ✓ Executor edita todos os campos
 *   ✗ Aprovador read-only
 *   ✗ Auditor não vê
 *
 * FASE 2 — Aprovador avalia executor
 *   status: aguardando_aprovacao  E  NÃO há plano do auditor pendente
 *   ✓ Aprovador: Conforme/NC em qualquer campo, criar plano, Aprovar
 *   ✗ Executor read-only
 *   ✗ Auditor não vê
 *
 * FASE 3 — Executor refaz devolvido
 *   status: devolvida
 *   ✓ Executor edita SÓ campos devolvidos
 *   ✗ Aprovador read-only
 *
 * FASE 4 — Aprovador avalia resposta ao plano R1/R2
 *   status: aguardando_aprovacao  E  há plano do aprovador respondido
 *   ✓ Aprovador marca Conforme/NC no plano respondido
 *   ✓ NC abre novo plano R{n+1} para executor
 *   ✓ Aprovar libera para auditoria
 *
 * FASE 5 — Auditor avalia aprovador
 *   status: aguardando_auditoria  E  NÃO há plano do auditor pendente
 *   ✓ Auditor responde perguntas auto, decide Confirmar/Criar plano
 *   ✗ Aprovador 🔒 TUDO TRAVADO
 *   ✗ Executor não vê
 *
 * FASE 6 — Auditor devolveu campo ao aprovador
 *   status: aguardando_aprovacao  E  há plano do auditor pendente
 *   ✓ Aprovador SÓ no campo devolvido: Conforme (aceita) ou NC (cria novo plano executor)
 *   ✓ Botão Aprovar habilitado para responder ao auditor
 *   ✗ Demais campos 🔒 travados
 *   ✗ Auditor read-only
 *
 * FASE 7 — Auditor avalia resposta do aprovador
 *   status: aguardando_auditoria  E  plano do auditor com respondido=true
 *   ✓ Auditor vê "Respostas do Aprovador" + Conforme/NC
 *   ✓ Conforme → habilita Confirmar Auditoria
 *   ✓ NC → cria novo plano (volta FASE 6)
 *   ✗ Aprovador 🔒 TUDO TRAVADO
 *
 * FASE FINAL — concluida | aprovada | reprovada | cancelada
 *   ✗ Todos read-only
 *
 * ----------------------------------------------------------------------------
 * REGRA DE OURO
 * ----------------------------------------------------------------------------
 *
 * Quem age = quem o STATUS define. NUNCA o papel do usuário.
 * Se você é admin + aprovador + auditor ao mesmo tempo:
 *   - status aguardando_aprovacao → você age COMO APROVADOR
 *   - status aguardando_auditoria → você age COMO AUDITOR
 *   - aba do outro papel = read-only com banner 🔒
 *
 * ============================================================================
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TASK_STATUS, type TaskStatus } from "@/modules/tarefas/services/tarefas_statusConstants";

// ============================================================================
// TIPOS
// ============================================================================
export type FlowRole = "executor" | "aprovador" | "auditor" | "spectator";

export interface FlowPermissions {
  // Identificação
  role: FlowRole;
  isAdmin: boolean;
  status: TaskStatus;

  // Estado computado
  /** Há plano do auditor pendente (respondido=false)? */
  hasAuditorPlansPending: boolean;
  /** Field IDs que o auditor devolveu e ainda não foram respondidos */
  fieldsDevolvidosPeloAuditor: Set<string>;
  /** Nome de quem está com a vez (para tooltip/banner) */
  responsavelAtual: string;

  // ──────────────────────────────────────────────────────────────────────
  // PERMISSÕES POR PAPEL — usar APENAS estas no UI
  // ──────────────────────────────────────────────────────────────────────

  // EXECUTOR
  /** Executor pode editar este campo agora? */
  canExecutorEditField: (fieldId: string) => boolean;
  /** Executor pode submeter (enviar) suas respostas? */
  canExecutorSubmit: boolean;

  // APROVADOR
  /** Aprovador pode marcar Conforme/NC neste campo? */
  canApproverDecideField: (fieldId: string) => boolean;
  /** Aprovador pode criar plano de ação para o executor neste campo? */
  canApproverCreatePlan: (fieldId: string) => boolean;
  /** Aprovador pode clicar no botão Aprovar/Finalizar? */
  canApproverFinalize: boolean;
  /** Tooltip quando Aprovar está disabled */
  approverButtonTooltip: string | null;
  /** Painel do aprovador está em modo restrito (banner 🔒)? */
  approverPanelRestricted: boolean;
  /** Mensagem do banner de bloqueio */
  approverLockMessage: string | null;

  // AUDITOR
  /** Auditor pode marcar resposta automática (N/A, etc)? */
  canAuditorAnswer: boolean;
  /** Auditor pode criar plano para o aprovador? */
  canAuditorCreatePlan: boolean;
  /** Auditor pode clicar em Confirmar Auditoria? */
  canAuditorFinalize: boolean;
  /** Auditor está vendo a tarefa em modo read-only? */
  auditorPanelReadOnly: boolean;
}

// ============================================================================
// HOOK PRINCIPAL
// ============================================================================
export function useFlowPermissions(
  assignment: any,
  profile: any,
  isAdmin: boolean = false,
  meusSetorIds: string[] = []
): FlowPermissions {
  // ──────────────────────────────────────────────────────────────────────
  // 1. Identifica papel do usuário nesta tarefa
  // ──────────────────────────────────────────────────────────────────────
  const role: FlowRole = useMemo(() => {
    if (!assignment || !profile) return "spectator";

    const status = assignment.status as TaskStatus;
    const isExecutor =
      assignment.responsavel_id === profile.id ||
      assignment.executor_id === profile.id ||
      (assignment.setor_id && meusSetorIds.includes(assignment.setor_id));
    const isAprovador =
      assignment.aprovador_id === profile.id ||
      (assignment.aprovador_id === null && assignment.created_by === profile.id);
    const isAuditor =
      assignment.auditor_id === profile.id ||
      (assignment.auditor_id === null &&
       assignment.setor_auditor_id &&
       meusSetorIds.includes(assignment.setor_auditor_id));

    // Quem age = quem o STATUS define
    if (status === TASK_STATUS.AGUARDANDO_AUDITORIA) {
      if (isAuditor || isAdmin) return "auditor";
      if (isAprovador) return "aprovador"; // vê read-only
      if (isExecutor) return "executor";
      return "spectator";
    }
    if (status === TASK_STATUS.AGUARDANDO_APROVACAO) {
      if (isAprovador || isAdmin) return "aprovador";
      if (isAuditor) return "auditor"; // vê read-only
      if (isExecutor) return "executor";
      return "spectator";
    }
    if (
      status === TASK_STATUS.DEVOLVIDA ||
      status === TASK_STATUS.PENDENTE ||
      status === TASK_STATUS.EM_ANDAMENTO ||
      status === TASK_STATUS.REABERTA
    ) {
      if (isExecutor || isAdmin) return "executor";
      if (isAprovador) return "aprovador";
      if (isAuditor) return "auditor";
      return "spectator";
    }
    // Status final
    return "spectator";
  }, [assignment, profile, isAdmin, meusSetorIds]);

  // ──────────────────────────────────────────────────────────────────────
  // 2. Carrega planos do auditor (pendentes + respondidos)
  // ──────────────────────────────────────────────────────────────────────
  const { data: auditorPlans = [] } = useQuery({
    queryKey: ["flow_permissions_auditor_plans", assignment?.id],
    queryFn: async () => {
      if (!assignment?.id) return [];
      const { data, error } = await (supabase as any)
        .from("operational_field_reviews")
        .select("id, field_id, respondido, rodada")
        .eq("assignment_id", assignment.id)
        .eq("criado_por_papel", "auditor")
        .eq("destinatario_papel", "aprovador");
      if (error) return [];
      return data ?? [];
    },
    enabled: !!assignment?.id,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const pendingAuditorPlans = useMemo(
    () => (auditorPlans as any[]).filter((p: any) => p.respondido !== true),
    [auditorPlans]
  );
  const fieldsDevolvidosPeloAuditor = useMemo(
    () => new Set(pendingAuditorPlans.map((p: any) => p.field_id)),
    [pendingAuditorPlans]
  );
  const hasAuditorPlansPending = pendingAuditorPlans.length > 0;

  // ──────────────────────────────────────────────────────────────────────
  // 3. Nome do responsável atual (para tooltip/banner)
  // ──────────────────────────────────────────────────────────────────────
  const responsavelAtual = useMemo(() => {
    if (!assignment) return "—";
    const status = assignment.status as TaskStatus;
    if (status === TASK_STATUS.AGUARDANDO_AUDITORIA) {
      return (
        assignment.auditor?.nome ??
        assignment.profiles_audit?.nome ??
        assignment.setor_auditor?.nome ??
        "auditor"
      );
    }
    if (status === TASK_STATUS.AGUARDANDO_APROVACAO) {
      return (
        assignment.aprovador?.nome ??
        assignment.profiles_aprov?.nome ??
        "aprovador"
      );
    }
    return assignment.responsavel?.nome ?? "executor";
  }, [assignment]);

  // ──────────────────────────────────────────────────────────────────────
  // 4. Computa permissões com base em status + papel
  // ──────────────────────────────────────────────────────────────────────
  const status = (assignment?.status ?? "") as TaskStatus;

  // EXECUTOR
  const canExecutorEditField = useMemo(() => {
    return (fieldId: string): boolean => {
      if (role !== "executor") return false;
      if (
        status === TASK_STATUS.PENDENTE ||
        status === TASK_STATUS.EM_ANDAMENTO ||
        status === TASK_STATUS.REABERTA
      ) {
        return true;
      }
      // FASE 3: devolvida → só campos com plano do aprovador pendente
      if (status === TASK_STATUS.DEVOLVIDA) {
        // Aceita qualquer campo devolvido — a checagem específica fica no useExecution
        return true;
      }
      return false;
    };
  }, [role, status]);

  const canExecutorSubmit = role === "executor" && (
    status === TASK_STATUS.PENDENTE ||
    status === TASK_STATUS.EM_ANDAMENTO ||
    status === TASK_STATUS.REABERTA ||
    status === TASK_STATUS.DEVOLVIDA
  );

  // APROVADOR — núcleo do lock
  /** Aprovador está EM AÇÃO (não read-only)? */
  const aprovadorEmAcao = role === "aprovador" && status === TASK_STATUS.AGUARDANDO_APROVACAO;

  /** Painel restrito = aprovador deveria ver tudo travado (status auditoria OU plano auditor pendente) */
  const approverPanelRestricted =
    status === TASK_STATUS.AGUARDANDO_AUDITORIA ||
    (status === TASK_STATUS.AGUARDANDO_APROVACAO && hasAuditorPlansPending);

  const canApproverDecideField = useMemo(() => {
    return (fieldId: string): boolean => {
      if (!aprovadorEmAcao) return false;
      // FASE 6: se tem plano do auditor pendente, só o campo devolvido destrava
      if (hasAuditorPlansPending) {
        return fieldsDevolvidosPeloAuditor.has(fieldId);
      }
      // FASE 2/4: aguardando_aprovacao normal → todos os campos liberados
      return true;
    };
  }, [aprovadorEmAcao, hasAuditorPlansPending, fieldsDevolvidosPeloAuditor]);

  const canApproverCreatePlan = useMemo(() => {
    return (fieldId: string): boolean => {
      // Mesma regra: só pode criar plano se pode decidir o campo
      return canApproverDecideField(fieldId);
    };
  }, [canApproverDecideField]);

  const canApproverFinalize = useMemo(() => {
    if (!aprovadorEmAcao) return false;
    // FASE 6: se há plano do auditor pendente, só habilita Aprovar para responder o auditor
    if (hasAuditorPlansPending) {
      return fieldsDevolvidosPeloAuditor.size > 0;
    }
    // FASE 2/4: normal
    return true;
  }, [aprovadorEmAcao, hasAuditorPlansPending, fieldsDevolvidosPeloAuditor]);

  const approverButtonTooltip = useMemo(() => {
    if (canApproverFinalize) return null;
    if (status === TASK_STATUS.AGUARDANDO_AUDITORIA) {
      return `Aguardando ${responsavelAtual} avaliar`;
    }
    return null;
  }, [canApproverFinalize, status, responsavelAtual]);

  const approverLockMessage = useMemo(() => {
    if (!approverPanelRestricted) return null;
    if (status === TASK_STATUS.AGUARDANDO_AUDITORIA) {
      return `🔒 BLOQUEADO — Aguardando ${responsavelAtual} avaliar`;
    }
    if (hasAuditorPlansPending) {
      return `🔒 Auditor devolveu ${fieldsDevolvidosPeloAuditor.size} item(s) para resposta — demais campos bloqueados`;
    }
    return null;
  }, [
    approverPanelRestricted,
    status,
    responsavelAtual,
    hasAuditorPlansPending,
    fieldsDevolvidosPeloAuditor,
  ]);

  // AUDITOR
  const auditorEmAcao = role === "auditor" && status === TASK_STATUS.AGUARDANDO_AUDITORIA;
  const auditorPanelReadOnly = !auditorEmAcao;
  const canAuditorAnswer = auditorEmAcao;
  const canAuditorCreatePlan = auditorEmAcao;
  const canAuditorFinalize = auditorEmAcao;

  // ──────────────────────────────────────────────────────────────────────
  // RETORNO
  // ──────────────────────────────────────────────────────────────────────
  return {
    role,
    isAdmin,
    status,

    hasAuditorPlansPending,
    fieldsDevolvidosPeloAuditor,
    responsavelAtual,

    canExecutorEditField,
    canExecutorSubmit,

    canApproverDecideField,
    canApproverCreatePlan,
    canApproverFinalize,
    approverButtonTooltip,
    approverPanelRestricted,
    approverLockMessage,

    canAuditorAnswer,
    canAuditorCreatePlan,
    canAuditorFinalize,
    auditorPanelReadOnly,
  };
}
