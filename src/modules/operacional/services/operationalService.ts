/**
 * Camada de services do módulo operacional.
 * Centraliza leituras e mutations comuns de tabelas operational_*.
 * Regra: UI e hooks devem preferir chamar estes métodos em vez de acessar supabase direto.
 */
import { supabase } from "@/integrations/supabase/client";
import { logSystem } from "./systemLogger";

async function run<T>(label: string, fn: () => Promise<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await fn();
  if (error) {
    logSystem.error(`operationalService.${label} failed`, error);
    throw error;
  }
  return data;
}

export const operationalService = {
  // ==================== TEMPLATES ====================
  async getTemplates() {
    return run("getTemplates", () =>
      supabase
        .from("operational_templates")
        .select("*, setores(id, nome), tipos_servico(id, nome)")
        .order("created_at", { ascending: false })
    );
  },

  // ==================== ASSIGNMENTS ====================
  async getAssignmentById(id: string) {
    return run("getAssignmentById", () =>
      supabase.from("operational_assignments").select("*").eq("id", id).maybeSingle()
    );
  },

  async getAssignmentsByResponsavel(responsavelId: string) {
    return run("getAssignmentsByResponsavel", () =>
      supabase
        .from("operational_assignments")
        .select("*")
        .eq("responsavel_id", responsavelId)
        .order("data_prevista", { ascending: true })
    );
  },

  async getAssignmentsByAvaliador(avaliadorId: string) {
    return run("getAssignmentsByAvaliador", () =>
      supabase
        .from("operational_assignments")
        .select("*")
        .eq("avaliador_id", avaliadorId)
        .order("data_prevista", { ascending: true })
    );
  },

  async getAssignmentsByAprovador(aprovadorId: string) {
    return run("getAssignmentsByAprovador", () =>
      supabase
        .from("operational_assignments")
        .select("*")
        .eq("aprovador_id", aprovadorId)
        .order("data_prevista", { ascending: true })
    );
  },

  // ==================== FIELD ANSWERS ====================
  async getFieldAnswers(assignmentId: string) {
    return run("getFieldAnswers", () =>
      supabase.from("operational_field_answers").select("*").eq("assignment_id", assignmentId)
    );
  },

  async getFieldReviews(assignmentId: string) {
    return run("getFieldReviews", () =>
      supabase.from("operational_field_reviews").select("*").eq("assignment_id", assignmentId)
    );
  },

  // ==================== CONTINGENCIES ====================
  async getContingencies(assignmentId: string) {
    return run("getContingencies", () =>
      supabase
        .from("operational_contingencies")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: false })
    );
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
    return run("getAuditTrail", () =>
      supabase
        .from("operational_audit_trail")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: false })
    );
  },

  async getAssignmentHistory(assignmentId: string) {
    return run("getAssignmentHistory", () =>
      supabase
        .from("operational_assignment_history")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("data_hora", { ascending: false })
    );
  },

  // ==================== APPROVAL ANSWERS ====================
  async getApprovalAnswers(assignmentId: string) {
    return run("getApprovalAnswers", () =>
      supabase.from("operational_approval_answers").select("*").eq("assignment_id", assignmentId)
    );
  },
};

export type OperationalService = typeof operationalService;
