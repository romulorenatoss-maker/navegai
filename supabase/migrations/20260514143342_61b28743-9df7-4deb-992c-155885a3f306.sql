-- Permite que membro ativo do setor executor inicie/atualize tarefa ainda não atribuída.
-- Cobre o caso "tarefa aberta para o setor" (responsavel_id IS NULL).
CREATE POLICY "Setor member can update unassigned operational_assignments"
ON public.operational_assignments
FOR UPDATE
USING (
  responsavel_id IS NULL
  AND setor_executor_id IS NOT NULL
  AND setor_executor_id IN (
    SELECT cs.setor_id
    FROM public.colaborador_setores cs
    JOIN public.profiles p ON p.id = cs.profile_id
    WHERE p.user_id = auth.uid()
      AND p.ativo = true
  )
);