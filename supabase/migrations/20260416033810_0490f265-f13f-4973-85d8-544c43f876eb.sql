
INSERT INTO storage.buckets (id, name, public)
VALUES ('contingency-attachments', 'contingency-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload contingency attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contingency-attachments');

CREATE POLICY "Authenticated can view contingency attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contingency-attachments');

CREATE POLICY "Authenticated can update own contingency attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'contingency-attachments');

CREATE POLICY "Authenticated can delete own contingency attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'contingency-attachments');
