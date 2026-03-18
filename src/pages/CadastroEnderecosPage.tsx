import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, ArrowRightLeft, Loader2, MapPin, Building2, Map, ExternalLink } from "lucide-react";
import AdminPasswordDialog from "@/components/AdminPasswordDialog";

interface Cidade { id: string; nome: string; }
interface Bairro { id: string; nome: string; cidade_id: string; }
interface Rua { id: string; nome: string; bairro_id: string; cep: string[] | null; }

export default function CadastroEnderecosPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState("cidades");
  const [search, setSearch] = useState("");

  // ─── Queries ────────────────────
  const { data: cidades = [] } = useQuery({
    queryKey: ["enderecos-cidades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cidades").select("*").order("nome");
      if (error) throw error;
      return data as Cidade[];
    },
  });
  const { data: bairros = [] } = useQuery({
    queryKey: ["enderecos-bairros"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bairros").select("*").order("nome");
      if (error) throw error;
      return data as Bairro[];
    },
  });
  const { data: ruas = [] } = useQuery({
    queryKey: ["enderecos-ruas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ruas").select("*").order("nome");
      if (error) throw error;
      return data as Rua[];
    },
  });

  // Lead counts per bairro and rua
  const { data: leadCounts } = useQuery({
    queryKey: ["enderecos-lead-counts"],
    queryFn: async () => {
      const { data: leads, error } = await supabase
        .from("leads")
        .select("id, cidade_id, bairro_id, rua_id");
      if (error) throw error;
      const byCidade: Record<string, number> = {};
      const byBairro: Record<string, number> = {};
      const byRua: Record<string, number> = {};
      for (const l of leads || []) {
        if (l.cidade_id) byCidade[l.cidade_id] = (byCidade[l.cidade_id] || 0) + 1;
        if (l.bairro_id) byBairro[l.bairro_id] = (byBairro[l.bairro_id] || 0) + 1;
        if (l.rua_id) byRua[l.rua_id] = (byRua[l.rua_id] || 0) + 1;
      }
      return { byCidade, byBairro, byRua };
    },
  });

  const cidadeLeadCount = (id: string) => leadCounts?.byCidade[id] || 0;
  const bairroLeadCount = (id: string) => leadCounts?.byBairro[id] || 0;
  const ruaLeadCount = (id: string) => leadCounts?.byRua[id] || 0;

  // ─── CRUD State ─────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formNome, setFormNome] = useState("");
  const [formCep, setFormCep] = useState("");
  const [formCidadeId, setFormCidadeId] = useState("");
  const [formBairroId, setFormBairroId] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Merge
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [merging, setMerging] = useState(false);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["enderecos-cidades"] });
    qc.invalidateQueries({ queryKey: ["enderecos-bairros"] });
    qc.invalidateQueries({ queryKey: ["enderecos-ruas"] });
    qc.invalidateQueries({ queryKey: ["enderecos-lead-counts"] });
  };

  // ─── Filtered lists ─────────────
  const filteredCidades = useMemo(() => cidades.filter(c => c.nome.toLowerCase().includes(search.toLowerCase())), [cidades, search]);
  const filteredBairros = useMemo(() => bairros.filter(b => b.nome.toLowerCase().includes(search.toLowerCase())), [bairros, search]);
  const filteredRuas = useMemo(() => ruas.filter(r => r.nome.toLowerCase().includes(search.toLowerCase())), [ruas, search]);

  const getCidadeNome = (id: string) => cidades.find(c => c.id === id)?.nome || "—";
  const getBairroNome = (id: string) => bairros.find(b => b.id === id)?.nome || "—";

  // ─── Open form ─────────────────
  const openCreate = () => {
    setEditingId(null);
    setFormNome("");
    setFormCep("");
    setFormCidadeId(cidades[0]?.id || "");
    setFormBairroId(bairros[0]?.id || "");
    setShowForm(true);
  };
  const openEdit = (item: any) => {
    setEditingId(item.id);
    setFormNome(item.nome);
    setFormCep(tab === "ruas" && item.cep ? (item.cep as string[]).join(", ") : "");
    if (tab === "bairros") setFormCidadeId(item.cidade_id);
    if (tab === "ruas") setFormBairroId(item.bairro_id);
    setShowForm(true);
  };

  // ─── Save ──────────────────────
  const handleSave = async () => {
    if (!formNome.trim()) { toast.error("Nome é obrigatório."); return; }
    setSaving(true);
    try {
      if (tab === "cidades") {
        if (editingId) {
          const { error } = await supabase.from("cidades").update({ nome: formNome.trim() }).eq("id", editingId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("cidades").insert({ nome: formNome.trim() });
          if (error) throw error;
        }
      } else if (tab === "bairros") {
        if (!formCidadeId) { toast.error("Selecione a cidade."); setSaving(false); return; }
        const payload = { nome: formNome.trim(), cidade_id: formCidadeId };
        if (editingId) {
          const { error } = await supabase.from("bairros").update(payload).eq("id", editingId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("bairros").insert(payload);
          if (error) throw error;
        }
      } else if (tab === "ruas") {
        if (!formBairroId) { toast.error("Selecione o bairro."); setSaving(false); return; }
        const cepsArr = formCep.split(",").map(c => c.trim()).filter(Boolean);
        const payload = { nome: formNome.trim(), bairro_id: formBairroId, cep: cepsArr.length > 0 ? cepsArr : null };
        if (editingId) {
          const { error } = await supabase.from("ruas").update(payload).eq("id", editingId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("ruas").insert(payload);
          if (error) throw error;
        }
      }
      toast.success(editingId ? "Atualizado!" : "Cadastrado!");
      setShowForm(false);
      invalidateAll();
    } catch (err: any) {
      toast.error(err.message?.includes("duplicate") ? "Já existe um registro com esse nome." : err.message);
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete ────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      // Check if there are associated leads
      let hasLeads = false;
      let hasClientes = false;
      if (tab === "cidades") {
        const { count: lc } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("cidade_id", deleteId);
        hasLeads = (lc || 0) > 0;
        const { count: cc } = await supabase.from("clientes").select("id", { count: "exact", head: true }).eq("cidade_id", deleteId);
        hasClientes = (cc || 0) > 0;
      } else if (tab === "bairros") {
        const { count: lc } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("bairro_id", deleteId);
        hasLeads = (lc || 0) > 0;
        const { count: cc } = await supabase.from("clientes").select("id", { count: "exact", head: true }).eq("bairro_id", deleteId);
        hasClientes = (cc || 0) > 0;
      } else {
        const { count: lc } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("rua_id", deleteId);
        hasLeads = (lc || 0) > 0;
        const { count: cc } = await supabase.from("clientes").select("id", { count: "exact", head: true }).eq("rua_id", deleteId);
        hasClientes = (cc || 0) > 0;
      }
      if (hasLeads || hasClientes) {
        const refs = [hasLeads && "leads", hasClientes && "clientes"].filter(Boolean).join(" e ");
        toast.error(`Não é possível remover: existem ${refs} associados a este registro. Migre-os primeiro.`);
        setDeleteId(null);
        return;
      }
      // Check child records (bairros in cidade, ruas in bairro)
      if (tab === "cidades") {
        const { count } = await supabase.from("bairros").select("id", { count: "exact", head: true }).eq("cidade_id", deleteId);
        if ((count || 0) > 0) {
          toast.error("Não é possível remover: existem bairros associados a esta cidade.");
          setDeleteId(null);
          return;
        }
      } else if (tab === "bairros") {
        const { count } = await supabase.from("ruas").select("id", { count: "exact", head: true }).eq("bairro_id", deleteId);
        if ((count || 0) > 0) {
          toast.error("Não é possível remover: existem ruas associadas a este bairro.");
          setDeleteId(null);
          return;
        }
      }
      const table = tab === "cidades" ? "cidades" : tab === "bairros" ? "bairros" : "ruas";
      const { error } = await supabase.from(table).delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Removido com sucesso!");
      invalidateAll();
    } catch (err: any) {
      toast.error(err.message);
    }
    setDeleteId(null);
  };

  // ─── Merge / Migrate ───────────
  const handleMerge = async () => {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) {
      toast.error("Selecione origem e destino diferentes.");
      return;
    }
    setMerging(true);
    try {
      if (tab === "cidades") {
        // Move all bairros from source to target
        await supabase.from("bairros").update({ cidade_id: mergeTargetId }).eq("cidade_id", mergeSourceId);
        // Move leads
        await supabase.from("leads").update({ cidade_id: mergeTargetId } as any).eq("cidade_id", mergeSourceId);
        // Delete source
        await supabase.from("cidades").delete().eq("id", mergeSourceId);
      } else if (tab === "bairros") {
        // Move all ruas from source to target
        await supabase.from("ruas").update({ bairro_id: mergeTargetId }).eq("bairro_id", mergeSourceId);
        // Move leads
        await supabase.from("leads").update({ bairro_id: mergeTargetId } as any).eq("bairro_id", mergeSourceId);
        // Delete source
        await supabase.from("bairros").delete().eq("id", mergeSourceId);
      } else {
        // Move leads from source rua to target
        await supabase.from("leads").update({ rua_id: mergeTargetId } as any).eq("rua_id", mergeSourceId);
        // Also move clientes references if any
        // Delete source
        await supabase.from("ruas").delete().eq("id", mergeSourceId);
      }
      toast.success("Migração concluída! Registros foram unificados e o duplicado removido.");
      setShowMerge(false);
      setMergeSourceId("");
      setMergeTargetId("");
      invalidateAll();
      qc.invalidateQueries({ queryKey: ["leads-list"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setMerging(false);
    }
  };

  const currentItems = tab === "cidades" ? filteredCidades : tab === "bairros" ? filteredBairros : filteredRuas;
  const allItems = tab === "cidades" ? cidades : tab === "bairros" ? bairros : ruas;
  const tabLabel = tab === "cidades" ? "Cidade" : tab === "bairros" ? "Bairro" : "Rua";
  const TabIcon = tab === "cidades" ? Building2 : tab === "bairros" ? Map : MapPin;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cadastro de Endereços</h1>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => { setMergeSourceId(""); setMergeTargetId(""); setShowMerge(true); }}>
              <ArrowRightLeft className="w-4 h-4 mr-1" /> Migrar / Unificar
            </Button>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> Novo {tabLabel}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={v => { setTab(v); setSearch(""); }}>
        <TabsList>
          <TabsTrigger value="cidades"><Building2 className="w-3.5 h-3.5 mr-1" /> Cidades ({cidades.length})</TabsTrigger>
          <TabsTrigger value="bairros"><Map className="w-3.5 h-3.5 mr-1" /> Bairros ({bairros.length})</TabsTrigger>
          <TabsTrigger value="ruas"><MapPin className="w-3.5 h-3.5 mr-1" /> Ruas ({ruas.length})</TabsTrigger>
        </TabsList>

        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={`Buscar ${tabLabel.toLowerCase()}...`} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
        </div>

        <TabsContent value="cidades" className="mt-3">
          <Card>
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y">
                {filteredCidades.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground text-center">Nenhuma cidade encontrada.</p>
                 ) : filteredCidades.map(c => {
                  const lc = cidadeLeadCount(c.id);
                  return (
                  <div key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{c.nome}</span>
                      <Badge variant="outline" className="text-[10px]">{bairros.filter(b => b.cidade_id === c.id).length} bairros</Badge>
                      {lc > 0 ? (
                        <Badge
                          variant="secondary" className="text-[10px] cursor-pointer hover:bg-primary/20"
                          onClick={() => navigate(`/leads/relatorios?cidade_id=${c.id}`)}
                        >
                          {lc} lead{lc > 1 ? "s" : ""} <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">0 leads</Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setDeleteId(c.id); setShowDeleteConfirm(true); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="bairros" className="mt-3">
          <Card>
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y">
                {filteredBairros.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground text-center">Nenhum bairro encontrado.</p>
                 ) : filteredBairros.map(b => {
                  const lc = bairroLeadCount(b.id);
                  return (
                  <div key={b.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Map className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <span className="text-sm font-medium">{b.nome}</span>
                        <span className="text-xs text-muted-foreground ml-2">({getCidadeNome(b.cidade_id)})</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">{ruas.filter(r => r.bairro_id === b.id).length} ruas</Badge>
                      {lc > 0 ? (
                        <Badge
                          variant="secondary" className="text-[10px] cursor-pointer hover:bg-primary/20"
                          onClick={() => navigate(`/leads/relatorios?bairro_id=${b.id}`)}
                        >
                          {lc} lead{lc > 1 ? "s" : ""} <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">0 leads</Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}><Pencil className="w-3.5 h-3.5" /></Button>
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setDeleteId(b.id); setShowDeleteConfirm(true); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="ruas" className="mt-3">
          <Card>
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y">
                {filteredRuas.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground text-center">Nenhuma rua encontrada.</p>
                 ) : filteredRuas.map(r => {
                  const bairro = bairros.find(b => b.id === r.bairro_id);
                  const lc = ruaLeadCount(r.id);
                  return (
                    <div key={r.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30">
                      <div className="flex items-center gap-2 flex-wrap">
                        <MapPin className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <span className="text-sm font-medium">{r.nome}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({getBairroNome(r.bairro_id)}{bairro ? ` — ${getCidadeNome(bairro.cidade_id)}` : ""})
                          </span>
                          {r.cep && r.cep.length > 0 && <span className="text-xs text-muted-foreground ml-2">CEP: {r.cep.join(", ")}</span>}
                        </div>
                        {lc > 0 ? (
                          <Badge
                            variant="secondary" className="text-[10px] cursor-pointer hover:bg-primary/20"
                            onClick={() => navigate(`/leads/relatorios?rua_id=${r.id}`)}
                          >
                            {lc} lead{lc > 1 ? "s" : ""} <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">0 leads</Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setDeleteId(r.id); setShowDeleteConfirm(true); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Create / Edit Dialog ──────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Novo"} {tabLabel}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={formNome} onChange={e => setFormNome(e.target.value)} placeholder={`Nome ${tabLabel.toLowerCase()}`} autoFocus />
            </div>
            {tab === "bairros" && (
              <div className="space-y-1.5">
                <Label>Cidade *</Label>
                <Select value={formCidadeId} onValueChange={setFormCidadeId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {cidades.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {tab === "ruas" && (
              <>
                <div className="space-y-1.5">
                  <Label>Bairro *</Label>
                  <Select value={formBairroId} onValueChange={setFormBairroId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {bairros.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.nome} ({getCidadeNome(b.cidade_id)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>CEPs <span className="text-xs text-muted-foreground">(separe por vírgula se houver mais de um)</span></Label>
                  <Input value={formCep} onChange={e => setFormCep(e.target.value)} placeholder="00000-000, 00000-001" />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="press-effect">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              {editingId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm ─────────────────── */}
      <AdminPasswordDialog
        open={showDeleteConfirm}
        onOpenChange={v => { setShowDeleteConfirm(v); if (!v) setDeleteId(null); }}
        title={`Excluir ${tabLabel}`}
        description={`Só é possível excluir se não houver leads, bairros ou ruas associados. Informe a senha de administrador.`}
        onConfirm={handleDelete}
      />

      {/* ─── Merge Dialog ──────────────────── */}
      <Dialog open={showMerge} onOpenChange={setShowMerge}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" /> Migrar / Unificar {tabLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione o registro <strong>incorreto</strong> (origem) e o registro <strong>correto</strong> (destino). 
              Todos os leads e dados associados serão transferidos para o destino e a origem será removida.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-destructive">Origem (será removido)</Label>
                <Select value={mergeSourceId} onValueChange={setMergeSourceId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {allItems.map((item: any) => (
                      <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-primary">Destino (será mantido)</Label>
                <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {allItems.filter((i: any) => i.id !== mergeSourceId).map((item: any) => (
                      <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {mergeSourceId && mergeTargetId && (
              <div className="p-3 rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  ⚠️ <strong>"{allItems.find((i: any) => i.id === mergeSourceId)?.nome}"</strong> será removido.
                  Todos os dados migram para <strong>"{allItems.find((i: any) => i.id === mergeTargetId)?.nome}"</strong>.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMerge(false)}>Cancelar</Button>
            <Button
              onClick={handleMerge}
              disabled={merging || !mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId}
              className="press-effect"
              variant="destructive"
            >
              {merging ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ArrowRightLeft className="w-4 h-4 mr-1" />}
              Migrar e Remover Origem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
