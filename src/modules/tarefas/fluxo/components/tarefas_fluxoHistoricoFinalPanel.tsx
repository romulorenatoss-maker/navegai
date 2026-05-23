import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useFluxoTarefa } from "../hooks/tarefas_useFluxoTarefa";
import { statusLabel } from "../services/tarefas_fluxoStatusMachine";
import { extrairResumosNotas } from "@/modules/tarefas/utils/tarefas_notasResumoUtils";
import { FluxoPerguntaHistoricoCard } from "./tarefas_fluxoPerguntaHistoricoCard";
import { ResumoNotasReadonly } from "./tarefas_resumoNotasReadonly";

interface Props {
  assignmentId: string;
}

type AbaHistoricoFinal = "executor" | "aprovador" | "auditor" | "resumo";

const numberOrNull = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function FluxoHistoricoFinalPanel({ assignmentId }: Props) {
  const { profile, isAdmin } = useAuth();
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
  const profileId = profile?.id ?? null;
  const profileSetorId = (profile as any)?.setor_id ?? null;
  const scoreLog = (tipos: string[]) =>
    numberOrNull(data.scoreLogs.find((log) => tipos.includes(String(log.tipo_score)))?.score_final);
  const notaExecutor =
    resumos.aprovador?.notaFinal ??
    scoreLog(["avaliado", "executor"]) ??
    numberOrNull(a.score_avaliado) ??
    numberOrNull(a.score_executor);
  const notaAprovador =
    resumos.auditor?.notaFinal ??
    scoreLog(["aprovador"]) ??
    numberOrNull(a.score_aprovador);
  const notasParaMedia = [notaExecutor, notaAprovador].filter((v): v is number => v != null);
  const notaMedia = notasParaMedia.length > 0
    ? Math.round((notasParaMedia.reduce((sum, v) => sum + v, 0) / notasParaMedia.length) * 100) / 100
    : null;

  const abas: AbaHistoricoFinal[] = (() => {
    const isExecutor = a.responsavel_id === profileId || (!!profileSetorId && a.setor_executor_id === profileSetorId);
    const isAprovador =
      a.aprovador_id === profileId ||
      a.avaliador_id === profileId ||
      (!!profileSetorId && a.setor_aprovador_id === profileSetorId);
    const isAuditor = a.auditor_id === profileId || (!!profileSetorId && a.setor_auditor_id === profileSetorId);

    if (isAdmin) return ["executor", "aprovador", "auditor", "resumo"];
    if (isAuditor) return ["auditor", "resumo"];
    if (isAprovador) return ["aprovador"];
    if (isExecutor) return ["executor"];
    return ["resumo"];
  })();

  const renderPerguntas = (opts: {
    mostrarPlanosAprovador: boolean;
    mostrarPlanosAuditor: boolean;
  }) => (
    <div className="space-y-3">
      {data.perguntas.map((pergunta) => (
        <FluxoPerguntaHistoricoCard
          key={pergunta.fieldId}
          pergunta={pergunta}
          papel="spectator"
          acoesAtivas={false}
          mostrarPlanosAprovador={opts.mostrarPlanosAprovador}
          mostrarPlanosAuditor={opts.mostrarPlanosAuditor}
        />
      ))}
    </div>
  );

  const renderNotaCard = (titulo: string, nota: number | null, descricao: string) => (
    <Card className="border-blue-200 bg-blue-50/50 max-w-full overflow-hidden">
      <CardContent className="p-4 space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-950 break-words">{titulo}</p>
            <p className="text-xs text-muted-foreground break-words">{descricao}</p>
          </div>
          <p className="text-3xl font-bold text-blue-700 whitespace-nowrap">
            {nota != null ? `${nota} pts` : "--"}
          </p>
        </div>
      </CardContent>
    </Card>
  );

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

      <Tabs defaultValue={abas[0]} className="space-y-3">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
          {abas.includes("executor") && <TabsTrigger value="executor">Executor</TabsTrigger>}
          {abas.includes("aprovador") && <TabsTrigger value="aprovador">Aprovador</TabsTrigger>}
          {abas.includes("auditor") && <TabsTrigger value="auditor">Auditor</TabsTrigger>}
          {abas.includes("resumo") && <TabsTrigger value="resumo">Resumo</TabsTrigger>}
        </TabsList>

        {abas.includes("executor") && (
          <TabsContent value="executor" className="space-y-3 mt-0">
            {renderPerguntas({ mostrarPlanosAprovador: true, mostrarPlanosAuditor: false })}
            <ResumoNotasReadonly
              modo="aprovador"
              data={data}
              notasSalvas={resumos.aprovador?.notas ?? null}
              titulo="Nota do executor"
            />
          </TabsContent>
        )}

        {abas.includes("aprovador") && (
          <TabsContent value="aprovador" className="space-y-3 mt-0">
            {renderPerguntas({ mostrarPlanosAprovador: true, mostrarPlanosAuditor: true })}
            <ResumoNotasReadonly
              modo="auditor"
              data={data}
              notasSalvas={resumos.auditor?.notas ?? null}
              titulo="Nota do aprovador"
            />
          </TabsContent>
        )}

        {abas.includes("auditor") && (
          <TabsContent value="auditor" className="space-y-3 mt-0">
            {renderPerguntas({ mostrarPlanosAprovador: true, mostrarPlanosAuditor: true })}
            <ResumoNotasReadonly
              modo="aprovador"
              data={data}
              notasSalvas={resumos.aprovador?.notas ?? null}
              titulo="Nota do executor"
            />
            <ResumoNotasReadonly
              modo="auditor"
              data={data}
              notasSalvas={resumos.auditor?.notas ?? null}
              titulo="Nota do aprovador"
            />
          </TabsContent>
        )}

        {abas.includes("resumo") && (
          <TabsContent value="resumo" className="space-y-3 mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {renderNotaCard("Nota do executor", notaExecutor, "Nota da etapa de aprovação sobre a execução.")}
              {renderNotaCard("Nota do aprovador", notaAprovador, "Nota da auditoria sobre a aprovação.")}
            </div>
            {renderNotaCard("Média final consolidada", notaMedia, "Média visual das notas disponíveis para esta tarefa.")}
            <ResumoNotasReadonly
              modo="aprovador"
              data={data}
              notasSalvas={resumos.aprovador?.notas ?? null}
              titulo="Resumo da nota do executor"
            />
            <ResumoNotasReadonly
              modo="auditor"
              data={data}
              notasSalvas={resumos.auditor?.notas ?? null}
              titulo="Resumo da nota do aprovador"
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default FluxoHistoricoFinalPanel;
