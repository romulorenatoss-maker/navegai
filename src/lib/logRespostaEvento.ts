/**
 * Camada paralela de métricas de tempo — registra cada clique de resposta
 * em respostas_eventos via RPC `insert_resposta_evento`.
 *
 * - Fire-and-forget: nunca bloqueia o fluxo de avaliação.
 * - Falhas são apenas logadas em console.warn.
 * - Não altera nada do fluxo existente (autoSaveAnswer, triggers, RLS).
 */
import { supabase } from "@/integrations/supabase/client";

export interface LogRespostaEventoParams {
  osId: string | null | undefined;
  perguntaId: string | null | undefined;
  usuarioId: string | null | undefined;
  setorId?: string | null;
  resposta: string | null | undefined;
}

export const logRespostaEvento = ({
  osId,
  perguntaId,
  usuarioId,
  setorId,
  resposta,
}: LogRespostaEventoParams): void => {
  // Guard contra valores nulos obrigatórios
  if (!osId || !perguntaId || !resposta) {
    return;
  }

  // Fire-and-forget: não bloqueia, não propaga erro
  void (async () => {
    try {
      await (supabase as any).rpc("insert_resposta_evento", {
        p_os_id: osId,
        p_pergunta_id: perguntaId,
        p_usuario_id: usuarioId ?? null,
        p_setor_id: setorId ?? null,
        p_resposta: resposta,
      });
    } catch (e) {
      console.warn("[logRespostaEvento] Falha ao registrar evento (não bloqueante):", e);
    }
  })();
};
