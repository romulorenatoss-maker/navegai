ALTER TABLE operational_assignments 
DROP CONSTRAINT IF EXISTS operational_assignments_status_check;

ALTER TABLE operational_assignments 
ADD CONSTRAINT operational_assignments_status_check 
CHECK (status IN (
  'pendente', 'em_andamento', 'concluida', 'atrasada', 'nao_executada', 
  'bloqueada', 'aguardando_avaliacao', 'aguardando_validacao', 'em_avaliacao', 
  'devolvida', 'aguardando_aprovacao', 'aprovada', 'reprovada', 'contingenciado',
  'aguardando_auditoria', 'em_plano_acao', 'cancelada', 'arquivada', 'reaberta',
  'aguardando_aceite_prazo', 'contingencia'
));