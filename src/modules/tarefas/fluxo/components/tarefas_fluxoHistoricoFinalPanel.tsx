import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useFluxoTarefa } from "../hooks/tarefas_useFluxoTarefa";
import { statusLabel } from "../services/tarefas_fluxoStatusMachine";
import { extrairResumosNotas } from "@/modules/tarefas/utils/tarefas_notasResumoUtils";
import { FluxoPerguntaHistoricoCard } from "./tarefas_fluxoPerguntaHistoricoCard";
import { ResumoNotasReadonly } from "./tarefas_resumoNotasReadonly";

interface Props {
  assignmentId: string;
}

export function FluxoHistoricoFinalPanel({ assignmentId }: Props) {
  const { data, isLoading } = useFluxoTarefa(assignmentId);

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando historico...
      </div>
    );
  }

  const a = data.assignment;
  const resumos = extrairResumosNotas(data.auditTrail);

  return (
    <div className="space-y-3">
      <Card className="max-w-full overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
            <span className="min-w-0 break-words whitespace-normal">#{a.numero_tarefa} · {a.nome}</span>
            <Badge variant="outline">{statusLabel(a.status)}</Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {data.perguntas.map((pergunta) => (
        <FluxoPerguntaHistoricoCard
          key={pergunta.fieldId}
          pergunta={pergunta}
          papel="spectator"
          acoesAtivas={false}
        />
      ))}

      <ResumoNotasReadonly
        modo="aprovador"
        data={data}
        notasSalvas={resumos.aprovador?.notas ?? null}
        titulo="Resumo de notas - Aprovacao"
      />

      <ResumoNotasReadonly
        modo="auditor"
        data={data}
        notasSalvas={resumos.auditor?.notas ?? null}
        titulo="Resumo de notas - Auditoria"
      />
    </div>
  );
}

export default FluxoHistoricoFinalPanel;
