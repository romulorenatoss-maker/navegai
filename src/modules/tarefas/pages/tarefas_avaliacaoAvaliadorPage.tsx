/**
 * PR C — Tela dedicada da "Avaliação do Avaliador" (AdA).
 * Rota: /tarefas/avaliacao-avaliador/:id
 *
 * Layout split-pane:
 *   - Esquerda: contexto da tarefa principal (read-only).
 *   - Direita: formulário AdA (perguntas do snapshot + observação + envio).
 *
 * Reutiliza tabelas existentes:
 *   - operational_assignments (linha tipo_assignment='avaliacao_avaliador')
 *   - template_snapshot (jsonb) guarda perguntas_padrao + respostas + respondido_em
 */
import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Send, Loader2, ClipboardCheck, User, Calendar, Star } from "lucide-react";
import { toast } from "sonner";
import type { AdaPerguntaPadrao } from "@/modules/tarefas/services/tarefas_ada_config_service";

interface AssignmentRow {
  id: string;
  status: string;
  tipo_assignment: string;
  parent_assignment_id: string | null;
  ada_avaliador_avaliado_id: string | null;
  ada_responsavel_definido_id: string | null;
  responsavel_id: string | null;
  setor_executor_id: string | null;
  template_snapshot: any;
  data_prevista: string;
  numero_tarefa: number;
  observacao: string | null;
}

export default function TarefasAvaliacaoAvaliadorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile, isAdmin } = useAuth();

  const [respostas, setRespostas] = useState<Record<string, any>>({});
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: assignment, isLoading } = useQuery({
    queryKey: ["ada_assignment", id],
    queryFn: async (): Promise<AssignmentRow | null> => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("operational_assignments")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: parent } = useQuery({
    queryKey: ["ada_parent", assignment?.parent_assignment_id],
    queryFn: async () => {
      if (!assignment?.parent_assignment_id) return null;
      const { data } = await (supabase as any)
        .from("operational_assignments")
        .select("*, operational_templates(nome), responsavel:responsavel_id(nome), avaliador:avaliador_id(nome)")
        .eq("id", assignment.parent_assignment_id)
        .maybeSingle();
      return data;
    },
    enabled: !!assignment?.parent_assignment_id,
  });

  const { data: avaliadoProfile } = useQuery({
    queryKey: ["ada_avaliado", assignment?.ada_avaliador_avaliado_id],
    queryFn: async () => {
      if (!assignment?.ada_avaliador_avaliado_id) return null;
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, nome, foto_url, email")
        .eq("id", assignment.ada_avaliador_avaliado_id)
        .maybeSingle();
      return data;
    },
    enabled: !!assignment?.ada_avaliador_avaliado_id,
  });

  // Setores do usuário (para acesso por setor)
  const { data: meusSetorIds = [] } = useQuery({
    queryKey: ["my_setor_ids_ada", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await (supabase as any)
        .from("profile_setores")
        .select("setor_id")
        .eq("profile_id", profile.id);
      return (data || []).map((r: any) => r.setor_id);
    },
    enabled: !!profile?.id,
  });

  const snapshot = assignment?.template_snapshot || {};
  const perguntas: AdaPerguntaPadrao[] = useMemo(() => {
    const arr = Array.isArray(snapshot?.perguntas_padrao) ? snapshot.perguntas_padrao : [];
    return [...arr].sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0));
  }, [snapshot]);

  const jaRespondida = !!snapshot?.respondido_em || ["concluida", "aprovada"].includes(assignment?.status || "");

  const podeResponder = useMemo(() => {
    if (!profile?.id || !assignment) return false;
    if (jaRespondida) return false;
    if (isAdmin) return true;
    if (assignment.ada_responsavel_definido_id === profile.id) return true;
    if (assignment.responsavel_id === profile.id) return true;
    if (assignment.setor_executor_id && meusSetorIds.includes(assignment.setor_executor_id)) return true;
    return false;
  }, [assignment, profile?.id, isAdmin, meusSetorIds, jaRespondida]);

  // Pré-carrega respostas existentes (revisão)
  useMemo(() => {
    if (snapshot?.respostas && typeof snapshot.respostas === "object") {
      setRespostas(snapshot.respostas);
    }
    if (snapshot?.observacao_avaliador && !observacao) {
      setObservacao(snapshot.observacao_avaliador);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.respondido_em]);

  function setResposta(qid: string, valor: any) {
    setRespostas((p) => ({ ...p, [qid]: valor }));
  }

  function validar(): string | null {
    for (const p of perguntas) {
      if (!p.obrigatorio) continue;
      const v = respostas[p.id];
      if (v === undefined || v === null || v === "") return `Responda: "${p.pergunta}"`;
    }
    return null;
  }

  function calcularPontuacao(): number {
    let total = 0;
    let max = 0;
    for (const p of perguntas) {
      if (!p.gera_pontuacao) continue;
      max += Number(p.pontos || 0);
      const v = respostas[p.id];
      if (p.tipo === "sim_nao") {
        if (v === true || v === "sim") total += Number(p.pontos || 0);
      } else if (p.tipo === "nota") {
        const n = Number(v);
        const notaMax = Number(snapshot?.nota_maxima || 100);
        if (!Number.isNaN(n) && notaMax > 0) total += (n / notaMax) * Number(p.pontos || 0);
      } else if (p.tipo === "escolha" || p.tipo === "texto") {
        if (v) total += Number(p.pontos || 0);
      }
    }
    if (max <= 0) return 0;
    return Math.round((total / max) * 100);
  }

  async function submeter() {
    if (!profile?.id || !assignment) return;
    const erro = validar();
    if (erro) {
      toast.error(erro);
      return;
    }
    setSubmitting(true);
    try {
      const score = calcularPontuacao();
      const novoSnapshot = {
        ...snapshot,
        respostas,
        observacao_avaliador: observacao || null,
        respondido_em: new Date().toISOString(),
        respondido_por: profile.id,
        pontuacao_calculada: score,
      };
      const { error } = await (supabase as any)
        .from("operational_assignments")
        .update({
          template_snapshot: novoSnapshot,
          status: "concluida",
          fim_em: new Date().toISOString(),
          pontuacao_obtida: score,
          score_avaliador: score,
          observacao: observacao || null,
        })
        .eq("id", assignment.id);
      if (error) throw error;

      // History
      await (supabase as any).from("operational_assignment_history").insert({
        assignment_id: assignment.id,
        tipo_evento: "AVALIACAO_DO_AVALIADOR_CONCLUIDA",
        etapa: "avaliacao_avaliador",
        detalhes_json: { score, respostas },
        usuario_id: profile.id,
      });

      toast.success("Avaliação do avaliador enviada.");
      qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
      qc.invalidateQueries({ queryKey: ["ada_assignment", assignment.id] });
      navigate("/tarefas/minhas");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Avaliação não encontrada.</p>
        <Button variant="ghost" onClick={() => navigate("/tarefas/minhas")} className="mt-4">
          <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  if (assignment.tipo_assignment !== "avaliacao_avaliador") {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Esta tarefa não é uma Avaliação do Avaliador.</p>
        <Button variant="ghost" onClick={() => navigate("/tarefas/minhas")} className="mt-4">
          <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/tarefas/minhas")}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded">
            <ClipboardCheck className="w-3.5 h-3.5" /> Avaliação do Avaliador
          </span>
          {jaRespondida && (
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded">
              Concluída
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Painel esquerdo: contexto */}
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground border-b pb-2">Contexto da tarefa avaliada</h2>

          {parent ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[10px] font-mono font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                  #{String(parent.numero_tarefa).padStart(4, "0")}
                </span>
                <span className="font-medium">{parent.operational_templates?.nome || "Tarefa"}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" /> Executor</div>
                  <div className="font-medium">{parent.responsavel?.nome || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground flex items-center gap-1"><Star className="w-3 h-3" /> Avaliador</div>
                  <div className="font-medium">{parent.avaliador?.nome || avaliadoProfile?.nome || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Data</div>
                  <div className="font-medium">{parent.data_prevista}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Status final</div>
                  <div className="font-medium capitalize">{parent.status?.replace(/_/g, " ")}</div>
                </div>
                {parent.score_executor != null && (
                  <div>
                    <div className="text-muted-foreground">Nota do executor</div>
                    <div className="font-medium">{Math.round(parent.score_executor)} pts</div>
                  </div>
                )}
              </div>

              {parent.observacao && (
                <div className="text-xs">
                  <div className="text-muted-foreground mb-1">Observação do avaliador (na tarefa original)</div>
                  <div className="bg-muted/30 rounded p-2 whitespace-pre-wrap">{parent.observacao}</div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Tarefa de origem não encontrada.</p>
          )}

          <div className="border-t pt-3">
            <div className="text-xs text-muted-foreground mb-1">Avaliador a ser avaliado</div>
            <div className="text-sm font-medium">{avaliadoProfile?.nome || "—"}</div>
            {avaliadoProfile?.email && (
              <div className="text-xs text-muted-foreground">{avaliadoProfile.email}</div>
            )}
          </div>
        </Card>

        {/* Painel direito: formulário AdA */}
        <Card className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-foreground border-b pb-2">
            {jaRespondida ? "Respostas registradas" : "Sua avaliação"}
          </h2>

          {!podeResponder && !jaRespondida && (
            <div className="text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 p-2 rounded">
              Você não tem permissão para responder esta avaliação.
            </div>
          )}

          {perguntas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma pergunta configurada no template.</p>
          ) : (
            <div className="space-y-4">
              {perguntas.map((p, idx) => (
                <div key={p.id} className="space-y-2">
                  <Label className="text-sm">
                    {idx + 1}. {p.pergunta}
                    {p.obrigatorio && <span className="text-destructive ml-1">*</span>}
                  </Label>

                  {p.tipo === "texto" && (
                    <Textarea
                      value={respostas[p.id] ?? ""}
                      onChange={(e) => setResposta(p.id, e.target.value)}
                      disabled={!podeResponder}
                      rows={3}
                    />
                  )}

                  {p.tipo === "sim_nao" && (
                    <RadioGroup
                      value={respostas[p.id] === true ? "sim" : respostas[p.id] === false ? "nao" : ""}
                      onValueChange={(v) => setResposta(p.id, v === "sim")}
                      disabled={!podeResponder}
                      className="flex gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="sim" id={`${p.id}-sim`} />
                        <Label htmlFor={`${p.id}-sim`} className="text-sm cursor-pointer">Sim</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="nao" id={`${p.id}-nao`} />
                        <Label htmlFor={`${p.id}-nao`} className="text-sm cursor-pointer">Não</Label>
                      </div>
                    </RadioGroup>
                  )}

                  {p.tipo === "nota" && (
                    <Input
                      type="number"
                      min={Number(snapshot?.nota_minima ?? 0)}
                      max={Number(snapshot?.nota_maxima ?? 100)}
                      value={respostas[p.id] ?? ""}
                      onChange={(e) => setResposta(p.id, e.target.value)}
                      disabled={!podeResponder}
                    />
                  )}

                  {p.tipo === "escolha" && (
                    <Select
                      value={respostas[p.id] ?? ""}
                      onValueChange={(v) => setResposta(p.id, v)}
                      disabled={!podeResponder}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {(Array.isArray((p as any).opcoes) ? (p as any).opcoes : ["Ótimo", "Bom", "Regular", "Ruim"]).map((op: string) => (
                          <SelectItem key={op} value={op}>{op}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {p.gera_pontuacao && (
                    <div className="text-[10px] text-muted-foreground">Vale {p.pontos} pts</div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm">Observação geral</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Comentário opcional sobre a atuação do avaliador..."
              disabled={!podeResponder}
              rows={3}
            />
          </div>

          {jaRespondida && snapshot?.pontuacao_calculada != null && (
            <div className="text-sm bg-primary/5 p-2 rounded">
              Pontuação registrada: <strong>{snapshot.pontuacao_calculada} pts</strong>
            </div>
          )}

          {podeResponder && (
            <Button onClick={submeter} disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar avaliação
            </Button>
          )}
        </Card>
      </div>
    </div>
  );
}
