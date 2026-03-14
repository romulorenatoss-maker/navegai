import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface ChecklistItem {
  id?: string;
  descricao: string;
  obrigatorio: boolean;
  ordem: number;
}

const recorrenciaLabel: Record<string, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
  personalizada: "Personalizada",
};

export default function ChecklistsCadastroPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [setorId, setSetorId] = useState("");
  const [recorrencia, setRecorrencia] = useState("diaria");
  const [prazoHoras, setPrazoHoras] = useState("24");
  const [itens, setItens] = useState<ChecklistItem[]>([]);
  const [novoItem, setNovoItem] = useState("");

  const { data: checklists = [], isLoading } = useQuery({
    queryKey: ["checklists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklists")
        .select("*, tipos_servico(nome), setores(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: checklistItensMap = {} } = useQuery({
    queryKey: ["checklist_itens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_itens")
        .select("*")
        .order("ordem");
      if (error) throw error;
      const map: Record<string, any[]> = {};
      data?.forEach((item) => {
        if (!map[item.checklist_id]) map[item.checklist_id] = [];
        map[item.checklist_id].push(item);
      });
      return map;
    },
  });

  const { data: tipos = [] } = useQuery({
    queryKey: ["tipos_servico_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tipos_servico").select("*, setores(id, nome)").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: setores = [] } = useQuery({
    queryKey: ["setores_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  // Filter tipos by selected setor
  const tiposFiltrados = setorId
    ? tipos.filter((t) => (t as any).setores?.id === setorId || !t.setor_id)
    : tipos;

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        titulo,
        descricao: descricao || null,
        tipo_servico_id: tipoServicoId || null,
        setor_id: setorId || null,
        recorrencia: recorrencia as any,
        prazo_horas: parseInt(prazoHoras) || 24,
      };

      let checklistId: string;

      if (editingId) {
        const { error } = await supabase.from("checklists").update(payload).eq("id", editingId);
        if (error) throw error;
        checklistId = editingId;

        // Remove old items and re-insert
        await supabase.from("checklist_itens").delete().eq("checklist_id", checklistId);
      } else {
        const { data, error } = await supabase.from("checklists").insert(payload).select().single();
        if (error) throw error;
        checklistId = data.id;
      }

      // Insert items
      if (itens.length > 0) {
        const { error } = await supabase.from("checklist_itens").insert(
          itens.map((item, i) => ({
            checklist_id: checklistId,
            descricao: item.descricao,
            obrigatorio: item.obrigatorio,
            ordem: i,
          }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      queryClient.invalidateQueries({ queryKey: ["checklist_itens"] });
      toast.success(editingId ? "Checklist atualizado." : "Checklist criado.");
      closeDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async (c: any) => {
      const { error } = await supabase.from("checklists").update({ ativo: !c.ativo }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklists"] }),
    onError: (err: any) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      queryClient.invalidateQueries({ queryKey: ["checklist_itens"] });
      toast.success("Checklist excluído.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setTitulo(""); setDescricao(""); setTipoServicoId(""); setSetorId("");
    setRecorrencia("diaria"); setPrazoHoras("24"); setItens([]); setNovoItem("");
    setDialogOpen(true);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setTitulo(c.titulo); setDescricao(c.descricao || "");
    setTipoServicoId(c.tipo_servico_id || ""); setSetorId(c.setor_id || "");
    setRecorrencia(c.recorrencia); setPrazoHoras(String(c.prazo_horas || 24));
    const existingItens = (checklistItensMap[c.id] || []).map((item: any) => ({
      id: item.id,
      descricao: item.descricao,
      obrigatorio: item.obrigatorio,
      ordem: item.ordem,
    }));
    setItens(existingItens);
    setNovoItem("");
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); };

  const addItem = () => {
    if (!novoItem.trim()) return;
    setItens([...itens, { descricao: novoItem.trim(), obrigatorio: true, ordem: itens.length }]);
    setNovoItem("");
  };

  const removeItem = (index: number) => {
    setItens(itens.filter((_, i) => i !== index));
  };

  const toggleItemObrigatorio = (index: number) => {
    setItens(itens.map((item, i) => i === index ? { ...item, obrigatorio: !item.obrigatorio } : item));
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    const newItens = [...itens];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItens.length) return;
    [newItens[index], newItens[targetIndex]] = [newItens[targetIndex], newItens[index]];
    setItens(newItens);
  };

  // Auto-select setor when tipo_servico is selected
  const handleTipoServicoChange = (value: string) => {
    setTipoServicoId(value);
    const tipo = tipos.find((t) => t.id === value);
    if (tipo?.setor_id) {
      setSetorId(tipo.setor_id);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Cadastro de Checklists</h1>
          <p className="text-body text-muted-foreground">Crie e configure checklists operacionais por tipo de OS e setor.</p>
        </div>
        <Button onClick={openCreate} className="press-effect">
          <Plus className="w-4 h-4 mr-2" /> Novo Checklist
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Título</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Setor</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo OS</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Recorrência</th>
                <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Itens</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando...</td></tr>
              ) : checklists.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhum checklist cadastrado.</td></tr>
              ) : checklists.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                      className="flex items-center gap-1.5 text-body font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {expandedId === c.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {c.titulo}
                    </button>
                    {c.descricao && <p className="text-caption text-muted-foreground mt-0.5 ml-5">{c.descricao}</p>}
                  </td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{c.setores?.nome || "—"}</td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{c.tipos_servico?.nome || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border badge-active">
                      {recorrenciaLabel[c.recorrencia] || c.recorrencia}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-body font-medium text-foreground font-tabular">
                    {(checklistItensMap[c.id] || []).length}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${c.ativo ? "badge-complete" : "badge-expired"}`}>
                      {c.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggleAtivo.mutate(c)} className="press-effect">
                        {c.ativo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)} className="press-effect"><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(c.id)} className="press-effect text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Expanded items view */}
        {expandedId && checklistItensMap[expandedId] && (
          <div className="border-t border-border bg-muted/30 px-6 py-4">
            <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider mb-2">Itens do Checklist</p>
            <div className="space-y-1.5">
              {(checklistItensMap[expandedId] || []).map((item: any, i: number) => (
                <div key={item.id} className="flex items-center gap-3 text-body">
                  <span className="text-caption text-muted-foreground font-tabular w-5">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-foreground flex-1">{item.descricao}</span>
                  <span className={`text-caption px-1.5 py-0.5 rounded border ${item.obrigatorio ? "badge-active" : "badge-expired"}`}>
                    {item.obrigatorio ? "Obrigatório" : "Opcional"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Editar Checklist" : "Novo Checklist"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="Ex: Checklist de limpeza diária" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição opcional..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Setor *</Label>
                <Select value={setorId} onValueChange={(v) => { setSetorId(v); setTipoServicoId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                  <SelectContent>
                    {setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de OS</Label>
                <Select value={tipoServicoId} onValueChange={handleTipoServicoChange}>
                  <SelectTrigger><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os tipos</SelectItem>
                    {tiposFiltrados.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Recorrência</Label>
                <Select value={recorrencia} onValueChange={setRecorrencia}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diaria">Diária</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="personalizada">Personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prazo (horas)</Label>
                <Input type="number" min={1} value={prazoHoras} onChange={(e) => setPrazoHoras(e.target.value)} />
              </div>
            </div>

            {/* Checklist Items */}
            <div className="space-y-2">
              <Label>Itens do Checklist</Label>
              <div className="bg-muted/50 rounded-lg border border-border p-3 space-y-2">
                {itens.length === 0 && (
                  <p className="text-caption text-muted-foreground text-center py-2">Nenhum item adicionado.</p>
                )}
                {itens.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-card rounded-md px-3 py-2 border border-border">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-caption text-muted-foreground font-tabular w-5">{i + 1}.</span>
                    <span className="text-body text-foreground flex-1">{item.descricao}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Label className="text-caption text-muted-foreground cursor-pointer">Obrig.</Label>
                      <Switch checked={item.obrigatorio} onCheckedChange={() => toggleItemObrigatorio(i)} />
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <Button type="button" variant="ghost" size="sm" onClick={() => moveItem(i, "up")} disabled={i === 0} className="h-7 w-7 p-0">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => moveItem(i, "down")} disabled={i === itens.length - 1} className="h-7 w-7 p-0">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(i)} className="h-7 w-7 p-0 text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={novoItem}
                    onChange={(e) => setNovoItem(e.target.value)}
                    placeholder="Descreva o item..."
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addItem} className="shrink-0">
                    <Plus className="w-4 h-4 mr-1" /> Adicionar
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button type="submit" disabled={upsert.isPending} className="press-effect">
                {upsert.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
