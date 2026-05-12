/**
 * tarefas_messagesService.ts — Camada SEPARADA de mensagens operacionais.
 *
 * NÃO usar assignment_history (eventos operacionais) nem audit_trail (auditoria).
 * Mensagens são uma camada própria. Persistência inicial em audit_trail com
 * tipo_evento dedicado "MENSAGEM_OPERACIONAL" + namespace claro,
 * mas a API pública é independente para permitir migração futura para tabela própria.
 *
 * Sem migration. Sem RPC. Sem trigger.
 */
import { supabase } from "@/integrations/supabase/client";

export type MessageChannel =
  | "solicitante_executor"
  | "executor_avaliador"
  | "executor_aprovador"
  | "geral";

export interface OperationalMessage {
  id: string;
  assignment_id: string;
  autor_id: string;
  autor_nome: string | null;
  autor_papel: string | null;
  channel: MessageChannel;
  texto: string;
  created_at: string;
  attachments?: Array<{ url: string; name: string; mime?: string }>;
}

const EVENT_TYPE = "MENSAGEM_OPERACIONAL";

/** Lista mensagens de uma tarefa, ordem cronológica asc. */
export async function listMessages(assignmentId: string): Promise<OperationalMessage[]> {
  const { data, error } = await (supabase as any)
    .from("operational_audit_trail")
    .select("id, assignment_id, executado_por, dados_novos, created_at")
    .eq("assignment_id", assignmentId)
    .eq("tipo_evento", EVENT_TYPE)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any): OperationalMessage => ({
    id: r.id,
    assignment_id: r.assignment_id,
    autor_id: r.executado_por,
    autor_nome: r.dados_novos?.autor_nome ?? null,
    autor_papel: r.dados_novos?.autor_papel ?? null,
    channel: (r.dados_novos?.channel as MessageChannel) ?? "geral",
    texto: r.dados_novos?.texto ?? "",
    attachments: r.dados_novos?.attachments ?? [],
    created_at: r.created_at,
  }));
}

export interface PostMessageInput {
  assignmentId: string;
  autorId: string;
  autorNome?: string | null;
  autorPapel?: string | null;
  channel: MessageChannel;
  texto: string;
  attachments?: Array<{ url: string; name: string; mime?: string }>;
}

/** Insere uma mensagem. NÃO grava em assignment_history. */
export async function postMessage(input: PostMessageInput): Promise<void> {
  const texto = input.texto?.trim();
  if (!texto) throw new Error("Mensagem vazia.");
  const payload = {
    assignment_id: input.assignmentId,
    tipo_evento: EVENT_TYPE,
    executado_por: input.autorId,
    motivo: null,
    dados_anteriores: null,
    dados_novos: {
      _layer: "messages_v1",
      channel: input.channel,
      texto,
      autor_nome: input.autorNome ?? null,
      autor_papel: input.autorPapel ?? null,
      attachments: input.attachments ?? [],
    },
  };
  const { error } = await (supabase as any).from("operational_audit_trail").insert(payload);
  if (error) throw error;
}

/** Helper: contagem por canal (para badges). */
export function countByChannel(msgs: OperationalMessage[]): Record<MessageChannel, number> {
  const out: Record<MessageChannel, number> = {
    solicitante_executor: 0,
    executor_avaliador: 0,
    executor_aprovador: 0,
    geral: 0,
  };
  for (const m of msgs) out[m.channel] = (out[m.channel] ?? 0) + 1;
  return out;
}
