ALTER TABLE public.operational_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.operational_contingencies REPLICA IDENTITY FULL;
ALTER TABLE public.lead_tarefas_contato REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='operational_assignments') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.operational_assignments';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='operational_contingencies') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.operational_contingencies';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lead_tarefas_contato') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tarefas_contato';
  END IF;
END $$;