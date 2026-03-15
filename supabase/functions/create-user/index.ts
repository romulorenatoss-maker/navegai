import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type CreateUserPayload = {
  email: string;
  password: string;
  nome: string;
  cargo?: string;
  setor_id?: string | null;
  setores_ids?: string[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(JSON.stringify({ error: "Configuração do servidor incompleta" }), { status: 500, headers: jsonHeaders });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: jsonHeaders });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: roleData, error: roleCheckError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleCheckError || !roleData) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar usuários" }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    const payload = (await req.json()) as CreateUserPayload;
    const email = payload.email?.trim().toLowerCase();
    const password = payload.password;
    const nome = payload.nome?.trim();
    const cargo = payload.cargo || "avaliado";
    const setoresIds = Array.isArray(payload.setores_ids) ? payload.setores_ids : [];
    const setorId = setoresIds[0] || payload.setor_id || null;

    if (!email || !password || !nome) {
      return new Response(JSON.stringify({ error: "Email, senha e nome são obrigatórios" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    let targetUserId: string | null = null;

    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (createError) {
      const isAlreadyRegistered =
        createError.message.toLowerCase().includes("already") ||
        createError.message.toLowerCase().includes("registered") ||
        createError.message.toLowerCase().includes("já");

      if (!isAlreadyRegistered) {
        return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: jsonHeaders });
      }

      const { data: usersPage, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) {
        return new Response(JSON.stringify({ error: "Erro ao recuperar usuário existente" }), {
          status: 500,
          headers: jsonHeaders,
        });
      }

      const existingUser = usersPage.users.find((u) => (u.email || "").toLowerCase() === email);
      if (!existingUser) {
        return new Response(JSON.stringify({ error: "Usuário já existe, mas não foi encontrado para vincular perfil" }), {
          status: 500,
          headers: jsonHeaders,
        });
      }

      targetUserId = existingUser.id;
    } else {
      targetUserId = createdUser.user.id;
      await new Promise((r) => setTimeout(r, 400));
    }

    const { data: existingProfile, error: profileFetchError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (profileFetchError) {
      return new Response(JSON.stringify({ error: "Erro ao verificar perfil do usuário" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    let profileId = existingProfile?.id || null;

    if (!profileId) {
      const { data: insertedProfile, error: profileInsertError } = await adminClient
        .from("profiles")
        .insert({
          user_id: targetUserId,
          nome,
          email,
          cargo,
          setor_id: setorId,
        })
        .select("id")
        .single();

      if (profileInsertError) {
        return new Response(JSON.stringify({ error: "Erro ao recriar perfil do usuário" }), {
          status: 500,
          headers: jsonHeaders,
        });
      }

      profileId = insertedProfile.id;

      // Default permission for new/recovered non-admin users
      await adminClient.from("permissoes_tela").insert({ profile_id: profileId, tela_path: "/avaliacoes/minhas" });
    }

    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({ nome, email, cargo, setor_id: setorId })
      .eq("id", profileId);

    if (profileUpdateError) {
      return new Response(JSON.stringify({ error: "Erro ao atualizar perfil do usuário" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const { error: syncRoleError } = await adminClient.rpc("sync_user_role", {
      _user_id: targetUserId,
      _cargo: cargo,
    });

    if (syncRoleError) {
      return new Response(JSON.stringify({ error: "Erro ao sincronizar permissões do usuário" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    await adminClient.from("colaborador_setores").delete().eq("profile_id", profileId);

    if (setoresIds.length > 0) {
      const rows = setoresIds.map((sid) => ({ profile_id: profileId, setor_id: sid }));
      const { error: setoresError } = await adminClient.from("colaborador_setores").insert(rows);

      if (setoresError) {
        return new Response(JSON.stringify({ error: "Usuário criado, mas houve erro ao vincular setores" }), {
          status: 500,
          headers: jsonHeaders,
        });
      }
    }

    return new Response(JSON.stringify({ user_id: targetUserId, profile_id: profileId }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (err) {
    console.error("Unexpected error in create-user:", err);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
