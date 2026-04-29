import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowLeft, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listarMeusRascunhos, excluirRascunho,
  type PropostasRascunhoConversa,
} from "../services/propostasRascunhoService";

export default function PropostaCreatePage() {
  const navigate = useNavigate();
  const [rascunhos, setRascunhos] = useState<PropostasRascunhoConversa[]>([]);
  const [carregando, setCarregando] = useState(true);

  async function recarregar() {
    setCarregando(true);
    try {
      const r = await listarMeusRascunhos();
      setRascunhos(r);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { recarregar(); }, []);

  async function descartar(r: PropostasRascunhoConversa) {
    if (!confirm(`Descartar rascunho de "${r.cliente_nome}"?`)) return;
    try {
      await excluirRascunho(r.id);
      toast.success("Rascunho descartado");
      recarregar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  function retomar(r: PropostasRascunhoConversa) {
    navigate(`/propostas/conversa?cliente=${r.cliente_id}`);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/propostas")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
      </div>

      {/* Botão central único */}
      <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="py-12 flex flex-col items-center text-center gap-4">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Nova Proposta</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Conversa guiada com IA. Selecione o cliente, descreva a necessidade
              e a planilha viva monta a proposta enquanto você fala.
            </p>
          </div>
          <Button size="lg" className="mt-2 px-8" onClick={() => navigate("/propostas/conversa")}>
            <MessageSquare className="w-5 h-5 mr-2" />
            Iniciar conversa
          </Button>
        </CardContent>
      </Card>

      {/* Rascunhos em andamento */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Conversas em andamento {rascunhos.length > 0 && <Badge variant="secondary" className="ml-2">{rascunhos.length}</Badge>}
          </h2>
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : rascunhos.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed rounded-lg p-6 text-center">
            Nenhuma conversa em andamento. Inicie uma nova acima.
          </p>
        ) : (
          <div className="space-y-2">
            {rascunhos.map((r) => (
              <Card key={r.id} className="hover:bg-accent/30 transition-colors">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <button
                    onClick={() => retomar(r)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="font-medium truncate">{r.cliente_nome}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span>{r.itens.length} item{r.itens.length !== 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span>{r.mensagens.length} msg</span>
                      <span>·</span>
                      <span>atualizado {new Date(r.updated_at).toLocaleString("pt-BR")}</span>
                    </div>
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => retomar(r)}>Retomar</Button>
                    <Button size="icon" variant="ghost" onClick={() => descartar(r)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
