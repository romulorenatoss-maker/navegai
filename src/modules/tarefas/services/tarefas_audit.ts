/**
 * Camada de auditoria estruturada para o módulo operacional.
 *
 * Sempre grava em operational_audit_trail (tabela já existente, vinculada a assignment_id).
 * Uso:
 *   await logAudit({ assignmentId, event: "answer_edited", before, after })
 *
 * Nunca joga exceção para fora (auditoria não deve quebrar a UX).
 */
import { supabase } from "@/integrations/supabase/client";
import { logSystem } from "./tarefas_systemLogger";

export type AuditEvent =
  | "status_changed"
  | "answer_created"
  | "answer_edited"
  | "approval_answer_saved"
  | "approval_final_decision"
  | "contingency_created"
  | "contingency_resolved"
  | "contingency_validated"
  | "review_submitted"
  | "assignment_reopened"
  | string;

export interface AuditInput {
  assignmentId: string;
  event: AuditEvent;
  actorProfileId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  motivo?: string | null;
}

export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await (supabase as any).from("operational_audit_trail").insert({
      assignment_id: input.assignmentId,
      tipo_evento: input.event,
      executado_por: input.actorProfileId ?? null,
      motivo: input.motivo ?? null,
      dados_anteriores: input.before ?? null,
      dados_novos: input.after ?? null,
    });
  } catch (err) {
    logSystem.error("Falha ao gravar auditoria", err, { event: input.event, assignmentId: input.assignmentId });
  }
}
