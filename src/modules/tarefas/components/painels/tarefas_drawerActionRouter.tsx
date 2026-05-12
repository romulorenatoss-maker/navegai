/**
 * Router declarativo dos painéis embarcados (Fase 1B.2).
 *
 * Não tem if/else encadeado. Lê PANEL_REGISTRY, filtra por match,
 * ordena por prioridade e renderiza o painel principal lazy.
 * Demais painéis elegíveis aparecem em chip "Outras ações disponíveis".
 *
 * Pode ser ligado em qualquer drawer (a 1B.3 cuidará da integração).
 */
import { Suspense, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectivePermissions } from "@/hooks/usePermissions";
import {
  resolveAssignmentRole,
  hasOperationalPermission,
} from "@/modules/tarefas/services/tarefas_rbac";
import { getSolicitacaoConfig } from "@/modules/tarefas/services/tarefas_solicitacaoConfig";
import { PANEL_REGISTRY } from "./tarefas_panelRegistry";
import type { PanelEntry, PanelOrigem, ResolveCtx } from "./tarefas_panelTypes";

interface Props {
  assignment: any;
  origem?: PanelOrigem;
  onClose?: () => void;
  onActionDone?: (newStatus: string) => void;
}

function buildCtx(args: {
  assignment: any;
  profileId: string | null | undefined;
  isAdmin: boolean;
  origem: PanelOrigem;
}): ResolveCtx {
  const { assignment, profileId, isAdmin, origem } = args;
  const role = resolveAssignmentRole({ profileId, assignment }, isAdmin);
  return {
    assignment,
    status: assignment?.status,
    role,
    isAdmin,
    profileId,
    isResp: assignment?.responsavel_id === profileId,
    isAval: assignment?.avaliador_id === profileId,
    isAprov: assignment?.aprovador_id === profileId,
    isCriador: assignment?.created_by === profileId,
    cfg: getSolicitacaoConfig(assignment),
    origem,
  };
}

function passesRbac(entry: PanelEntry, ctx: ResolveCtx, perms: any[]): boolean {
  if (!entry.requiredAction) return true;
  return hasOperationalPermission({
    action: entry.requiredAction,
    isAdmin: ctx.isAdmin,
    permissions: perms,
    assignmentRole: ctx.role,
  });
}

export function DrawerActionRouter({ assignment, origem = "drawer", onClose, onActionDone }: Props) {
  const { profile, isAdmin } = useAuth() as any;
  const { permissions } = useEffectivePermissions();
  const [forcedId, setForcedId] = useState<string | null>(null);

  const ctx = useMemo(
    () => buildCtx({ assignment, profileId: profile?.id, isAdmin: !!isAdmin, origem }),
    [assignment, profile?.id, isAdmin, origem],
  );

  const eligible = useMemo(() => {
    return PANEL_REGISTRY
      .filter((e) => e.match(ctx) && passesRbac(e, ctx, permissions || []))
      .sort((a, b) => a.priority - b.priority);
  }, [ctx, permissions]);

  if (eligible.length === 0) return null;

  const primary =
    (forcedId && eligible.find((e) => e.id === forcedId)) || eligible[0];
  const others = eligible.filter((e) => e !== primary);
  const Comp = primary.component;
  const mode = primary.resolveMode?.(ctx);

  return (
    <div className="space-y-3">
      <Suspense fallback={<div className="text-xs text-muted-foreground">Carregando painel…</div>}>
        <Comp ctx={ctx} mode={mode} onClose={onClose} onActionDone={onActionDone} />
      </Suspense>

      {others.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
          <span className="text-xs text-muted-foreground">Outras ações disponíveis:</span>
          {others.map((e) => (
            <button
              key={`${e.id}-${e.priority}`}
              type="button"
              onClick={() => setForcedId(e.id)}
              className="inline-flex items-center h-7 px-2.5 rounded-full text-xs border bg-card hover:bg-muted"
            >
              {e.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
