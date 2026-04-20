
-- 1. lead_historico SELECT: scope to owner/author/avaliador/admin
DROP POLICY IF EXISTS "Authenticated can view lead_historico" ON public.lead_historico;
CREATE POLICY "Authorized can view lead_historico"
ON public.lead_historico FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
  OR usuario_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR lead_id IN (
    SELECT id FROM public.leads
    WHERE responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

-- 2. lead_tarefas_contato SELECT: same scoping
DROP POLICY IF EXISTS "Authenticated can view lead_tarefas_contato" ON public.lead_tarefas_contato;
CREATE POLICY "Authorized can view lead_tarefas_contato"
ON public.lead_tarefas_contato FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
  OR responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR lead_id IN (
    SELECT id FROM public.leads
    WHERE responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

-- 3. leads SELECT: scope (owner, avaliador on related OS, admin)
DROP POLICY IF EXISTS "Authenticated can view leads" ON public.leads;
CREATE POLICY "Authorized can view leads"
ON public.leads FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.has_role(auth.uid(), 'avaliador'::app_role)
  OR responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR convertido_por IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- 4. clientes SELECT: tighter scope for avaliadores (only related to their OS/leads)
DROP POLICY IF EXISTS "Authorized can view clientes" ON public.clientes;
CREATE POLICY "Authorized can view clientes"
ON public.clientes FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR id IN (
    SELECT cliente_id FROM public.leads
    WHERE cliente_id IS NOT NULL
      AND (
        responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        OR convertido_por IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      )
  )
);

-- 5. Bucket listing: prevent public listing of objects in instrucoes-campos and evidencias and contingency-attachments by non-admins.
-- Existing SELECT policies on storage.objects for these buckets are scoped to authenticated; ensure no unauthenticated SELECT remains.
-- Drop overly broad public SELECT policies if any exist by name.
DO $$
BEGIN
  -- Remove any "Public read" style policies that allow anon listing
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public Access') THEN
    EXECUTE 'DROP POLICY "Public Access" ON storage.objects';
  END IF;
END $$;

-- Restrict instrucoes-campos listing: allow individual file reads to anon (since bucket is public for direct URL access),
-- but block listing by removing any anon SELECT that uses bucket_id alone without an object name filter.
-- We replace with an authenticated-only SELECT.
DROP POLICY IF EXISTS "Public read instrucoes-campos" ON storage.objects;
CREATE POLICY "Authenticated read instrucoes-campos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'instrucoes-campos');

-- contingency-attachments: ensure authenticated-only
DROP POLICY IF EXISTS "Public read contingency-attachments" ON storage.objects;
CREATE POLICY "Authenticated read contingency-attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contingency-attachments');

-- Make instrucoes-campos and contingency-attachments private buckets (objects still served via signed URLs / app)
UPDATE storage.buckets SET public = false WHERE id IN ('instrucoes-campos','contingency-attachments');
