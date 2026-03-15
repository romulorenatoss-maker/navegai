import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, User, FileText, Pencil, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ClientesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedId = searchParams.get("id");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newCpf, setNewCpf] = useState("");

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editNome, setEditNome] = useState("");
  const [editCpf, setEditCpf] = useState("");

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { data: clientes = [], refetch } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("*").order("nome");
      return data || [];
    },
  });

  const selectedCliente = clientes.find((c: any) => c.id === selectedId);

  const { data: osDoCliente = [] } = useQuery({
    queryKey: ["os_cliente", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, status, created_at, tipo_servico_id, colaborador_avaliado_id, cliente_nome")
        .eq("cliente_id", selectedId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedId,
  });

  const { data: avaliacoesMap = {} } = useQuery({
    queryKey: ["avaliacoes_cliente", selectedId, osDoCliente],
    queryFn: async () => {
      if (!osDoCliente.length) return {};
      const osIds = osDoCliente.map((o: any) => o.id);
      const { data } = await supabase
        .from("avaliacoes")
        .select("ordem_servico_id, nota_final, concluida, created_at")
        .in("ordem_servico_id", osIds);
      const map: Record<string, any[]> = {};
      data?.forEach((a: any) => {
        if (!map[a.ordem_servico_id]) map[a.ordem_servico_id] = [];
        map[a.ordem_servico_id].push(a);
      });
      return map;
    },
    enabled: osDoCliente.length > 0,
  });

  const filtered = clientes.filter(
    (c: any) =>
      c.nome?.toLowerCase().includes(search.toLowerCase()) ||
      c.cpf?.includes(search)
  );

  const handleCreate = async () => {
    if (!newNome.trim()) { toast.error("Nome obrigatório"); return; }
    const { error } = await supabase.from("clientes").insert({ nome: newNome.trim(), cpf: newCpf.trim() || null });
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Cliente criado!");
    setShowNew(false);
    setNewNome("");
    setNewCpf("");
    refetch();
  };

  const openEdit = () => {
    if (!selectedCliente) return;
    setEditNome(selectedCliente.nome);
    setEditCpf(selectedCliente.cpf || "");
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!selectedId || !editNome.trim()) { toast.error("Nome obrigatório"); return; }
    const { error } = await supabase.from("clientes").update({ nome: editNome.trim(), cpf: editCpf.trim() || null }).eq("id", selectedId);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Cliente atualizado!");
    setEditOpen(false);
    refetch();
  };

  const openDelete = () => {
    setDeletePassword("");
    setDeleteError("");
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deletePassword.trim()) { setDeleteError("Informe sua senha."); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setDeleteError("Erro ao verificar usuário."); return; }
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: deletePassword });
    if (authErr) { setDeleteError("Senha incorreta."); return; }

    setDeleteLoading(true);
    try {
      // Nullify FK references in ordens_servico
      await supabase.from("ordens_servico").update({ cliente_id: null, cliente_nome: null } as any).eq("cliente_id", selectedId!);
      // Delete the cliente
      const { error } = await supabase.from("clientes").delete().eq("id", selectedId!);
      if (error) throw error;
      toast.success("Cliente excluído.");
      setDeleteOpen(false);
      setSearchParams({});
      refetch();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const statusBadge: Record<string, string> = {
    aberta: "badge-pending",
    em_andamento: "badge-active",
    concluida: "badge-complete",
  };
  const statusText: Record<string, string> = {
    aberta: "Aberta",
    em_andamento: "Em andamento",
    concluida: "Concluída",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Clientes</h1>
          <p className="text-body text-muted-foreground">Cadastro e histórico de OS por cliente</p>
        </div>
        <Button onClick={() => setShowNew(true)} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Novo Cliente
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: client list */}
        <div className="lg:col-span-1 bg-card border border-border rounded-lg shadow-card">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou CPF..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
            {filtered.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setSearchParams({ id: c.id })}
                className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${selectedId === c.id ? "bg-primary/5 border-l-2 border-primary" : ""}`}
              >
                <p className="text-body font-medium text-foreground">{c.nome}</p>
                {c.cpf && <p className="text-caption text-muted-foreground">{c.cpf}</p>}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-4 py-8 text-center text-body text-muted-foreground">Nenhum cliente encontrado.</p>
            )}
          </div>
        </div>

        {/* Right: client detail */}
        <div className="lg:col-span-2">
          {selectedCliente ? (
            <div className="bg-card border border-border rounded-lg shadow-card">
              <div className="p-4 border-b border-border flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-body font-semibold text-foreground">{selectedCliente.nome}</h2>
                  <p className="text-caption text-muted-foreground">{selectedCliente.cpf || "Sem CPF"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={openEdit} className="press-effect">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={openDelete} className="press-effect text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <Tabs defaultValue="os" className="p-4">
                <TabsList>
                  <TabsTrigger value="os">Ordens de Serviço ({osDoCliente.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="os">
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">OS</th>
                          <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Status</th>
                          <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Data</th>
                          <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Nota</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {osDoCliente.map((os: any) => {
                          const avals = (avaliacoesMap as any)[os.id] || [];
                          const concluidas = avals.filter((a: any) => a.concluida);
                          const avgNota = concluidas.length > 0
                            ? (concluidas.reduce((s: number, a: any) => s + (a.nota_final || 0), 0) / concluidas.length)
                            : null;
                          return (
                            <tr key={os.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/avaliacoes/pesquisa?os=${os.numero_os}`)}>
                              <td className="px-3 py-2 text-body font-medium text-primary underline underline-offset-2 font-tabular">{os.numero_os}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${statusBadge[os.status]}`}>
                                  {statusText[os.status]}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-body text-muted-foreground font-tabular">
                                {new Date(os.created_at).toLocaleDateString("pt-BR")}
                              </td>
                              <td className="px-3 py-2 text-body font-medium font-tabular">
                                {avgNota !== null ? (
                                  <span className={avgNota >= 70 ? "text-success" : avgNota >= 50 ? "text-warning" : "text-destructive"}>
                                    {avgNota.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {osDoCliente.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-8 text-center text-body text-muted-foreground">Nenhuma OS vinculada a este cliente.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg shadow-card p-12 text-center">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-body text-muted-foreground">Selecione um cliente para ver o histórico de OS.</p>
            </div>
          )}
        </div>
      </div>

      {/* Dialog novo cliente */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={newNome} onChange={(e) => setNewNome(e.target.value)} placeholder="Nome do cliente" /></div>
            <div><Label>CPF</Label><Input value={newCpf} onChange={(e) => setNewCpf(e.target.value)} placeholder="000.000.000-00" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog editar cliente */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={editNome} onChange={(e) => setEditNome(e.target.value)} /></div>
            <div><Label>CPF</Label><Input value={editCpf} onChange={(e) => setEditCpf(e.target.value)} placeholder="000.000.000-00" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleEdit} className="press-effect">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog excluir cliente */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleteLoading) setDeleteOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Lock className="w-5 h-5" /> Excluir Cliente
            </DialogTitle>
            <DialogDescription>
              Esta ação é irreversível. O cliente <strong>{selectedCliente?.nome}</strong> será removido permanentemente. Confirme sua senha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <Input
                type="password"
                placeholder="Digite sua senha"
                value={deletePassword}
                onChange={e => { setDeletePassword(e.target.value); setDeleteError(""); }}
                onKeyDown={e => e.key === "Enter" && handleDelete()}
                autoFocus
              />
              {deleteError && <p className="text-caption text-destructive">{deleteError}</p>}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading || !deletePassword.trim()} className="press-effect">
              {deleteLoading ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
