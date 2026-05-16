DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operational_assignments_setor_avaliado_id_fkey') THEN
    ALTER TABLE operational_assignments ADD CONSTRAINT operational_assignments_setor_avaliado_id_fkey FOREIGN KEY (setor_avaliado_id) REFERENCES setores(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operational_assignments_setor_aprovador_id_fkey') THEN
    ALTER TABLE operational_assignments ADD CONSTRAINT operational_assignments_setor_aprovador_id_fkey FOREIGN KEY (setor_aprovador_id) REFERENCES setores(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operational_assignments_setor_auditor_id_fkey') THEN
    ALTER TABLE operational_assignments ADD CONSTRAINT operational_assignments_setor_auditor_id_fkey FOREIGN KEY (setor_auditor_id) REFERENCES setores(id) ON DELETE SET NULL;
  END IF;
END $$;