// Edge function: preview-proposta
// Converte o .docx do template em PDF via CloudConvert e salva no storage.
// Body: { template_id: string, docx_path?: string, force?: boolean }
// Retorna: { pdf_path, signed_url }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "propostas-templates";
const CLOUDCONVERT_BASE = "https://api.cloudconvert.com/v2";

function jerr(status: number, msg: string, extra?: unknown) {
  return new Response(JSON.stringify({ error: msg, details: extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jerr(405, "Method not allowed");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const CLOUDCONVERT_API_KEY = Deno.env.get("CLOUDCONVERT_API_KEY");
  if (!CLOUDCONVERT_API_KEY) return jerr(500, "CLOUDCONVERT_API_KEY ausente");

  let body: { template_id?: string; docx_path?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return jerr(400, "JSON inválido");
  }
  const templateId = body.template_id;
  if (!templateId) return jerr(400, "template_id obrigatório");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1) Buscar template
  const { data: tpl, error: tplErr } = await supabase
    .from("propostas_templates")
    .select("id, nome, arquivo_docx_path, arquivo_pdf_path")
    .eq("id", templateId)
    .single();
  if (tplErr || !tpl) return jerr(404, "Template não encontrado", tplErr);

  const docxPath = body.docx_path || tpl.arquivo_docx_path;
  if (!docxPath) return jerr(400, "Template sem arquivo .docx vinculado");

  // 2) Se PDF já existe e !force, retorna o existente (com base64)
  if (tpl.arquivo_pdf_path && !body.force) {
    const { data: cachedBlob } = await supabase.storage
      .from(BUCKET)
      .download(tpl.arquivo_pdf_path);
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(tpl.arquivo_pdf_path, 60 * 60);
    if (cachedBlob) {
      const buf = new Uint8Array(await cachedBlob.arrayBuffer());
      const b64 = btoa(String.fromCharCode(...buf));
      return new Response(
        JSON.stringify({
          pdf_path: tpl.arquivo_pdf_path,
          signed_url: signed?.signedUrl ?? null,
          pdf_base64: b64,
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // 3) Baixar .docx do storage
  const { data: docxBlob, error: dlErr } = await supabase.storage.from(BUCKET).download(docxPath);
  if (dlErr || !docxBlob) return jerr(500, "Falha ao baixar .docx", dlErr);

  // 4) Criar job no CloudConvert: import/upload → convert → export/url
  const ccHeaders = {
    Authorization: `Bearer ${CLOUDCONVERT_API_KEY}`,
    "Content-Type": "application/json",
  };

  const jobRes = await fetch(`${CLOUDCONVERT_BASE}/jobs`, {
    method: "POST",
    headers: ccHeaders,
    body: JSON.stringify({
      tasks: {
        "upload-docx": { operation: "import/upload" },
        "convert-pdf": {
          operation: "convert",
          input: "upload-docx",
          input_format: "docx",
          output_format: "pdf",
          engine: "libreoffice",
        },
        "export-pdf": { operation: "export/url", input: "convert-pdf" },
      },
    }),
  });
  if (!jobRes.ok) {
    return jerr(502, "CloudConvert: falha ao criar job", await jobRes.text());
  }
  const jobJson = await jobRes.json();
  const job = jobJson.data;
  const uploadTask = job.tasks.find((t: any) => t.name === "upload-docx");
  const uploadForm = uploadTask.result.form;

  // 5) Upload do .docx para o CloudConvert
  const fd = new FormData();
  for (const [k, v] of Object.entries(uploadForm.parameters as Record<string, string>)) {
    fd.append(k, v);
  }
  fd.append("file", docxBlob, "template.docx");
  const upRes = await fetch(uploadForm.url, { method: "POST", body: fd });
  if (!upRes.ok && upRes.status !== 201) {
    return jerr(502, "CloudConvert: falha no upload", await upRes.text());
  }

  // 6) Aguardar job concluir (polling)
  let exportUrl: string | null = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetch(`${CLOUDCONVERT_BASE}/jobs/${job.id}`, { headers: ccHeaders });
    if (!st.ok) continue;
    const stJson = await st.json();
    const status = stJson.data.status;
    if (status === "error") {
      return jerr(502, "CloudConvert: job error", stJson.data);
    }
    if (status === "finished") {
      const exp = stJson.data.tasks.find((t: any) => t.name === "export-pdf");
      exportUrl = exp?.result?.files?.[0]?.url ?? null;
      break;
    }
  }
  if (!exportUrl) return jerr(504, "CloudConvert: timeout aguardando conversão");

  // 7) Baixar PDF resultante
  const pdfRes = await fetch(exportUrl);
  if (!pdfRes.ok) return jerr(502, "Falha ao baixar PDF do CloudConvert");
  const pdfBuf = new Uint8Array(await pdfRes.arrayBuffer());

  // 8) Subir PDF no storage
  const pdfPath = `previews/${templateId}-${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(pdfPath, pdfBuf, { contentType: "application/pdf", upsert: true });
  if (upErr) return jerr(500, "Falha ao salvar PDF no storage", upErr);

  // 9) Atualizar template
  await supabase
    .from("propostas_templates")
    .update({ arquivo_pdf_path: pdfPath })
    .eq("id", templateId);

  // 10) Signed URL + base64 (para uso em blob URL no front, evita bloqueio do Chrome)
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(pdfPath, 60 * 60);
  const pdfBase64 = btoa(String.fromCharCode(...pdfBuf));

  return new Response(
    JSON.stringify({
      pdf_path: pdfPath,
      signed_url: signed?.signedUrl ?? null,
      pdf_base64: pdfBase64,
      cached: false,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
