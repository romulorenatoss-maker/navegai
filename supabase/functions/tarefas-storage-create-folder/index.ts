// ============================================================================
// tarefas-storage-create-folder
// ----------------------------------------------------------------------------
// POST -> cria (ou reusa, idempotente) uma pasta dentro da pasta-mãe
// configurada para o provider. Usado pelo botão "Criar pasta Tarefas no Drive"
// em /configuracoes > Armazenamento (TarefasConfigArmazenamento.tsx).
//
// Body:
//   {
//     provider?: string,        // default "google_drive"
//     root_folder_id: string,   // ID da pasta-mãe no Drive
//     folder_name: string,      // nome da pasta a criar (ex: "tarefas")
//   }
//
// Retorno em sucesso:
//   { ok: true, folder_id: string, folder_name: string, already_existed?: boolean }
//
// Acesso: admin only (igual aos outros tarefas-storage-*).
//
// Doc relacionada:
//   src/modules/tarefas/docs/tarefas_arquitetura_planos_acao.md
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { ensureFolderPath } from '../_shared/storage_providers/google_drive.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ---- Auth ----
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_auth' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: 'invalid_user' }, 401);

  const { data: isPlatformAdmin, error: adminCheckError } = await userClient.rpc('security_is_platform_admin');
  if (adminCheckError || !isPlatformAdmin) return json({ error: 'forbidden_admin_only' }, 403);

  // ---- Body ----
  let body: { provider?: string; root_folder_id?: string; folder_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const provider = (body.provider ?? 'google_drive').trim();
  const rootFolderId = (body.root_folder_id ?? '').trim();
  const folderName = (body.folder_name ?? '').trim();

  if (!rootFolderId) return json({ error: 'missing_root_folder_id' }, 400);
  if (!folderName) return json({ error: 'missing_folder_name' }, 400);

  if (provider !== 'google_drive') {
    return json({ error: 'unsupported_provider', detail: `Provider "${provider}" não suportado` }, 400);
  }

  // ---- Cria/reusa pasta no Drive ----
  // ensureFolderPath é find-or-create idempotente — chamadas repetidas devolvem
  // o mesmo folder_id sem criar duplicata.
  try {
    const folderId = await ensureFolderPath(rootFolderId, [folderName]);
    return json({ ok: true, folder_id: folderId, folder_name: folderName });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: 'create_folder_failed', detail: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
