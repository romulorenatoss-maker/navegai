import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { usePermissions, EffectivePermission, DataScope } from "@/hooks/usePermissions";

type Profile = Tables<"profiles">;
type AppRole = Enums<"app_role">;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  allowedScreens: string[];
  permissions: EffectivePermission[];
  permissionsLoading: boolean;
  can: (resourceCode: string, action: "view" | "create" | "edit" | "delete" | "assign" | "export") => boolean;
  getScope: (resourceCode: string) => DataScope;
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
  const [loading, setLoading] = useState(true);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin");

  // New RBAC permissions
  const { permissions, isLoading: permissionsLoading, can, canViewPath, getScope, viewablePaths } = usePermissions(profile?.id ?? null);

  // Backward-compatible allowedScreens derived from new RBAC
  const allowedScreens = isAdmin ? [] : viewablePaths;

  const fetchProfileAndRoles = async (userId: string) => {
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, user_id, nome, email, cargo, setor_id, ativo, pode_editar_avaliacoes, pode_excluir_avaliacoes, created_at, updated_at").eq("user_id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (profileRes.data) {
      setProfile(profileRes.data as Profile);
    }
    if (rolesRes.data) setRoles(rolesRes.data.map((r) => r.role));
  };

  useEffect(() => {
    let initialFetchDone = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          if (!initialFetchDone || _event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') {
            setTimeout(() => fetchProfileAndRoles(session.user.id), 0);
          }
        } else {
          setProfile(null);
          setRoles([]);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        initialFetchDone = true;
        fetchProfileAndRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
        permissions, permissionsLoading, can, canViewPath,
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
