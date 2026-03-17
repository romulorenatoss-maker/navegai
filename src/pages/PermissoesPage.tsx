import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, Users, Eye, PenLine, Plus, Trash2, Save, Lock } from "lucide-react";

interface Resource {
  id: string;
  code: string;
  label: string;
  module: string;
  path: string | null;
}

interface PermGroup {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
}

interface GroupPerm {
  id: string;
  group_id: string;
  resource_id: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

interface UserGroupAssignment {
  id: string;
  profile_id: string;
  group_id: string;
}

interface UserOverride {
  id: string;
  profile_id: string;
  resource_id: string;
  can_view: boolean | null;
  can_create: boolean | null;
  can_edit: boolean | null;
  can_delete: boolean | null;
}

export default function PermissoesPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [newGroupDialog, setNewGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");

  // Queries
  const { data: resources = [] } = useQuery({
    queryKey: ["perm-resources"],
    queryFn: async () => {
      const { data } = await supabase.from("permission_resources").select("*").order("module, label");
      return (data || []) as Resource[];
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["perm-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("permission_groups").select("*").order("name");
      return (data || []) as PermGroup[];
    },
  });

  const { data: groupPerms = [] } = useQuery({
    queryKey: ["perm-group-perms", selectedGroupId],
    queryFn: async () => {
      if (!selectedGroupId) return [];
      const { data } = await supabase.from("group_permissions").select("*").eq("group_id", selectedGroupId);
      return (data || []) as GroupPerm[];
    },
    enabled: !!selectedGroupId,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["perm-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome, cargo").eq("ativo", true).order("nome");
      return data || [];
    },
  });

  const { data: userAssignments = [] } = useQuery({
    queryKey: ["perm-user-assignments", selectedProfileId],
    queryFn: async () => {
      if (!selectedProfileId) return [];
      const { data } = await supabase.from("user_group_assignments").select("*").eq("profile_id", selectedProfileId);
      return (data || []) as UserGroupAssignment[];
    },
    enabled: !!selectedProfileId,
  });

  const { data: userOverrides = [] } = useQuery({
    queryKey: ["perm-user-overrides", selectedProfileId],
    queryFn: async () => {
      if (!selectedProfileId) return [];
      const { data } = await supabase.from("user_permission_overrides").select("*").eq("profile_id", selectedProfileId);
      return (data || []) as UserOverride[];
    },
    enabled: !!selectedProfileId,
  });

  // Mutations
  const toggleGroupPerm = useMutation({
    mutationFn: async ({ resourceId, action, value }: { resourceId: string; action: string; value: boolean }) => {
      const existing = groupPerms.find((gp) => gp.resource_id === resourceId);
      if (existing) {
        await supabase.from("group_permissions").update({ [action]: value }).eq("id", existing.id);
      } else {
        await supabase.from("group_permissions").insert({
          group_id: selectedGroupId,
          resource_id: resourceId,
          [action]: value,
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["perm-group-perms", selectedGroupId] }),
  });

  const createGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("permission_groups").insert({ name: newGroupName, description: newGroupDesc || null });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perm-groups"] });
      setNewGroupDialog(false);
      setNewGroupName("");
      setNewGroupDesc("");
      toast.success("Grupo criado!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteGroup = useMutation({
    mutationFn: async (groupId: string) => {
      await supabase.from("group_permissions").delete().eq("group_id", groupId);
      await supabase.from("user_group_assignments").delete().eq("group_id", groupId);
      await supabase.from("permission_groups").delete().eq("id", groupId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perm-groups"] });
      setSelectedGroupId("");
      toast.success("Grupo excluído!");
    },
  });

  const toggleUserGroup = useMutation({
    mutationFn: async ({ groupId, assigned }: { groupId: string; assigned: boolean }) => {
      if (assigned) {
        await supabase.from("user_group_assignments").delete().eq("profile_id", selectedProfileId).eq("group_id", groupId);
      } else {
        await supabase.from("user_group_assignments").insert({ profile_id: selectedProfileId, group_id: groupId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perm-user-assignments", selectedProfileId] });
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });
    },
  });

  const setUserOverride = useMutation({
    mutationFn: async ({ resourceId, action, value }: { resourceId: string; action: string; value: boolean | null }) => {
      const existing = userOverrides.find((o) => o.resource_id === resourceId);
      if (existing) {
        await supabase.from("user_permission_overrides").update({ [action]: value }).eq("id", existing.id);
      } else {
        await supabase.from("user_permission_overrides").insert({
          profile_id: selectedProfileId,
          resource_id: resourceId,
          [action]: value,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perm-user-overrides", selectedProfileId] });
      queryClient.invalidateQueries({ queryKey: ["effective-permissions"] });
    },
  });

  if (!isAdmin) {
    return <div className="p-6 text-muted-foreground">Acesso restrito a administradores.</div>;
  }

  const resourcesByModule = resources.reduce<Record<string, Resource[]>>((acc, r) => {
    if (!acc[r.module]) acc[r.module] = [];
    acc[r.module].push(r);
    return acc;
  }, {});

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  const getPermValue = (resourceId: string, action: keyof GroupPerm): boolean => {
    const perm = groupPerms.find((gp) => gp.resource_id === resourceId);
    return perm ? (perm[action] as boolean) : false;
  };

  const getOverrideValue = (resourceId: string, action: string): boolean | null => {
    const o = userOverrides.find((ov) => ov.resource_id === resourceId);
    if (!o) return null;
    return (o as any)[action] ?? null;
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Gestão de Permissões</h1>
      </div>

      <Tabs defaultValue="groups">
        <TabsList>
          <TabsTrigger value="groups" className="gap-1.5"><Users className="w-4 h-4" /> Grupos</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Eye className="w-4 h-4" /> Usuários</TabsTrigger>
        </TabsList>

        {/* GROUPS TAB */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Selecione um grupo" /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name} {g.is_system && <Badge variant="secondary" className="ml-1 text-[10px]">Sistema</Badge>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setNewGroupDialog(true)}>
              <Plus className="w-4 h-4 mr-1" /> Novo Grupo
            </Button>
            {selectedGroup && !selectedGroup.is_system && (
              <Button size="sm" variant="destructive" onClick={() => deleteGroup.mutate(selectedGroupId)}>
                <Trash2 className="w-4 h-4 mr-1" /> Excluir
              </Button>
            )}
          </div>

          {selectedGroupId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Permissões: {selectedGroup?.name}
                  {selectedGroup?.is_system && <Lock className="w-4 h-4 text-muted-foreground" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-3 py-2 text-muted-foreground font-medium">Módulo / Resource</th>
                        <th className="text-center px-3 py-2 text-muted-foreground font-medium w-20">Ver</th>
                        <th className="text-center px-3 py-2 text-muted-foreground font-medium w-20">Criar</th>
                        <th className="text-center px-3 py-2 text-muted-foreground font-medium w-20">Editar</th>
                        <th className="text-center px-3 py-2 text-muted-foreground font-medium w-20">Excluir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(resourcesByModule).map(([module, res]) => (
                        <>
                          <tr key={module}>
                            <td colSpan={5} className="px-3 py-1.5 bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{module}</td>
                          </tr>
                          {res.map((r) => (
                            <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                              <td className="px-3 py-2 text-foreground">{r.label}</td>
                              {(["can_view", "can_create", "can_edit", "can_delete"] as const).map((action) => (
                                <td key={action} className="text-center px-3 py-2">
                                  <Switch
                                    checked={getPermValue(r.id, action)}
                                    onCheckedChange={(v) => toggleGroupPerm.mutate({ resourceId: r.id, action, value: v })}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* USERS TAB */}
        <TabsContent value="users" className="space-y-4">
          <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.nome} ({p.cargo})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedProfileId && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Group assignments */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Grupos Atribuídos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {groups.map((g) => {
                    const assigned = userAssignments.some((a) => a.group_id === g.id);
                    return (
                      <div key={g.id} className="flex items-center justify-between py-1.5">
                        <span className="text-sm text-foreground">{g.name}</span>
                        <Switch checked={assigned} onCheckedChange={() => toggleUserGroup.mutate({ groupId: g.id, assigned })} />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* User overrides */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <PenLine className="w-4 h-4" /> Overrides (por usuário)
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Clique para alternar: herdar → permitir → bloquear</p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-2 py-1.5 text-muted-foreground font-medium text-xs">Resource</th>
                          <th className="text-center px-2 py-1.5 text-muted-foreground font-medium text-xs w-16">Ver</th>
                          <th className="text-center px-2 py-1.5 text-muted-foreground font-medium text-xs w-16">Criar</th>
                          <th className="text-center px-2 py-1.5 text-muted-foreground font-medium text-xs w-16">Editar</th>
                          <th className="text-center px-2 py-1.5 text-muted-foreground font-medium text-xs w-16">Excluir</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resources.map((r) => (
                          <tr key={r.id} className="border-b border-border/50">
                            <td className="px-2 py-1.5 text-foreground text-xs">{r.label}</td>
                            {(["can_view", "can_create", "can_edit", "can_delete"] as const).map((action) => {
                              const val = getOverrideValue(r.id, action);
                              const label = val === null ? "—" : val ? "✓" : "✗";
                              const cls = val === null ? "text-muted-foreground bg-muted/30" : val ? "text-success bg-success/10" : "text-destructive bg-destructive/10";
                              return (
                                <td key={action} className="text-center px-2 py-1.5">
                                  <button
                                    onClick={() => {
                                      const next = val === null ? true : val === true ? false : null;
                                      setUserOverride.mutate({ resourceId: r.id, action, value: next });
                                    }}
                                    className={`w-8 h-6 rounded text-xs font-bold ${cls} hover:opacity-80 transition-opacity`}
                                  >
                                    {label}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New Group Dialog */}
      <Dialog open={newGroupDialog} onOpenChange={setNewGroupDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Grupo de Permissão</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nome do grupo" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
            <Input placeholder="Descrição (opcional)" value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewGroupDialog(false)}>Cancelar</Button>
            <Button onClick={() => createGroup.mutate()} disabled={!newGroupName.trim()}>
              <Save className="w-4 h-4 mr-1" /> Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
