// Helper de autenticação compartilhado para edge functions de Propostas.
// Valida o JWT do chamador e confirma acesso ao módulo Propostas
// via RPC `propostas_user_has_access`.
//
// Uso:
//   const auth = await requirePropostasAccess(req, corsHeaders);
//   if (auth instanceof Response) return auth;
//   const { userId, supabase } = auth;

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface PropostasAuthOk {
  userId: string;
  supabase: SupabaseClient;
}

export async function requirePropostasAccess(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<PropostasAuthOk | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claimsData.claims.sub as string;

  const { data: hasAccess, error: rpcErr } = await userClient.rpc("propostas_user_has_access", {
    _user_id: userId,
  });
  if (rpcErr || hasAccess !== true) {
    return new Response(JSON.stringify({ error: "Forbidden: sem acesso ao módulo Propostas" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return { userId, supabase: userClient };
}
