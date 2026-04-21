-- Permitir que usuários autenticados criem templates ad-hoc (Nova Tarefa Individual)
-- e suas seções/campos relacionados.

CREATE POLICY "Users can insert own ad-hoc templates"
ON public.operational_templates
FOR INSERT
TO authenticated
WITH CHECK (
  origem = 'ad_hoc'
  AND responsavel_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own ad-hoc templates"
ON public.operational_templates
FOR UPDATE
TO authenticated
USING (
  origem = 'ad_hoc'
  AND responsavel_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Sections: permitir inserção em templates ad-hoc do próprio usuário
CREATE POLICY "Users can insert sections of own ad-hoc templates"
ON public.operational_template_sections
FOR INSERT
TO authenticated
WITH CHECK (
  template_id IN (
    SELECT t.id FROM public.operational_templates t
    WHERE t.origem = 'ad_hoc'
      AND t.responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

-- Fields: idem
CREATE POLICY "Users can insert fields of own ad-hoc templates"
ON public.operational_template_fields
FOR INSERT
TO authenticated
WITH CHECK (
  template_id IN (
    SELECT t.id FROM public.operational_templates t
    WHERE t.origem = 'ad_hoc'
      AND t.responsavel_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);