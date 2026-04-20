/**
 * Logger estruturado do módulo operacional.
 *
 * Uso:
 *   logSystem.info("template aplicado", { assignmentId })
 *   logSystem.warn("transicao bloqueada", { currentStatus, targetStatus })
 *   logSystem.error("falha ao salvar resposta", error, { fieldId })
 *
 * - Sempre imprime no console (dev).
 * - Em produção tenta persistir em public.system_logs (best-effort; nunca quebra o fluxo).
 */
import { supabase } from "@/integrations/supabase/client";

export type LogLevel = "INFO" | "WARNING" | "ERROR";

export interface LogPayload {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  module?: string;
}

const DEFAULT_MODULE = "operacional";

async function persist(payload: LogPayload) {
  try {
    const { data: userResp } = await supabase.auth.getUser();
    await (supabase as any).from("system_logs").insert({
      level: payload.level,
      message: payload.message,
      context: payload.context ?? null,
      module: payload.module ?? DEFAULT_MODULE,
      user_id: userResp?.user?.id ?? null,
    });
  } catch {
    // Logger nunca deve quebrar o app.
  }
}

function consoleOut(payload: LogPayload) {
  const tag = `[${payload.module ?? DEFAULT_MODULE}][${payload.level}]`;
  if (payload.level === "ERROR") console.error(tag, payload.message, payload.context ?? "");
  else if (payload.level === "WARNING") console.warn(tag, payload.message, payload.context ?? "");
  else console.info(tag, payload.message, payload.context ?? "");
}

export const logSystem = {
  info(message: string, context?: Record<string, unknown>, module?: string) {
    const payload: LogPayload = { level: "INFO", message, context, module };
    consoleOut(payload);
    void persist(payload);
  },
  warn(message: string, context?: Record<string, unknown>, module?: string) {
    const payload: LogPayload = { level: "WARNING", message, context, module };
    consoleOut(payload);
    void persist(payload);
  },
  error(message: string, error?: unknown, context?: Record<string, unknown>, module?: string) {
    const merged = {
      ...(context ?? {}),
      error_message: error instanceof Error ? error.message : String(error ?? ""),
      error_stack: error instanceof Error ? error.stack : undefined,
    };
    const payload: LogPayload = { level: "ERROR", message, context: merged, module };
    consoleOut(payload);
    void persist(payload);
  },
};
