import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPontuacaoConfig,
  type AprovadorPerguntaPadrao,
} from "@/modules/tarefas/services/tarefas_pontuacao_config_service";
import { calcularRespostaAutomatica, type ResultadoCalculoOcorrencia } from "../services/tarefas_resumoNotasCalculoService";
import type { TarefaFluxoData } from "../types/tarefas_fluxoTypes";

export type ResumoNotasModo = "aprovador" | "auditor";
export type ResumoNotasOrigem = "automatica" | "manual";

export interface ResumoNotasPergunta {
  id: string;
  ordem: number;
  pergunta: string;
  origem: ResumoNotasOrigem;
  tipo: string;
  peso: number;
  descontoAplicado: number | null;
  pontoDevolvidoNa: number;
  valorExibido: string;
  permiteNa: boolean;
  metricaPendente: boolean;
  respostaAutomatica?: "sim" | "nao" | null;
  fonte?: string | null;
  ocorrencias?: ResultadoCalculoOcorrencia[];
}

export interface ResumoNotasDestino {
  tipo: "pessoa" | "setor" | "nao_mapeado";
  label: string;
}

const fieldId = (field: any, index: number) =>
  String(field?.id ?? field?.tempId ?? `${field?.label ?? "pergunta"}-${index}`);

const getSnapshotFields = (data: TarefaFluxoData | null) => {
  const frozen = data?.assignment?.template_snapshot?.fields;
  const live = data?.assignment?.operational_templates?.ada_config_snapshot?.fields;
  return (Array.isArray(frozen) ? frozen : Array.isArray(live) ? live : []) as any[];
};

const getSnapshotChecklists = (data: TarefaFluxoData | null, modo: ResumoNotasModo) => {
  const frozen = data?.assignment?.template_snapshot;
  const live = data?.assignment?.operational_templates?.ada_config_snapshot;
  const snap = frozen?.ada_config_snapshot ?? frozen;
  const key = modo === "auditor" ? "validador" : "aprovador";
  const legacyKey = modo === "auditor" ? "auditor" : "aprovador";
  const fromFrozen = snap?.checklists?.[key] ?? snap?.checklists?.[legacyKey];
  const fromLive = live?.checklists?.[key] ?? live?.checklists?.[legacyKey];
  const list = Array.isArray(fromFrozen) && fromFrozen.length > 0 ? fromFrozen : fromLive;
  return (Array.isArray(list) ? list : []) as any[];
};

const firstString = (...vals: any[]): string | null => {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};

const getDestino = (data: TarefaFluxoData | null): ResumoNotasDestino => {
  const assignment: any = data?.assignment ?? {};
  const snap: any = assignment?.template_snapshot ?? {};
  const live: any = assignment?.operational_templates?.ada_config_snapshot ?? {};
  const tpl: any = assignment?.operational_templates ?? {};
  const destinoScore = snap.destino_score ?? live.destino_score ?? assignment?.destino_score;

  const pessoaNome = firstString(
    assignment?.avaliado?.nome,
    assignment?.profiles_aval?.nome,
    assignment?.profile_avaliado?.nome,
    snap?.avaliado_nome,
    snap?.avaliado?.nome,
    live?.avaliado_nome,
    live?.avaliado?.nome,
    tpl?.avaliado_nome,
  );
  const pessoaId =
    assignment?.avaliado_id ?? snap?.avaliado_profile_id ?? live?.avaliado_profile_id ?? null;

  const setorNome = firstString(
    assignment?.setor_avaliado?.nome,
    assignment?.setor_avaliado_nome,
    snap?.setor_avaliado_nome,
    snap?.setor_avaliado?.nome,
    live?.setor_avaliado_nome,
    live?.setor_avaliado?.nome,
    tpl?.setor_avaliado_nome,
  );
  const setorId =
    assignment?.setor_avaliado_id ?? snap?.avaliado_setor_id ?? live?.avaliado_setor_id ?? null;

  if (pessoaNome) return { tipo: "pessoa", label: pessoaNome };
  if (setorNome) return { tipo: "setor", label: setorNome };
  if (pessoaId) return { tipo: "pessoa", label: "nome nao carregado" };
  if (setorId) return { tipo: "setor", label: "nome nao carregado" };
  if (destinoScore) {
    return {
      tipo: destinoScore === "setor" ? "setor" : "pessoa",
      label: "nome nao carregado",
    };
  }
  return { tipo: "nao_mapeado", label: "destino nao mapeado" };
};

const getPerguntaId = (p: any, index: number) =>
  String(p?.tempId ?? p?.id ?? p?.pergunta_origem_id ?? `${p?.pergunta ?? p?.pergunta_padrao ?? "pergunta"}-${index}`);

const getPerguntaTexto = (p: any) =>
  String(p?.pergunta ?? p?.pergunta_padrao ?? p?.label ?? "Pergunta sem titulo");

const getMetrica = (p: any) =>
  String(p?.metrica_calculo ?? p?.metric_key ?? "manual");

const getOrigem = (p: any): ResumoNotasOrigem => {
  const origem = String(p?.origem ?? p?.origem_pergunta ?? "");
  const metrica = getMetrica(p);
  return origem.includes("manual") || metrica === "manual" ? "manual" : "automatica";
};

export function useResumoNotas(data: TarefaFluxoData | null, modo: ResumoNotasModo) {
  const configQ = useQuery({
    queryKey: ["tarefas_pontuacao_config_resumo_notas"],
    queryFn: getPontuacaoConfig,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const config = configQ.data;
    const fields = getSnapshotFields(data);
    const checklistSnapshot = getSnapshotChecklists(data, modo).filter((p) => p?.ativo !== false);
    const destino = getDestino(data);
    const pacoteGlobal =
      modo === "auditor"
        ? ((config?.validador_pacote_padrao ?? []) as AprovadorPerguntaPadrao[])
        : ((config?.aprovador_pacote_padrao ?? []) as AprovadorPerguntaPadrao[]);
    const pacote = (checklistSnapshot.length > 0 ? checklistSnapshot : pacoteGlobal).filter((p: any) => p?.ativo !== false);

    const perguntasAutomaticas: ResumoNotasPergunta[] = pacote
      .filter((p: any) => getOrigem(p) === "automatica")
      .sort((a: any, b: any) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0))
      .map((p: any, index: number) => {
        const peso = Number(p.peso ?? 0);
        const calculo = calcularRespostaAutomatica(data, modo, getMetrica(p));
        return {
          id: getPerguntaId(p, index),
          ordem: Number(p.ordem ?? index + 1),
          pergunta: getPerguntaTexto(p),
          origem: "automatica",
          tipo: String(p.tipo ?? "sim_nao"),
          peso,
          descontoAplicado: calculo.calculavel ? (calculo.tiraPonto ? peso : 0) : null,
          pontoDevolvidoNa: peso,
          valorExibido: calculo.label,
          permiteNa: p.permite_na !== false,
          metricaPendente: !calculo.calculavel,
          respostaAutomatica: calculo.resposta,
          fonte: calculo.fonte,
          ocorrencias: calculo.ocorrencias ?? [],
        };
      });

    const perguntasManuaisBase = pacote
      .filter((p: any) => getOrigem(p) === "manual")
      .map((p: any, index: number) => ({
        id: getPerguntaId(p, index),
        ordem: Number(p.ordem ?? index + 1),
        pergunta: getPerguntaTexto(p),
        tipo: String(p.tipo ?? "conforme_nao_conforme"),
        peso: Number(p.peso ?? 0),
        permiteNa: p.permite_na !== false,
      }));

    const perguntasManuaisCampos =
      modo === "aprovador"
        ? fields
            .filter((f) => f?.aprovador_verificar && String(f?.aprovador_pergunta ?? "").trim())
            .map((f, index) => ({
              id: fieldId(f, index),
              ordem: Number(f?.ordem ?? index + 1),
              pergunta: String(f.aprovador_pergunta),
              tipo: String(f.aprovador_tipo_resposta ?? "conforme_nao_conforme"),
              peso: Number(f.aprovador_peso ?? f.peso ?? 0),
              permiteNa: true,
            }))
        : [];

    const perguntasManuais: ResumoNotasPergunta[] = [...perguntasManuaisBase, ...perguntasManuaisCampos]
      .sort((a, b) => a.ordem - b.ordem)
      .map((p) => ({
        ...p,
        origem: "manual" as const,
        descontoAplicado: null,
        pontoDevolvidoNa: p.peso,
        valorExibido: "Resposta manual pendente",
        permiteNa: p.permiteNa,
        metricaPendente: false,
        fonte: null,
      }));

    return {
      isLoading: configQ.isLoading,
      destino,
      perguntasAutomaticas,
      perguntasManuais,
      scoreExistente: {
        executor: data?.assignment.score_executor ?? null,
        aprovacao: data?.assignment.score_aprovacao ?? null,
        aprovador: data?.assignment.score_aprovador ?? null,
        auditor: data?.assignment.score_auditor ?? null,
      },
      backendPendente: perguntasAutomaticas.some((p) => p.metricaPendente) || destino.tipo === "nao_mapeado",
    };
  }, [configQ.data, configQ.isLoading, data, modo]);
}
