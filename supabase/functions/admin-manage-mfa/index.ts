import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Configuração do servidor incompleta" }), { status: 500, headers: jsonHeaders });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
      error: authError,
    } = await supabaseAdmin.auth.getUser();

    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });
    }

    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("is_admin", { _user_id: caller.id });
    if (roleError || !isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem gerenciar 2FA." }), { status: 403, headers: jsonHeaders });
    }

    const body = await req.json();
    const targetUserId = typeof body?.target_user_id === "string" ? body.target_user_id.trim() : "";
    const action = body?.action;

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "Usuário alvo inválido." }), { status: 400, headers: jsonHeaders });
    }

    if (action === "check") {
      const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: targetUserId });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: jsonHeaders });
      }

      const verified = data?.factors?.filter((factor: any) => factor.status === "verified" && factor.factor_type === "totp") || [];

      return new Response(JSON.stringify({
        has_mfa: verified.length > 0,
        factors: verified.map((factor: any) => ({ id: factor.id })),
      }), { status: 200, headers: jsonHeaders });
    }

    if (action === "unenroll") {
      const { data, error: listErr } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: targetUserId });
      if (listErr) {
        return new Response(JSON.stringify({ error: listErr.message }), { status: 400, headers: jsonHeaders });
      }

      const factors = data?.factors?.filter((factor: any) => factor.factor_type === "totp") || [];

      for (const factor of factors) {
        const { error: deleteErr } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
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
