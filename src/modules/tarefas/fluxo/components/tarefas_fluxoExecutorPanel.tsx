/**
 * tarefas_fluxoExecutorPanel.tsx
 *
 * Painel do EXECUTOR.
 *
 * Regras visuais:
 * - R0 usa o renderer original da pergunta.
 * - Depois do envio, R0 fica read-only.
 * - Planos R1/R2/R3 do aprovador aparecem abaixo da pergunta vinculada.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Clock, Play, CheckCircle2, Lock, Circle, Timer } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

import { useFluxoTarefa } from "../hooks/tarefas_useFluxoTarefa";
import { useExecutorActions } from "../hooks/tarefas_useExecutorActions";
import { useFluxoPermissoes } from "../hooks/tarefas_useFluxoPermissoes";
import { ExecutorPlanoAprovadorCard } from "@/modules/tarefas/components/tarefas_executorPlanoAprovadorCard";
import { DynamicFieldRenderer } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { FluxoPlanoAprovadorCard } from "./tarefas_fluxoPlanoAprovadorCard";
import { tarefasExtrairSlaResponsabilidades } from "@/modules/tarefas/utils/tarefas_slaPrazoUtils";
import type { ExecutorRespostaInput } from "../services/tarefas_fluxoRpcService";
import type { TarefaFluxoPergunta } from "../types/tarefas_fluxoTypes";

interface Props {
  assignmentId: string;
  meusSetorIds?: string[];
}

export function FluxoExecutorPanel({ assignmentId, meusSetorIds = [] }: Props) {
  const { profile, isAdmin } = useAuth();
  const { data, isLoading, invalidate } = useFluxoTarefa(assignmentId);
  const actions = useExecutorActions(assignmentId);
  const perms = useFluxoPermissoes(data, meusSetorIds);

  const [rascunho, setRascunho] = useState<Record<string, ExecutorRespostaInput>>({});
  const [etapaSelecionadaId, setEtapaSelecionadaId] = useState<string | null>(null);
  const [etapaEmAndamentoId, setEtapaEmAndamentoId] = useState<string | null>(null);
  const [etapaIniciadaEm, setEtapaIniciadaEm] = useState<number | null>(null);
  const [etapasConcluidas, setEtapasConcluidas] = useState<Record<string, boolean>>({});
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!etapaEmAndamentoId) return;
    const timer = window.setInterval(() => setTick((prev) => prev + 1), 1000);
    return () => window.clearInterval(timer);
  }, [etapaEmAndamentoId]);

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando tarefa...
      </div>
    );
  }

  const a = data.assignment;
  const sla = tarefasExtrairSlaResponsabilidades(a);

  const sectionById = (() => {
    const snap = a.template_snapshot ?? {};
    const liveSnap = a.operational_templates?.ada_config_snapshot ?? {};
    const sections = Array.isArray(snap.sections)
      ? snap.sections
      : Array.isArray(liveSnap.sections)
        ? liveSnap.sections
        : [];
    const map = new Map<string, any>();
    sections.forEach((section: any, index: number) => {
      const id = String(section?.id ?? section?.tempId ?? section?.section_id ?? `section-${index}`);
      map.set(id, section);
    });
    return map;
  })();

  const updateRascunho = (fieldId: string, patch: Partial<ExecutorRespostaInput>) => {
    setRascunho((prev) => ({
      ...prev,
      [fieldId]: { field_id: fieldId, ...(prev[fieldId] ?? { field_id: fieldId }), ...patch },
    }));
  };

  const handleEnviar = async () => {
    const respostas = Object.values(rascunho);
    if (respostas.length === 0) {
      toast.error("Preencha pelo menos uma resposta antes de enviar.");
      return;
    }

    try {
      await actions.enviarRespostas.mutateAsync({ assignmentId, respostas });
      setRascunho({});
      invalidate();
    } catch {
      // O hook ja mostra o toast de erro.
    }
  };

  const respostasPorPergunta = data.perguntas.reduce<Record<string, any>>((acc, pergunta) => {
    const resposta = (rascunho[pergunta.fieldId] as any) ?? (pergunta.respostaOriginalExecutor as any);
    if (resposta) acc[pergunta.fieldId] = resposta;
    return acc;
  }, {});

  const formatHorarioEtapa = (inicio?: any, fim?: any) => {
    const inicioFormatado = inicio ? String(inicio).slice(0, 5) : "";
    const fimFormatado = fim ? String(fim).slice(0, 5) : "";
    if (inicioFormatado && fimFormatado) return `${inicioFormatado} - ${fimFormatado}`;
    return inicioFormatado || null;
  };

  const respostaAtual = (pergunta: TarefaFluxoPergunta) =>
    (rascunho[pergunta.fieldId] as any) ?? (pergunta.respostaOriginalExecutor as any) ?? null;

  const respostaTemValor = (resposta: any) => !!resposta && (
    (resposta.valor_texto != null && resposta.valor_texto !== "") ||
    resposta.valor_numero != null ||
    resposta.valor_booleano != null ||
    resposta.valor_data != null ||
    resposta.valor_json != null
  );

  const perguntaExigeEvidencia = (pergunta: TarefaFluxoPergunta) => {
    const resposta = respostaAtual(pergunta);
    const regras = Array.isArray((pergunta.snapshot as any).opcoes_regras)
      ? ((pergunta.snapshot as any).opcoes_regras as any[])
      : [];
    const valorSelecionado = resposta?.valor_texto === "na"
      ? "na"
      : resposta?.valor_booleano === true
        ? (pergunta.tipo === "sim_nao" ? "sim" : "conforme")
        : resposta?.valor_booleano === false
          ? (pergunta.tipo === "sim_nao" ? "nao" : "nao_conforme")
          : null;
    const regraSelecionada = valorSelecionado
      ? regras.find((regra) => regra?.valor === valorSelecionado)
      : null;
    return !!pergunta.snapshot.exige_evidencia || !!regraSelecionada?.requer_evidencia;
  };

  const perguntaCompleta = (pergunta: TarefaFluxoPergunta) => {
    const resposta = respostaAtual(pergunta);
    if (pergunta.obrigatorio && !respostaTemValor(resposta)) return false;
    if (perguntaExigeEvidencia(pergunta) && !resposta?.evidencia_url && !resposta?.evidencia_anexo_id) return false;
    return true;
  };

  const etapas = (() => {
    const grupos = new Map<string, {
      id: string;
      label: string;
      horario?: string | null;
      ordem: number;
      perguntas: TarefaFluxoPergunta[];
    }>();

    data.perguntas.forEach((pergunta, index) => {
      const snapshot: any = pergunta.snapshot ?? {};
      const sectionId = snapshot.section_id ? String(snapshot.section_id) : "";
      const section = sectionId ? sectionById.get(sectionId) : null;
      const horarioInicio = section?.horario_inicio ?? snapshot.horario_inicio ?? snapshot.horario_inicio_previsto ?? null;
      const horarioFim = section?.horario_fim ?? snapshot.horario_fim ?? snapshot.horario_limite ?? null;
      const fallbackKey = sectionId || (horarioInicio ? `horario:${horarioInicio}-${horarioFim ?? ""}` : "etapa-unica");
      const ordem = Number(section?.ordem ?? snapshot.section_ordem ?? snapshot.ordem ?? index);
      const label = String(section?.nome ?? section?.label ?? section?.titulo ?? snapshot.section_label ?? "").trim();

      if (!grupos.has(fallbackKey)) {
        grupos.set(fallbackKey, {
          id: fallbackKey,
          label,
          horario: formatHorarioEtapa(horarioInicio, horarioFim),
          ordem,
          perguntas: [],
        });
      }

      grupos.get(fallbackKey)!.perguntas.push(pergunta);
    });

    return Array.from(grupos.values())
      .sort((etapaA, etapaB) => etapaA.ordem - etapaB.ordem)
      .map((etapa, index) => ({
        ...etapa,
        label: etapa.label || `Etapa ${index + 1}`,
        perguntas: etapa.perguntas.sort((perguntaA, perguntaB) => perguntaA.ordem - perguntaB.ordem),
      }));
  })();

  const etapaPreenchida = (etapa: (typeof etapas)[number]) => etapa.perguntas.every(perguntaCompleta);
  const todasEtapasConcluidas = etapas.every((etapa) => !!etapasConcluidas[etapa.id]);
  const etapaAtualIndexRaw = etapas.findIndex((etapa) => !etapasConcluidas[etapa.id]);
  const etapaAtualIndex = etapaAtualIndexRaw === -1 ? Math.max(0, etapas.length - 1) : etapaAtualIndexRaw;
  const activeEtapaId = etapaSelecionadaId ?? etapas[etapaAtualIndex]?.id ?? etapas[0]?.id ?? null;
  const fluxoPorEtapas = etapas.length > 1 || data.perguntas.some((pergunta) => !!pergunta.snapshot.section_id);

  const getEtapaStatus = (etapa: (typeof etapas)[number], index: number) => {
    if (etapasConcluidas[etapa.id]) return "concluida";
    if (etapaEmAndamentoId === etapa.id) return "em_andamento";
    if (index === 0 || etapas.slice(0, index).every((etapaAnterior) => !!etapasConcluidas[etapaAnterior.id])) return "liberada";
    return "bloqueada";
  };

  const formatElapsed = () => {
    if (!etapaIniciadaEm) return "00:00";
    const elapsed = Math.max(0, Math.floor((Date.now() - etapaIniciadaEm) / 1000));
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const iniciarEtapa = (etapaId: string) => {
    setEtapaSelecionadaId(etapaId);
    setEtapaEmAndamentoId(etapaId);
    setEtapaIniciadaEm(Date.now());
  };

  const finalizarEtapa = (etapa: (typeof etapas)[number]) => {
    if (!etapaPreenchida(etapa)) {
      toast.error("Preencha obrigatorias e evidencias desta etapa antes de finalizar.");
      return;
    }

    setEtapasConcluidas((prev) => ({ ...prev, [etapa.id]: true }));
    if (etapaEmAndamentoId === etapa.id) {
      setEtapaEmAndamentoId(null);
      setEtapaIniciadaEm(null);
    }
    toast.success(`${etapa.label} finalizada.`);
  };

  return (
    <div className="space-y-3">
      {fluxoPorEtapas && (
        <div className="sticky top-0 z-10 -mx-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-2">
          <div className="flex gap-1.5 overflow-x-auto px-1 py-1">
            {etapas.map((etapa, index) => {
              const status = getEtapaStatus(etapa, index);
              const isActive = activeEtapaId === etapa.id;
              const StatusIcon = status === "concluida" ? CheckCircle2 : status === "bloqueada" ? Lock : status === "em_andamento" ? Play : Circle;
              return (
                <button
                  key={etapa.id}
                  type="button"
                  onClick={() => {
                    setEtapaSelecionadaId(etapa.id);
                  }}
                  className={[
                    "shrink-0 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                    isActive ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground",
                    status === "concluida" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "",
                    status === "bloqueada" ? "opacity-60" : "hover:bg-muted",
                  ].join(" ")}
                >
                  <StatusIcon className="h-3 w-3" />
                  <span className="max-w-[92px] truncate">{etapa.label}</span>
                  {etapa.horario && <span className="text-[10px] opacity-80">{etapa.horario}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {etapas.map((etapa, etapaIndex) => {
        const etapaStatus = getEtapaStatus(etapa, etapaIndex);
        const etapaEmAndamento = etapaEmAndamentoId === etapa.id;
        const podeResponderEtapa = etapaEmAndamento && etapaStatus !== "bloqueada" && !etapasConcluidas[etapa.id];
        const perguntasPendentes = etapa.perguntas.filter((pergunta) => !perguntaCompleta(pergunta)).length;

        return (
          <section key={etapa.id} className="space-y-3 rounded-lg border border-border bg-card/30 p-2 sm:p-3">
            {fluxoPorEtapas && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold truncate">{etapa.label}</h3>
                    {etapa.horario && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" /> {etapa.horario}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {etapasConcluidas[etapa.id]
                      ? "Etapa finalizada"
                      : etapaPreenchida(etapa)
                        ? "Etapa preenchida, pronta para finalizar"
                        : `${perguntasPendentes} pendencia(s) obrigatoria(s)/evidencia(s)`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {etapaEmAndamento && etapaIniciadaEm && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium">
                      <Timer className="h-3 w-3" /> {formatElapsed()}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={etapaStatus === "bloqueada" || etapaEmAndamento || !!etapasConcluidas[etapa.id]}
                    onClick={() => iniciarEtapa(etapa.id)}
                  >
                    <Play className="h-3 w-3 mr-1" /> Iniciar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={etapaStatus === "bloqueada" || !etapaPreenchida(etapa) || !!etapasConcluidas[etapa.id]}
                    onClick={() => finalizarEtapa(etapa)}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Finalizar
                  </Button>
                </div>
              </div>
            )}

            {etapaStatus === "bloqueada" && (
              <div className="flex items-center gap-2 rounded-md border border-muted bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                Etapa bloqueada ate concluir a etapa anterior.
              </div>
            )}

            {etapa.perguntas.map((pergunta) => {
              const planosDaPergunta = [...pergunta.planosAprovador].sort((aPlano, bPlano) => aPlano.rodada - bPlano.rodada);
              const planosRespondidos = planosDaPergunta.filter((plano) => plano.respondido);
              const planosPendentes = planosDaPergunta.filter((plano) => !plano.respondido);
              const perguntaReadonly = !perms.podeEditarOriginal || planosDaPergunta.length > 0 || (fluxoPorEtapas && !podeResponderEtapa);

              return (
                <div key={pergunta.fieldId} className="space-y-2 max-w-full">
                  <DynamicFieldRenderer
                    field={pergunta.snapshot as any}
                    answer={
                      perguntaReadonly
                        ? ((pergunta.respostaOriginalExecutor as any) ?? null)
                        : ((rascunho[pergunta.fieldId] as any) ?? (pergunta.respostaOriginalExecutor as any) ?? null)
                    }
                    review={null as any}
                    userRole="executor"
                    disabled={perguntaReadonly}
                    allAnswers={respostasPorPergunta}
                    onChange={(fieldId: string, patch: any) => {
                      if (!perguntaReadonly) updateRascunho(fieldId, patch);
                    }}
                    assignmentId={a.id}
                    numeroTarefa={a.numero_tarefa ?? 0}
                    nomeTarefa={a.nome ?? "tarefa"}
                    origemTarefa={(a.origem ?? "rotina") as any}
                    profileId={profile?.id}
                    responsavelId={a.responsavel_id ?? undefined}
                    setorExecutorId={a.setor_executor_id ?? undefined}
                    meusSetorIds={meusSetorIds}
                    isAdmin={isAdmin}
                    lockOriginal={perguntaReadonly}
                  />

                  {planosDaPergunta.length > 0 && (
                    <div className="space-y-2 pl-2 sm:pl-3 border-l-2 border-amber-300 max-w-full">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Historico incremental desta pergunta ({planosDaPergunta.length})
                      </p>
                      {planosRespondidos.map((plano) => (
                    <FluxoPlanoAprovadorCard
                      key={plano.id}
                      plano={plano}
                      papel="executor"
                      podeResponder={false}
                      slaPadraoHoras={sla.executorPlanoAprovadorHoras}
                      excluirFimSemanaSla={sla.excluirFimSemana}
                    />
                      ))}
                      {planosPendentes.map((plano) => (
                    <ExecutorPlanoAprovadorCard
                      key={plano.id}
                      plano={plano}
                      fieldLabel={pergunta.label}
                      assignmentId={a.id}
                      tipoTarefa={(a.origem ?? "rotina") as string}
                      codigoTarefa={`#${String(a.numero_tarefa ?? "").padStart(4, "0")}`}
                      nomeTarefa={a.nome ?? "tarefa"}
                      slaPadraoHoras={sla.executorPlanoAprovadorHoras}
                      excluirFimSemanaSla={sla.excluirFimSemana}
                      isResponding={actions.responderPlanoAprovador.isPending}
                      onResponder={async (input) => {
                        await actions.responderPlanoAprovador.mutateAsync(input);
                      }}
                    />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}

      {perms.podeEnviarRespostas && data.planosAprovadorPendentes.length === 0 && (
        <div className="sticky bottom-0 bg-background pt-2 border-t">
          <Button
            type="button"
            size="sm"
            onClick={handleEnviar}
            disabled={actions.isSubmitting || (fluxoPorEtapas && !todasEtapasConcluidas)}
            className="w-full"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {actions.isSubmitting
              ? "Enviando..."
              : fluxoPorEtapas && !todasEtapasConcluidas
                ? "Finalize todas as etapas para enviar"
                : "Enviar respostas ao aprovador"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default FluxoExecutorPanel;
