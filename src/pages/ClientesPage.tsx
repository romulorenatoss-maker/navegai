import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, User, FileText, Pencil, Trash2, Lock, MapPin, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export default function ClientesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectedId = searchParams.get("id");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({
    tipo_pessoa: "PF" as "PF" | "PJ",
    nome: "", cpf: "", rg: "", nome_mae: "",
    cnpj: "", razao_social: "", nome_fantasia: "", inscricao_estadual: "", inscricao_municipal: "",
    numero: "", referencia: "",
  });
  const [newCidadeId, setNewCidadeId] = useState("");
  const [newBairroId, setNewBairroId] = useState("");
  const [newRuaId, setNewRuaId] = useState("");
  const [newBairroSearch, setNewBairroSearch] = useState("");
  const [newRuaSearch, setNewRuaSearch] = useState("");

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    tipo_pessoa: "PF" as "PF" | "PJ",
    nome: "", cpf: "", rg: "", nome_mae: "",
    cnpj: "", razao_social: "", nome_fantasia: "", inscricao_estadual: "", inscricao_municipal: "",
    numero: "", referencia: "",
  });
  const [editCidadeId, setEditCidadeId] = useState("");
  const [editBairroId, setEditBairroId] = useState("");
  const [editRuaId, setEditRuaId] = useState("");
  const [editBairroSearch, setEditBairroSearch] = useState("");
  const [editRuaSearch, setEditRuaSearch] = useState("");

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Address data
  const { data: endCidades = [] } = useQuery({
    queryKey: ["enderecos-cidades"],
    queryFn: async () => { const { data } = await supabase.from("cidades").select("*").order("nome"); return data || []; },
  });
  const { data: endBairros = [] } = useQuery({
    queryKey: ["enderecos-bairros"],
    queryFn: async () => { const { data } = await supabase.from("bairros").select("*").order("nome"); return data || []; },
  });
  const { data: endRuas = [] } = useQuery({
    queryKey: ["enderecos-ruas"],
    queryFn: async () => { const { data } = await supabase.from("ruas").select("*").order("nome"); return data || []; },
  });

  const { data: clientes = [], refetch } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("*").order("nome");
      return data || [];
    },
  });

  const selectedCliente: any = clientes.find((c: any) => c.id === selectedId);

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
      const { data } = await supabase.from("ordens_servico").select("id, numero_os, status, created_at, tipo_servico_id, colaborador_avaliado_id, cliente_nome").eq("cliente_id", selectedId).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedId,
  });

  const { data: avaliacoesMap = {} } = useQuery({
    queryKey: ["avaliacoes_cliente", selectedId, osDoCliente],
    queryFn: async () => {
      if (!osDoCliente.length) return {};
      const osIds = osDoCliente.map((o: any) => o.id);
      const { data } = await supabase.from("avaliacoes").select("ordem_servico_id, nota_final, concluida, created_at").in("ordem_servico_id", osIds);
      const map: Record<string, any[]> = {};
      data?.forEach((a: any) => { if (!map[a.ordem_servico_id]) map[a.ordem_servico_id] = []; map[a.ordem_servico_id].push(a); });
      return map;
    },
    enabled: osDoCliente.length > 0,
  });

  const filtered = clientes.filter((c: any) => c.nome?.toLowerCase().includes(search.toLowerCase()) || c.cpf?.includes(search));

  const handleCreate = async () => {
    if (!newForm.nome.trim()) { toast.error("Nome obrigatório"); return; }
    const isPJ = newForm.tipo_pessoa === "PJ";
    const { error } = await supabase.from("clientes").insert({
      tipo_pessoa: newForm.tipo_pessoa,
      nome: newForm.nome.trim(),
      cpf: !isPJ ? (newForm.cpf.trim() || null) : null,
      rg: !isPJ ? (newForm.rg.trim() || null) : null,
      nome_mae: !isPJ ? (newForm.nome_mae.trim() || null) : null,
      cnpj: isPJ ? (newForm.cnpj.trim() || null) : null,
      razao_social: isPJ ? (newForm.razao_social.trim() || null) : null,
      nome_fantasia: isPJ ? (newForm.nome_fantasia.trim() || null) : null,
      inscricao_estadual: isPJ ? (newForm.inscricao_estadual.trim() || null) : null,
      inscricao_municipal: isPJ ? (newForm.inscricao_municipal.trim() || null) : null,
      numero: newForm.numero.trim() || null,
      referencia: newForm.referencia.trim() || null,
      cidade_id: newCidadeId || null, bairro_id: newBairroId || null, rua_id: newRuaId || null,
    } as any);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Cliente criado!");
    setShowNew(false);
    setNewForm({
      tipo_pessoa: "PF", nome: "", cpf: "", rg: "", nome_mae: "",
      cnpj: "", razao_social: "", nome_fantasia: "", inscricao_estadual: "", inscricao_municipal: "",
      numero: "", referencia: "",
    });
    setNewCidadeId(""); setNewBairroId(""); setNewRuaId(""); setNewBairroSearch(""); setNewRuaSearch("");
    refetch();
  };

  const openEdit = () => {
    if (!selectedCliente) return;
    setEditForm({
      tipo_pessoa: (selectedCliente.tipo_pessoa as "PF" | "PJ") || "PF",
      nome: selectedCliente.nome || "",
      cpf: selectedCliente.cpf || "",
      rg: selectedCliente.rg || "",
      nome_mae: selectedCliente.nome_mae || "",
      cnpj: selectedCliente.cnpj || "",
      razao_social: selectedCliente.razao_social || "",
      nome_fantasia: selectedCliente.nome_fantasia || "",
      inscricao_estadual: selectedCliente.inscricao_estadual || "",
      inscricao_municipal: selectedCliente.inscricao_municipal || "",
      numero: selectedCliente.numero || "",
      referencia: selectedCliente.referencia || "",
    });
    setEditCidadeId(selectedCliente.cidade_id || "");
    setEditBairroId(selectedCliente.bairro_id || "");
    setEditRuaId(selectedCliente.rua_id || "");
    const bairro = endBairros.find(b => b.id === selectedCliente.bairro_id);
    const rua = endRuas.find(r => r.id === selectedCliente.rua_id);
    setEditBairroSearch(bairro?.nome || "");
    setEditRuaSearch(rua?.nome || "");
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!selectedId || !editForm.nome.trim()) { toast.error("Nome obrigatório"); return; }
    const isPJ = editForm.tipo_pessoa === "PJ";
    const { error } = await supabase.from("clientes").update({
      tipo_pessoa: editForm.tipo_pessoa,
      nome: editForm.nome.trim(),
      cpf: !isPJ ? (editForm.cpf.trim() || null) : null,
      rg: !isPJ ? (editForm.rg.trim() || null) : null,
      nome_mae: !isPJ ? (editForm.nome_mae.trim() || null) : null,
      cnpj: isPJ ? (editForm.cnpj.trim() || null) : null,
      razao_social: isPJ ? (editForm.razao_social.trim() || null) : null,
      nome_fantasia: isPJ ? (editForm.nome_fantasia.trim() || null) : null,
      inscricao_estadual: isPJ ? (editForm.inscricao_estadual.trim() || null) : null,
      inscricao_municipal: isPJ ? (editForm.inscricao_municipal.trim() || null) : null,
      numero: editForm.numero.trim() || null,
      referencia: editForm.referencia.trim() || null,
      cidade_id: editCidadeId || null, bairro_id: editBairroId || null, rua_id: editRuaId || null,
    } as any).eq("id", selectedId);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Cliente atualizado!");
    setEditOpen(false);
    refetch();
  };

  const openDelete = () => { setDeletePassword(""); setDeleteError(""); setDeleteOpen(true); };

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
    } catch (err: any) { toast.error("Erro: " + err.message); }
    finally { setDeleteLoading(false); }
  };

  const statusBadge: Record<string, string> = { aberta: "badge-pending", em_andamento: "badge-active", concluida: "badge-complete" };
  const statusText: Record<string, string> = { aberta: "Aberta", em_andamento: "Em andamento", concluida: "Concluída" };

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) => (
    value ? <div className="flex items-start gap-2"><span className="text-caption text-muted-foreground min-w-[90px] shrink-0">{label}:</span><span className="text-body text-foreground">{value}</span></div> : null
  );

  // Reusable address form with fuzzy search
  const AddressFields = ({ cidadeId, setCidadeId, bairroId, setBairroId, ruaId, setRuaId, bairroSearch, setBairroSearch, ruaSearch, setRuaSearch }: {
    cidadeId: string; setCidadeId: (v: string) => void;
    bairroId: string; setBairroId: (v: string) => void;
    ruaId: string; setRuaId: (v: string) => void;
    bairroSearch: string; setBairroSearch: (v: string) => void;
    ruaSearch: string; setRuaSearch: (v: string) => void;
  }) => {
    const filteredBairros = cidadeId && bairroSearch.length >= 2 && !bairroId
      ? endBairros.filter(b => b.cidade_id === cidadeId && b.nome.toLowerCase().includes(bairroSearch.toLowerCase()))
      : [];
    const filteredRuas = bairroId && ruaSearch.length >= 2 && !ruaId
      ? endRuas.filter(r => r.bairro_id === bairroId && r.nome.toLowerCase().includes(ruaSearch.toLowerCase()))
      : [];
    const showBairroNew = cidadeId && bairroSearch.trim().length >= 2 && !bairroId && !filteredBairros.some(b => b.nome.toLowerCase() === bairroSearch.trim().toLowerCase());
    const showRuaNew = bairroId && ruaSearch.trim().length >= 2 && !ruaId && !filteredRuas.some(r => r.nome.toLowerCase() === ruaSearch.trim().toLowerCase());

    const selectedRua = ruaId ? endRuas.find(r => r.id === ruaId) : null;
    const ruaCeps = selectedRua?.cep || [];

    return (
      <div className="space-y-2">
        <div>
          <Label className="text-xs">Cidade</Label>
          <Select value={cidadeId || "none"} onValueChange={v => { setCidadeId(v === "none" ? "" : v); setBairroId(""); setRuaId(""); setBairroSearch(""); setRuaSearch(""); }}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {endCidades.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Bairro</Label>
          <div className="relative">
            <Input className="h-8 text-xs" placeholder="Digite para buscar bairro..." value={bairroSearch}
              onChange={e => { setBairroSearch(e.target.value); setBairroId(""); setRuaId(""); setRuaSearch(""); }}
              disabled={!cidadeId} />
            {(filteredBairros.length > 0 || showBairroNew) && (
              <div className="absolute z-50 w-full bg-popover border border-border rounded-md shadow-md mt-0.5 max-h-32 overflow-y-auto">
                {filteredBairros.map(b => (
                  <button key={b.id} type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50"
                    onClick={() => { setBairroId(b.id); setBairroSearch(b.nome); }}>{b.nome}</button>
                ))}
                {showBairroNew && (
                  <button type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 text-primary font-medium"
                    onClick={async () => {
                      try {
                        const { data: nb, error } = await supabase.from("bairros").insert({ nome: bairroSearch.trim(), cidade_id: cidadeId }).select().single();
                        if (error) throw error;
                        queryClient.invalidateQueries({ queryKey: ["enderecos-bairros"] });
                        setBairroId(nb.id); setBairroSearch(nb.nome);
                        toast.success("Bairro criado!");
                      } catch (err: any) { toast.error(err.message); }
                    }}>
                    <Plus className="w-3 h-3 inline mr-1" /> Criar "{bairroSearch.trim()}"
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <div>
          <Label className="text-xs">Rua</Label>
          <div className="relative">
            <Input className="h-8 text-xs" placeholder="Digite para buscar rua..." value={ruaSearch}
              onChange={e => { setRuaSearch(e.target.value); setRuaId(""); }}
              disabled={!bairroId} />
            {(filteredRuas.length > 0 || showRuaNew) && (
              <div className="absolute z-50 w-full bg-popover border border-border rounded-md shadow-md mt-0.5 max-h-32 overflow-y-auto">
                {filteredRuas.map(r => (
                  <button key={r.id} type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50"
                    onClick={() => { setRuaId(r.id); setRuaSearch(r.nome); }}>{r.nome} {r.cep?.length ? `(${r.cep.join(", ")})` : ""}</button>
                ))}
                {showRuaNew && (
                  <button type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 text-primary font-medium"
                    onClick={async () => {
                      try {
                        const { data: nr, error } = await supabase.from("ruas").insert({ nome: ruaSearch.trim(), bairro_id: bairroId }).select().single();
                        if (error) throw error;
                        queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] });
                        setRuaId(nr.id); setRuaSearch(nr.nome);
                        toast.success("Rua criada!");
                      } catch (err: any) { toast.error(err.message); }
                    }}>
                    <Plus className="w-3 h-3 inline mr-1" /> Criar "{ruaSearch.trim()}"
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {/* CEPs da rua selecionada */}
        {ruaId && (
          <CepManager ruaId={ruaId} ceps={ruaCeps} />
        )}
      </div>
    );
  };

  // CEP manager for a rua
  const CepManager = ({ ruaId, ceps }: { ruaId: string; ceps: string[] }) => {
    const [newCep, setNewCep] = useState("");
    const addCep = async () => {
      const formatted = newCep.replace(/\D/g, "").slice(0, 8);
      if (formatted.length < 5) { toast.error("CEP muito curto"); return; }
      if (ceps.some(c => c.replace(/\D/g, "") === formatted)) { toast.error("CEP já vinculado"); return; }
      const updated = [...ceps, formatted];
      const { error } = await supabase.from("ruas").update({ cep: updated }).eq("id", ruaId);
      if (error) { toast.error(error.message); return; }
      queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] });
      setNewCep("");
      toast.success("CEP adicionado!");
    };
    const removeCep = async (cepToRemove: string) => {
      const updated = ceps.filter(c => c !== cepToRemove);
      const { error } = await supabase.from("ruas").update({ cep: updated }).eq("id", ruaId);
      if (error) { toast.error(error.message); return; }
      queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] });
      toast.success("CEP removido!");
    };
    return (
      <div className="space-y-1">
        <Label className="text-xs">CEPs vinculados</Label>
        <div className="flex flex-wrap gap-1">
          {ceps.length === 0 && <span className="text-xs text-muted-foreground italic">Nenhum CEP</span>}
          {ceps.map(c => (
            <Badge key={c} variant="secondary" className="text-xs gap-1">
              {c}
              <button type="button" onClick={() => removeCep(c)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-1">
          <Input className="h-7 text-xs flex-1" placeholder="Novo CEP..." value={newCep}
            onChange={e => setNewCep(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={e => e.key === "Enter" && addCep()} />
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addCep} disabled={newCep.replace(/\D/g, "").length < 5}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Clientes</h1>
          <p className="text-body text-muted-foreground">Cadastro e histórico de OS por cliente</p>
        </div>
        <Button onClick={() => setShowNew(true)} size="sm"><Plus className="w-4 h-4 mr-1" /> Novo Cliente</Button>
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
              <button key={c.id} onClick={() => setSearchParams({ id: c.id })}
                className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${selectedId === c.id ? "bg-primary/5 border-l-2 border-primary" : ""}`}>
                <p className="text-body font-medium text-foreground">{c.nome}</p>
                {c.cpf && <p className="text-caption text-muted-foreground">{c.cpf}</p>}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-4 py-8 text-center text-body text-muted-foreground">Nenhum cliente encontrado.</p>}
          </div>
        </div>

        {/* Right: client detail */}
        <div className="lg:col-span-2">
          {selectedCliente ? (
            <div className="bg-card border border-border rounded-lg shadow-card">
              <div className="p-4 border-b border-border flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><User className="w-5 h-5 text-primary" /></div>
                <div className="flex-1">
                  <h2 className="text-body font-semibold text-foreground">{selectedCliente.nome}</h2>
                  <p className="text-caption text-muted-foreground">{selectedCliente.cpf || "Sem CPF"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={openEdit} className="press-effect"><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={openDelete} className="press-effect text-destructive"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>

              <Tabs defaultValue="dados" className="p-4">
                <TabsList>
                  <TabsTrigger value="dados">Dados Cadastrais</TabsTrigger>
                  <TabsTrigger value="os">OS ({osDoCliente.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="dados" className="mt-3 space-y-4">
                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <h3 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Documentos</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      <InfoRow label="CPF" value={selectedCliente.cpf} />
                      <InfoRow label="RG" value={selectedCliente.rg} />
                      <InfoRow label="Nome da Mãe" value={selectedCliente.nome_mae} />
                    </div>
                    {!selectedCliente.cpf && !selectedCliente.rg && !selectedCliente.nome_mae && <p className="text-caption text-muted-foreground italic">Nenhum documento cadastrado.</p>}
                  </div>

                  <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                    <h3 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Endereço</h3>
                    {(() => {
                      const cidade = endCidades.find(c => c.id === selectedCliente.cidade_id);
                      const bairro = endBairros.find(b => b.id === selectedCliente.bairro_id);
                      const rua = endRuas.find(r => r.id === selectedCliente.rua_id);
                      const ceps = rua?.cep || [];
                      const hasAddress = cidade || bairro || rua || selectedCliente.numero || selectedCliente.referencia;
                      return hasAddress ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          <InfoRow label="Cidade" value={cidade?.nome} />
                          <InfoRow label="Bairro" value={bairro?.nome} />
                          <InfoRow label="Rua" value={rua?.nome} />
                          <InfoRow label="Número" value={selectedCliente.numero} />
                          {ceps.length > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-caption text-muted-foreground min-w-[90px] shrink-0">CEP:</span>
                              <div className="flex flex-wrap gap-1">{ceps.map((c: string) => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}</div>
                            </div>
                          )}
                          <InfoRow label="Referência" value={selectedCliente.referencia} />
                        </div>
                      ) : <p className="text-caption text-muted-foreground italic">Nenhum endereço cadastrado.</p>;
                    })()}
                  </div>

                  {clienteContatos.length > 0 && (
                    <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                      <h3 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Contatos</h3>
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
                          const avgNota = concluidas.length > 0 ? (concluidas.reduce((s: number, a: any) => s + (a.nota_final || 0), 0) / concluidas.length) : null;
                          return (
                            <tr key={os.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/avaliacoes/pesquisa?os=${os.numero_os}`)}>
                              <td className="px-3 py-2 text-body font-medium text-primary underline underline-offset-2 font-tabular">{os.numero_os}</td>
                              <td className="px-3 py-2"><span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${statusBadge[os.status]}`}>{statusText[os.status]}</span></td>
                              <td className="px-3 py-2 text-body text-muted-foreground font-tabular">{new Date(os.created_at).toLocaleDateString("pt-BR")}</td>
                              <td className="px-3 py-2 text-body font-medium font-tabular">
                                {avgNota !== null ? <span className={avgNota >= 70 ? "text-success" : avgNota >= 50 ? "text-warning" : "text-destructive"}>{avgNota.toFixed(1)}%</span> : <span className="text-muted-foreground">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                        {osDoCliente.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-body text-muted-foreground">Nenhuma OS vinculada a este cliente.</td></tr>}
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
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nome *</Label><Input value={newForm.nome} onChange={e => setNewForm({ ...newForm, nome: e.target.value })} placeholder="Nome completo" /></div>
                <div><Label>CPF</Label><Input value={newForm.cpf} onChange={e => setNewForm({ ...newForm, cpf: e.target.value })} placeholder="000.000.000-00" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>RG</Label><Input value={newForm.rg} onChange={e => setNewForm({ ...newForm, rg: e.target.value })} placeholder="RG" /></div>
                <div><Label>Nome da Mãe</Label><Input value={newForm.nome_mae} onChange={e => setNewForm({ ...newForm, nome_mae: e.target.value })} placeholder="Nome da mãe" /></div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Endereço</p>
                <AddressFields cidadeId={newCidadeId} setCidadeId={setNewCidadeId} bairroId={newBairroId} setBairroId={setNewBairroId}
                  ruaId={newRuaId} setRuaId={setNewRuaId} bairroSearch={newBairroSearch} setBairroSearch={setNewBairroSearch}
                  ruaSearch={newRuaSearch} setRuaSearch={setNewRuaSearch} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nº</Label><Input value={newForm.numero} onChange={e => setNewForm({ ...newForm, numero: e.target.value })} placeholder="Nº" /></div>
                <div><Label>Referência</Label><Input value={newForm.referencia} onChange={e => setNewForm({ ...newForm, referencia: e.target.value })} placeholder="Ponto de referência" /></div>
              </div>
            </div>
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
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nome *</Label><Input value={editForm.nome} onChange={e => setEditForm({ ...editForm, nome: e.target.value })} /></div>
                <div><Label>CPF</Label><Input value={editForm.cpf} onChange={e => setEditForm({ ...editForm, cpf: e.target.value })} placeholder="000.000.000-00" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>RG</Label><Input value={editForm.rg} onChange={e => setEditForm({ ...editForm, rg: e.target.value })} /></div>
                <div><Label>Nome da Mãe</Label><Input value={editForm.nome_mae} onChange={e => setEditForm({ ...editForm, nome_mae: e.target.value })} /></div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Endereço</p>
                <AddressFields cidadeId={editCidadeId} setCidadeId={setEditCidadeId} bairroId={editBairroId} setBairroId={setEditBairroId}
                  ruaId={editRuaId} setRuaId={setEditRuaId} bairroSearch={editBairroSearch} setBairroSearch={setEditBairroSearch}
                  ruaSearch={editRuaSearch} setRuaSearch={setEditRuaSearch} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Nº</Label><Input value={editForm.numero} onChange={e => setEditForm({ ...editForm, numero: e.target.value })} /></div>
                <div><Label>Referência</Label><Input value={editForm.referencia} onChange={e => setEditForm({ ...editForm, referencia: e.target.value })} /></div>
              </div>
            </div>
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
            <DialogTitle className="flex items-center gap-2 text-destructive"><Lock className="w-5 h-5" /> Excluir Cliente</DialogTitle>
            <DialogDescription>Esta ação é irreversível. O cliente <strong>{selectedCliente?.nome}</strong> será removido permanentemente. Confirme sua senha.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <Input type="password" placeholder="Digite sua senha" value={deletePassword}
                onChange={e => { setDeletePassword(e.target.value); setDeleteError(""); }}
                onKeyDown={e => e.key === "Enter" && handleDelete()} autoFocus />
              {deleteError && <p className="text-caption text-destructive">{deleteError}</p>}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading || !deletePassword.trim()} className="press-effect">{deleteLoading ? "Excluindo..." : "Excluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}