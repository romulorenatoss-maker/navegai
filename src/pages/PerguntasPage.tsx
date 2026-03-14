import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, AlertTriangle, Camera, FileVideo, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AnimatePresence, motion } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";

type Pergunta = Tables<"perguntas_avaliacao">;

type PreviewAnswer = "sim" | "nao" | "na" | null;

export default function PerguntasPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Pergunta | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [avaliadorId, setAvaliadorId] = useState("");
  const [tipoAvaliado, setTipoAvaliado] = useState("atendente");
  const [peso, setPeso] = useState("1");
  const [ordem, setOrdem] = useState("0");

  // Preview state
  const [previewAnswer, setPreviewAnswer] = useState<PreviewAnswer>(null);

  // Filter state - multi-select
  const [filtrosTipoServico, setFiltrosTipoServico] = useState<Set<string>>(new Set());

  const { data: perguntas = [], isLoading } = useQuery({
    queryKey: ["perguntas_avaliacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perguntas_avaliacao")
        .select("*, tipos_servico(nome), profiles!perguntas_avaliacao_avaliador_id_fkey(nome)")
        .order("ordem");
      if (error) throw error;
      return data;
    },
  });

  const { data: tipos = [] } = useQuery({
    queryKey: ["tipos_servico_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tipos_servico").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: avaliadores = [] } = useQuery({
    queryKey: ["avaliadores_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  // Summary cards grouped by tipo_servico
  const summaryByTipo = useMemo(() => {
    const map = new Map<string, { nome: string; count: number; totalPeso: number }>();
    for (const p of perguntas) {
      const key = p.tipo_servico_id || "global";
      const nome = (p as any).tipos_servico?.nome || "Global (todos)";
      const current = map.get(key) || { nome, count: 0, totalPeso: 0 };
      current.count += 1;
      current.totalPeso += p.peso;
      map.set(key, current);
    }
    return map;
  }, [perguntas]);

  // Filtered questions based on multi-select
  const hasFilters = filtrosTipoServico.size > 0;
  const perguntasFiltradas = useMemo(() => {
    if (!hasFilters) return perguntas;
    return perguntas.filter((p) => {
      const key = p.tipo_servico_id || "global";
      return filtrosTipoServico.has(key);
    });
  }, [perguntas, filtrosTipoServico, hasFilters]);

  const somaPesoFiltrado = useMemo(
    () => perguntasFiltradas.reduce((acc, p) => acc + p.peso, 0),
    [perguntasFiltradas]
  );

  const toggleFiltro = (key: string) => {
    setFiltrosTipoServico((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        pergunta,
        tipo_servico_id: tipoServicoId || null,
        avaliador_id: avaliadorId || null,
        tipo_avaliado: tipoAvaliado,
        peso: Math.min(100, Math.max(1, parseInt(peso) || 1)),
        ordem: parseInt(ordem),
      };
      if (editing) {
        const { error } = await supabase.from("perguntas_avaliacao").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("perguntas_avaliacao").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perguntas_avaliacao"] });
      toast.success(editing ? "Pergunta atualizada." : "Pergunta criada.");
      closeDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("perguntas_avaliacao").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["perguntas_avaliacao"] }); toast.success("Pergunta excluída."); },
    onError: (err: any) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditing(null); setPergunta(""); setTipoServicoId(""); setAvaliadorId(""); setTipoAvaliado("atendente"); setPeso("1"); setOrdem(String(perguntas.length)); setPreviewAnswer(null);
    setDialogOpen(true);
  };
  const openEdit = (p: Pergunta) => {
    setEditing(p); setPergunta(p.pergunta); setTipoServicoId(p.tipo_servico_id || ""); setAvaliadorId(p.avaliador_id || ""); setTipoAvaliado(p.tipo_avaliado); setPeso(String(p.peso)); setOrdem(String(p.ordem)); setPreviewAnswer(null);
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); setPreviewAnswer(null); };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Perguntas de Avaliação</h1>
          <p className="text-body text-muted-foreground">Cadastro e ordenação de perguntas por tipo de serviço e avaliador.</p>
        </div>
        <Button onClick={openCreate} className="press-effect"><Plus className="w-4 h-4 mr-2" /> Nova Pergunta</Button>
      </div>

      {/* Filter checkboxes */}
      {perguntas.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4 shadow-card mb-4">
          <p className="text-caption text-muted-foreground uppercase tracking-wider mb-2">Filtrar por Tipo de Serviço</p>
          <div className="flex flex-wrap gap-3">
            {Array.from(summaryByTipo.entries()).map(([key, val]) => (
              <label
                key={key}
                className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-all press-effect ${
                  filtrosTipoServico.has(key) ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"
                }`}
              >
                <Checkbox
                  checked={filtrosTipoServico.has(key)}
                  onCheckedChange={() => toggleFiltro(key)}
                />
                <span className="text-body font-medium text-foreground">{val.nome}</span>
                <span className="text-caption text-muted-foreground">({val.count})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Summary cards - only when filters are selected */}
      {hasFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
          {Array.from(summaryByTipo.entries())
            .filter(([key]) => filtrosTipoServico.has(key))
            .map(([key, val]) => (
              <div key={key} className="bg-card border border-primary/30 rounded-lg px-4 py-3 shadow-card">
                <p className="text-body font-semibold text-foreground truncate">{val.nome}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-caption text-muted-foreground">{val.count} pergunta{val.count !== 1 ? "s" : ""}</span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-caption font-bold border font-tabular ${
                    val.totalPeso >= 100 ? "badge-complete" : val.totalPeso >= 50 ? "badge-active" : "badge-pending"
                  }`}>
                    {val.totalPeso} pts
                  </span>
                </div>
              </div>
            ))}
          <div className="bg-muted/30 border border-border rounded-lg px-4 py-3 flex items-center justify-center">
            <span className="text-body font-semibold text-foreground">
              Total: {somaPesoFiltrado} pts ({perguntasFiltradas.length} perguntas)
            </span>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-8">#</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Pergunta</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Avaliador</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo Serviço</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Avaliado</th>
                <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Peso</th>
                <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando...</td></tr>
              ) : perguntasFiltradas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhuma pergunta encontrada.</td></tr>
              ) : perguntasFiltradas.map((p, i) => (
                <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-caption text-muted-foreground font-tabular">{String(i + 1).padStart(2, "0")}</td>
                  <td className="px-4 py-3 text-body font-medium text-foreground">{p.pergunta}</td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{(p as any).profiles?.nome || "Todos"}</td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{(p as any).tipos_servico?.nome || "Global"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${p.tipo_avaliado === "atendente" ? "badge-active" : "badge-pending"}`}>
                      {p.tipo_avaliado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-body font-semibold text-foreground font-tabular">{p.peso}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="press-effect"><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(p.id)} className="press-effect text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {perguntasFiltradas.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-primary/20 bg-muted/30">
                  <td colSpan={5} className="px-4 py-3 text-body font-semibold text-foreground text-right">
                    Soma Total ({perguntasFiltradas.length} perguntas):
                  </td>
                  <td className="px-4 py-3 text-center text-subhead font-bold text-primary font-tabular">
                    {somaPesoFiltrado}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Pergunta" : "Nova Pergunta"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">
            <div className="space-y-1.5"><Label>Pergunta</Label><Input value={pergunta} onChange={(e) => setPergunta(e.target.value)} required /></div>
            <div className="space-y-1.5">
              <Label>Avaliador Responsável</Label>
              <Select value={avaliadorId} onValueChange={setAvaliadorId}>
                <SelectTrigger><SelectValue placeholder="Todos os avaliadores" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os avaliadores</SelectItem>
                  {avaliadores.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome} ({a.email})</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">Deixe em "Todos" para que qualquer avaliador veja esta pergunta.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo de Serviço</Label>
                <Select value={tipoServicoId} onValueChange={setTipoServicoId}>
                  <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de Avaliado</Label>
                <Select value={tipoAvaliado} onValueChange={setTipoAvaliado}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="atendente">Atendente</SelectItem>
                    <SelectItem value="tecnico">Técnico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Peso</Label>
                <Input type="number" min={1} max={100} value={peso} onChange={(e) => setPeso(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Ordem</Label>
                <Input type="number" min={0} value={ordem} onChange={(e) => setOrdem(e.target.value)} required />
              </div>
            </div>

            {/* Live Preview */}
            {pergunta && (
              <div className="space-y-2">
                <Label className="text-caption text-muted-foreground uppercase tracking-wider">Pré-visualização</Label>
                <div className="bg-muted/30 border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-body font-medium text-foreground">{pergunta}</p>
                      <p className="text-caption text-muted-foreground">Peso: {peso}</p>
                    </div>
                    <div className="flex bg-muted rounded-md p-0.5 gap-0.5 shrink-0">
                      {([
                        { label: "Sim", value: "sim" as PreviewAnswer, activeColor: "bg-success text-success-foreground" },
                        { label: "Não", value: "nao" as PreviewAnswer, activeColor: "bg-destructive text-destructive-foreground" },
                        { label: "N/A", value: "na" as PreviewAnswer, activeColor: "bg-muted text-foreground" },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPreviewAnswer(previewAnswer === opt.value ? null : opt.value)}
                          className={`px-3 py-1.5 rounded text-caption font-medium transition-all duration-150 press-effect min-w-[48px] ${
                            previewAnswer === opt.value ? opt.activeColor : "text-foreground hover:bg-background/50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <AnimatePresence>
                    {previewAnswer === "nao" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 mt-3 space-y-3">
                          <div className="flex items-center gap-1.5 text-caption text-destructive font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Ação obrigatória — O avaliador deve preencher:
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-caption">Descrição do ocorrido *</Label>
                            <Textarea
                              placeholder="Descreva a irregularidade encontrada..."
                              className="bg-card h-20 text-caption"
                              disabled
                            />
                          </div>
                          <div>
                            <Label className="text-caption mb-1.5 block">Anexar evidência *</Label>
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" size="sm" className="text-caption" disabled>
                                <Camera className="w-3.5 h-3.5 mr-1.5" /> Foto
                              </Button>
                              <Button type="button" variant="outline" size="sm" className="text-caption" disabled>
                                <FileVideo className="w-3.5 h-3.5 mr-1.5" /> Vídeo
                              </Button>
                              <Button type="button" variant="outline" size="sm" className="text-caption" disabled>
                                <FileText className="w-3.5 h-3.5 mr-1.5" /> Documento
                              </Button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button type="submit" disabled={upsert.isPending} className="press-effect">{upsert.isPending ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
