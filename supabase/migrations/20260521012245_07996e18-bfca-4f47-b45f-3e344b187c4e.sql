
CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_executor_responder_plano()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.respondido = true AND (OLD.respondido IS DISTINCT FROM true) THEN
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

CREATE OR REPLACE FUNCTION public.tarefas_fn_trigger_apos_aprovador_responder_plano_auditor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.respondido = true AND (OLD.respondido IS DISTINCT FROM true) THEN
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

NOTIFY pgrst, 'reload schema';
