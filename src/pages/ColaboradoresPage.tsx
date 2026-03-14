import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

const cargoConfig: Record<string, { label: string; badge: string; description: string }> = {
  administrador: { label: "Administrador", badge: "badge-complete", description: "Acesso total ao sistema" },
  avaliador: { label: "Avaliador", badge: "badge-active", description: "Executa avaliações de OS" },
  executor: { label: "Executor", badge: "badge-pending", description: "Realiza checklists operacionais" },
  gestor: { label: "Gestor", badge: "badge-pending", description: "Monitora tarefas e indicadores" },
  atendente: { label: "Atendente", badge: "badge-expired", description: "Atendimento ao cliente" },
  tecnico: { label: "Técnico", badge: "badge-expired", description: "Suporte técnico" },
};

export default function ColaboradoresPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("atendente");
  const [selectedSetores, setSelectedSetores] = useState<string[]>([]);
  const [senha, setSenha] = useState("");
  const [selectedTiposServico, setSelectedTiposServico] = useState<string[]>([]);

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*, setores(nome)").order("nome");
      if (error) throw error;
      // Load multi-setor data for all profiles
      const { data: allSetorLinks } = await supabase
        .from("colaborador_setores")
        .select("profile_id, setores(nome)");
      const setorMap = new Map<string, string[]>();
      allSetorLinks?.forEach((link: any) => {
        const list = setorMap.get(link.profile_id) || [];
        if (link.setores?.nome) list.push(link.setores.nome);
        setorMap.set(link.profile_id, list);
      });
      return data.map((p: any) => ({
        ...p,
        _setoresNomes: setorMap.get(p.id) || (p.setores?.nome ? [p.setores.nome] : []),
      }));
    },
  });

  const { data: setores = [] } = useQuery({
    queryKey: ["setores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: tiposServico = [] } = useQuery({
    queryKey: ["tipos_servico_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tipos_servico").select("*, setores:setor_id(nome)").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  // Load assigned tipos and setores when editing
  useEffect(() => {
    if (!editing) return;
    // Load setores
    supabase
      .from("colaborador_setores")
      .select("setor_id")
      .eq("profile_id", editing.id)
      .then(({ data }) => {
        setSelectedSetores(data?.map((d) => d.setor_id) || []);
      });
    // Load tipos if avaliador
    if (cargo === "avaliador") {
      supabase
        .from("avaliador_tipos_servico")
        .select("tipo_servico_id")
        .eq("avaliador_id", editing.id)
        .then(({ data }) => {
          setSelectedTiposServico(data?.map((d) => d.tipo_servico_id) || []);
        });
    }
  }, [editing, cargo]);

  const syncRole = async (userId: string, cargo: string) => {
    const { error } = await supabase.rpc("sync_user_role", { _user_id: userId, _cargo: cargo });
    if (error) console.error("Erro ao sincronizar role:", error.message);
  };

  const saveSetores = async (profileId: string) => {
    const { error: delError } = await supabase.from("colaborador_setores").delete().eq("profile_id", profileId);
    if (delError) {
      console.error("Erro ao limpar setores:", delError.message);
      throw new Error("Erro ao salvar setores: " + delError.message);
    }
    if (selectedSetores.length > 0) {
      const rows = selectedSetores.map((sid) => ({ profile_id: profileId, setor_id: sid }));
      const { error: insError } = await supabase.from("colaborador_setores").insert(rows);
      if (insError) {
        console.error("Erro ao inserir setores:", insError.message);
        throw new Error("Erro ao salvar setores: " + insError.message);
      }
    }
    // Also update the legacy setor_id field with the first setor for backward compat
    await supabase.from("profiles").update({ setor_id: selectedSetores[0] || null }).eq("id", profileId);
  };

  const saveTiposServico = async (profileId: string) => {
    await supabase.from("avaliador_tipos_servico").delete().eq("avaliador_id", profileId);
    if (selectedTiposServico.length > 0) {
      const rows = selectedTiposServico.map((tid) => ({
        avaliador_id: profileId,
        tipo_servico_id: tid,
      }));
      await supabase.from("avaliador_tipos_servico").insert(rows);
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { nome } },
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error("Erro ao criar usuário.");

      await new Promise((r) => setTimeout(r, 1000));

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ cargo, setor_id: selectedSetores[0] || null })
        .eq("user_id", authData.user.id);
      if (updateError) throw updateError;

      await syncRole(authData.user.id, cargo);

      const { data: createdProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", authData.user.id)
        .single();

      if (createdProfile) {
        await saveSetores(createdProfile.id);
        if (cargo === "avaliador") await saveTiposServico(createdProfile.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Colaborador criado com sucesso.");
      closeDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase.from("profiles").update({
        nome, cargo, setor_id: selectedSetores[0] || null,
      }).eq("id", editing.id);
      if (error) throw error;

      await syncRole(editing.user_id, cargo);
      await saveSetores(editing.id);

      // Save tipos de serviço if avaliador
      if (cargo === "avaliador") {
        await saveTiposServico(editing.id);
      } else {
        // Remove any existing tipo assignments if no longer avaliador
        await supabase.from("avaliador_tipos_servico").delete().eq("avaliador_id", editing.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Colaborador atualizado.");
      closeDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async (p: Profile) => {
      const { error } = await supabase.from("profiles").update({ ativo: !p.ativo }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profiles"] }),
    onError: (err: any) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Colaborador excluído.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditing(null); setNome(""); setEmail(""); setCargo("atendente"); setSelectedSetores([]); setSenha("");
    setSelectedTiposServico([]);
    setDialogOpen(true);
  };
  const openEdit = (p: Profile) => {
    setEditing(p); setNome(p.nome); setEmail(p.email); setCargo(p.cargo || "atendente"); setSelectedSetores([]);
    setSelectedTiposServico([]);
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  const handleSubmit = () => {
    if (editing) update.mutate();
    else create.mutate();
  };

  const toggleTipoServico = (id: string) => {
    setSelectedTiposServico((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const isSubmitting = create.isPending || update.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Colaboradores</h1>
          <p className="text-body text-muted-foreground">Gerencie os colaboradores e suas permissões.</p>
        </div>
        <Button onClick={openCreate} className="press-effect">
          <Plus className="w-4 h-4 mr-2" /> Novo Colaborador
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nome</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Email</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cargo</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Setor</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando...</td></tr>
              ) : profiles.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhum colaborador cadastrado.</td></tr>
              ) : profiles.map((p) => {
                const cfg = cargoConfig[p.cargo || ""] || { label: p.cargo || "—", badge: "badge-expired" };
                return (
                  <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-body font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        {p.cargo === "administrador" && <ShieldCheck className="w-4 h-4 text-success shrink-0" />}
                        {p.nome}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{p.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{(p as any).setores?.nome || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${p.ativo ? "badge-complete" : "badge-expired"}`}>{p.ativo ? "Ativo" : "Inativo"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => toggleAtivo.mutate(p)} className="press-effect">{p.ativo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}</Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="press-effect"><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => remove.mutate(p.id)} className="press-effect text-destructive"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Colaborador" : "Novo Colaborador"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required disabled={!!editing} className={editing ? "bg-muted" : ""} />
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label>Senha</Label>
                <Input value={senha} onChange={(e) => setSenha(e.target.value)} type="password" required minLength={6} placeholder="Mínimo 6 caracteres" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Cargo / Permissão</Label>
              <Select value={cargo} onValueChange={(v) => { setCargo(v); if (v !== "avaliador") setSelectedTiposServico([]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(cargoConfig).map(([value, cfg]) => (
                    <SelectItem key={value} value={value}>
                      <span>{cfg.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">{cargoConfig[cargo]?.description || ""}</p>
            </div>
            <div className="space-y-2">
              <Label>Setores</Label>
              <p className="text-caption text-muted-foreground">Selecione os setores deste colaborador.</p>
              <div className="border border-border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                {setores.length === 0 ? (
                  <p className="text-caption text-muted-foreground text-center py-2">Nenhum setor cadastrado.</p>
                ) : setores.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                    <Checkbox
                      checked={selectedSetores.includes(s.id)}
                      onCheckedChange={() => {
                        setSelectedSetores((prev) => {
                          const next = prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id];
                          // Remove tipos that no longer belong to any selected setor
                          setSelectedTiposServico((prevTipos) =>
                            prevTipos.filter((tid) => {
                              const tipo = tiposServico.find((t) => t.id === tid);
                              return tipo?.setor_id && next.includes(tipo.setor_id);
                            })
                          );
                          return next;
                        });
                      }}
                    />
                    <span className="text-body font-medium text-foreground">{s.nome}</span>
                  </label>
                ))}
              </div>
              {selectedSetores.length > 0 && (
                <p className="text-caption text-muted-foreground">{selectedSetores.length} setor(es) selecionado(s)</p>
              )}
            </div>

            {/* Tipos de Serviço para Avaliador */}
            {cargo === "avaliador" && (
              <div className="space-y-2">
                <Label>Tipos de Serviço Atribuídos</Label>
                <p className="text-caption text-muted-foreground">
                  {selectedSetores.length === 0
                    ? "Selecione ao menos um setor acima para ver os tipos de serviço disponíveis."
                    : "Selecione os tipos de serviço que este avaliador poderá avaliar."}
                </p>
                <div className="border border-border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                  {selectedSetores.length === 0 ? (
                    <p className="text-caption text-muted-foreground text-center py-2">Nenhum setor selecionado.</p>
                  ) : tiposServico.filter((ts) => ts.setor_id && selectedSetores.includes(ts.setor_id)).length === 0 ? (
                    <p className="text-caption text-muted-foreground text-center py-2">Nenhum tipo de serviço para os setores selecionados.</p>
                  ) : tiposServico.filter((ts) => ts.setor_id && selectedSetores.includes(ts.setor_id)).map((ts) => (
                    <label key={ts.id} className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                      <Checkbox
                        checked={selectedTiposServico.includes(ts.id)}
                        onCheckedChange={() => toggleTipoServico(ts.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-body font-medium text-foreground">{ts.nome}</span>
                        <span className="text-caption text-muted-foreground ml-2">({(ts as any).setores?.nome || "Sem setor"})</span>
                      </div>
                    </label>
                  ))}
                </div>
                {selectedTiposServico.length > 0 && (
                  <p className="text-caption text-muted-foreground">{selectedTiposServico.length} tipo(s) selecionado(s)</p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} className="press-effect">{isSubmitting ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
