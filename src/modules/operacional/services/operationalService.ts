/**
 * Camada de services do módulo operacional.
 * Centraliza leituras comuns de tabelas operational_*.
 * Mutations complexas permanecem nos hooks (camada de domínio).
 */
import { supabase } from "@/integrations/supabase/client";

export const operationalService = {
  // Templates
  async getTemplates() {
    const { data, error } = await supabase
      .from("operational_templates")
      .select("*, setores(id, nome), tipos_servico(id, nome)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  // Assignments
  async getAssignmentById(id: string) {
    const { data, error } = await supabase
      .from("operational_assignments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getAssignmentsByResponsavel(responsavelId: string) {
    const { data, error } = await supabase
      .from("operational_assignments")
      .select("*")
      .eq("responsavel_id", responsavelId)
      .order("data_prevista", { ascending: true });
    if (error) throw error;
    return data;
  },

  async getAssignmentsByAvaliador(avaliadorId: string) {
    const { data, error } = await supabase
      .from("operational_assignments")
      .select("*")
      .eq("avaliador_id", avaliadorId)
      .order("data_prevista", { ascending: true });
    if (error) throw error;
    return data;
  },

  // Field answers / reviews
  async getFieldAnswers(assignmentId: string) {
    const { data, error } = await supabase
      .from("operational_field_answers")
      .select("*")
      .eq("assignment_id", assignmentId);
    if (error) throw error;
    return data;
  },

  async getFieldReviews(assignmentId: string) {
    const { data, error } = await supabase
      .from("operational_field_reviews")
      .select("*")
      .eq("assignment_id", assignmentId);
    if (error) throw error;
    return data;
  },

  // Contingencies
  async getContingencies(assignmentId: string) {
    const { data, error } = await supabase
      .from("operational_contingencies")
      .select("*")
      .eq("assignment_id", assignmentId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  // Audit
  async getAuditTrail(assignmentId: string) {
    const { data, error } = await supabase
      .from("operational_audit_trail")
      .select("*")
      .eq("assignment_id", assignmentId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  // Approval answers
  async getApprovalAnswers(assignmentId: string) {
    const { data, error } = await supabase
      .from("operational_approval_answers")
      .select("*")
      .eq("assignment_id", assignmentId);
    if (error) throw error;
    return data;
  },
};

export type OperationalService = typeof operationalService;
