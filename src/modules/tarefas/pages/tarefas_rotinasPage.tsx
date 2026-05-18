// src/modules/tarefas/pages/tarefas_rotinasPage.tsx
import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Filter, GripVertical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RotinasModal } from "@/modules/tarefas/components/rotinas/RotinasModal";

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
  const { isAdmin, profile } = useAuth();

  // ── Modal state ──
  const [modalOpen, setModalOpen]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [modalDestino, setModalDestino] = useState<"padrao" | "minhas">("padrao");

  // ── Dialog destino ao criar ──
  const [destinoDialog, setDestinoDialog] = useState(false);

  // ── Dialog destino ao reativar ──
  const [reativarDialog, setReativarDialog] = useState<{ id: string; nome: string } | null>(null);

  // ── Aba principal ──
  const [abaAtiva, setAbaAtiva] = useState<"padrao" | "minhas" | "excluidas">(isAdmin ? "padrao" : "minhas");

  // ── Filtros ──
  const [filterExecutor, setFilterExecutor]   = useState("__all");
  const [filterAvaliador, setFilterAvaliador] = useState("__all");

  // ── Queries ──
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["operational_templates", "todas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_templates")
        .select("*, setores!operational_templates_setor_id_fkey(nome), criador:profiles!operational_templates_created_by_fkey(nome)")
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

  // ── Separação por aba ──
  const templatesPadrao = useMemo(() =>
    templates.filter((t: any) => !t.deleted_at && t.destino_aba === "padrao"),
    [templates]);

  const templatesMinhas = useMemo(() =>
    templates.filter((t: any) => !t.deleted_at && t.destino_aba === "minhas" && t.created_by === profile?.id),
    [templates, profile]);

  const templatesExcluidos = useMemo(() => {
    if (isAdmin) return templates.filter((t: any) => !!t.deleted_at);
    return templates.filter((t: any) => !!t.deleted_at && t.created_by === profile?.id);
  }, [templates, isAdmin, profile]);

  const templatesDaAba = abaAtiva === "padrao" ? templatesPadrao
    : abaAtiva === "minhas" ? templatesMinhas
    : templatesExcluidos;

  // ── Filtros sobre a aba ativa ──
  const { executorProfiles, avaliadorProfiles } = useMemo(() => {
    const execMap = new Map<string, string>();
    const avalMap = new Map<string, string>();
    const profileMap = new Map(colaboradores.map((c: any) => [c.id, c.nome]));
    for (const t of templatesDaAba) {
      if (t.executor_profile_id && profileMap.has(t.executor_profile_id))
        execMap.set(t.executor_profile_id, profileMap.get(t.executor_profile_id)!);
      if (t.aprovador_profile_id && profileMap.has(t.aprovador_profile_id))
        avalMap.set(t.aprovador_profile_id, profileMap.get(t.aprovador_profile_id)!);
    }
    return {
      executorProfiles: Array.from(execMap, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      avaliadorProfiles: Array.from(avalMap, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  }, [templatesDaAba, colaboradores]);

  const filteredTemplates = useMemo(() => {
    let list = templatesDaAba;
    if (filterExecutor !== "__all") list = list.filter((t: any) => t.executor_profile_id === filterExecutor);
    if (filterAvaliador !== "__all") list = list.filter((t: any) => t.aprovador_profile_id === filterAvaliador);
    return list;
  }, [templatesDaAba, filterExecutor, filterAvaliador]);

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

  // ── Drag and drop ──
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

  // Soft delete — verifica se tem tarefa em andamento
  const softDelete = useMutation({
    mutationFn: async (t: any) => {
      // user só pode excluir se não tiver tarefa em andamento
      if (!isAdmin) {
        const { count } = await (supabase as any)
          .from("operational_assignments")
          .select("id", { count: "exact", head: true })
          .eq("template_id", t.id)
          .in("status", ["pendente", "em_andamento", "aguardando_aprovacao", "aguardando_avaliacao"]);
        if (count && count > 0) {
          throw new Error("Conclua ou desative a rotina antes de excluir. Existem tarefas em andamento vinculadas.");
        }
      }
      const { error } = await (supabase as any)
        .from("operational_templates")
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["operational_templates"] }); toast.success("Rotina movida para Excluídas."); },
    onError: (e: any) => toast.error(e.message),
  });

  // Reativar — zera histórico de geração e pergunta destino
  const reativar = useMutation({
    mutationFn: async ({ id, destino }: { id: string; destino: "padrao" | "minhas" }) => {
      // 1. Reativa e zera
      const { error } = await (supabase as any)
        .from("operational_templates")
        .update({
          deleted_at: null,
          ativo: true,
          destino_aba: destino,
          data_inicio: new Date().toISOString().split("T")[0],
        })
        .eq("id", id);
      if (error) throw error;

      // 2. Verifica se já tem tarefa para hoje
      const hoje = new Date().toISOString().split("T")[0];
      const { count } = await (supabase as any)
        .from("operational_assignments")
        .select("id", { count: "exact", head: true })
        .eq("template_id", id)
        .eq("data_prevista", hoje);

      return { temTarefaHoje: (count ?? 0) > 0 };
    },
    onSuccess: async (result, variables) => {
      qc.invalidateQueries({ queryKey: ["operational_templates"] });
      setReativarDialog(null);
      if (!result.temTarefaHoje) {
        const hoje = new Date().toLocaleDateString("pt-BR");
        if (window.confirm(`Deseja criar a tarefa para hoje (${hoje})?`)) {
          // Força geração chamando a edge function
          const { data: sess } = await supabase.auth.getSession();
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-daily-assignments`, {
            method: "POST",
            headers: { Authorization: `Bearer ${sess.session?.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ template_id: variables.id, force_date: new Date().toISOString().split("T")[0] }),
          });
          toast.success("Rotina reativada e tarefa de hoje criada.");
        } else {
          toast.success("Rotina reativada. A próxima tarefa será gerada automaticamente.");
        }
      } else {
        toast.success("Rotina reativada. Já existe tarefa para hoje.");
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Handlers de abertura do modal ──
  const handleClickCriar = () => {
    if (isAdmin) {
      setDestinoDialog(true); // admin escolhe destino
    } else {
      // user vai direto para Minhas Rotinas
      setModalDestino("minhas");
      setEditingId(null);
      setModalOpen(true);
    }
  };

  const openEdit = (id: string) => { setEditingId(id); setModalOpen(true); };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Rotinas Operacionais</h1>
          <p className="text-body text-muted-foreground">Gerencie rotinas e tarefas operacionais.</p>
        </div>
        <Button onClick={handleClickCriar} className="press-effect">
          <Plus className="w-4 h-4 mr-2" /> Nova Rotina
        </Button>
      </div>

      {/* Abas principais */}
      <Tabs value={abaAtiva} onValueChange={(v) => setAbaAtiva(v as any)} className="mb-4">
        <TabsList>
          {isAdmin && <TabsTrigger value="padrao">Rotinas Padrão</TabsTrigger>}
          <TabsTrigger value="minhas">Minhas Rotinas</TabsTrigger>
          <TabsTrigger value="excluidas">
            Excluídas {templatesExcluidos.length > 0 && <span className="ml-1 text-xs text-destructive">({templatesExcluidos.length})</span>}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filtros */}
      {abaAtiva !== "excluidas" && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <Select value={filterExecutor} onValueChange={setFilterExecutor}>
            <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Executor: Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Executor: Todos</SelectItem>
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
      )}

      {/* Tabela */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-body text-muted-foreground">Carregando...</div>
        ) : groupedTemplates.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-body text-muted-foreground">
            {abaAtiva === "excluidas" ? "Nenhuma rotina excluída." : "Nenhuma rotina encontrada."}
          </div>
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
                      {abaAtiva !== "excluidas" && <th className="w-8"></th>}
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nome</th>
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo</th>
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Recorrência</th>
                      {abaAtiva === "excluidas"
                        ? <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Excluída em</th>
                        : <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>}
                      <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.items.map((t: any) => (
                      <tr
                        key={t.id}
                        draggable={abaAtiva !== "excluidas"}
                        onDragStart={() => handleDragStart(t.id, setorKey)}
                        onDragOver={(e) => handleDragOver(e, t.id, setorKey)}
                        onDrop={handleDrop}
                        className="hover:bg-muted/50 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        {abaAtiva !== "excluidas" && (
                          <td className="pl-2 pr-0 py-3 text-muted-foreground/40">
                            <GripVertical className="w-4 h-4" />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span className="text-body font-medium text-foreground">{t.nome}</span>
                          {t.descricao && <p className="text-caption text-muted-foreground mt-0.5 truncate max-w-[250px]">{t.descricao}</p>}
                          {t.criador?.nome && (
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Criador: {t.criador.nome}</p>
                          )}
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
                          {abaAtiva === "excluidas" ? (
                            <span className="text-caption text-muted-foreground">
                              {t.deleted_at ? new Date(t.deleted_at).toLocaleDateString("pt-BR") : "—"}
                            </span>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${t.ativo ? "badge-complete" : "badge-expired"}`}>
                              {t.ativo ? "Ativo" : "Inativo"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {abaAtiva === "excluidas" ? (
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => setReativarDialog({ id: t.id, nome: t.nome })}
                                className="press-effect text-green-600"
                              >
                                <RotateCcw className="w-4 h-4 mr-1" /> Reativar
                              </Button>
                            ) : (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => toggleAtivo.mutate(t)} className="press-effect">
                                  {t.ativo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => openEdit(t.id)} className="press-effect">
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => {
                                    if (window.confirm(`Mover "${t.nome}" para Excluídas?`))
                                      softDelete.mutate(t);
                                  }}
                                  className="press-effect text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
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

      {/* Dialog: admin escolhe destino ao criar */}
      <Dialog open={destinoDialog} onOpenChange={setDestinoDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Onde deseja adicionar esta rotina?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Button variant="outline" className="justify-start" onClick={() => { setModalDestino("padrao"); setEditingId(null); setDestinoDialog(false); setModalOpen(true); }}>
              📋 Rotinas Padrão — visível para todos os executores
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => { setModalDestino("minhas"); setEditingId(null); setDestinoDialog(false); setModalOpen(true); }}>
              👤 Minhas Rotinas — somente para mim
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: destino ao reativar */}
      <Dialog open={!!reativarDialog} onOpenChange={(o) => { if (!o) setReativarDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reativar "{reativarDialog?.nome}"</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">O histórico de geração será zerado. Onde deseja reativar?</p>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            {isAdmin && (
              <Button variant="outline" className="justify-start" onClick={() => reativar.mutate({ id: reativarDialog!.id, destino: "padrao" })}>
                📋 Rotinas Padrão
              </Button>
            )}
            <Button variant="outline" className="justify-start" onClick={() => reativar.mutate({ id: reativarDialog!.id, destino: "minhas" })}>
              👤 Minhas Rotinas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de criação/edição */}
      <RotinasModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingId(null); }}
        templateId={editingId}
        setores={setores}
        colaboradores={colaboradores}
        colaboradorSetores={colaboradorSetores as any}
        destinoAba={modalDestino}
        createdBy={profile?.id}
      />
    </div>
  );
}
