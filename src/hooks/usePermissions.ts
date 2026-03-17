import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DataScope = "none" | "own" | "team" | "all";

export interface EffectivePermission {
  resource_code: string;
  resource_path: string | null;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_assign: boolean;
  can_export: boolean;
  data_scope: DataScope;
}

export function usePermissions(profileId: string | null) {
  const { data: permissions = [], isLoading } = useQuery({
    queryKey: ["effective-permissions", profileId],
    queryFn: async () => {
      if (!profileId) return [];
      const { data, error } = await supabase.rpc("get_user_effective_permissions", {
        _profile_id: profileId,
      });
      if (error) throw error;
      return (data || []) as EffectivePermission[];
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
  });

  const can = (resourceCode: string, action: "view" | "create" | "edit" | "delete" | "assign" | "export"): boolean => {
    const perm = permissions.find((p) => p.resource_code === resourceCode);
    if (!perm) return false;
    switch (action) {
      case "view": return perm.can_view;
      case "create": return perm.can_create;
      case "edit": return perm.can_edit;
      case "delete": return perm.can_delete;
      case "assign": return perm.can_assign;
      case "export": return perm.can_export;
      default: return false;
    }
  };

  const canViewPath = (path: string): boolean => {
    const perm = permissions.find((p) => p.resource_path === path);
    return perm?.can_view ?? false;
  };

  const viewablePaths = permissions
    .filter((p) => p.can_view && p.resource_path)
    .map((p) => p.resource_path!);

  return { permissions, isLoading, can, canViewPath, viewablePaths };
}
