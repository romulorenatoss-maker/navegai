/**
 * Camada de services do módulo operacional.
 * Centraliza leituras e mutations comuns de tabelas operational_*.
 * Regra: UI e hooks devem preferir chamar estes métodos em vez de acessar supabase direto.
 */
import { supabase } from "@/integrations/supabase/client";
import { logSystem } from "./tarefas_systemLogger";

function ensure<T>(label: string, error: any, data: T): T {
  if (error) {
    logSystem.error(`operationalService.${label} failed`, error);
    throw error;
  }
  return data;
}

export const operationalService = {
  // ==================== TEMPLATES ====================
  async getTemplates() {
    const { data, error } = await supabase
      .from("operational_templates")
      .select("*, setores(id, nome), tipos_servico(id, nome)")
      .order("created_at", { ascending: false });
    return ensure("getTemplates", error, data);
  },

  // ==================== ASSIGNMENTS ====================
  async getAssignmentById(id: string) {
    const { data, error } = await supabase
      .from("operational_assignments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return ensure("getAssignmentById", error, data);
  },

  async getAssignmentsByResponsavel(responsavelId: string) {
    const { data, error } = await supabase
      .from("operational_assignments")
      .select("*")
      .eq("responsavel_id", responsavelId)
      .order("data_prevista", { ascending: true });
    return ensure("getAssignmentsByResponsavel", error, data);
  },

  async getAssignmentsByAuditor(auditorId: string) {
    const { data, error } = await supabase
      .from("operational_assignments")
      .select("*")
      .eq("auditor_id", auditorId)
      .order("data_prevista", { ascending: true });
    return ensure("getAssignmentsByAuditor", error, data);
  },

  async getAssignmentsByAprovador(aprovadorId: string) {
    const { data, error } = await supabase
      .from("operational_assignments")
      .select("*")
      .eq("aprovador_id", aprovadorId)
      .order("data_prevista", { ascending: true });
    return ensure("getAssignmentsByAprovador", error, data);
  },

  // ==================== FIELD ANSWERS ====================
  async getFieldAnswers(assignmentId: string) {
    const { data, error } = await supabase
      .from("operational_field_answers")
      .select("*")
      .eq("assignment_id", assignmentId);
    return ensure("getFieldAnswers", error, data);
  },

  async getFieldReviews(assignmentId: string) {
    const { data, error } = await supabase
      .from("operational_field_reviews")
      .select("*")
      .eq("assignment_id", assignmentId);
    return ensure("getFieldReviews", error, data);
  },

  // ==================== CONTINGENCIES ====================
  async getContingencies(assignmentId: string) {
    const { data, error } = await supabase
      .from("operational_contingencies")
      .select("*")
      .eq("assignment_id", assignmentId)
      .order("created_at", { ascending: false });
    return ensure("getContingencies", error, data);
  },

  async getOpenContingenciesCount(assignmentId: string): Promise<number> {
    const { data, error } = await supabase
      .from("operational_contingencies")
      .select("id")
      .eq("assignment_id", assignmentId)
      .in("status", ["aberta", "em_andamento", "resolvida"]);
    if (error) {
      logSystem.error("getOpenContingenciesCount failed", error);
      throw error;
    }
    return data?.length ?? 0;
  },

  // ==================== AUDIT ====================
  async getAuditTrail(assignmentId: string) {
    const { data, error } = await supabase
      .from("operational_audit_trail")
      .select("*")
      .eq("assignment_id", assignmentId)
      .order("created_at", { ascending: false });
    return ensure("getAuditTrail", error, data);
  },

  async getAssignmentHistory(assignmentId: string) {
    const { data, error } = await supabase
      .from("operational_assignment_history")
      .select("*")
      .eq("assignment_id", assignmentId)
      .order("data_hora", { ascending: false });
    return ensure("getAssignmentHistory", error, data);
  },

  // ==================== APPROVAL ANSWERS ====================
  async getApprovalAnswers(assignmentId: string) {
    const { data, error } = await supabase
      .from("operational_approval_answers")
      .select("*")
      .eq("assignment_id", assignmentId);
    return ensure("getApprovalAnswers", error, data);
  },
};

export type OperationalService = typeof operationalService;
