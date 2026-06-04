import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

type MfaFactor = {
  id: string;
  status?: string;
  factor_type?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Configuração do servidor incompleta" }), { status: 500, headers: jsonHeaders });
    }

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user: caller },
      error: authError,
    } = await callerClient.auth.getUser();

    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });
    }

    const { data: isPlatformAdmin, error: adminCheckError } = await callerClient.rpc("security_is_platform_admin");

    if (adminCheckError || !isPlatformAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem gerenciar 2FA." }), { status: 403, headers: jsonHeaders });
    }

    const body = await req.json();
    const targetUserId = typeof body?.target_user_id === "string" ? body.target_user_id.trim() : "";
    const action = body?.action;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "Usuário alvo inválido." }), { status: 400, headers: jsonHeaders });
    }

    if (action === "check") {
      const { data, error } = await adminClient.auth.admin.mfa.listFactors({ userId: targetUserId });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: jsonHeaders });
      }

      const verified = (data?.factors as MfaFactor[] | undefined)?.filter((factor) => factor.status === "verified" && factor.factor_type === "totp") || [];

      return new Response(JSON.stringify({
        has_mfa: verified.length > 0,
        factors: verified.map((factor) => ({ id: factor.id })),
      }), { status: 200, headers: jsonHeaders });
    }

    if (action === "unenroll") {
      const { data, error: listErr } = await adminClient.auth.admin.mfa.listFactors({ userId: targetUserId });
      if (listErr) {
        return new Response(JSON.stringify({ error: listErr.message }), { status: 400, headers: jsonHeaders });
      }

      const factors = (data?.factors as MfaFactor[] | undefined)?.filter((factor) => factor.factor_type === "totp") || [];

      for (const factor of factors) {
        const { error: deleteErr } = await adminClient.auth.admin.mfa.deleteFactor({
          userId: targetUserId,
          id: factor.id,
        });

        if (deleteErr) {
          return new Response(JSON.stringify({ error: deleteErr.message }), { status: 400, headers: jsonHeaders });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        removed: factors.length,
        requires_reenroll: true,
      }), { status: 200, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: jsonHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno do servidor";
    console.error("admin-manage-mfa error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: jsonHeaders });
  }
});
