/**
 * tarefas_fluxoAuditorPanel.tsx
 *
 * Painel do AUDITOR. Comportamento:
 *  - Para cada pergunta: histórico completo (R0 + R1/R2... aprovador + planos auditor)
 *  - Botões Conforme/Não Conforme por pergunta
 *  - Form de criar plano para aprovador (se NC, com builder de itens)
 *  - Botão único "Aprovar auditoria e concluir tarefa"
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { useFluxoTarefa } from "../hooks/tarefas_useFluxoTarefa";
import { useAuditorActions } from "../hooks/tarefas_useAuditorActions";
import { useFluxoPermissoes } from "../hooks/tarefas_useFluxoPermissoes";
import { statusLabel } from "../services/tarefas_fluxoStatusMachine";
import { ItensPlanoBuilder, type ItemPlano } from "@/modules/tarefas/components/tarefas_itensPlanoBuilder";
import { FluxoPerguntaHistoricoCard } from "./tarefas_fluxoPerguntaHistoricoCard";
import { FluxoBotaoConformeNaoConforme } from "./tarefas_fluxoBotaoConformeNaoConforme";

interface Props {
  assignmentId: string;
}

interface PlanoDraft {
  instrucao: string;
  itens: ItemPlano[];
  prazoIso: string;
  criticidade: "baixa" | "media" | "alta";
}

function defaultPlano(): PlanoDraft {
  const prazo = new Date(Date.now() + 24 * 3600 * 1000);
  return {
    instrucao: "",
    itens: [],
    prazoIso: prazo.toISOString().slice(0, 16),
    criticidade: "media",
  };
}

export function FluxoAuditorPanel({ assignmentId }: Props) {
  const { data, isLoading, invalidate } = useFluxoTarefa(assignmentId);
  const actions = useAuditorActions(assignmentId);
  const perms = useFluxoPermissoes(data);

  const [avaliacao, setAvaliacao] = useState<Record<string, "conforme" | "nao_conforme">>({});
  const [planosDraft, setPlanosDraft] = useState<Record<string, PlanoDraft>>({});

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando tarefa...
      </div>
    );
  }

  const a = data.assignment;

  const handleCriarPlano = async (fieldId: string) => {
    const d = planosDraft[fieldId];
    if (!d || d.itens.length === 0) {
      toast.error("Adicione pelo menos 1 item ao plano antes de criar.");
      return;
    }
    try {
      await actions.criarPlanoAprovador.mutateAsync({
        assignmentId,
        fieldId,
        instrucao: d.instrucao,
        itensPlano: d.itens,
        prazoResolucao: d.prazoIso ? new Date(d.prazoIso).toISOString() : new Date(Date.now() + 86400000).toISOString(),
        criticidade: d.criticidade,
      });
      setPlanosDraft((prev) => { const n = { ...prev }; delete n[fieldId]; return n; });
      setAvaliacao((prev) => { const n = { ...prev }; delete n[fieldId]; return n; });
      invalidate();
    } catch { /* toast no hook */ }
  };

  const handleFinalizar = async () => {
    try {
      await actions.aprovarAuditoria.mutateAsync({ assignmentId });
      invalidate();
    } catch { /* toast no hook */ }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between gap-2">
            <span>#{a.numero_tarefa} · {a.nome}</span>
            <Badge variant="outline">{statusLabel(a.status)}</Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      <div className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-900">
          <strong>Modo Auditor.</strong> Revise cada pergunta. Se aprovar tudo, finalize. Se houver não-conformidade, crie um plano de ação para o aprovador na pergunta correspondente.
        </p>
      </div>

      {data.perguntas.map((p) => (
        <FluxoPerguntaHistoricoCard
          key={p.fieldId}
          pergunta={p}
          papel="auditor"
          acoesAtivas={false}
          rodape={
            <div className="space-y-2 mt-2 border-t pt-2">
              {perms.podeAuditorCriarPlanoAprovador && (
                <FluxoBotaoConformeNaoConforme
                  valor={avaliacao[p.fieldId] ?? null}
                  onConforme={() =>
                    setAvaliacao((prev) => ({ ...prev, [p.fieldId]: "conforme" }))
                  }
                  onNaoConforme={() => {
                    setAvaliacao((prev) => ({ ...prev, [p.fieldId]: "nao_conforme" }));
                    setPlanosDraft((prev) => ({
                      ...prev,
                      [p.fieldId]: prev[p.fieldId] ?? defaultPlano(),
                    }));
                  }}
                  disabled={actions.isSubmitting}
                  labelNaoConforme={`Não Conforme · criar plano R${(p.planosAuditor.length || 0) + 1}`}
                />
              )}

              {avaliacao[p.fieldId] === "nao_conforme" && planosDraft[p.fieldId] && (
                <div className="border border-purple-300 rounded-md overflow-hidden">
                  <div className="px-3 py-2 bg-purple-50 border-b border-purple-200">
                    <span className="text-[11px] font-semibold text-purple-800">
                      Novo plano para o aprovador
                    </span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Instrução geral (opcional)</Label>
                      <Textarea
                        value={planosDraft[p.fieldId].instrucao}
                        onChange={(e) =>
                          setPlanosDraft((prev) => ({
                            ...prev,
                            [p.fieldId]: { ...(prev[p.fieldId] ?? defaultPlano()), instrucao: e.target.value },
                          }))
                        }
                        className="text-xs min-h-[44px]"
                        placeholder="O que o aprovador deve corrigir..."
                      />
                    </div>
                    <ItensPlanoBuilder
                      itens={planosDraft[p.fieldId].itens}
                      onChange={(itens) =>
                        setPlanosDraft((prev) => ({
                          ...prev,
                          [p.fieldId]: { ...(prev[p.fieldId] ?? defaultPlano()), itens },
                        }))
                      }
                      compact
                      accentColor="purple"
                    />
                    <div className="space-y-1">
                      <Label className="text-[11px]">Prazo</Label>
                      <Input
                        type="datetime-local"
                        value={planosDraft[p.fieldId].prazoIso}
                        onChange={(e) =>
                          setPlanosDraft((prev) => ({
                            ...prev,
                            [p.fieldId]: { ...(prev[p.fieldId] ?? defaultPlano()), prazoIso: e.target.value },
                          }))
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAvaliacao((prev) => { const n = { ...prev }; delete n[p.fieldId]; return n; });
                          setPlanosDraft((prev) => { const n = { ...prev }; delete n[p.fieldId]; return n; });
                        }}
                        disabled={actions.isSubmitting}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleCriarPlano(p.fieldId)}
                        disabled={actions.isSubmitting || planosDraft[p.fieldId].itens.length === 0}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                      >
                        {actions.isSubmitting ? "Criando..." : "Criar plano e enviar ao aprovador"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          }
        />
      ))}

      {perms.podeAuditorAprovar && (
        <div className="sticky bottom-0 bg-background pt-2 border-t">
          <Button
            type="button"
            size="sm"
            onClick={handleFinalizar}
            disabled={actions.isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {actions.isSubmitting ? "Finalizando..." : "Aprovar auditoria e concluir tarefa"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default FluxoAuditorPanel;
