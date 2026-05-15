// src/modules/tarefas/pages/tarefas_rotinasPage.tsx
// Página de Rotinas Operacionais — recriada do zero.
// SEM builder antigo. SEM wizard. SEM snapshot engine.
// Modal com 5 abas independentes via RotinasModal.
import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Filter, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotinasModal } from "@/modules/tarefas/components/rotinas/RotinasModal";
import { useQuery as useColabSetoresQuery } from "@tanstack/react-query";

const TIPO_EXECUCAO_LABELS: Record<string, string> = {
  simples: "Tarefa Simples",
  etapas: "Por Etapas",
  checklist_inspecao: "Por Etapas",
};

const RECORRENCIA_LABELS: Record<string, string> = {
  unica: "Única",
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
  personalizada: "Personalizada",
};

const GROUP_COLORS = [
  "bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300",
  "bg-purple-500/15 border-purple-500/30 text-purple-700 dark:text-purple-300",
  "bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 border-cyan-500/30 text-cyan-700 dark:text-cyan-300",
  "bg-orange-500/15 border-orange-500/30 text-orange-700 dark:text-orange-300",
];

export default function OperationalCadastroPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterExecutor, setFilterExecutor] = useState("__all");
  const [filterAvaliador, setFilterAvaliador] = useState("__all");

  // ── Queries ──
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["operational_templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_templates")
        .select("*, setores!operational_templates_setor_id_fkey(nome)")
        .or("origem.eq.rotina,origem.is.null")
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: false });
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
    staleTime: 0,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ["profiles_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: colaboradorSetores = [] } = useQuery({
    queryKey: ["colaborador_setores_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("colaborador_setores").select("profile_id, setor_id");
      if (error) throw error;
      return data || [];
    },
  });

  // ── Filtros ──
  const { executorProfiles, avaliadorProfiles } = useMemo(() => {
    const execMap = new Map<string, string>();
    const avalMap = new Map<string, string>();
    const profileMap = new Map(colaboradores.map((c: any) => [c.id, c.nome]));
    for (const t of templates) {
      if (t.executor_profile_id && profileMap.has(t.executor_profile_id))
        execMap.set(t.executor_profile_id, profileMap.get(t.executor_profile_id)!);
      if (t.aprovador_profile_id && profileMap.has(t.aprovador_profile_id))
        avalMap.set(t.aprovador_profile_id, profileMap.get(t.aprovador_profile_id)!);
    }
    return {
      executorProfiles: Array.from(execMap, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      avaliadorProfiles: Array.from(avalMap, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  }, [templates, colaboradores]);

  const filteredTemplates = useMemo(() => {
    let list = templates;
    if (filterExecutor !== "__all") list = list.filter((t: any) => t.executor_profile_id === filterExecutor);
    if (filterAvaliador !== "__all") list = list.filter((t: any) => t.aprovador_profile_id === filterAvaliador);
    return list;
  }, [templates, filterExecutor, filterAvaliador]);

  const groupedTemplates = useMemo(() => {
    const groups: { setor: string; setorId: string | null; items: any[] }[] = [];
    const map = new Map<string, any[]>();
    const order: string[] = [];
    for (const t of filteredTemplates) {
      const key = t.setor_id || "__sem_setor";
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(t);
    }
    for (const key of order) {
      const items = map.get(key)!;
      const setor = key === "__sem_setor" ? "Sem Setor" : (items[0]?.setores?.nome || "Sem Setor");
      groups.push({ setor, setorId: key === "__sem_setor" ? null : key, items });
    }
    return groups;
  }, [filteredTemplates]);

  // ── Drag and drop reorder ──
  const dragItem = useRef<{ id: string; setorKey: string } | null>(null);
  const dragOverItem = useRef<{ id: string; setorKey: string } | null>(null);

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; ordem: number }[]) => {
      for (const u of updates) {
        await (supabase as any).from("operational_templates").update({ ordem: u.ordem }).eq("id", u.id);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operational_templates"] }),
  });

  const handleDragStart = useCallback((id: string, setorKey: string) => { dragItem.current = { id, setorKey }; }, []);
  const handleDragOver = useCallback((e: React.DragEvent, id: string, setorKey: string) => { e.preventDefault(); dragOverItem.current = { id, setorKey }; }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem.current || !dragOverItem.current) return;
    if (dragItem.current.setorKey !== dragOverItem.current.setorKey) return;
    if (dragItem.current.id === dragOverItem.current.id) return;
    const group = groupedTemplates.find((g) => (g.setorId || "__sem_setor") === dragItem.current!.setorKey);
    if (!group) return;
    const items = [...group.items];
    const fromIdx = items.findIndex((i) => i.id === dragItem.current!.id);
    const toIdx = items.findIndex((i) => i.id === dragOverItem.current!.id);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    reorderMutation.mutate(items.map((item, idx) => ({ id: item.id, ordem: idx })));
    dragItem.current = null;
    dragOverItem.current = null;
  }, [groupedTemplates, reorderMutation]);

  // ── Mutations ──
  const toggleAtivo = useMutation({
    mutationFn: async (t: any) => {
      const { error } = await (supabase as any).from("operational_templates").update({ ativo: !t.ativo }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operational_templates"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from("operational_assignments")
        .select("id", { count: "exact", head: true })
        .eq("template_id", id);
      if (count && count > 0) {
        throw new Error(`Não é possível excluir: existem ${count} tarefa(s) executada(s) vinculada(s). Remova todas as tarefas executadas primeiro.`);
      }
      await (supabase as any).from("operational_template_steps").delete().eq("template_id", id);
      await (supabase as any).from("operational_template_fields").delete().eq("template_id", id);
      await (supabase as any).from("operational_template_sections").delete().eq("template_id", id);
      const { error } = await (supabase as any).from("operational_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["operational_templates"] }); toast.success("Rotina excluída."); },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => { setEditingId(null); setModalOpen(true); };
  const openEdit = (id: string) => { setEditingId(id); setModalOpen(true); };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Rotinas Operacionais</h1>
          <p className="text-body text-muted-foreground">Cadastre templates com seções, campos dinâmicos, workflow e recorrência.</p>
        </div>
        <Button onClick={openCreate} className="press-effect">
          <Plus className="w-4 h-4 mr-2" /> Gerar Nova Tarefa
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <Select value={filterExecutor} onValueChange={setFilterExecutor}>
          <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Nota: Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Nota: Todos</SelectItem>
            {executorProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAvaliador} onValueChange={setFilterAvaliador}>
          <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Avaliador: Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Avaliador: Todos</SelectItem>
            {avaliadorProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-body text-muted-foreground">Carregando...</div>
        ) : groupedTemplates.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-body text-muted-foreground">Nenhum template encontrado.</div>
        ) : groupedTemplates.map((group, groupIdx) => {
          const setorKey = group.setorId || "__sem_setor";
          const colorClass = GROUP_COLORS[groupIdx % GROUP_COLORS.length];
          return (
            <div key={setorKey} className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
              <div className={`px-4 py-1.5 border-b ${colorClass}`}>
                <h3 className="text-xs font-semibold">{group.setor}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="w-8"></th>
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nome</th>
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo</th>
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Recorrência</th>
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                      <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.items.map((t: any) => (
                      <tr
                        key={t.id}
                        draggable
                        onDragStart={() => handleDragStart(t.id, setorKey)}
                        onDragOver={(e) => handleDragOver(e, t.id, setorKey)}
                        onDrop={handleDrop}
                        className="hover:bg-muted/50 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <td className="pl-2 pr-0 py-3 text-muted-foreground/40">
                          <GripVertical className="w-4 h-4" />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-body font-medium text-foreground">{t.nome}</span>
                          {t.descricao && <p className="text-caption text-muted-foreground mt-0.5 truncate max-w-[250px]">{t.descricao}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border badge-active">
                            {TIPO_EXECUCAO_LABELS[t.tipo_execucao] || t.tipo_execucao}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-body text-muted-foreground">
                          {RECORRENCIA_LABELS[t.recorrencia_tipo] || t.recorrencia_tipo}
                        </td>
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
                            <Button variant="ghost" size="sm" onClick={() => openEdit(t.id)} className="press-effect">
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => {
                                if (window.confirm(`Excluir rotina "${t.nome}"? Só é possível se não houver tarefas executadas vinculadas.`))
                                  remove.mutate(t.id);
                              }}
                              className="press-effect text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      <RotinasModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingId(null); }}
        templateId={editingId}
        setores={setores}
        colaboradores={colaboradores}
        colaboradorSetores={colaboradorSetores as any}
      />
    </div>
  );
}
