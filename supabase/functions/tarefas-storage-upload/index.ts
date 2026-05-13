// tarefas-storage-upload
// ----------------------------------------------------------------------------
// Recebe multipart upload do frontend, faz upload via provider abstrato
// e persiste registro em public.tarefas_anexos.
// Nunca expõe provider_file_id como URL pública.
// ----------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  getStorageProvider,
  buildPathRelativo,
} from '../_shared/tarefas_storage_provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_CONTEXTS = new Set([
  'instrucao_etapa', 'instrucao_pergunta', 'resposta_executor',
  'evidencia', 'plano_acao', 'devolucao', 'aprovacao',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'missing_auth' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Cliente p/ identificar usuário
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: 'invalid_user' }, 401);

    // Profile
    const { data: profile } = await userClient
      .from('profiles').select('id').eq('user_id', userRes.user.id).maybeSingle();
    if (!profile) return json({ error: 'profile_not_found' }, 403);

    // Form data
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return json({ error: 'missing_file' }, 400);

    const contexto_tipo = String(form.get('contexto_tipo') ?? '');
    if (!VALID_CONTEXTS.has(contexto_tipo)) return json({ error: 'invalid_contexto_tipo' }, 400);

    const contexto_ref_id = (form.get('contexto_ref_id') as string) || null;
    const assignment_id   = (form.get('assignment_id')   as string) || null;
    const template_id     = (form.get('template_id')     as string) || null;
    const codigo_tarefa   = (form.get('codigo_tarefa')   as string) || 'SEM-CODIGO';
    const nome_tarefa     = (form.get('nome_tarefa')     as string) || 'sem-nome';
    const tipo_tarefa     = (form.get('tipo_tarefa')     as string) || 'template';

    const pathRelativo = buildPathRelativo({
      tipoTarefa: tipo_tarefa,
      codigoTarefa: codigo_tarefa,
      nomeTarefa: nome_tarefa,
      contexto: contexto_tipo,
      nomeArquivo: file.name,
    });

    const provider = getStorageProvider('google_drive');
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Lê root_folder_id da config (singleton por provider). SEM fallback.
    const { data: cfg } = await adminClient
      .from('tarefas_storage_config')
      .select('root_folder_id')
      .eq('provider', provider.name)
      .maybeSingle();
    if (!cfg?.root_folder_id) {
      return json({
        error: 'storage_not_configured',
        detail: 'Pasta-mãe do Drive ainda não configurada. Acesse Configurações → Integrações.',
      }, 412);
    }

    const buf = new Uint8Array(await file.arrayBuffer());
    const result = await provider.upload({
      pathRelativo,
      nomeOriginal: file.name,
      mimeType: file.type || 'application/octet-stream',
      conteudo: buf,
      rootFolderId: cfg.root_folder_id,
    });

    // Persistir com service_role (bypass RLS, mas registramos uploaded_by = profile.id)
    const { data: anexo, error: insErr } = await adminClient
      .from('tarefas_anexos')
      .insert({
        provider: provider.name,
        path_relativo: pathRelativo,
        provider_file_id: result.providerFileId,
        nome_original: file.name,
        mime_type: file.type || 'application/octet-stream',
        tamanho_bytes: result.tamanhoBytes,
        checksum: result.checksum ?? null,
        contexto_tipo,
        contexto_ref_id,
        assignment_id,
        template_id,
        uploaded_by: profile.id,
        metadados: result.metadados ?? {},
      })
      .select()
      .single();

    if (insErr) return json({ error: 'db_insert_failed', detail: insErr.message }, 500);

    return json({ ok: true, anexo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return json({ error: 'internal', detail: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
