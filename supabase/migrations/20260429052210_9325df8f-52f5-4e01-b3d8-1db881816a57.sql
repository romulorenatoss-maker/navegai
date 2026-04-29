ALTER TABLE public.propostas_templates
  ADD COLUMN IF NOT EXISTS arquivo_pdf_path text;

COMMENT ON COLUMN public.propostas_templates.arquivo_pdf_path IS 'Caminho do PDF de preview gerado via CloudConvert no bucket propostas-templates.';