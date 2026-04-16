
INSERT INTO storage.buckets (id, name, public)
VALUES ('instrucoes-campos', 'instrucoes-campos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view instrucoes"
ON storage.objects FOR SELECT
USING (bucket_id = 'instrucoes-campos');

CREATE POLICY "Authenticated can upload instrucoes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'instrucoes-campos');

CREATE POLICY "Authenticated can update instrucoes"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'instrucoes-campos');

CREATE POLICY "Authenticated can delete instrucoes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'instrucoes-campos');
