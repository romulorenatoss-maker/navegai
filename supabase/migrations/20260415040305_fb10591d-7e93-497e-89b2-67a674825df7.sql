
ALTER TABLE public.operational_assignments DROP CONSTRAINT IF EXISTS operational_assignments_status_check;
ALTER TABLE public.operational_assignments ADD CONSTRAINT operational_assignments_status_check
  CHECK (status = ANY (ARRAY[
    'pendente', 'em_andamento', 'concluida', 'atrasada', 'nao_executada', 'bloqueada',
    'aguardando_avaliacao', 'em_avaliacao', 'devolvida',
    'aguardando_aprovacao', 'aprovada', 'reprovada'
  ]));
