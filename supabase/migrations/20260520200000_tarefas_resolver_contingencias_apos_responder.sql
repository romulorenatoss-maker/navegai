-- =============================================================================
-- FIX: triggers do novo modelo resolvem contingências legacy antes de transição
-- =============================================================================
-- Bug detectado em produção:
--   Executor responde plano via RPC tarefas_rpc_executor_responder_plano_aprovador.
--   Trigger tarefas_trigger_status_apos_executor_responder_plano tenta mudar
--   status do assignment para 'aguardando_aprovacao'.
--   Trigger LEGACY check_contingency_block (migration 20260515174308) REJEITA
--   a transição porque operational_contingencies ainda tem registros
--   status='aberta' (criados pelo aprovador no fluxo de criação do plano).
--   Resultado: "Não é possível concluir: existem N contingência(s) pendente(s)".
--
-- Causa raiz: o novo modelo (tarefas_planos_acao_*) coexiste com a tabela
-- legacy operational_contingencies. A RPC nova atualiza apenas a tabela nova
-- e não resolve a contingência associada — gap que quebra a transição.
--
-- Fix cirúrgico: os 2 triggers do novo modelo que mudam status (executor
-- responder e aprovador responder auditor) passam a RESOLVER as
-- contingências abertas do assignment ANTES de fazer o UPDATE de status.
--
-- NÃO TOCA EM:
--   - check_contingency_block (trigger legacy permanece intacto para
--     proteger fluxos antigos)
--   - RPCs (intactas — só os triggers absorvem a resolução)
--   - Outras tabelas
--
-- Docs:
--   src/modules/tarefas/docs/tarefas_trigger_status_apos_executor_responder_plano.md
--   src/modules/tarefas/docs/tarefas_trigger_status_apos_aprovador_responder_plano_auditor.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger: APÓS executor responder plano do aprovador
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_executor_responder_plano()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.respondido = true AND (OLD.respondido IS DISTINCT FROM true) THEN
    -- 🆕 Resolve contingências abertas vinculadas ao assignment ANTES de
    -- tentar mudar o status. Sem isso, o trigger check_contingency_block
    -- rejeita a transição para aguardando_aprovacao.
    UPDATE public.operational_contingencies
      SET status = 'resolvida',
          resolvida_em = now(),
          dentro_prazo = CASE
            WHEN prazo_resolucao IS NULL THEN true
            WHEN now() <= prazo_resolucao THEN true
            ELSE false
          END
      WHERE assignment_id = NEW.assignment_id
        AND status NOT IN ('validada', 'descartada', 'resolvida');

    -- Agora transiciona status (sem bloqueio do check_contingency_block).
    UPDATE public.operational_assignments
      SET status = 'aguardando_aprovacao',
          updated_at = now()
      WHERE id = NEW.assignment_id
        AND status IN ('devolvida', 'em_andamento');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tarefas_fn_trigger_apos_executor_responder_plano IS
  'Quando executor responde plano (respondido false→true): (1) resolve contingências legacy abertas; (2) muda status para aguardando_aprovacao. Doc: src/modules/tarefas/docs/tarefas_trigger_status_apos_executor_responder_plano.md';

-- ---------------------------------------------------------------------------
-- 2. Trigger: APÓS aprovador responder plano do auditor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_aprovador_responder_plano_auditor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.respondido = true AND (OLD.respondido IS DISTINCT FROM true) THEN
    -- 🆕 Mesma lógica: resolve contingências legacy antes de transicionar.
    UPDATE public.operational_contingencies
      SET status = 'resolvida',
          resolvida_em = now(),
          dentro_prazo = CASE
            WHEN prazo_resolucao IS NULL THEN true
            WHEN now() <= prazo_resolucao THEN true
            ELSE false
          END
      WHERE assignment_id = NEW.assignment_id
        AND status NOT IN ('validada', 'descartada', 'resolvida');

    UPDATE public.operational_assignments
      SET status = 'aguardando_auditoria',
          updated_at = now()
      WHERE id = NEW.assignment_id
        AND status IN ('aguardando_aprovacao');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tarefas_fn_trigger_apos_aprovador_responder_plano_auditor IS
  'Quando aprovador responde plano do auditor (respondido false→true): (1) resolve contingências legacy abertas; (2) muda status para aguardando_auditoria. Doc: src/modules/tarefas/docs/tarefas_trigger_status_apos_aprovador_responder_plano_auditor.md';
