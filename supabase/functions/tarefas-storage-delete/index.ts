// tarefas-storage-delete
// ----------------------------------------------------------------------------
// Soft delete por padrão (preferível). Hard delete (provider + linha) só admin
// quando ?hard=1.
// ----------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getStorageProvider } from '../_shared/tarefas_storage_provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_auth' }, 401);

  let body: { anexo_id?: string; hard?: boolean };
  try { body = await req.json(); } catch { return json({ error: 'invalid_body' }, 400); }
  const anexoId = body.anexo_id;
  const hard = !!body.hard;
  if (!anexoId) return json({ error: 'missing_anexo_id' }, 400);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: 'invalid_user' }, 401);

    const { data: profile } = await userClient
      .from('profiles').select('id').eq('user_id', userRes.user.id).maybeSingle();
    if (!profile) return json({ error: 'profile_not_found' }, 403);

    const { data: isAdminData } = await userClient.rpc('is_admin', { _user_id: userRes.user.id });
    const isAdmin = !!isAdminData;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: anexo, error } = await admin
      .from('tarefas_anexos')
      .select('id, provider, provider_file_id, uploaded_by, deleted_at')
      .eq('id', anexoId)
      .maybeSingle();
    if (error || !anexo) return json({ error: 'not_found' }, 404);

    const isOwner = anexo.uploaded_by === profile.id;
    if (!isAdmin && !isOwner) return json({ error: 'forbidden' }, 403);

    if (hard) {
      if (!isAdmin) return json({ error: 'forbidden_hard_delete' }, 403);
      try {
        const provider = getStorageProvider(anexo.provider);
        await provider.remove(anexo.provider_file_id);
      } catch (e) {
        // log mas segue: registro do banco será removido mesmo assim
        console.error('provider remove failed', e);
      }
      const { error: delErr } = await admin.from('tarefas_anexos').delete().eq('id', anexoId);
      if (delErr) return json({ error: 'db_delete_failed', detail: delErr.message }, 500);
      return json({ ok: true, mode: 'hard' });
    }

    // soft delete
    if (anexo.deleted_at) return json({ ok: true, mode: 'soft', already: true });
    const { error: updErr } = await admin
      .from('tarefas_anexos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', anexoId);
    if (updErr) return json({ error: 'db_soft_delete_failed', detail: updErr.message }, 500);
    return json({ ok: true, mode: 'soft' });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
