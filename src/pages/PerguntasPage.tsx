import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Tables } from "@/integrations/supabase/types";

type Pergunta = Tables<"perguntas_avaliacao">;

// Group questions by evaluator and sum weights
function calcPesoByAvaliador(perguntas: any[]): Map<string, { nome: string; total: number; count: number }> {
  const map = new Map<string, { nome: string; total: number; count: number }>();
  for (const p of perguntas) {
    const key = p.avaliador_id || "todos";
    const nome = (p as any).profiles?.nome || "Todos";
    const current = map.get(key) || { nome, total: 0, count: 0 };
    current.total += p.peso;
    current.count += 1;
    map.set(key, current);
  }
  return map;
}
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Pergunta | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [avaliadorId, setAvaliadorId] = useState("");
  const [tipoAvaliado, setTipoAvaliado] = useState("atendente");
  const [peso, setPeso] = useState("1");
  const [ordem, setOrdem] = useState("0");

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

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        pergunta,
        tipo_servico_id: tipoServicoId || null,
        avaliador_id: avaliadorId || null,
        tipo_avaliado: tipoAvaliado,
        peso: parseInt(peso),
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
    setEditing(null); setPergunta(""); setTipoServicoId(""); setAvaliadorId(""); setTipoAvaliado("atendente"); setPeso("1"); setOrdem(String(perguntas.length));
    setDialogOpen(true);
  };
  const openEdit = (p: Pergunta) => {
    setEditing(p); setPergunta(p.pergunta); setTipoServicoId(p.tipo_servico_id || ""); setAvaliadorId(p.avaliador_id || ""); setTipoAvaliado(p.tipo_avaliado); setPeso(String(p.peso)); setOrdem(String(p.ordem));
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Perguntas de Avaliação</h1>
          <p className="text-body text-muted-foreground">Cadastro e ordenação de perguntas por tipo de serviço e avaliador.</p>
        </div>
        <Button onClick={openCreate} className="press-effect"><Plus className="w-4 h-4 mr-2" /> Nova Pergunta</Button>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-8">#</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Pergunta</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Avaliador</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Serviço</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Avaliado</th>
                <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Peso</th>
                <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando...</td></tr>
              ) : perguntas.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhuma pergunta cadastrada.</td></tr>
              ) : perguntas.map((p, i) => (
                <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-caption text-muted-foreground font-tabular">{String(i + 1).padStart(2, "0")}</td>
                  <td className="px-4 py-3 text-body font-medium text-foreground">{p.pergunta}</td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{(p as any).profiles?.nome || "Todos"}</td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{(p as any).tipos_servico?.nome || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${p.tipo_avaliado === "atendente" ? "badge-active" : "badge-pending"}`}>
                      {p.tipo_avaliado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-body font-medium text-foreground font-tabular">{p.peso}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="press-effect"><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(p.id)} className="press-effect text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
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
              <div className="space-y-1.5"><Label>Peso (1-10)</Label><Input type="number" min={1} max={10} value={peso} onChange={(e) => setPeso(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label>Ordem</Label><Input type="number" min={0} value={ordem} onChange={(e) => setOrdem(e.target.value)} required /></div>
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
