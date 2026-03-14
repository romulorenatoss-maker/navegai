import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, ChevronLeft, CheckCircle2, XCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export default function MinhasAvaliacoesPage() {
  const { profile } = useAuth();
  const [selectedAval, setSelectedAval] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Get completed OS where current user is atendente or tecnico
  const { data: minhasOS = [], isLoading } = useQuery({
    queryKey: ["minhas_avaliacoes", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, cliente_nome, status, created_at, tipo_servico_id, atendente_id, tecnico_id")
        .eq("status", "concluida")
        .or(`atendente_id.eq.${profile.id},tecnico_id.eq.${profile.id}`)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Load evaluation details for selected OS
  const { data: avalDetails = [] } = useQuery({
    queryKey: ["aval_detail", selectedAval?.id],
    queryFn: async () => {
      if (!selectedAval?.id) return [];
      const { data: avals } = await supabase
        .from("avaliacoes")
        .select("id, avaliador_id, concluida, concluida_em, nota_final, tipo_avaliacao_id")
        .eq("ordem_servico_id", selectedAval.id)
        .eq("concluida", true);
      if (!avals) return [];

      const result = [];
      for (const aval of avals) {
        const { data: respostas } = await supabase
          .from("respostas_avaliacao")
          .select("pergunta_id, resposta, observacao, evidencia_url")
          .eq("avaliacao_id", aval.id);

        const perguntaIds = respostas?.map(r => r.pergunta_id) || [];
        let perguntas: any[] = [];
        if (perguntaIds.length > 0) {
          const { data: ps } = await supabase.from("perguntas_avaliacao").select("id, pergunta, peso, target_employee_type").in("id", perguntaIds);
          perguntas = ps || [];
        }

        // Get avaliador name
        const { data: avaliador } = await supabase.from("profiles").select("nome").eq("id", aval.avaliador_id).single();
        
        // Get tipo_avaliacao name
        let taNome = "—";
        if (aval.tipo_avaliacao_id) {
          const { data: ta } = await (supabase as any).from("tipos_avaliacao").select("nome").eq("id", aval.tipo_avaliacao_id).single();
          if (ta) taNome = ta.nome;
        }

        result.push({
          ...aval,
          _avaliador_nome: avaliador?.nome || "—",
          _ta_nome: taNome,
          _respostas: respostas?.map(r => {
            const pg = perguntas.find(p => p.id === r.pergunta_id);
            return { ...r, pergunta: pg?.pergunta || "—", peso: pg?.peso || 0, target: pg?.target_employee_type || "geral" };
          }) || [],
        });
      }
      return result;
    },
    enabled: !!selectedAval?.id,
  });

  const openDetail = (os: any) => { setSelectedAval(os); setDetailOpen(true); };

  const myRole = (os: any) => {
    if (os.atendente_id === profile?.id && os.tecnico_id === profile?.id) return "Atendente + Técnico";
    if (os.atendente_id === profile?.id) return "Atendente";
    if (os.tecnico_id === profile?.id) return "Técnico";
    return "—";
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-section font-semibold text-foreground">Minhas Avaliações</h1>
        <p className="text-body text-muted-foreground">Visualize as avaliações concluídas onde você foi avaliado.</p>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Meu Papel</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Data</th>
              <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando...</td></tr>
            ) : minhasOS.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhuma avaliação concluída encontrada.</td></tr>
            ) : minhasOS.map(os => (
              <tr key={os.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 text-body font-medium text-primary font-tabular">#{os.numero_os}</td>
                <td className="px-4 py-3 text-body text-muted-foreground">{os.cliente_nome || "—"}</td>
                <td className="px-4 py-3 text-body text-muted-foreground">{myRole(os)}</td>
                <td className="px-4 py-3 text-body text-muted-foreground font-tabular">{new Date(os.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openDetail(os)} className="press-effect">
                    <Eye className="w-4 h-4 mr-1" /> Ver
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Avaliação — OS #{selectedAval?.numero_os}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedAval && (
              <div className="bg-muted/30 border border-border rounded-lg px-4 py-3 space-y-1">
                <p className="text-sm text-foreground"><span className="font-medium text-muted-foreground">Cliente:</span> {selectedAval.cliente_nome || "—"}</p>
              </div>
            )}
            {avalDetails.map((aval: any) => (
              <div key={aval.id} className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted/30 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-body font-semibold text-foreground">{aval._ta_nome}</p>
                    <p className="text-caption text-muted-foreground">
                      Avaliador: {aval._avaliador_nome}
                      {aval.concluida_em && ` • Concluído em ${new Date(aval.concluida_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                  </div>
                  {aval.nota_final != null && (
                    <span className={cn("text-body font-bold font-tabular", aval.nota_final >= 80 ? "text-success" : aval.nota_final >= 60 ? "text-warning" : "text-destructive")}>
                      {Number(aval.nota_final).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="divide-y divide-border">
                  {aval._respostas.map((r: any, i: number) => (
                    <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                      {r.resposta === "sim" ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" /> :
                       r.resposta === "nao" ? <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" /> :
                       <span className="w-4 h-4 rounded-full bg-muted shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-body text-foreground">{r.pergunta}</p>
                        <p className="text-caption text-muted-foreground">Peso: {r.peso} • {r.target === "atendente" ? "Atendente" : r.target === "tecnico" ? "Técnico" : "Geral"}</p>
                        {r.observacao && <p className="text-caption text-destructive mt-1">💬 {r.observacao}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {avalDetails.length === 0 && <p className="text-center text-body text-muted-foreground py-6">Carregando detalhes...</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
