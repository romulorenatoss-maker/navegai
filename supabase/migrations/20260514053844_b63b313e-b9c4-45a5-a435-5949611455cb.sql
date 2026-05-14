
UPDATE public.operational_assignments
SET status = 'aguardando_aprovacao',
    updated_at = now()
WHERE status IN ('aguardando_avaliacao', 'em_avaliacao');
