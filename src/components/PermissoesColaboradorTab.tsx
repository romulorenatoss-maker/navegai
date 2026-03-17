import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Save, CheckCheck, Shield, Users } from "lucide-react";

type DataScopeValue = "none" | "own" | "team" | "all";
const SCOPE_LABELS: Record<DataScopeValue, string> = { none: "Nenhum", own: "Próprio", team: "Equipe", all: "Todos" };
const SCOPE_CYCLE: DataScopeValue[] = ["none", "own", "team", "all"];
const SCOPE_COLORS: Record<DataScopeValue, string> = {
  none: "text-muted-foreground bg-muted/30",
  own: "text-primary bg-primary/10",
  team: "text-amber-600 bg-amber-500/10",
  all: "text-emerald-600 bg-emerald-500/10",
};

const OVERRIDE_LABELS: Record<string, string> = {
  null: "Herdar",
  true: "Permitir",
  false: "Bloquear",
};

interface Resource {
  id: string;
  code: string;
  label: string;
  module: string;
  path: string | null;
}

interface GroupPerm {
  resource_id: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_assign: boolean;
  can_export: boolean;
  data_scope: DataScopeValue;
}

interface UserOverride {
  id: string;
  profile_id: string;
  resource_id: string;
  can_view: boolean | null;
  can_create: boolean | null;
  can_edit: boolean | null;
  can_delete: boolean | null;
  can_assign: boolean | null;
  can_export: boolean | null;
  data_scope: DataScopeValue | null;
}

interface Props {
  profileId: string;
  isAdminProfile: boolean;
}

const ACTIONS = ["can_view", "can_create", "can_edit", "can_delete", "can_assign", "can_export"] as const;
const ACTION_LABELS: Record<string, string> = {
  can_view: "Ver",
  can_create: "Criar",
  can_edit: "Editar",
  can_delete: "Excluir",
  can_assign: "Atribuir",
  can_export: "Exportar",
};

export default function PermissoesColaboradorTab({ profileId, isAdminProfile }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [localOverrides, setLocalOverrides] = useState<Map<string, Partial<UserOverride>>>(new Map());
  const [dirty, setDirty] = useState(false);

  // Fetch resources
  const { data: resources = [] } = useQuery({
    queryKey: ["perm-resources"],
    queryFn: async () => {
      const { data } = await supabase.from("permission_resources").select("*").order("module, label");
      return (data || []) as Resource[];
    },
  });

  // Fetch groups
  const { data: groups = [] } = useQuery({
    queryKey: ["perm-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("permission_groups").select("*").order("name");
      return data || [];
    },
  });

  // Fetch user's group assignment
  const { data: userAssignment, isLoading: loadingAssignment } = useQuery({
    queryKey: ["colab-group-assignment", profileId],
    queryFn: async () => {
      const { data } = await supabase.from("user_group_assignments").select("*").eq("profile_id", profileId);
      return data || [];
    },
  });

  // Fetch group permissions for the assigned group
  const { data: groupPerms = [] } = useQuery({
    queryKey: ["colab-group-perms", selectedGroupId],
    queryFn: async () => {
      if (!selectedGroupId) return [];
      const { data } = await supabase.from("group_permissions").select("*").eq("group_id", selectedGroupId);
      return (data || []) as GroupPerm[];
    },
    enabled: !!selectedGroupId,
  });

  // Fetch user overrides
  const { data: userOverrides = [], isLoading: loadingOverrides } = useQuery({
    queryKey: ["colab-user-overrides", profileId],
    queryFn: async () => {
      const { data } = await supabase.from("user_permission_overrides").select("*").eq("profile_id", profileId);
      return (data || []) as UserOverride[];
    },
  });

  // Set initial group from DB
  useEffect(() => {
    if (userAssignment?.length) {
      setSelectedGroupId(userAssignment[0].group_id);
    } else {
      setSelectedGroupId("");
    }
  }, [userAssignment]);

  // Initialize local overrides from DB
  useEffect(() => {
    const map = new Map<string, Partial<UserOverride>>();
    userOverrides.forEach((o) => {
      map.set(o.resource_id, { ...o });
    });
    setLocalOverrides(map);
    setDirty(false);
  }, [userOverrides]);

  const resourcesByModule = useMemo(() => {
    return resources.reduce<Record<string, Resource[]>>((acc, r) => {
      if (!acc[r.module]) acc[r.module] = [];
      acc[r.module].push(r);
      return acc;
    }, {});
  }, [resources]);

  // Get the group's base permission for a resource+action
  const getGroupValue = (resourceId: string, action: string): boolean => {
    const gp = groupPerms.find((p) => p.resource_id === resourceId);
    if (!gp) return false;
    return (gp as any)[action] ?? false;
  };

  const getGroupScope = (resourceId: string): DataScopeValue => {
    const gp = groupPerms.find((p) => p.resource_id === resourceId);
    return (gp?.data_scope as DataScopeValue) || "none";
  };

  // Get override value from local state
  const getOverrideValue = (resourceId: string, action: string): boolean | null => {
    const o = localOverrides.get(resourceId);
    if (!o) return null;
    return (o as any)[action] ?? null;
  };

  const getOverrideScope = (resourceId: string): DataScopeValue | null => {
    const o = localOverrides.get(resourceId);
    return o?.data_scope ?? null;
  };

  // Effective = override ?? group
  const getEffectiveValue = (resourceId: string, action: string): boolean => {
    const override = getOverrideValue(resourceId, action);
    if (override !== null) return override;
    return getGroupValue(resourceId, action);
  };

  const getEffectiveScope = (resourceId: string): DataScopeValue => {
    const override = getOverrideScope(resourceId);
    if (override !== null) return override;
    return getGroupScope(resourceId);
  };

  // Toggle override: cycle null → true → false → null
  const toggleOverride = (resourceId: string, action: string) => {
    setDirty(true);
    setLocalOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(resourceId) || {};
      const current = (existing as any)[action] ?? null;
      let newVal: boolean | null;
      if (current === null) newVal = true;
      else if (current === true) newVal = false;
      else newVal = null;
      next.set(resourceId, { ...existing, resource_id: resourceId, [action]: newVal });
      return next;
    });
  };

  // Cycle override scope: null → own → team → all → null
  const cycleOverrideScope = (resourceId: string) => {
    setDirty(true);
    setLocalOverrides((prev) => {
      const next = new Map(prev);
      const existing = next.get(resourceId) || {};
      const current = existing.data_scope ?? null;
      let newVal: DataScopeValue | null;
      if (current === null) newVal = "own";
      else if (current === "own") newVal = "team";
      else if (current === "team") newVal = "all";
      else if (current === "all") newVal = "none";
      else newVal = null;
      next.set(resourceId, { ...existing, resource_id: resourceId, data_scope: newVal });
      return next;
    });
  };

  const handleChangeGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Update group assignment
      await supabase.from("user_group_assignments").delete().eq("profile_id", profileId);
      if (selectedGroupId) {
        const { error } = await supabase.from("user_group_assignments").insert({
          profile_id: profileId,
          group_id: selectedGroupId,
        });
        if (error) throw error;
      }

      // 2. Update overrides
      await supabase.from("user_permission_overrides").delete().eq("profile_id", profileId);
      const overrideRows: any[] = [];
      localOverrides.forEach((o, resourceId) => {
        // Only save if there's at least one non-null value
        const hasOverride = ACTIONS.some((a) => (o as any)[a] !== null && (o as any)[a] !== undefined) || (o.data_scope !== null && o.data_scope !== undefined);
        if (hasOverride) {
          overrideRows.push({
            profile_id: profileId,
            resource_id: resourceId,
            can_view: (o as any).can_view ?? null,
            can_create: (o as any).can_create ?? null,
            can_edit: (o as any).can_edit ?? null,
            can_delete: (o as any).can_delete ?? null,
            can_assign: (o as any).can_assign ?? null,
            can_export: (o as any).can_export ?? null,
            data_scope: o.data_scope ?? null,
          });
        }
      });
      if (overrideRows.length > 0) {
        const { error } = await supabase.from("user_permission_overrides").insert(overrideRows);
        if (error) throw error;
      }

      toast.success("Permissões salvas com sucesso.");
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["colab-group-assignment", profileId] });
      queryClient.invalidateQueries({ queryKey: ["colab-user-overrides", profileId] });
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "falha"));
    } finally {
      setSaving(false);
    }
  };

  if (isAdminProfile) {
    return (
      <div className="p-4 bg-success/5 border border-success/20 rounded-lg text-center">
        <CheckCheck className="w-6 h-6 text-success mx-auto mb-2" />
        <p className="text-body font-medium text-foreground">Administradores têm acesso total</p>
        <p className="text-caption text-muted-foreground mt-1">Não é necessário configurar permissões para administradores.</p>
      </div>
    );
  }

  if (loadingAssignment || loadingOverrides) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const getOverrideBadge = (val: boolean | null) => {
    if (val === null) return <span className="text-[10px] text-muted-foreground">Herdar</span>;
    if (val === true) return <span className="text-[10px] text-emerald-600 font-semibold">Permitir</span>;
    return <span className="text-[10px] text-destructive font-semibold">Bloquear</span>;
  };

  return (
    <div className="space-y-4">
      {/* Group Assignment */}
      <div className="flex items-center gap-3 flex-wrap">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="text-body font-medium text-foreground">Grupo:</span>
        <Select value={selectedGroupId || "none"} onValueChange={(v) => handleChangeGroup(v === "none" ? "" : v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Sem grupo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem grupo</SelectItem>
            {groups.map((g: any) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedGroupId && (
          <Badge variant="secondary" className="text-caption">
            Base do grupo aplicada
          </Badge>
        )}
      </div>

      <p className="text-caption text-muted-foreground">
        Clique nas células para alternar: <span className="text-muted-foreground">Herdar</span> → <span className="text-emerald-600">Permitir</span> → <span className="text-destructive">Bloquear</span>. O resultado final combina grupo + ajustes individuais.
      </p>

      {/* Permissions Table */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 text-muted-foreground font-medium text-xs">Recurso</th>
              {ACTIONS.map((a) => (
                <th key={a} className="text-center px-2 py-2 text-muted-foreground font-medium text-xs w-16">{ACTION_LABELS[a]}</th>
              ))}
              <th className="text-center px-2 py-2 text-muted-foreground font-medium text-xs w-20">Escopo</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(resourcesByModule).map(([module, res]) => (
              <>
                <tr key={module}>
                  <td colSpan={8} className="px-3 py-1.5 bg-muted/20 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{module}</td>
                </tr>
                {res.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-3 py-1.5 text-foreground text-xs font-medium">{r.label}</td>
                    {ACTIONS.map((action) => {
                      const overrideVal = getOverrideValue(r.id, action);
                      const groupVal = getGroupValue(r.id, action);
                      const effective = getEffectiveValue(r.id, action);
                      return (
                        <td key={action} className="text-center px-2 py-1.5">
                          <button
                            onClick={() => toggleOverride(r.id, action)}
                            className={`w-full flex flex-col items-center gap-0.5 rounded px-1 py-0.5 transition-colors ${
                              overrideVal !== null ? "bg-muted/40" : ""
                            }`}
                            title={`Grupo: ${groupVal ? "Sim" : "Não"} | Override: ${overrideVal === null ? "Herdar" : overrideVal ? "Permitir" : "Bloquear"} | Efetivo: ${effective ? "Sim" : "Não"}`}
                          >
                            <span className={`w-3 h-3 rounded-full ${effective ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                            {getOverrideBadge(overrideVal)}
                          </button>
                        </td>
                      );
                    })}
                    <td className="text-center px-2 py-1.5">
                      {(() => {
                        const overrideScope = getOverrideScope(r.id);
                        const effectiveScope = getEffectiveScope(r.id);
                        return (
                          <button
                            onClick={() => cycleOverrideScope(r.id)}
                            className={`px-2 h-6 rounded text-[10px] font-semibold ${SCOPE_COLORS[effectiveScope]} hover:opacity-80 transition-opacity`}
                            title={`Grupo: ${SCOPE_LABELS[getGroupScope(r.id)]} | Override: ${overrideScope ? SCOPE_LABELS[overrideScope] : "Herdar"}`}
                          >
                            {SCOPE_LABELS[effectiveScope]}
                            {overrideScope !== null && <span className="ml-1 text-[8px]">✎</span>}
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving || !dirty} className="press-effect">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Permissões
        </Button>
      </div>
    </div>
  );
}
