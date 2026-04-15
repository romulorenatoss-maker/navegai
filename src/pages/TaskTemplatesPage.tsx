import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PRIORIDADE_CONFIG } from "@/hooks/useTaskScoring";

const RECORRENCIA_LABELS: Record<string, string> = { unica: "Única", diaria: "Diária", semanal: "Semanal", mensal: "Mensal" };
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface FormState {
  titulo: string;
  descricao: string;
  setor_id: string;
  tipo_recorrencia: string;
  dias_execucao: number[];
  prazo_horas: number;
  prioridade: string;
  meta_execucao_minutos: number;
  obrigar_observacao: boolean;
  exigir_evidencia_foto: boolean;
}

const defaultForm: FormState = {
  titulo: "", descricao: "", setor_id: "", tipo_recorrencia: "unica",
  dias_execucao: [], prazo_horas: 24, prioridade: "media",
  meta_execucao_minutos: 60, obrigar_observacao: false, exigir_evidencia_foto: false,
};

export default function TaskTemplatesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["task_templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("task_templates").select("*, setores(nome)").order("created_at", { ascending: false });
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

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        titulo: form.titulo,
        descricao: form.descricao || null,
        setor_id: form.setor_id || null,
        tipo_recorrencia: form.tipo_recorrencia,
        dias_execucao: form.dias_execucao,
        prazo_horas: form.prazo_horas,
        prioridade: form.prioridade,
        meta_execucao_minutos: form.meta_execucao_minutos || null,
        obrigar_observacao: form.obrigar_observacao,
        exigir_evidencia_foto: form.exigir_evidencia_foto,
      };
      if (editingId) {
        const { error } = await (supabase as any).from("task_templates").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("task_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task_templates"] });
      toast.success(editingId ? "Template atualizado." : "Template criado.");
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async (t: any) => {
      const { error } = await (supabase as any).from("task_templates").update({ ativo: !t.ativo }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task_templates"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("task_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task_templates"] }); toast.success("Template excluído."); },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditingId(null); setForm(defaultForm); setDialogOpen(true); };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      titulo: t.titulo, descricao: t.descricao || "", setor_id: t.setor_id || "",
      tipo_recorrencia: t.tipo_recorrencia, dias_execucao: t.dias_execucao || [],
      prazo_horas: t.prazo_horas, prioridade: t.prioridade,
      meta_execucao_minutos: t.meta_execucao_minutos || 60,
      obrigar_observacao: t.obrigar_observacao, exigir_evidencia_foto: t.exigir_evidencia_foto,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); };


  const toggleDia = (dia: number) => {
    setForm(f => ({ ...f, dias_execucao: f.dias_execucao.includes(dia) ? f.dias_execucao.filter(d => d !== dia) : [...f.dias_execucao, dia].sort() }));
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Templates de Tarefas</h1>
          <p className="text-body text-muted-foreground">Crie modelos de tarefas operacionais recorrentes com gamificação.</p>
        </div>
        <Button onClick={openCreate} className="press-effect"><Plus className="w-4 h-4 mr-2" /> Novo Template</Button>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Título</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Setor</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Recorrência</th>
                <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Prioridade</th>
                <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Pts Base</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando...</td></tr>
              ) : templates.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhum template cadastrado.</td></tr>
              ) : templates.map((t: any) => (
                <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-body font-medium text-foreground">{t.titulo}</span>
                    {t.descricao && <p className="text-caption text-muted-foreground mt-0.5 truncate max-w-[250px]">{t.descricao}</p>}
                  </td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{t.setores?.nome || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border badge-active">
                      {RECORRENCIA_LABELS[t.tipo_recorrencia] || t.tipo_recorrencia}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${PRIORIDADE_CONFIG[t.prioridade]?.class || "badge-active"}`}>
                      {PRIORIDADE_CONFIG[t.prioridade]?.label || t.prioridade}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-body font-medium text-foreground font-tabular">{t.pontuacao_base}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${t.ativo ? "badge-complete" : "badge-expired"}`}>
                      {t.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggleAtivo.mutate(t)} className="press-effect">
                        {t.ativo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)} className="press-effect"><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(t.id)} className="press-effect text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Editar Template" : "Novo Template"}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={form.titulo} onChange={e => set("titulo", e.target.value)} required placeholder="Ex: Limpeza da sala de equipamentos" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={e => set("descricao", e.target.value)} placeholder="Detalhes da tarefa..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Setor Responsável</Label>
                <Select value={form.setor_id} onValueChange={v => set("setor_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Recorrência *</Label>
                <Select value={form.tipo_recorrencia} onValueChange={v => set("tipo_recorrencia", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unica">Única</SelectItem>
                    <SelectItem value="diaria">Diária</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.tipo_recorrencia === "semanal" && (
              <div className="space-y-1.5">
                <Label>Dias de Execução</Label>
                <div className="flex gap-2 flex-wrap">
                  {DIAS_SEMANA.map((d, i) => (
                    <button key={i} type="button" onClick={() => toggleDia(i)}
                      className={`px-3 py-1.5 rounded-md text-caption font-medium border transition-colors ${form.dias_execucao.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted"}`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Prazo (horas)</Label>
                <Input type="number" min={1} value={form.prazo_horas} onChange={e => set("prazo_horas", +e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={form.prioridade} onValueChange={v => set("prioridade", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORIDADE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Dificuldade</Label>
                <Select value={form.dificuldade} onValueChange={handleDificuldadeChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DIFICULDADE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Meta de Tempo (minutos)</Label>
              <Input type="number" min={1} value={form.meta_execucao_minutos} onChange={e => set("meta_execucao_minutos", +e.target.value)} />
            </div>

            <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-3">
              <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Pontuação / Gamificação</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Pontuação Base</Label>
                  <Input type="number" min={0} max={100} value={form.pontuacao_base} onChange={e => set("pontuacao_base", +e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bônus Antecipação</Label>
                  <Input type="number" min={0} value={form.bonus_antecipacao} onChange={e => set("bonus_antecipacao", +e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Penalidade Atraso</Label>
                  <Input type="number" min={0} value={form.penalidade_atraso} onChange={e => set("penalidade_atraso", +e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Penalidade Não Execução</Label>
                  <Input type="number" min={0} value={form.penalidade_nao_execucao} onChange={e => set("penalidade_nao_execucao", +e.target.value)} />
                </div>
              </div>
            </div>

            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.obrigar_observacao} onCheckedChange={v => set("obrigar_observacao", v)} />
                <Label className="cursor-pointer">Obrigar observação</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.exigir_evidencia_foto} onCheckedChange={v => set("exigir_evidencia_foto", v)} />
                <Label className="cursor-pointer">Exigir evidência (foto)</Label>
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
