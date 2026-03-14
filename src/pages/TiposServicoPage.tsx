import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Tables } from "@/integrations/supabase/types";

type TipoServico = Tables<"tipos_servico">;

export default function TiposServicoPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TipoServico | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [selectedChecklists, setSelectedChecklists] = useState<string[]>([]);

  const { data: tipos = [], isLoading } = useQuery({
    queryKey: ["tipos_servico"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tipos_servico").select("*").order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch all checklists
  const { data: allChecklists = [] } = useQuery({
    queryKey: ["all_checklists"],
    queryFn: async () => {
      const { data, error } = await supabase.from("checklists").select("id, titulo").eq("ativo", true).order("titulo");
      if (error) throw error;
      return data || [];
    },
  });

  // Load existing checklist links for edited tipo
  const { data: existingChecklistLinks = [] } = useQuery({
    queryKey: ["tsc_links", editing?.id],
    queryFn: async () => {
      if (!editing?.id) return [];
      const { data } = await (supabase as any).from("tipo_servico_checklists").select("checklist_id").eq("tipo_servico_id", editing.id);
      return (data || []).map((l: any) => l.checklist_id as string);
    },
    enabled: !!editing?.id,
  });

  useEffect(() => {
    if (editing && existingChecklistLinks.length >= 0) {
      setSelectedChecklists(existingChecklistLinks);
    }
  }, [existingChecklistLinks, editing]);

  // Count questions per checklist for display
  const { data: checklistQuestionCounts = {} } = useQuery({
    queryKey: ["checklist_question_counts"],
    queryFn: async () => {
      const { data } = await supabase.from("perguntas_avaliacao").select("checklist_id").eq("ativo", true).not("checklist_id", "is", null);
      const map: Record<string, number> = {};
      data?.forEach((p: any) => { if (p.checklist_id) map[p.checklist_id] = (map[p.checklist_id] || 0) + 1; });
      return map;
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = { nome, descricao, setor_id: null, checklist_id: null };
      let tipoId: string;
      if (editing) {
        const { error } = await supabase.from("tipos_servico").update(payload as any).eq("id", editing.id);
        if (error) throw error;
        tipoId = editing.id;
      } else {
        const { data, error } = await (supabase as any).from("tipos_servico").insert(payload).select("id").single();
        if (error) throw error;
        tipoId = data.id;
      }
      // Sync checklist links
      await (supabase as any).from("tipo_servico_checklists").delete().eq("tipo_servico_id", tipoId);
      if (selectedChecklists.length > 0) {
        const rows = selectedChecklists.map(clId => ({ tipo_servico_id: tipoId, checklist_id: clId }));
        await (supabase as any).from("tipo_servico_checklists").insert(rows);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos_servico"] });
      queryClient.invalidateQueries({ queryKey: ["tsc_links"] });
      toast.success(editing ? "Tipo de serviço atualizado." : "Tipo de serviço criado.");
      closeDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async (t: TipoServico) => {
      const { error } = await supabase.from("tipos_servico").update({ ativo: !t.ativo }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tipos_servico"] }),
    onError: (err: any) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tipos_servico").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tipos_servico"] }); toast.success("Excluído."); },
    onError: (err: any) => toast.error(err.message),
  });

  const openCreate = () => { setEditing(null); setNome(""); setDescricao(""); setSelectedChecklists([]); setDialogOpen(true); };
  const openEdit = (t: any) => { setEditing(t); setNome(t.nome); setDescricao(t.descricao || ""); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); setSelectedChecklists([]); };

  const toggleChecklist = (clId: string) => {
    setSelectedChecklists(prev => prev.includes(clId) ? prev.filter(id => id !== clId) : [...prev, clId]);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Tipos de Serviço</h1>
          <p className="text-body text-muted-foreground">Configure tipos de serviço e vincule checklists de avaliação.</p>
        </div>
        <Button onClick={openCreate} className="press-effect"><Plus className="w-4 h-4 mr-2" /> Novo Tipo</Button>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nome</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Checklists</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Perguntas</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Por Setor</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
              <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando...</td></tr>
            ) : tipos.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhum tipo cadastrado.</td></tr>
            ) : tipos.map((t: any) => (
              <TipoRow key={t.id} t={t} onToggle={() => toggleAtivo.mutate(t)} onEdit={() => openEdit(t)} onRemove={() => remove.mutate(t.id)} />
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Tipo de Serviço" : "Novo Tipo de Serviço"}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Descrição</Label><Textarea value={descricao} onChange={e => setDescricao(e.target.value)} /></div>

            {/* Checklists Associados */}
            <div className="space-y-2">
              <Label>Checklists Associados</Label>
              <p className="text-caption text-muted-foreground">Selecione os pacotes de perguntas vinculados a este tipo de serviço.</p>
              {allChecklists.length === 0 ? (
                <p className="text-caption text-muted-foreground">Nenhum checklist cadastrado. Crie um na tela de Perguntas.</p>
              ) : (
                <div className="space-y-1.5 border border-border rounded-lg p-3 max-h-60 overflow-y-auto">
                  {allChecklists.map(cl => (
                    <label key={cl.id} className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 px-2 py-1.5 rounded-md transition-colors">
                      <Checkbox checked={selectedChecklists.includes(cl.id)} onCheckedChange={() => toggleChecklist(cl.id)} />
                      <div className="flex-1">
                        <span className="text-body font-medium text-foreground">{cl.titulo}</span>
                        <span className="text-caption text-muted-foreground ml-2">({checklistQuestionCounts[cl.id] || 0} perguntas)</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

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

interface SectorBreakdown {
  totalPerguntas: number;
  totalPontos: number;
  atendimentoPerguntas: number;
  atendimentoPontos: number;
  tecnicoPerguntas: number;
  tecnicoPontos: number;
}

function TipoRow({ t, onToggle, onEdit, onRemove }: { t: any; onToggle: () => void; onEdit: () => void; onRemove: () => void }) {
  // Fetch linked checklists
  const { data: linkedChecklists = [] } = useQuery({
    queryKey: ["tsc_display", t.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tipo_servico_checklists").select("checklist_id").eq("tipo_servico_id", t.id);
      if (!data?.length) return [];
      const ids = data.map((l: any) => l.checklist_id);
      const { data: cls } = await supabase.from("checklists").select("id, titulo").in("id", ids);
      return (cls || []) as { id: string; titulo: string }[];
    },
  });

  // Fetch question breakdown from linked checklists
  const { data: breakdown } = useQuery<SectorBreakdown>({
    queryKey: ["tipo_servico_breakdown", t.id, linkedChecklists.map((c: any) => c.id).join(",")],
    queryFn: async () => {
      const result: SectorBreakdown = { totalPerguntas: 0, totalPontos: 0, atendimentoPerguntas: 0, atendimentoPontos: 0, tecnicoPerguntas: 0, tecnicoPontos: 0 };
      
      const checklistIds = linkedChecklists.map((c: any) => c.id);
      if (checklistIds.length === 0) {
        // Fallback: load by tipo_servico_id
        const { data: perguntas } = await supabase
          .from("perguntas_avaliacao")
          .select("peso, setor_avaliado_id, setores!perguntas_avaliacao_setor_avaliado_id_fkey(nome)")
          .eq("ativo", true)
          .eq("tipo_servico_id", t.id);
        if (!perguntas) return result;
        for (const p of perguntas) {
          result.totalPerguntas++;
          result.totalPontos += p.peso;
          const setorNome = ((p as any).setores?.nome || "").toLowerCase();
          if (setorNome.includes("atendimento") || setorNome.includes("atendente")) { result.atendimentoPerguntas++; result.atendimentoPontos += p.peso; }
          else if (setorNome.includes("técnico") || setorNome.includes("tecnico")) { result.tecnicoPerguntas++; result.tecnicoPontos += p.peso; }
        }
        return result;
      }

      const { data: perguntas } = await (supabase as any)
        .from("perguntas_avaliacao")
        .select("peso, setor_avaliado_id, setores!perguntas_avaliacao_setor_avaliado_id_fkey(nome)")
        .eq("ativo", true)
        .in("checklist_id", checklistIds);
      if (!perguntas) return result;
      for (const p of perguntas) {
        result.totalPerguntas++;
        result.totalPontos += p.peso;
        const setorNome = ((p as any).setores?.nome || "").toLowerCase();
        if (setorNome.includes("atendimento") || setorNome.includes("atendente")) { result.atendimentoPerguntas++; result.atendimentoPontos += p.peso; }
        else if (setorNome.includes("técnico") || setorNome.includes("tecnico")) { result.tecnicoPerguntas++; result.tecnicoPontos += p.peso; }
      }
      return result;
    },
    enabled: linkedChecklists !== undefined,
  });

  const b = breakdown || { totalPerguntas: 0, totalPontos: 0, atendimentoPerguntas: 0, atendimentoPontos: 0, tecnicoPerguntas: 0, tecnicoPontos: 0 };

  return (
    <tr className="hover:bg-muted/50 transition-colors">
      <td className="px-4 py-3">
        <div className="text-body font-medium text-foreground">{t.nome}</div>
        {t.descricao && <div className="text-caption text-muted-foreground">{t.descricao}</div>}
      </td>
      <td className="px-4 py-3 text-caption text-muted-foreground">
        {linkedChecklists.length > 0 ? linkedChecklists.map((c: any) => c.titulo).join(", ") : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="text-body font-medium text-foreground">{b.totalPerguntas}</div>
        <div className="text-caption text-muted-foreground">{b.totalPontos} pts</div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-caption text-muted-foreground">
            Atend: <span className="font-medium text-foreground">{b.atendimentoPerguntas}</span> ({b.atendimentoPontos} pts)
          </span>
          <span className="text-caption text-muted-foreground">
            Téc: <span className="font-medium text-foreground">{b.tecnicoPerguntas}</span> ({b.tecnicoPontos} pts)
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${t.ativo ? "badge-complete" : "badge-expired"}`}>{t.ativo ? "Ativo" : "Inativo"}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={onToggle} className="press-effect">{t.ativo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}</Button>
          <Button variant="ghost" size="sm" onClick={onEdit} className="press-effect"><Pencil className="w-4 h-4" /></Button>
          <Button variant="ghost" size="sm" onClick={onRemove} className="press-effect text-destructive"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </td>
    </tr>
  );
}
