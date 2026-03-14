
-- Drop the recursive policy
DROP POLICY IF EXISTS "Avaliadores can view avaliacoes on same OS" ON public.avaliacoes;

-- Create a security definer function to check if user has an avaliacao on the same OS
CREATE OR REPLACE FUNCTION public.user_has_avaliacao_on_os(_user_id uuid, _os_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.avaliacoes a
    JOIN public.profiles p ON p.id = a.avaliador_id AND p.user_id = _user_id
    WHERE a.ordem_servico_id = _os_id
  )
$$;

-- Recreate policy using the function
CREATE POLICY "Avaliadores can view avaliacoes on same OS"
ON public.avaliacoes
FOR SELECT
TO authenticated
USING (
  public.user_has_avaliacao_on_os(auth.uid(), ordem_servico_id)
);
