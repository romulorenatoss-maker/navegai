import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, MessageSquare, Loader2 } from "lucide-react";

export default function ObjecoesLeadsPage() {
  const queryClient = useQueryClient();
  const [novaDescricao, setNovaDescricao] = useState("");

  const { data: objecoes = [], isLoading } = useQuery({
    queryKey: ["lead-objecoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_objecoes")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!novaDescricao.trim()) throw new Error("Descrição obrigatória");
      const { error } = await supabase.from("lead_objecoes").insert({ descricao: novaDescricao.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Objeção criada");
      setNovaDescricao("");
      queryClient.invalidateQueries({ queryKey: ["lead-objecoes"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("lead_objecoes").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead-objecoes"] }),
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="flex-1 min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cadastro de Objeções</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie as objeções que podem ser registradas ao fechar um lead</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nova Objeção
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Descrição da objeção..."
                value={novaDescricao}
                onChange={(e) => setNovaDescricao(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createMutation.mutate()}
              />
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="press-effect shrink-0">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Objeções Cadastradas ({objecoes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : objecoes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma objeção cadastrada</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-24 text-center">Ativo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {objecoes.map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.descricao}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={o.ativo}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: o.id, ativo: checked })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
