-- Drop old check constraint and add updated one with 'contingenciado' status
ALTER TABLE public.operational_assignments DROP CONSTRAINT operational_assignments_status_check;

ALTER TABLE public.operational_assignments ADD CONSTRAINT operational_assignments_status_check 
CHECK (status = ANY (ARRAY[
  'pendente', 'em_andamento', 'concluida', 'atrasada', 'nao_executada', 
  'bloqueada', 'aguardando_avaliacao', 'em_avaliacao', 'devolvida', 
  'aguardando_aprovacao', 'aprovada', 'reprovada', 'contingenciado'
]));