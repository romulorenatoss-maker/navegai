-- 1) Cria setor virtual "Administrador" (idempotente)
INSERT INTO public.setores (nome, descricao, ativo)
SELECT 'Administrador',
       'Setor virtual: agrupa todos os usuários com papel admin. Vínculo mantido automaticamente.',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.setores WHERE nome = 'Administrador');

-- 2) Função de sincronização de membros admin <-> setor Administrador
CREATE OR REPLACE FUNCTION public.sync_admin_setor_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setor_id uuid;
  v_profile_id uuid;
BEGIN
  SELECT id INTO v_setor_id FROM public.setores WHERE nome = 'Administrador' LIMIT 1;
  IF v_setor_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' AND NEW.role = 'admin' THEN
    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
    IF v_profile_id IS NOT NULL THEN
      INSERT INTO public.colaborador_setores (profile_id, setor_id)
      VALUES (v_profile_id, v_setor_id)
      ON CONFLICT (profile_id, setor_id) DO NOTHING;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.role = 'admin' THEN
    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = OLD.user_id LIMIT 1;
    IF v_profile_id IS NOT NULL THEN
      DELETE FROM public.colaborador_setores
      WHERE profile_id = v_profile_id AND setor_id = v_setor_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_admin_setor_membership ON public.user_roles;
CREATE TRIGGER trg_sync_admin_setor_membership
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_admin_setor_membership();

-- 3) Backfill: vincula todos os admins atuais ao setor Administrador
INSERT INTO public.colaborador_setores (profile_id, setor_id)
SELECT p.id, s.id
FROM public.user_roles ur
JOIN public.profiles p ON p.user_id = ur.user_id
CROSS JOIN public.setores s
WHERE ur.role = 'admin' AND s.nome = 'Administrador'
ON CONFLICT (profile_id, setor_id) DO NOTHING;