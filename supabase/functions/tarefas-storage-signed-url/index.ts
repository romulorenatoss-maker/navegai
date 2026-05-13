// tarefas-storage-signed-url
// ----------------------------------------------------------------------------
// Dois modos:
//   GET ?anexo_id=...                 -> valida acesso (RLS user) e devolve
//                                        URL temporária apontando p/ esta
//                                        mesma function com token assinado.
//   GET ?token=...                    -> stream do conteúdo via provider.
//
// URL nunca é pública: token assinado com SUPABASE_JWT_SECRET, expira em 5min.
// ----------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { create, verify, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';
import { getStorageProvider } from '../_shared/tarefas_storage_provider.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const TOKEN_TTL_SECONDS = 300; // 5 min

async function getSigningKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('SUPABASE_JWT_SECRET') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  // ----- Modo download (proxy stream) -----
  if (token) {
    try {
      const key = await getSigningKey();
      const payload = await verify(token, key) as { anexo_id: string };
      if (!payload.anexo_id) return json({ error: 'invalid_token' }, 401);

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const admin = createClient(supabaseUrl, serviceKey);
      const { data: anexo, error } = await admin
        .from('tarefas_anexos')
        .select('provider, provider_file_id, mime_type, nome_original, deleted_at')
        .eq('id', payload.anexo_id)
        .maybeSingle();
      if (error || !anexo || anexo.deleted_at) return json({ error: 'not_found' }, 404);

      const provider = getStorageProvider(anexo.provider);
      const stream = await provider.download(anexo.provider_file_id);
      return new Response(stream.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': stream.mimeType || anexo.mime_type || 'application/octet-stream',
          'Content-Disposition': `inline; filename="${encodeURIComponent(anexo.nome_original)}"`,
          'Cache-Control': 'private, max-age=60',
        },
      });
    } catch (e) {
      return json({ error: 'token_failed', detail: String(e) }, 401);
    }
  }

  // ----- Modo issue (gerar URL) -----
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_auth' }, 401);

  const anexoId = url.searchParams.get('anexo_id');
  if (!anexoId) return json({ error: 'missing_anexo_id' }, 400);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // RLS é quem decide se o usuário pode ver o anexo
    const { data: anexo, error } = await userClient
      .from('tarefas_anexos')
      .select('id, nome_original, mime_type, tamanho_bytes')
      .eq('id', anexoId)
      .maybeSingle();
    if (error || !anexo) return json({ error: 'forbidden_or_not_found' }, 403);

    const key = await getSigningKey();
    const jwt = await create(
      { alg: 'HS256', typ: 'JWT' },
      { anexo_id: anexo.id, exp: getNumericDate(TOKEN_TTL_SECONDS) },
      key,
    );

    const downloadUrl = `${supabaseUrl}/functions/v1/tarefas-storage-signed-url?token=${encodeURIComponent(jwt)}`;
    return json({
      ok: true,
      url: downloadUrl,
      expires_in: TOKEN_TTL_SECONDS,
      anexo,
    });
  } catch (e) {
    return json({ error: 'internal', detail: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
