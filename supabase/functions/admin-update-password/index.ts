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

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: caller.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem alterar senhas." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { target_user_id, new_password } = await req.json();
    if (!target_user_id || !new_password || new_password.length < 6) {
      return new Response(JSON.stringify({ error: "Senha deve ter no mínimo 6 caracteres." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, { password: new_password });
    if (updateError) {
      console.error("[admin-update-password] updateUserById error:", {
        target_user_id,
        status: (updateError as any).status,
        code: (updateError as any).code,
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
      }

      return new Response(
        JSON.stringify({ error: friendly, details: updateError.message, code: (updateError as any).code ?? null }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[admin-update-password] unexpected error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
