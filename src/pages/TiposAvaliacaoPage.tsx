import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface TipoAvaliacao {
  id: string;
  nome: string;
  cargo_responsavel: string | null;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
}

export default function TiposAvaliacaoPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TipoAvaliacao | null>(null);
  const [nome, setNome] = useState("");
  const [cargoResponsavel, setCargoResponsavel] = useState("");
  const [descricao, setDescricao] = useState("");

  const { data: tipos = [], isLoading } = useQuery({
    queryKey: ["tipos_avaliacao_crud"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tipos_avaliacao").select("*").order("nome");
      return (data || []) as TipoAvaliacao[];
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = { nome, cargo_responsavel: cargoResponsavel || null, descricao: descricao || null };
      if (editing) {
        await (supabase as any).from("tipos_avaliacao").update(payload).eq("id", editing.id);
      } else {
        await (supabase as any).from("tipos_avaliacao").insert(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos_avaliacao_crud"] });
      toast.success(editing ? "Atualizado." : "Criado.");
      closeDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async (t: TipoAvaliacao) => {
      await (supabase as any).from("tipos_avaliacao").update({ ativo: !t.ativo }).eq("id", t.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tipos_avaliacao_crud"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("tipos_avaliacao").delete().eq("id", id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tipos_avaliacao_crud"] }); toast.success("Excluído."); },
    onError: (err: any) => toast.error(err.message),
  });

  const openCreate = () => { setEditing(null); setNome(""); setCargoResponsavel(""); setDescricao(""); setDialogOpen(true); };
  const openEdit = (t: TipoAvaliacao) => { setEditing(t); setNome(t.nome); setCargoResponsavel(t.cargo_responsavel || ""); setDescricao(t.descricao || ""); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Tipos de Avaliação</h1>
          <p className="text-body text-muted-foreground">Defina os tipos de avaliação (ex: Atendimento, Técnico, Qualidade).</p>
        </div>
        <Button onClick={openCreate} className="press-effect"><Plus className="w-4 h-4 mr-2" /> Novo Tipo</Button>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nome</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cargo Responsável</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
              <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando...</td></tr>
            ) : tipos.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhum tipo cadastrado.</td></tr>
            ) : tipos.map(t => (
              <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 text-body font-medium text-foreground">{t.nome}</td>
                <td className="px-4 py-3 text-body text-muted-foreground">{t.cargo_responsavel || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${t.ativo ? "badge-complete" : "badge-expired"}`}>{t.ativo ? "Ativo" : "Inativo"}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => toggleAtivo.mutate(t)} className="press-effect">{t.ativo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}</Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)} className="press-effect"><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(t.id)} className="press-effect text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} Tipo de Avaliação</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={e => setNome(e.target.value)} required placeholder="Ex: Atendimento" /></div>
            <div className="space-y-1.5">
              <Label>Cargo Responsável</Label>
              <Input value={cargoResponsavel} onChange={e => setCargoResponsavel(e.target.value)} placeholder="Ex: atendente, tecnico, qualidade" />
              <p className="text-caption text-muted-foreground">Cargo do avaliador que realizará esta avaliação. Deve corresponder ao campo 'cargo' do perfil.</p>
            </div>
            <div className="space-y-1.5"><Label>Descrição</Label><Textarea value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
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
