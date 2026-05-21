/**
 * tarefas_fluxoRpcService.ts
 *
 * Service oficial de chamadas RPC do fluxo. ÚNICA verdade — proibido
 * componente chamar supabase.rpc diretamente.
 *
 * Doc por RPC: src/modules/tarefas/docs/tarefas_rpc_<nome>.md
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  ItemPlano,
  PlanoAprovador,
  PlanoAuditor,
  RespostaPlanoValorJson,
} from "../types/tarefas_fluxoTypes";

// ============================================================================
// EXECUTOR
// ============================================================================

export interface ExecutorRespostaInput {
  field_id: string;
  valor_booleano?: boolean | null;
  valor_texto?: string | null;
  valor_numero?: number | null;
  valor_json?: unknown;
  evidencia_url?: string | null;
  evidencia_anexo_id?: string | null;
  evidencia_mime_type?: string | null;
  observacao?: string | null;
}

async function executorEnviarRespostas(input: {
  assignmentId: string;
  respostas: ExecutorRespostaInput[];
}): Promise<{ assignment_id: string; novo_status: string; respostas_salvas: number }> {
  const { data, error } = await (supabase as any).rpc(
    "tarefas_rpc_executor_enviar_respostas",
    {
      p_assignment_id: input.assignmentId,
      p_respostas: input.respostas,
    },
  );
  if (error) throw error;
  // RPC retorna setof; pegamos a primeira linha
  const row = Array.isArray(data) ? data[0] : data;
  return row;
}

async function executorResponderPlanoAprovador(input: {
  planoId: string;
  respostaValorJson: RespostaPlanoValorJson;
}): Promise<PlanoAprovador> {
  const { data, error } = await (supabase as any).rpc(
    "tarefas_rpc_executor_responder_plano_aprovador",
    {
      p_plano_id: input.planoId,
      p_resposta_valor_json: input.respostaValorJson,
    },
  );
  if (error) throw error;
  return data as PlanoAprovador;
}

// ============================================================================
// APROVADOR
// ============================================================================

export interface CriarPlanoInput {
  assignmentId: string;
  fieldId: string;
  instrucao: string;
  itensPlano: ItemPlano[];
  prazoResolucao: string; // ISO
  criticidade?: "baixa" | "media" | "alta";
}

async function aprovadorCriarPlanoExecutor(
  input: CriarPlanoInput,
): Promise<PlanoAprovador> {
  const { data, error } = await (supabase as any).rpc(
    "tarefas_rpc_aprovador_criar_plano_executor",
    {
      p_assignment_id: input.assignmentId,
      p_field_id: input.fieldId,
      p_instrucao: input.instrucao,
      p_itens_plano: input.itensPlano,
      p_prazo_resolucao: input.prazoResolucao,
      p_criticidade: input.criticidade ?? "media",
    },
  );
  if (error) throw error;
  return data as PlanoAprovador;
}

async function aprovadorAprovarParaAuditoria(input: {
  assignmentId: string;
  notas?: unknown;
}): Promise<{ assignment_id: string; novo_status: string }> {
  const { data, error } = await (supabase as any).rpc(
    "tarefas_rpc_aprovador_aprovar_para_auditoria",
    {
      p_assignment_id: input.assignmentId,
      p_notas: input.notas ?? null,
    },
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row;
}

async function aprovadorResponderPlanoAuditor(input: {
  planoId: string;
  respostaValorJson: RespostaPlanoValorJson;
}): Promise<PlanoAuditor> {
  const { data, error } = await (supabase as any).rpc(
    "tarefas_rpc_aprovador_responder_plano_auditor",
    {
      p_plano_id: input.planoId,
      p_resposta_valor_json: input.respostaValorJson,
    },
  );
  if (error) throw error;
  return data as PlanoAuditor;
}

// ============================================================================
// AUDITOR
// ============================================================================

async function auditorCriarPlanoAprovador(
  input: CriarPlanoInput,
): Promise<PlanoAuditor> {
  const { data, error } = await (supabase as any).rpc(
    "tarefas_rpc_auditor_criar_plano_aprovador",
    {
      p_assignment_id: input.assignmentId,
      p_field_id: input.fieldId,
      p_instrucao: input.instrucao,
      p_itens_plano: input.itensPlano,
      p_prazo_resolucao: input.prazoResolucao,
      p_criticidade: input.criticidade ?? "media",
    },
  );
  if (error) throw error;
  return data as PlanoAuditor;
}

async function auditorAprovarAuditoria(input: {
  assignmentId: string;
  notas?: unknown;
}): Promise<{ assignment_id: string; novo_status: string }> {
  const { data, error } = await (supabase as any).rpc(
    "tarefas_rpc_auditor_aprovar_auditoria",
    {
      p_assignment_id: input.assignmentId,
      p_notas: input.notas ?? null,
    },
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row;
}

// ============================================================================
// API agregada
// ============================================================================
export const tarefasFluxoRpcService = {
  executorEnviarRespostas,
  executorResponderPlanoAprovador,
  aprovadorCriarPlanoExecutor,
  aprovadorAprovarParaAuditoria,
  aprovadorResponderPlanoAuditor,
  auditorCriarPlanoAprovador,
  auditorAprovarAuditoria,
};
