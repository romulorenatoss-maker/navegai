-- Allow all authenticated users to insert cidades
CREATE POLICY "Authenticated can insert cidades"
ON public.cidades
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow all authenticated users to insert ruas
CREATE POLICY "Authenticated can insert ruas"
ON public.ruas
FOR INSERT
TO authenticated
WITH CHECK (true);