/**
 * tarefas_fluxoBannerPendenciaAuditor.tsx
 *
 * Banner visível no topo da tela do aprovador quando há plano do auditor
 * pendente. Comunica que o aprovador NÃO pode aprovar antes de resolver
 * os planos do auditor.
 */
import { AlertTriangle } from "lucide-react";
import type { PlanoAuditor } from "../types/tarefas_fluxoTypes";

interface Props {
  planosAuditorPendentes: PlanoAuditor[];
}

export function FluxoBannerPendenciaAuditor({ planosAuditorPendentes }: Props) {
  if (planosAuditorPendentes.length === 0) return null;
  return (
    <div className="border border-orange-400 bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
      <div className="text-xs text-orange-900 dark:text-orange-200">
        <p className="font-semibold mb-0.5">
          Você tem {planosAuditorPendentes.length} plano(s) de ação do auditor a serem resolvidos.
        </p>
        <p>
          Enquanto houver pendência do auditor, você não pode aprovar a tarefa nem criar
          planos livres para o executor — exceto em perguntas explicitamente liberadas pelo auditor.
        </p>
      </div>
    </div>
  );
}

export default FluxoBannerPendenciaAuditor;
