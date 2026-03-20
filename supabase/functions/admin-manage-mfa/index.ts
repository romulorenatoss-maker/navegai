import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: caller.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem gerenciar 2FA." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { action, target_user_id } = body;

    if (action === "check") {
      // List MFA factors for the target user
      const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: target_user_id });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const verified = data?.factors?.filter((f: any) => f.status === "verified" && f.factor_type === "totp") || [];
      return new Response(JSON.stringify({ has_mfa: verified.length > 0, factors: verified.map((f: any) => ({ id: f.id })) }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unenroll") {
      // List and unenroll all TOTP factors
      const { data, error: listErr } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: target_user_id });
      if (listErr) {
        return new Response(JSON.stringify({ error: listErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const factors = data?.factors?.filter((f: any) => f.factor_type === "totp") || [];

      for (const f of factors) {
        const { error: deleteErr } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id });
        if (deleteErr) {
          return new Response(JSON.stringify({ error: deleteErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      return new Response(JSON.stringify({ success: true, removed: factors.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
