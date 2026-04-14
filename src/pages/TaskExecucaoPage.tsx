import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Play, CheckCircle2, AlertTriangle, Clock, Camera, MessageSquare, Shield, HelpCircle, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { calculateTaskScore } from "@/hooks/useTaskScoring";
import { PRIORIDADE_CONFIG, NIVEL_CONFIG } from "@/hooks/useTaskScoring";

function formatMinutes(m: number | null): string {
  if (!m) return "—";
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}min` : ""}`;
}

function timeLeft(deadline: string | null): string {
  if (!deadline) return "—";
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "Expirado";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}min`;
}

export default function TaskExecucaoPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("hoje");
  const [actionDialog, setActionDialog] = useState<{ assignment: any; type: string } | null>(null);
  const [obs, setObs] = useState("");

  const profileId = profile?.id;

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["my_task_assignments", profileId],
    queryFn: async () => {
      if (!profileId) return [];
      const { data, error } = await (supabase as any)
        .from("task_assignments")
        .select("*, task_templates(titulo, descricao, prioridade, dificuldade, pontuacao_base, bonus_antecipacao, penalidade_atraso, penalidade_nao_execucao, meta_execucao_minutos, obrigar_observacao, exigir_evidencia_foto, setores(nome))")
        .eq("responsavel_id", profileId)
        .order("data_prevista", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profileId,
  });

  const { data: streak } = useQuery({
    queryKey: ["my_streak", profileId],
    queryFn: async () => {
      if (!profileId) return null;
      const { data } = await (supabase as any).from("task_user_streaks").select("*").eq("profile_id", profileId).maybeSingle();
      return data;
    },
    enabled: !!profileId,
  });

  const today = new Date().toISOString().split("T")[0];

  const filtered = useMemo(() => {
    const hoje = assignments.filter((a: any) => a.data_prevista === today && !["concluida", "nao_executada"].includes(a.status));
    const pendentes = assignments.filter((a: any) => a.status === "pendente" && a.data_prevista !== today);
    const atrasadas = assignments.filter((a: any) => a.status === "atrasada" || (a.status === "pendente" && a.prazo_limite && new Date(a.prazo_limite) < new Date()));
    const concluidas = assignments.filter((a: any) => a.status === "concluida");
    const historico = assignments.filter((a: any) => ["concluida", "nao_executada", "bloqueada"].includes(a.status));
    return { hoje, pendentes, atrasadas, concluidas, historico };
  }, [assignments, today]);

  // Actions
  const startTask = useMutation({
    mutationFn: async (id: string) => {
      await (supabase as any).from("task_assignments").update({ status: "em_andamento", inicio_em: new Date().toISOString() }).eq("id", id);
      if (profileId) {
        await (supabase as any).from("task_execution_logs").insert({ assignment_id: id, profile_id: profileId, acao: "iniciou" });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my_task_assignments"] }); toast.success("Tarefa iniciada!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const completeTask = useMutation({
    mutationFn: async ({ id, observacao }: { id: string; observacao: string }) => {
      const assignment = assignments.find((a: any) => a.id === id);
      if (!assignment) throw new Error("Tarefa não encontrada");
      const tmpl = assignment.task_templates;

      if (tmpl.obrigar_observacao && !observacao.trim()) throw new Error("Observação obrigatória.");

      const now = new Date();
      const inicio = assignment.inicio_em ? new Date(assignment.inicio_em) : now;
      const tempo = Math.round((now.getTime() - inicio.getTime()) / 60000);

      const score = calculateTaskScore({
        pontuacao_base: tmpl.pontuacao_base, bonus_antecipacao: tmpl.bonus_antecipacao,
        penalidade_atraso: tmpl.penalidade_atraso, penalidade_nao_execucao: tmpl.penalidade_nao_execucao,
        meta_execucao_minutos: tmpl.meta_execucao_minutos, prazo_limite: assignment.prazo_limite || now.toISOString(),
        inicio_em: assignment.inicio_em, fim_em: now.toISOString(), tempo_gasto_minutos: tempo, status: "concluida",
      });

      await (supabase as any).from("task_assignments").update({
        status: "concluida", fim_em: now.toISOString(), tempo_gasto_minutos: tempo,
        pontuacao_obtida: score.total, observacao: observacao || null,
      }).eq("id", id);

      if (profileId) {
        await (supabase as any).from("task_execution_logs").insert({ assignment_id: id, profile_id: profileId, acao: "concluiu", detalhes: { score: score.total, tempo } });
        for (const item of score.breakdown) {
          await (supabase as any).from("task_score_logs").insert({ assignment_id: id, profile_id: profileId, tipo: item.tipo, valor: item.valor, descricao: item.descricao });
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my_task_assignments"] }); setActionDialog(null); setObs(""); toast.success("Tarefa concluída! 🎉"); },
    onError: (e: any) => toast.error(e.message),
  });

  const blockTask = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      await (supabase as any).from("task_assignments").update({ status: "bloqueada", motivo_bloqueio: motivo || "Impedimento não especificado" }).eq("id", id);
      if (profileId) {
        await (supabase as any).from("task_execution_logs").insert({ assignment_id: id, profile_id: profileId, acao: "bloqueou", detalhes: { motivo } });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my_task_assignments"] }); setActionDialog(null); setObs(""); toast.info("Tarefa marcada como bloqueada."); },
    onError: (e: any) => toast.error(e.message),
  });

  const renderCard = (a: any) => {
    const tmpl = a.task_templates;
    const prio = PRIORIDADE_CONFIG[tmpl?.prioridade] || PRIORIDADE_CONFIG.media;
    const isRunning = a.status === "em_andamento";
    const isLate = a.prazo_limite && new Date(a.prazo_limite) < new Date() && !["concluida", "nao_executada"].includes(a.status);

    return (
      <div key={a.id} className={`bg-card border rounded-lg p-4 space-y-3 transition-all ${isLate ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-body font-semibold text-foreground truncate">{tmpl?.titulo || "Tarefa"}</h3>
            {tmpl?.descricao && <p className="text-caption text-muted-foreground mt-0.5 line-clamp-2">{tmpl.descricao}</p>}
          </div>
          <Badge variant="outline" className={prio.class}>{prio.label}</Badge>
        </div>

        <div className="flex flex-wrap gap-2 text-caption text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {timeLeft(a.prazo_limite)}</span>
          <span>⏱ {formatMinutes(tmpl?.meta_execucao_minutos)}</span>
          <span>🏆 {tmpl?.pontuacao_base}pts</span>
          {tmpl?.setores?.nome && <span>📍 {tmpl.setores.nome}</span>}
        </div>

        {a.status === "concluida" && (
          <div className="flex items-center gap-2 text-caption">
            <span className="text-green-600 font-semibold">✅ {a.pontuacao_obtida}pts</span>
            <span className="text-muted-foreground">• {formatMinutes(a.tempo_gasto_minutos)}</span>
          </div>
        )}

        {a.status === "bloqueada" && (
          <p className="text-caption text-orange-600">🚫 {a.motivo_bloqueio}</p>
        )}

        {!["concluida", "nao_executada", "bloqueada"].includes(a.status) && (
          <div className="flex gap-2 pt-1">
            {!isRunning && (
              <Button size="sm" onClick={() => startTask.mutate(a.id)} className="press-effect flex-1">
                <Play className="w-3.5 h-3.5 mr-1" /> Iniciar
              </Button>
            )}
            {isRunning && (
              <Button size="sm" onClick={() => setActionDialog({ assignment: a, type: "concluir" })} className="press-effect flex-1 bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Concluir
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setActionDialog({ assignment: a, type: "bloquear" })} className="press-effect">
              <Shield className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  const nivel = streak ? NIVEL_CONFIG[streak.nivel] || NIVEL_CONFIG.bronze : NIVEL_CONFIG.bronze;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      {/* User Stats Header */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-section font-semibold text-foreground">Minhas Tarefas</h1>
          <p className="text-caption text-muted-foreground">Painel de execução</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1.5">
            <span className="text-lg">{nivel.icon}</span>
            <span className={`text-body font-bold ${nivel.color}`}>{nivel.label}</span>
          </div>
          <p className="text-caption text-muted-foreground font-tabular">{streak?.pontuacao_total ?? 0} pts total</p>
          {streak?.streak_atual ? (
            <p className="text-caption text-orange-500 flex items-center gap-1 justify-end"><Flame className="w-3.5 h-3.5" /> {streak.streak_atual} dias</p>
          ) : null}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-5 mb-4">
          <TabsTrigger value="hoje" className="text-caption">Hoje ({filtered.hoje.length})</TabsTrigger>
          <TabsTrigger value="pendentes" className="text-caption">Pendentes ({filtered.pendentes.length})</TabsTrigger>
          <TabsTrigger value="atrasadas" className="text-caption">Atraso ({filtered.atrasadas.length})</TabsTrigger>
          <TabsTrigger value="concluidas" className="text-caption">OK ({filtered.concluidas.length})</TabsTrigger>
          <TabsTrigger value="historico" className="text-caption">Histórico</TabsTrigger>
        </TabsList>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : (
          <>
            <TabsContent value="hoje" className="space-y-3 mt-0">
              {filtered.hoje.length === 0 ? <p className="text-center text-muted-foreground py-8">Nenhuma tarefa para hoje 🎉</p> : filtered.hoje.map(renderCard)}
            </TabsContent>
            <TabsContent value="pendentes" className="space-y-3 mt-0">
              {filtered.pendentes.length === 0 ? <p className="text-center text-muted-foreground py-8">Sem pendências</p> : filtered.pendentes.map(renderCard)}
            </TabsContent>
            <TabsContent value="atrasadas" className="space-y-3 mt-0">
              {filtered.atrasadas.length === 0 ? <p className="text-center text-muted-foreground py-8">Nenhuma tarefa em atraso 👍</p> : filtered.atrasadas.map(renderCard)}
            </TabsContent>
            <TabsContent value="concluidas" className="space-y-3 mt-0">
              {filtered.concluidas.length === 0 ? <p className="text-center text-muted-foreground py-8">Nada concluído ainda</p> : filtered.concluidas.map(renderCard)}
            </TabsContent>
            <TabsContent value="historico" className="space-y-3 mt-0">
              {filtered.historico.length === 0 ? <p className="text-center text-muted-foreground py-8">Sem histórico</p> : filtered.historico.map(renderCard)}
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={() => { setActionDialog(null); setObs(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{actionDialog?.type === "concluir" ? "Concluir Tarefa" : "Reportar Bloqueio"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder={actionDialog?.type === "concluir" ? "Observação sobre a execução..." : "Descreva o impedimento..."}
              value={obs} onChange={e => setObs(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setObs(""); }}>Cancelar</Button>
            {actionDialog?.type === "concluir" ? (
              <Button className="press-effect bg-green-600 hover:bg-green-700" onClick={() => completeTask.mutate({ id: actionDialog.assignment.id, observacao: obs })} disabled={completeTask.isPending}>
                {completeTask.isPending ? "Salvando..." : "Concluir"}
              </Button>
            ) : (
              <Button variant="destructive" className="press-effect" onClick={() => blockTask.mutate({ id: actionDialog!.assignment.id, motivo: obs })} disabled={blockTask.isPending}>
                {blockTask.isPending ? "Salvando..." : "Bloquear"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
