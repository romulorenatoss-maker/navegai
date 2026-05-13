// tarefas-storage-config
// ----------------------------------------------------------------------------
// GET  -> lê config atual + valida acesso à pasta no provider.
// POST -> admin grava root_folder_id (valida no provider antes de salvar).
// ----------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getStorageProvider } from '../_shared/tarefas_storage_provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_auth' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: 'invalid_user' }, 401);

  const { data: isAdminData } = await userClient.rpc('is_admin', { _user_id: userRes.user.id });
  if (!isAdminData) return json({ error: 'forbidden_admin_only' }, 403);

  const admin = createClient(supabaseUrl, serviceKey);

  // -------- GET: lê + verifica --------
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider') ?? 'google_drive';

    const { data: cfg, error } = await admin
      .from('tarefas_storage_config')
      .select('*')
      .eq('provider', provider)
      .maybeSingle();
    if (error) return json({ error: 'db_read_failed', detail: error.message }, 500);
    if (!cfg) return json({ ok: true, configured: false, provider });

    let validation: { ok: boolean; folder_name?: string; error?: string };
    try {
      const info = await getStorageProvider(provider).inspectFolder(cfg.root_folder_id);
      validation = { ok: true, folder_name: info.name };
    } catch (e) {
      validation = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    return json({ ok: true, configured: true, config: cfg, validation });
  }

  // -------- POST: salva (com validação) --------
  if (req.method === 'POST') {
    let body: {
      provider?: string;
      root_folder_id?: string;
      root_folder_label?: string;
      root_folder_link?: string;
      limite_upload_mb?: number;
      tipos_permitidos?: string[];
      usar_proxy_visualizacao?: boolean;
      bloquear_link_direto?: boolean;
      permitir_download?: boolean;
      permitir_preview?: boolean;
      observacoes?: string;
    };
    try { body = await req.json(); } catch { return json({ error: 'invalid_body' }, 400); }

    const provider = body.provider ?? 'google_drive';
    const folderId = (body.root_folder_id ?? '').trim();
    if (!folderId) return json({ error: 'missing_root_folder_id' }, 400);

    // Valida no provider antes de gravar
    let folderName: string;
    let statusConexao: string;
    try {
      const info = await getStorageProvider(provider).inspectFolder(folderId);
      folderName = info.name;
      statusConexao = 'ok';
    } catch (e) {
      return json({ error: 'folder_validation_failed', detail: e instanceof Error ? e.message : String(e) }, 400);
    }

    const { data: profile } = await userClient
      .from('profiles').select('id').eq('user_id', userRes.user.id).maybeSingle();

    const upsertData: Record<string, unknown> = {
      provider,
      root_folder_id: folderId,
      root_folder_label: body.root_folder_label ?? folderName,
      updated_by: profile?.id ?? null,
      status_conexao: statusConexao,
      ultima_validacao_em: new Date().toISOString(),
    };
    if (body.root_folder_link !== undefined) upsertData.root_folder_link = body.root_folder_link || null;
    if (body.limite_upload_mb !== undefined) upsertData.limite_upload_mb = body.limite_upload_mb;
    if (body.tipos_permitidos !== undefined) upsertData.tipos_permitidos = body.tipos_permitidos;
    if (body.usar_proxy_visualizacao !== undefined) upsertData.usar_proxy_visualizacao = body.usar_proxy_visualizacao;
    if (body.bloquear_link_direto !== undefined) upsertData.bloquear_link_direto = body.bloquear_link_direto;
    if (body.permitir_download !== undefined) upsertData.permitir_download = body.permitir_download;
    if (body.permitir_preview !== undefined) upsertData.permitir_preview = body.permitir_preview;
    if (body.observacoes !== undefined) upsertData.observacoes = body.observacoes || null;

    const { data: saved, error } = await admin
      .from('tarefas_storage_config')
      .upsert(upsertData, { onConflict: 'provider' })
      .select()
      .single();
    if (error) return json({ error: 'db_save_failed', detail: error.message }, 500);

    return json({ ok: true, config: saved, validation: { ok: true, folder_name: folderName } });
  }

  return json({ error: 'method_not_allowed' }, 405);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
