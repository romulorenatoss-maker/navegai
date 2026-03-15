import { useState, useMemo } from "react";
import { Eye, CheckCircle2, XCircle, MessageSquare, Image as ImageIcon, Loader2, CalendarIcon, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchNotasPorSetor, calcularMediaColaborador } from "@/hooks/useNotasPorSetor";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function MinhasAvaliacoesPage() {
  const { profile } = useAuth();
  const [selectedAval, setSelectedAval] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const now = new Date();
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(now));
  const [searchTrigger, setSearchTrigger] = useState(0);

  // Get completed OS where current user is atendente or tecnico
  const { data: minhasOS = [], isLoading } = useQuery({
    queryKey: ["minhas_avaliacoes", profile?.id, searchTrigger],
    queryFn: async () => {
      if (!profile?.id) return [];
      const from = startDate ? startOfDay(startDate).toISOString() : startOfMonth(now).toISOString();
      const to = endDate ? endOfDay(endDate).toISOString() : endOfDay(endOfMonth(now)).toISOString();

      const { data } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, cliente_nome, cliente_cpf, status, created_at, tipo_servico_id, atendente_id, tecnico_id")
        .eq("status", "concluida")
        .or(`atendente_id.eq.${profile.id},tecnico_id.eq.${profile.id}`)
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!profile?.id,
  });

  // Calculate average score using per-sector SQL function
  const { data: notaMedia } = useQuery({
    queryKey: ["minhas_avaliacoes_media_setor", profile?.id, searchTrigger],
    queryFn: async () => {
      if (!profile?.id) return null;
      const from = startDate ? startOfDay(startDate).toISOString() : startOfMonth(now).toISOString();
      const to = endDate ? endOfDay(endDate).toISOString() : endOfDay(endOfMonth(now)).toISOString();
      const notas = await fetchNotasPorSetor(from, to);
      return calcularMediaColaborador(notas, profile.id);
    },
    enabled: !!profile?.id,
  });

  // Fetch atendente and técnico names for the selected OS
  const { data: osEmployees } = useQuery({
    queryKey: ["os_employees", selectedAval?.id],
    queryFn: async () => {
      if (!selectedAval) return { atendente_nome: null, tecnico_nome: null };
      const names: { atendente_nome: string | null; tecnico_nome: string | null } = { atendente_nome: null, tecnico_nome: null };
      if (selectedAval.atendente_id) {
        const { data } = await supabase.from("profiles").select("nome").eq("id", selectedAval.atendente_id).single();
        names.atendente_nome = data?.nome || null;
      }
      if (selectedAval.tecnico_id) {
        const { data } = await supabase.from("profiles").select("nome").eq("id", selectedAval.tecnico_id).single();
        names.tecnico_nome = data?.nome || null;
      }
      return names;
    },
    enabled: !!selectedAval?.id,
  });

  // Load evaluation details for selected OS
  const { data: avalDetails = [], isLoading: detailLoading } = useQuery({
    queryKey: ["aval_detail", selectedAval?.id],
    queryFn: async () => {
      if (!selectedAval?.id) return [];
      const { data: avals } = await supabase
        .from("avaliacoes")
        .select("id, avaliador_id, concluida, concluida_em, nota_final, tipo_avaliacao_id")
        .eq("ordem_servico_id", selectedAval.id)
        .eq("concluida", true);
      if (!avals || avals.length === 0) return [];

      // Fetch all setores for mapping setor_nota_id to setor name
      const { data: allSetores } = await supabase.from("setores").select("id, nome");
      const setoresMap = new Map((allSetores || []).map(s => [s.id, s.nome]));

      const result = [];
      for (const aval of avals) {
        const { data: respostas } = await supabase
          .from("respostas_avaliacao")
          .select("pergunta_id, resposta, observacao, evidencia_url")
          .eq("avaliacao_id", aval.id);

        if (!respostas || respostas.length === 0) continue;

        const perguntaIds = respostas.map(r => r.pergunta_id);
        let perguntas: any[] = [];
        if (perguntaIds.length > 0) {
          const { data: ps } = await supabase.from("perguntas_avaliacao").select("id, pergunta, peso, target_employee_type, setor_nota_id").in("id", perguntaIds);
          perguntas = ps || [];
        }

        const { data: avaliador } = await supabase.from("profiles").select("nome").eq("id", aval.avaliador_id).single();

        result.push({
          ...aval,
          _avaliador_nome: avaliador?.nome || "—",
          _respostas: respostas.map(r => {
            const pg = perguntas.find(p => p.id === r.pergunta_id);
            const setorNome = pg?.setor_nota_id ? setoresMap.get(pg.setor_nota_id) || null : null;
            // Determine employee type from setor name
            let employeeType = pg?.target_employee_type || "geral";
            if (setorNome) {
              const lower = setorNome.toLowerCase();
              if (lower.includes("atendimento")) employeeType = "atendente";
              else if (lower.includes("cnico") || lower.includes("tecnico")) employeeType = "tecnico";
            }
            return { ...r, pergunta: pg?.pergunta || "—", peso: pg?.peso || 0, target: employeeType, setor_nome: setorNome };
          }),
        });
      }
      return result;
    },
    enabled: !!selectedAval?.id,
  });

  // Calculate per-employee scores from avalDetails
  const employeeScores = useMemo(() => {
    if (!avalDetails || avalDetails.length === 0) return [];
    // Combine all respostas from all evaluations
    const allRespostas = avalDetails.flatMap((a: any) => a._respostas);
    const groups: Record<string, { label: string; nome: string | null; pesoTotal: number; pesoAcertado: number }> = {};

    for (const r of allRespostas) {
      const tipo = r.target === "tecnico" ? "tecnico" : r.target === "atendente" ? "atendente" : null;
      if (!tipo) continue; // skip "geral" - can't assign to specific person
      if (r.resposta === "na") continue; // N/A ignored

      if (!groups[tipo]) {
        groups[tipo] = {
          label: tipo === "atendente" ? "Atendente" : "Técnico",
          nome: tipo === "atendente" ? (osEmployees?.atendente_nome || null) : (osEmployees?.tecnico_nome || null),
          pesoTotal: 0,
          pesoAcertado: 0,
        };
      }
      groups[tipo].pesoTotal += r.peso;
      if (r.resposta === "sim") groups[tipo].pesoAcertado += r.peso;
    }

    return Object.values(groups).map(g => ({
      ...g,
      nota: g.pesoTotal > 0 ? (g.pesoAcertado / g.pesoTotal) * 100 : null,
    }));
  }, [avalDetails, osEmployees]);

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

      {/* Filtro de datas */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="text-caption font-medium text-muted-foreground mb-1 block">Data Início</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                <CalendarIcon className="w-4 h-4 mr-2" />
                {startDate ? format(startDate, "dd/MM/yyyy") : "Selecionar"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <label className="text-caption font-medium text-muted-foreground mb-1 block">Data Fim</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                <CalendarIcon className="w-4 h-4 mr-2" />
                {endDate ? format(endDate, "dd/MM/yyyy") : "Selecionar"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <Button onClick={() => setSearchTrigger(p => p + 1)} className="press-effect">
          <Search className="w-4 h-4 mr-2" /> Buscar
        </Button>
        {notaMedia != null && (
          <div className="flex items-center gap-2 ml-2 bg-muted/50 border border-border rounded-lg px-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">Nota Média:</span>
            <span className={cn("text-lg font-bold font-tabular", notaMedia >= 80 ? "text-success" : notaMedia >= 60 ? "text-warning" : "text-destructive")}>
              {notaMedia.toFixed(1)}%
            </span>
          </div>
        )}
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
          <div className="space-y-5">
            {/* Loading state */}
            {detailLoading && (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-body">Carregando detalhes...</span>
              </div>
            )}

            {/* No data state */}
            {!detailLoading && avalDetails.length === 0 && (
              <p className="text-center text-body text-muted-foreground py-6">Nenhuma avaliação encontrada para esta OS.</p>
            )}

            {/* Avaliações */}
            {avalDetails.map((aval: any) => (
              <div key={aval.id} className="space-y-4">
                {/* Dados do cliente e avaliador */}
                <div className="bg-muted/30 border border-border rounded-lg px-4 py-3 space-y-2">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <p><span className="font-medium text-muted-foreground">Cliente:</span> <span className="text-foreground">{selectedAval?.cliente_nome || "—"}</span></p>
                    <p><span className="font-medium text-muted-foreground">CPF:</span> <span className="text-foreground">{selectedAval?.cliente_cpf || "—"}</span></p>
                    <p><span className="font-medium text-muted-foreground">Avaliador:</span> <span className="text-foreground font-semibold">{aval._avaliador_nome}</span></p>
                    <p><span className="font-medium text-muted-foreground">Data:</span> <span className="text-foreground">{aval.concluida_em ? new Date(aval.concluida_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</span></p>
                  </div>
                </div>

                {/* Tabela de perguntas e respostas */}
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-3 py-2 w-8">#</th>
                        <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Pergunta</th>
                        <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-3 py-2 w-20">Resposta</th>
                        <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-3 py-2 w-16">Nota</th>
                        <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-3 py-2 w-16">Anexos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {aval._respostas.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-4 text-center text-caption text-muted-foreground">Sem respostas registradas.</td></tr>
                      )}
                      {aval._respostas.map((r: any, i: number) => (
                        <tr key={i} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2 text-caption text-muted-foreground font-tabular">{String(i + 1).padStart(2, "0")}</td>
                          <td className="px-3 py-2">
                            <p className="text-sm text-foreground">{r.pergunta}</p>
                            {r.observacao && (
                              <div className="mt-1 flex items-start gap-1 text-destructive">
                                <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                                <p className="text-caption">{r.observacao}</p>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={cn(
                              "inline-block px-2.5 py-0.5 rounded-full text-caption font-semibold",
                              r.resposta === "sim" ? "bg-success/15 text-success" :
                              r.resposta === "nao" ? "bg-destructive/15 text-destructive" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {r.resposta === "sim" ? "Sim" : r.resposta === "nao" ? "Não" : "N/A"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-sm font-tabular text-muted-foreground">{r.peso}</td>
                          <td className="px-3 py-2 text-center">
                            {r.evidencia_url ? (
                              <button onClick={() => window.open(r.evidencia_url, "_blank")} className="inline-flex items-center gap-1 text-primary hover:underline text-caption">
                                <ImageIcon className="w-3.5 h-3.5" /> Ver
                              </button>
                            ) : (
                              <span className="text-caption text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Nota final */}
                  {aval.nota_final != null && (
                    <div className="border-t border-border bg-muted/20 px-4 py-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">Nota Final</span>
                      <span className={cn("text-xl font-bold font-tabular", aval.nota_final >= 80 ? "text-success" : aval.nota_final >= 60 ? "text-warning" : "text-destructive")}>
                        {Number(aval.nota_final).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
