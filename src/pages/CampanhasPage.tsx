import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Pencil, Megaphone, Loader2 } from "lucide-react";

interface Campanha {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
}

export default function CampanhasPage() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);

  const { data: campanhas = [], isLoading } = useQuery({
    queryKey: ["campanhas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campanhas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Campanha[];
    },
  });

  const openCreate = () => {
    setEditId(null);
    setNome("");
    setAtivo(true);
    setShowDialog(true);
  };

  const openEdit = (c: Campanha) => {
    setEditId(c.id);
    setNome(c.nome);
    setAtivo(c.ativo);
    setShowDialog(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!nome.trim()) throw new Error("Nome é obrigatório.");
      if (editId) {
        const { error } = await supabase
          .from("campanhas")
          .update({ nome: nome.trim(), ativo } as any)
          .eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("campanhas")
          .insert({ nome: nome.trim(), ativo } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Campanha atualizada!" : "Campanha criada!");
      setShowDialog(false);
      queryClient.invalidateQueries({ queryKey: ["campanhas"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="flex-1 min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Megaphone className="w-6 h-6" /> Campanhas
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie campanhas para rastrear a origem dos leads.
            </p>
          </div>
          <Button onClick={openCreate} className="press-effect">
            <Plus className="w-4 h-4 mr-2" /> Nova Campanha
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Campanhas cadastradas
              <Badge variant="secondary" className="ml-2 text-xs">{campanhas.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
            ) : campanhas.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma campanha cadastrada</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campanhas.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nome}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={c.ativo ? "default" : "secondary"} className="text-xs">
                          {c.ativo ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome da Campanha *</Label>
                <Input
                  placeholder="Ex: Facebook Ads Março"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={ativo} onCheckedChange={setAtivo} />
                <Label className="text-sm">Campanha ativa</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !nome.trim()}
                className="press-effect"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {editId ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
