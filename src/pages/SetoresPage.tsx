import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import AdminPasswordDialog from "@/components/AdminPasswordDialog";

type Setor = Tables<"setores">;

export default function SetoresPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Setor | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavelPadraoId, setResponsavelPadraoId] = useState<string>("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: setores = [], isLoading } = useQuery({
    queryKey: ["setores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["setores_profiles_for_responsavel_padrao"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data || [];
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase.from("setores").update({ nome, descricao }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("setores").insert({ nome, descricao });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["setores"] });
      toast.success(editing ? "Setor atualizado." : "Setor criado.");
      closeDialog();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async (setor: Setor) => {
      const { error } = await supabase.from("setores").update({ ativo: !setor.ativo }).eq("id", setor.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["setores"] }),
    onError: (err: any) => toast.error(err.message),
  });

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    // Nullify all FK references to this setor
    await supabase.from("colaborador_setores").delete().eq("setor_id", deletingId);
    await supabase.from("profiles").update({ setor_id: null }).eq("setor_id", deletingId);
    await supabase.from("perguntas_avaliacao").update({ setor_avaliado_id: null } as any).eq("setor_avaliado_id", deletingId);
    await supabase.from("perguntas_avaliacao").update({ setor_nota_id: null } as any).eq("setor_nota_id", deletingId);
    await supabase.from("checklists").update({ setor_id: null } as any).eq("setor_id", deletingId);
    await supabase.from("tipos_servico").update({ setor_id: null } as any).eq("setor_id", deletingId);
    await supabase.from("respostas_avaliacao").update({ avaliador_setor_id: null } as any).eq("avaliador_setor_id", deletingId);
    // Delete the setor
    const { error } = await supabase.from("setores").delete().eq("id", deletingId);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["setores"] });
    toast.success("Setor excluído.");
    setDeletingId(null);
  };

  const openCreate = () => { setEditing(null); setNome(""); setDescricao(""); setDialogOpen(true); };
  const openEdit = (s: Setor) => { setEditing(s); setNome(s.nome); setDescricao(s.descricao || ""); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditing(null); };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Setores</h1>
          <p className="text-body text-muted-foreground">Gerencie os setores da organização.</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="press-effect">
            <Plus className="w-4 h-4 mr-2" /> Novo Setor
          </Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nome</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Descrição</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
              <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando...</td></tr>
            ) : setores.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhum setor cadastrado.</td></tr>
            ) : setores.map((s) => (
              <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 text-body font-medium text-foreground">{s.nome}</td>
                <td className="px-4 py-3 text-body text-muted-foreground">{s.descricao || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${s.ativo ? "badge-complete" : "badge-expired"}`}>
                    {s.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {isAdmin && (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => toggleAtivo.mutate(s)} className="press-effect">
                        {s.ativo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)} className="press-effect">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { setDeletingId(s.id); setDeleteDialogOpen(true); }} className="press-effect text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Setor" : "Novo Setor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); upsert.mutate(); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} />
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

      <AdminPasswordDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Excluir Setor"
        description="Esta ação é irreversível. O setor será removido permanentemente."
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
