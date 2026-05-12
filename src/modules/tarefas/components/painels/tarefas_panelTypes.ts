/**
 * Tipos comuns dos painéis embarcados (Fase 1B.2).
 * Single source: TASK_STATUS, OperationalRole, SolicitacaoConfig.
 */
import type { ComponentType, LazyExoticComponent } from "react";
import type { OperationalRole, OperationalAction } from "@/modules/tarefas/services/tarefas_rbac";
import type { SolicitacaoConfig } from "@/modules/tarefas/services/tarefas_solicitacaoConfig";

export type PanelId =
  | "aceitePrazo"
  | "validacaoSolicitante"
  | "planoAcao"
  | "avaliacao"
  | "aprovacao";

export type PanelOrigem = "drawer" | "lista" | "card";

export type AceiteMode = "executor" | "solicitante";

export interface ResolveCtx {
  assignment: any;
  status: string;
  role: OperationalRole | null;
  isAdmin: boolean;
  profileId: string | null | undefined;
  isResp: boolean;
  isAval: boolean;
  isAprov: boolean;
  isCriador: boolean;
  cfg: SolicitacaoConfig;
  origem: PanelOrigem;
}

export interface PanelProps {
  ctx: ResolveCtx;
  /** Resolvido pelo router; nunca derivado dentro do painel. */
  mode?: AceiteMode;
  onClose?: () => void;
  onActionDone?: (newStatus: string) => void;
}

export interface PanelEntry {
  id: PanelId;
  label: string;
  /** Menor = maior prioridade. */
  priority: number;
  /** Filtro declarativo. Sem efeitos colaterais. */
  match: (ctx: ResolveCtx) => boolean;
  /** Modo passado ao componente (resolvido aqui, não dentro do painel). */
  resolveMode?: (ctx: ResolveCtx) => AceiteMode | undefined;
  /** Ação RBAC mínima exigida (checada por hasOperationalPermission). */
  requiredAction?: OperationalAction;
  /** Lazy import — code-splitting. */
  component: LazyExoticComponent<ComponentType<PanelProps>>;
}
