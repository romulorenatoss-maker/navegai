import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPontuacaoConfig,
  type AprovadorPerguntaPadrao,
} from "@/modules/tarefas/services/tarefas_pontuacao_config_service";
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
  fonte?: string | null;
}

export interface ResumoNotasDestino {
  tipo: "pessoa" | "setor" | "nao_mapeado";
  label: string;
}

const isManual = (p: AprovadorPerguntaPadrao) =>
  p.metrica_calculo === "manual" || p.origem_pergunta === "manual_padrao_configuracao";

const fieldId = (field: any, index: number) =>
  String(field?.id ?? field?.tempId ?? `${field?.label ?? "pergunta"}-${index}`);

const getSnapshotFields = (data: TarefaFluxoData | null) => {
  const frozen = data?.assignment?.template_snapshot?.fields;
  const live = data?.assignment?.operational_templates?.ada_config_snapshot?.fields;
  return (Array.isArray(frozen) ? frozen : Array.isArray(live) ? live : []) as any[];
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
  if (pessoaId) return { tipo: "pessoa", label: "pendente de backend" };
  if (setorId) return { tipo: "setor", label: "pendente de backend" };
  if (destinoScore) {
    return {
      tipo: destinoScore === "setor" ? "setor" : "pessoa",
      label: "pendente de backend",
    };
  }
  return { tipo: "nao_mapeado", label: "pendente de backend" };
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
    const destino = getDestino(data);
    const pacote =
      modo === "auditor"
        ? (config?.validador_pacote_padrao ?? [])
        : (config?.aprovador_pacote_padrao ?? []);

    const perguntasAutomaticas: ResumoNotasPergunta[] = pacote
      .filter((p) => p.ativo && !isManual(p))
      .sort((a, b) => a.ordem - b.ordem)
      .map((p) => ({
        id: p.id,
        ordem: p.ordem,
        pergunta: p.pergunta,
        origem: "automatica",
        tipo: p.tipo,
        peso: Number(p.peso ?? 0),
        descontoAplicado: null,
        pontoDevolvidoNa: Number(p.peso ?? 0),
        valorExibido: p.metrica_pendente ? "Pendente de backend" : "Aguardando resultado do serviço",
        permiteNa: true,
        metricaPendente: !!p.metrica_pendente,
        fonte: p.fonte_dados ?? null,
      }));

    const perguntasManuaisBase =
      modo === "auditor"
        ? pacote.filter((p) => p.ativo && isManual(p)).map((p) => ({
            id: p.id,
            ordem: p.ordem,
            pergunta: p.pergunta,
            tipo: p.tipo,
            peso: Number(p.peso ?? 0),
          }))
        : fields
            .filter((f) => f?.aprovador_verificar && String(f?.aprovador_pergunta ?? "").trim())
            .map((f, index) => ({
              id: fieldId(f, index),
              ordem: Number(f?.ordem ?? index + 1),
              pergunta: String(f.aprovador_pergunta),
              tipo: String(f.aprovador_tipo_resposta ?? "conforme_nao_conforme"),
              peso: Number(f.aprovador_peso ?? f.peso ?? 0),
            }));

    const perguntasManuais: ResumoNotasPergunta[] = perguntasManuaisBase
      .sort((a, b) => a.ordem - b.ordem)
      .map((p) => ({
        ...p,
        origem: "manual" as const,
        descontoAplicado: null,
        pontoDevolvidoNa: p.peso,
        valorExibido: "Resposta manual pendente",
        permiteNa: true,
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
