import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { History, Eye, Plus } from "lucide-react";
import { listarPropostas } from "../services/propostasService";
import { toast } from "sonner";

export default function PropostaHistoricoPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setRows(await listarPropostas());
      } catch (e) {
        console.error(e);
        toast.error("Erro ao carregar propostas");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="w-6 h-6" /> Histórico de Propostas
        </h1>
        <p className="text-sm text-muted-foreground">Todas as propostas geradas.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Propostas</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma proposta criada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Criada em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.clientes?.nome ?? "—"}</TableCell>
                    <TableCell><Badge variant={r.status === "aprovado" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right">R$ {Number(r.valor_total).toFixed(2)}</TableCell>
                    <TableCell>{r.validade ? new Date(r.validade).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
