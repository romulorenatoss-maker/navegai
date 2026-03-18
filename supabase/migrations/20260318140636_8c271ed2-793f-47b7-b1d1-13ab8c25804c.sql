CREATE UNIQUE INDEX idx_lead_contatos_phone_unique
ON public.lead_contatos (regexp_replace(valor, '\D', '', 'g'))
WHERE tipo_contato = 'telefone';