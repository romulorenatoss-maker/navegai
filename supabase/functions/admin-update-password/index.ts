import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type SupabaseAuthErrorDetails = Error & {
  status?: number;
  code?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Edge Function sem configuração de ambiente do Supabase." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Sessão expirada. Entre novamente e tente alterar a senha." }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return json({ error: "Não autorizado. Entre novamente e tente alterar a senha." }, 401);
    }

    const { data: isPlatformAdmin, error: platformAdminError } = await callerClient.rpc("security_is_platform_admin");
    let canUpdatePassword = !!isPlatformAdmin;

    if (platformAdminError) {
      const { data: isLegacyAdmin, error: legacyAdminError } = await supabaseAdmin.rpc("is_admin", {
        _user_id: caller.id,
      });
      if (legacyAdminError) {
        console.error("[admin-update-password] admin check error:", {
          platformAdminError,
          legacyAdminError,
        });
      }
      canUpdatePassword = !!isLegacyAdmin;
    }

    if (!canUpdatePassword) {
      return json({ error: "Apenas administradores podem alterar senhas." }, 403);
    }

    const payload = await req.json().catch(() => null) as {
      target_user_id?: string;
      new_password?: string;
    } | null;

    const targetUserId = payload?.target_user_id?.trim();
    const newPassword = payload?.new_password ?? "";

    if (!targetUserId) {
      return json(
        { error: "Colaborador sem usuário de acesso vinculado. Recrie ou vincule o login antes de alterar a senha." },
        400,
      );
    }

    if (!newPassword || newPassword.length < 6) {
      return json({ error: "Senha deve ter no mínimo 6 caracteres." }, 400);
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
    });
    if (updateError) {
      const updateErrorDetails = updateError as SupabaseAuthErrorDetails;
      console.error("[admin-update-password] updateUserById error:", {
        target_user_id: targetUserId,
        status: updateErrorDetails.status,
        code: updateErrorDetails.code,
        name: updateError.name,
        message: updateError.message,
      });

      const raw = (updateError.message || "").toLowerCase();
      let friendly = updateError.message;
      if (raw.includes("pwned") || raw.includes("known") || raw.includes("weak") || raw.includes("leaked")) {
        friendly = "Esta senha já vazou em incidentes públicos. Escolha uma senha diferente, com letras, números e símbolos.";
      } else if (raw.includes("password") && raw.includes("characters")) {
        friendly = "A senha não atende à política mínima de tamanho/complexidade. Use uma senha mais forte.";
      } else if (raw.includes("same_password")) {
        friendly = "A nova senha não pode ser igual à atual.";
      } else if (raw.includes("user not found") || raw.includes("not found")) {
        friendly = "Usuário de acesso do colaborador não foi encontrado no Auth do Supabase.";
      }

      return json({
        error: friendly,
        details: updateError.message,
        code: updateErrorDetails.code ?? null,
      }, 400);
    }

    return json({ success: true });
  } catch (err) {
    console.error("[admin-update-password] unexpected error:", err);
    return json({ error: "Erro inesperado ao alterar senha.", details: (err as Error).message }, 500);
  }
});
