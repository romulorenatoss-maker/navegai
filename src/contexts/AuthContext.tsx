import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, Enums } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type AppRole = Enums<"app_role">;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  allowedScreens: string[];
  canViewPath: (path: string) => boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function AuthProviderInner({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [allowedScreens, setAllowedScreens] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin");

  const clearAuthState = useCallback(() => {
    setProfile(null);
    setRoles([]);
    setAllowedScreens([]);
  }, []);

  const canViewPath = useCallback((path: string): boolean => {
    if (isAdmin) return true;
    return allowedScreens.includes(path);
  }, [isAdmin, allowedScreens]);

  const fetchProfileAndRoles = useCallback(async (userId: string) => {
    // Timeout wrapper to prevent infinite loading when DB is unresponsive
    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout ao conectar com o banco")), ms)
        ),
      ]);

    const [profileRes, rolesRes] = await withTimeout(
      Promise.all([
        supabase
          .from("profiles")
          .select("id, user_id, nome, email, cargo, setor_id, ativo, pode_editar_avaliacoes, pode_excluir_avaliacoes, created_at, updated_at")
          .eq("user_id", userId)
          .single(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]),
      15000
    );

    if (profileRes.error) {
      clearAuthState();
      throw profileRes.error;
    }

    if (rolesRes.error) {
      clearAuthState();
      throw rolesRes.error;
    }

    const prof = profileRes.data as Profile;
    const { data: telas, error: telasError } = await withTimeout(
      supabase
        .from("permissoes_tela")
        .select("tela_path")
        .eq("profile_id", prof.id),
      10000
    );

    if (telasError) {
      clearAuthState();
      throw telasError;
    }

    setProfile(prof);
    setRoles((rolesRes.data ?? []).map((r) => r.role));
    setAllowedScreens((telas ?? []).map((t) => t.tela_path));
  }, [clearAuthState]);

  useEffect(() => {
    let isMounted = true;

    const syncAuthState = async (nextSession: Session | null) => {
      if (!isMounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        clearAuthState();
        setLoading(false);
        return;
      }

      try {
        await fetchProfileAndRoles(nextSession.user.id);
      } catch (err) {
        console.error("Erro ao carregar perfil/permissões:", err);
        clearAuthState();
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    // 1) Set up the listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        // Use setTimeout to avoid blocking the auth callback
        setTimeout(() => syncAuthState(nextSession), 0);
      }
    );

    // 2) Then get the initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncAuthState(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [clearAuthState, fetchProfileAndRoles]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, nome: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome } },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session, user, profile, roles, allowedScreens,
        canViewPath,
        loading, signIn, signUp, signOut, hasRole, isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function AuthProvider({ children }: { children: ReactNode }) {
  return <AuthProviderInner>{children}</AuthProviderInner>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
