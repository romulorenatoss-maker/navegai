/**
 * tarefas_useFluxoPermissoes.ts
 *
 * Hook de permissões do fluxo. Verifica papel + status + planos pendentes.
 * NÃO usa apenas permissão global — combina identidade + estado da tarefa.
 *
 * Doc: Regra 0.5 do REGRAS_CLAUDE.md (permissão = papel + status + pendência + plano).
 */
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  canAprovadorAprovarParaAuditoria,
  canAprovadorCriarPlanoExecutor,
  canAprovadorResponderPlanoAuditor,
  canAuditorAprovar,
  canAuditorCriarPlanoAprovador,
  canExecutorEditOriginal,
  canExecutorEnviarRespostas,
  canExecutorResponderPlanoAprovador,
} from "../services/tarefas_fluxoStatusMachine";
import type { TarefaFluxoData } from "../types/tarefas_fluxoTypes";

export interface FluxoPermissoes {
  isExecutor: boolean;
  isAprovador: boolean;
  isAuditor: boolean;
  isCriador: boolean;
  isAdmin: boolean;
  papelAtivo: TarefaFluxoData["papelUsuario"];

  // Executor
  podeEditarOriginal: boolean;
  podeEnviarRespostas: boolean;
  podeResponderPlanoAprovador: boolean;

  // Aprovador
  podeAprovarParaAuditoria: boolean;
  podeResponderPlanoAuditor: boolean;
  /**
   * Função: aprovador pode criar plano para executor em uma pergunta
   * específica? Considera o gate do plano do auditor pendente.
   */
  podeAprovadorCriarPlanoExecutorParaField: (fieldId: string) => boolean;

  // Auditor
  podeAuditorCriarPlanoAprovador: boolean;
  podeAuditorAprovar: boolean;

  // Bandeira global (UI usa para mostrar banner)
  temPlanoAuditorPendente: boolean;
  temPlanoAprovadorPendente: boolean;
}

const PERMS_VAZIA: FluxoPermissoes = {
  isExecutor: false,
  isAprovador: false,
  isAuditor: false,
  isCriador: false,
  isAdmin: false,
  papelAtivo: "spectator",
  podeEditarOriginal: false,
  podeEnviarRespostas: false,
  podeResponderPlanoAprovador: false,
  podeAprovarParaAuditoria: false,
  podeResponderPlanoAuditor: false,
  podeAprovadorCriarPlanoExecutorParaField: () => false,
  podeAuditorCriarPlanoAprovador: false,
  podeAuditorAprovar: false,
  temPlanoAuditorPendente: false,
  temPlanoAprovadorPendente: false,
};

export function useFluxoPermissoes(
  fluxoData: TarefaFluxoData | null,
): FluxoPermissoes {
  const { profile, isAdmin } = useAuth();

  return useMemo<FluxoPermissoes>(() => {
    if (!fluxoData) return PERMS_VAZIA;

    const a = fluxoData.assignment;
    const profileId = profile?.id ?? null;
    if (!profileId) return PERMS_VAZIA;

    const isExecutor = a.responsavel_id === profileId;
    const isAprovador =
      a.aprovador_id === profileId || a.avaliador_id === profileId;
    const isAuditor = a.auditor_id === profileId;
    const isCriador = a.created_by === profileId;

    const status = a.status;
    const planosAprovPendentes = fluxoData.planosAprovadorPendentes;
    const planosAuditPendentes = fluxoData.planosAuditorPendentes;

    return {
      isExecutor,
      isAprovador,
      isAuditor,
      isCriador,
      isAdmin: !!isAdmin,
      papelAtivo: fluxoData.papelUsuario,

      // Executor
      podeEditarOriginal:
        (isExecutor || !!isAdmin) && canExecutorEditOriginal(status),
      podeEnviarRespostas:
        (isExecutor || !!isAdmin) && canExecutorEnviarRespostas(status),
      podeResponderPlanoAprovador:
        (isExecutor || !!isAdmin) &&
        canExecutorResponderPlanoAprovador(status, planosAprovPendentes),

      // Aprovador
      podeAprovarParaAuditoria:
        (isAprovador || !!isAdmin) &&
        canAprovadorAprovarParaAuditoria(
          status,
          planosAprovPendentes,
          planosAuditPendentes,
        ),
      podeResponderPlanoAuditor:
        (isAprovador || !!isAdmin) &&
        canAprovadorResponderPlanoAuditor(status, planosAuditPendentes),
      podeAprovadorCriarPlanoExecutorParaField: (fieldId: string) =>
        (isAprovador || !!isAdmin) &&
        canAprovadorCriarPlanoExecutor(status, planosAuditPendentes, fieldId),

      // Auditor
      podeAuditorCriarPlanoAprovador:
        (isAuditor || !!isAdmin) && canAuditorCriarPlanoAprovador(status),
      podeAuditorAprovar:
        (isAuditor || !!isAdmin) &&
        canAuditorAprovar(status, planosAuditPendentes),

      temPlanoAuditorPendente: planosAuditPendentes.length > 0,
      temPlanoAprovadorPendente: planosAprovPendentes.length > 0,
    };
  }, [fluxoData, profile?.id, isAdmin]);
}
