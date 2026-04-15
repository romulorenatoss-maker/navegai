import { useState, useMemo } from "react";
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

interface LeadRow {
  id: string;
  campanha_id: string | null;
  status_lead: string;
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

  // Fetch leads stats per campaign using paginated fetching to avoid 1000-row limit
  const { data: statsMap = {} } = useQuery({
    queryKey: ["campanhas-leads-stats"],
    queryFn: async () => {
      const map: Record<string, { total: number; convertidos: number; arquivados: number; perdidos: number }> = {};
      let offset = 0;
      const BATCH = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("leads")
          .select("campanha_id, status_lead")
          .not("campanha_id", "is", null)
          .range(offset, offset + BATCH - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const lead of data) {
          const cid = lead.campanha_id!;
          if (!map[cid]) map[cid] = { total: 0, convertidos: 0, arquivados: 0, perdidos: 0 };
          const s = map[cid];
          s.total++;
          if (lead.status_lead === "convertido") s.convertidos++;
          if (lead.status_lead === "arquivado") s.arquivados++;
          if (lead.status_lead === "perdido") s.perdidos++;
        }
        if (data.length < BATCH) break;
        offset += BATCH;
      }
      return map;
    },
    staleTime: 30_000,
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
      queryClient.invalidateQueries({ queryKey: ["campanhas-ativas"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="flex-1 min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
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
                    <TableHead className="text-center">Leads</TableHead>
                    <TableHead className="text-center">Convertidos</TableHead>
                    <TableHead className="text-center">Arquivados</TableHead>
                    <TableHead className="text-center">Perdidos</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campanhas.map((c) => {
                    const stats = statsMap[c.id] || { total: 0, convertidos: 0, arquivados: 0, perdidos: 0 };
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={c.ativo ? "default" : "secondary"} className="text-xs">
                            {c.ativo ? "Ativa" : "Inativa"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-semibold">{stats.total}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">
                            {stats.convertidos}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            {stats.arquivados}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
                            {stats.perdidos}
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
                    );
                  })}
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
