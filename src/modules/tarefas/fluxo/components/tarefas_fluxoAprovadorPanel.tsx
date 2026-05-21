/**
 * tarefas_fluxoAprovadorPanel.tsx
 *
 * Painel do APROVADOR. Comportamento:
 *  - Banner se há plano do auditor pendente
 *  - Para cada pergunta: histórico (R0 + R1/R2... do aprovador + R do auditor)
 *  - Botões Conforme/Não Conforme por pergunta (quando aplicável)
 *  - Form de criar plano para executor (se NC, com builder de itens)
 *  - Form de responder plano do auditor (se há plano pendente)
 *  - Botão único "Aprovar e enviar para auditoria" (quando aplicável)
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, ClipboardList } from "lucide-react";
import { toast } from "sonner";

import { useFluxoTarefa } from "../hooks/tarefas_useFluxoTarefa";
import { useAprovadorActions } from "../hooks/tarefas_useAprovadorActions";
import { useFluxoPermissoes } from "../hooks/tarefas_useFluxoPermissoes";
import { statusLabel } from "../services/tarefas_fluxoStatusMachine";
import { ItensPlanoBuilder, type ItemPlano } from "@/modules/tarefas/components/tarefas_itensPlanoBuilder";
import { FluxoBannerPendenciaAuditor } from "./tarefas_fluxoBannerPendenciaAuditor";
import { FluxoPerguntaHistoricoCard } from "./tarefas_fluxoPerguntaHistoricoCard";
import { FluxoBotaoConformeNaoConforme } from "./tarefas_fluxoBotaoConformeNaoConforme";
import type { RespostaPlanoValorJson } from "../types/tarefas_fluxoTypes";

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

export function FluxoAprovadorPanel({ assignmentId }: Props) {
  const { data, isLoading, invalidate } = useFluxoTarefa(assignmentId);
  const actions = useAprovadorActions(assignmentId);
  const perms = useFluxoPermissoes(data);

  // Avaliação local (conforme/nc) por field_id, antes de criar plano
  const [avaliacao, setAvaliacao] = useState<Record<string, "conforme" | "nao_conforme">>({});
  const [planosDraft, setPlanosDraft] = useState<Record<string, PlanoDraft>>({});
  // Resposta a planos do auditor: estrutura indexada por idx do item
  const [respostasAuditor, setRespostasAuditor] = useState<Record<string, RespostaPlanoValorJson>>({});

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
      await actions.criarPlanoExecutor.mutateAsync({
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

  const handleResponderPlanoAuditor = async (planoId: string) => {
    const resp = respostasAuditor[planoId] ?? {};
    try {
      await actions.responderPlanoAuditor.mutateAsync({
        planoId,
        respostaValorJson: resp,
      });
      setRespostasAuditor((prev) => { const n = { ...prev }; delete n[planoId]; return n; });
      invalidate();
    } catch { /* toast no hook */ }
  };

  const handleAprovar = async () => {
    try {
      await actions.aprovarParaAuditoria.mutateAsync({ assignmentId });
      invalidate();
    } catch { /* toast no hook */ }
  };

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

      <FluxoBannerPendenciaAuditor planosAuditorPendentes={data.planosAuditorPendentes} />

      {data.perguntas.map((p) => (
        <FluxoPerguntaHistoricoCard
          key={p.fieldId}
          pergunta={p}
          papel="aprovador"
          acoesAtivas={true}
          onAprovadorResponderPlanoAuditor={(planoId) => handleResponderPlanoAuditor(planoId)}
          rodape={
            <>
              {/* Botões Conforme/NC por pergunta */}
              {perms.podeAprovadorCriarPlanoExecutorParaField(p.fieldId) && (
                <div className="space-y-2 mt-2 border-t pt-2">
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
                    labelNaoConforme={`Não Conforme · criar plano R${(p.planosAprovador.length || 0) + 1}`}
                  />

                  {/* Form do plano quando NC */}
                  {avaliacao[p.fieldId] === "nao_conforme" && planosDraft[p.fieldId] && (
                    <PlanoForm
                      draft={planosDraft[p.fieldId]}
                      onChange={(patch) =>
                        setPlanosDraft((prev) => ({
                          ...prev,
                          [p.fieldId]: { ...(prev[p.fieldId] ?? defaultPlano()), ...patch },
                        }))
                      }
                      onSubmit={() => handleCriarPlano(p.fieldId)}
                      onCancel={() => {
                        setAvaliacao((prev) => { const n = { ...prev }; delete n[p.fieldId]; return n; });
                        setPlanosDraft((prev) => { const n = { ...prev }; delete n[p.fieldId]; return n; });
                      }}
                      isSubmitting={actions.isSubmitting}
                    />
                  )}
                </div>
              )}

              {/* Form de responder plano do auditor (na pergunta dele) */}
              {p.planosAuditor.filter(x => !x.respondido).map((ap) => (
                <PlanoAuditorRespostaForm
                  key={ap.id}
                  itens={ap.itens_plano}
                  resposta={respostasAuditor[ap.id] ?? {}}
                  onChangeResposta={(idx, patch) =>
                    setRespostasAuditor((prev) => ({
                      ...prev,
                      [ap.id]: { ...(prev[ap.id] ?? {}), [String(idx)]: { ...((prev[ap.id] ?? {})[String(idx)] ?? {}), ...patch } },
                    }))
                  }
                  onEnviar={() => handleResponderPlanoAuditor(ap.id)}
                  isSubmitting={actions.isSubmitting}
                />
              ))}
            </>
          }
        />
      ))}

      {/* Rodapé global: Aprovar e enviar para auditoria */}
      {perms.podeAprovarParaAuditoria && (
        <div className="sticky bottom-0 bg-background pt-2 border-t">
          <Button
            type="button"
            size="sm"
            onClick={handleAprovar}
            disabled={actions.isSubmitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {actions.isSubmitting ? "Aprovando..." : "Aprovar e enviar para auditoria"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Form de criação de plano (instrução + itens + prazo + criticidade)
// ----------------------------------------------------------------------------
function PlanoForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  draft: PlanoDraft;
  onChange: (patch: Partial<PlanoDraft>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}) {
  return (
    <div className="border border-amber-300 rounded-md overflow-hidden max-w-full">
      <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
        <ClipboardList className="h-3.5 w-3.5 text-amber-700" />
        <span className="text-[11px] font-semibold text-amber-800">Novo plano para o executor</span>
      </div>
      <div className="p-3 space-y-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Instrução geral (opcional)</Label>
          <Textarea
            value={draft.instrucao}
            onChange={(e) => onChange({ instrucao: e.target.value })}
            className="text-xs min-h-[44px]"
            placeholder="Descreva o que precisa ser corrigido..."
          />
        </div>
        <ItensPlanoBuilder
          itens={draft.itens}
          onChange={(itens) => onChange({ itens })}
          compact
          accentColor="amber"
        />
        <div className="space-y-1">
          <Label className="text-[11px]">Prazo</Label>
          <Input
            type="datetime-local"
            value={draft.prazoIso}
            onChange={(e) => onChange({ prazoIso: e.target.value })}
            className="h-8 text-xs max-w-full"
          />
        </div>
        <div className="flex gap-1.5">
          {(["baixa", "media", "alta"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ criticidade: c })}
              className={`flex-1 py-1.5 rounded border text-xs font-medium ${
                draft.criticidade === c
                  ? c === "alta"
                    ? "bg-red-100 border-red-400 text-red-700"
                    : c === "media"
                    ? "bg-amber-100 border-amber-400 text-amber-700"
                    : "bg-emerald-100 border-emerald-400 text-emerald-700"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {c === "baixa" ? "Baixa" : c === "media" ? "Média" : "Alta"}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={isSubmitting || draft.itens.length === 0}
            className="w-full sm:flex-1 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isSubmitting ? "Criando..." : "Criar plano e devolver"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Form: aprovador responde plano do auditor (texto/upload por item)
// ----------------------------------------------------------------------------
function PlanoAuditorRespostaForm({
  itens,
  resposta,
  onChangeResposta,
  onEnviar,
  isSubmitting,
}: {
  itens: ItemPlano[];
  resposta: RespostaPlanoValorJson;
  onChangeResposta: (idx: number, patch: any) => void;
  onEnviar: () => void;
  isSubmitting?: boolean;
}) {
  return (
    <div className="border border-purple-300 rounded-md p-2 space-y-2 mt-2 max-w-full overflow-hidden">
      <p className="text-[11px] font-semibold text-purple-800">
        Responder ao auditor:
      </p>
      {itens.map((item, idx) => {
        const r: any = resposta[String(idx)] ?? {};
        if (item.tipo === "texto") {
          return (
            <div key={idx} className="space-y-1">
              <Label className="text-[10px]">
                #{idx + 1} {item.titulo}
                {item.obrigatorio && <span className="text-red-600 ml-1">*</span>}
              </Label>
              <Textarea
                value={r.valor_texto ?? ""}
                onChange={(e) => onChangeResposta(idx, { tipo: item.tipo, valor_texto: e.target.value })}
                className="text-xs min-h-[44px]"
                placeholder={`Resposta: ${item.titulo || "..."}`}
              />
            </div>
          );
        }
        // foto/video/audio: por enquanto só campo URL (upload completo via
        // edge-function pode ser adicionado depois — mesmo padrão do
        // ExecutorPlanoAprovadorCard).
        return (
          <div key={idx} className="space-y-1">
            <Label className="text-[10px]">
              #{idx + 1} {item.titulo} ({item.tipo})
              {item.obrigatorio && <span className="text-red-600 ml-1">*</span>}
            </Label>
            <Input
              value={r.evidencia_url ?? ""}
              onChange={(e) => onChangeResposta(idx, { tipo: item.tipo, evidencia_url: e.target.value })}
              placeholder="URL da evidência (upload via card será reaproveitado em fase de UI)"
              className="h-8 text-xs max-w-full"
            />
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        onClick={onEnviar}
        disabled={isSubmitting}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
      >
        {isSubmitting ? "Enviando..." : "Enviar resposta ao auditor"}
      </Button>
    </div>
  );
}

export default FluxoAprovadorPanel;
