import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, User, FileText, Pencil, Trash2, Lock, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ClientesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedId = searchParams.get("id");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ nome: "", cpf: "", rg: "", nome_mae: "", endereco: "", numero: "", cep: "", cidade: "", referencia: "" });

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ nome: "", cpf: "", rg: "", nome_mae: "", endereco: "", numero: "", cep: "", cidade: "", referencia: "" });

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

  // Contatos do cliente
  const { data: clienteContatos = [] } = useQuery({
    queryKey: ["cliente_contatos", selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data } = await supabase.from("cliente_contatos").select("*").eq("cliente_id", selectedId).order("created_at");
      return data || [];
    },
    enabled: !!selectedId,
  });

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
    if (!newForm.nome.trim()) { toast.error("Nome obrigatório"); return; }
    const { error } = await supabase.from("clientes").insert({
      nome: newForm.nome.trim(), cpf: newForm.cpf.trim() || null, rg: newForm.rg.trim() || null,
      nome_mae: newForm.nome_mae.trim() || null, endereco: newForm.endereco.trim() || null,
      numero: newForm.numero.trim() || null, cep: newForm.cep.trim() || null,
      cidade: newForm.cidade.trim() || null, referencia: newForm.referencia.trim() || null,
    });
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Cliente criado!");
    setShowNew(false);
    setNewForm({ nome: "", cpf: "", rg: "", nome_mae: "", endereco: "", numero: "", cep: "", cidade: "", referencia: "" });
    refetch();
  };

  const openEdit = () => {
    if (!selectedCliente) return;
    setEditForm({
      nome: selectedCliente.nome || "",
      cpf: selectedCliente.cpf || "",
      rg: selectedCliente.rg || "",
      nome_mae: selectedCliente.nome_mae || "",
      endereco: selectedCliente.endereco || "",
      numero: selectedCliente.numero || "",
      cep: selectedCliente.cep || "",
      cidade: selectedCliente.cidade || "",
      referencia: selectedCliente.referencia || "",
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!selectedId || !editForm.nome.trim()) { toast.error("Nome obrigatório"); return; }
    const { error } = await supabase.from("clientes").update({
      nome: editForm.nome.trim(), cpf: editForm.cpf.trim() || null, rg: editForm.rg.trim() || null,
      nome_mae: editForm.nome_mae.trim() || null, endereco: editForm.endereco.trim() || null,
      numero: editForm.numero.trim() || null, cep: editForm.cep.trim() || null,
      cidade: editForm.cidade.trim() || null, referencia: editForm.referencia.trim() || null,
    }).eq("id", selectedId);
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
      await supabase.from("ordens_servico").update({ cliente_id: null, cliente_nome: null } as any).eq("cliente_id", selectedId!);
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

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) => (
    value ? (
      <div className="flex items-start gap-2">
        <span className="text-caption text-muted-foreground min-w-[90px] shrink-0">{label}:</span>
        <span className="text-body text-foreground">{value}</span>
      </div>
    ) : null
  );

  const FormFields = ({ form, setForm }: { form: typeof editForm; setForm: (f: typeof editForm) => void }) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo" /></div>
        <div><Label>CPF</Label><Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>RG</Label><Input value={form.rg} onChange={e => setForm({ ...form, rg: e.target.value })} placeholder="RG" /></div>
        <div><Label>Nome da Mãe</Label><Input value={form.nome_mae} onChange={e => setForm({ ...form, nome_mae: e.target.value })} placeholder="Nome da mãe" /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2"><Label>Endereço</Label><Input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} placeholder="Rua / Avenida" /></div>
        <div><Label>Nº</Label><Input value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} placeholder="Nº" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>CEP</Label><Input value={form.cep} onChange={e => setForm({ ...form, cep: e.target.value })} placeholder="00000-000" /></div>
        <div><Label>Cidade</Label><Input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} placeholder="Cidade" /></div>
      </div>
      <div><Label>Referência</Label><Input value={form.referencia} onChange={e => setForm({ ...form, referencia: e.target.value })} placeholder="Ponto de referência" /></div>
    </div>
  );

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

              <Tabs defaultValue="dados" className="p-4">
                <TabsList>
                  <TabsTrigger value="dados">Dados Cadastrais</TabsTrigger>
                  <TabsTrigger value="os">OS ({osDoCliente.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="dados" className="mt-3 space-y-4">
                  {/* Documentos */}
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <h3 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" /> Documentos
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      <InfoRow label="CPF" value={selectedCliente.cpf} />
                      <InfoRow label="RG" value={selectedCliente.rg} />
                      <InfoRow label="Nome da Mãe" value={selectedCliente.nome_mae} />
                    </div>
                    {!selectedCliente.cpf && !selectedCliente.rg && !selectedCliente.nome_mae && (
                      <p className="text-caption text-muted-foreground italic">Nenhum documento cadastrado.</p>
                    )}
                  </div>

                  {/* Endereço */}
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <h3 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Endereço
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      <InfoRow label="Endereço" value={selectedCliente.endereco} />
                      <InfoRow label="Número" value={selectedCliente.numero} />
                      <InfoRow label="CEP" value={selectedCliente.cep} />
                      <InfoRow label="Cidade" value={selectedCliente.cidade} />
                      <InfoRow label="Referência" value={selectedCliente.referencia} />
                    </div>
                    {!selectedCliente.endereco && !selectedCliente.cep && !selectedCliente.cidade && (
                      <p className="text-caption text-muted-foreground italic">Nenhum endereço cadastrado.</p>
                    )}
                  </div>

                  {/* Contatos */}
                  {clienteContatos.length > 0 && (
                    <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                      <h3 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" /> Contatos
                      </h3>
                      <div className="space-y-1">
                        {clienteContatos.map((ct: any) => (
                          <div key={ct.id} className="flex items-center gap-2 text-body text-foreground">
                            <span>{ct.valor}</span>
                            {ct.tem_whatsapp && <span className="text-caption text-success font-medium">WhatsApp</span>}
                            <span className="text-caption text-muted-foreground">({ct.tipo})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

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
              <p className="text-body text-muted-foreground">Selecione um cliente para ver os dados.</p>
            </div>
          )}
        </div>
      </div>

      {/* Dialog novo cliente */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <FormFields form={newForm} setForm={setNewForm} />
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog editar cliente */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader><DialogTitle>Editar Cliente</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <FormFields form={editForm} setForm={setEditForm} />
          </ScrollArea>
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