ALTER TABLE public.operational_assignments DROP CONSTRAINT IF EXISTS operational_assignments_status_check;

ALTER TABLE public.operational_assignments ADD CONSTRAINT operational_assignments_status_check
CHECK (status = ANY (ARRAY[
  'pendente'::text,
  'em_andamento'::text,
  'concluida'::text,
  'atrasada'::text,
  'nao_executada'::text,
  'bloqueada'::text,
  'aguardando_avaliacao'::text,
  'aguardando_validacao'::text,
  'em_avaliacao'::text,
  'devolvida'::text,
  'aguardando_aprovacao'::text,
  'aprovada'::text,
  'reprovada'::text,
  'contingenciado'::text
]));