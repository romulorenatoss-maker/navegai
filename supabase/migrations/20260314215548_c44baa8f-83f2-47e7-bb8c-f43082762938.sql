
-- Drop and recreate "Avaliado can view completed avaliacoes" to also check tecnico_id/atendente_id
DROP POLICY IF EXISTS "Avaliado can view completed avaliacoes" ON public.avaliacoes;
CREATE POLICY "Avaliado can view completed avaliacoes"
ON public.avaliacoes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM ordens_servico os
    WHERE os.id = avaliacoes.ordem_servico_id
      AND os.status = 'concluida'::os_status
      AND (
        os.colaborador_avaliado_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
        OR os.tecnico_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
        OR os.atendente_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
      )
  )
);

-- Drop and recreate "Avaliado can view completed respostas" to also check tecnico_id/atendente_id
DROP POLICY IF EXISTS "Avaliado can view completed respostas" ON public.respostas_avaliacao;
CREATE POLICY "Avaliado can view completed respostas"
ON public.respostas_avaliacao
FOR SELECT
TO authenticated
USING (
  avaliacao_id IN (
    SELECT a.id FROM avaliacoes a
    JOIN ordens_servico os ON os.id = a.ordem_servico_id
    WHERE os.status = 'concluida'::os_status
      AND (
        os.colaborador_avaliado_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
        OR os.tecnico_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
        OR os.atendente_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
      )
  )
);
