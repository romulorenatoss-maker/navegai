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
import { AlertTriangle, Loader2, Send, ClipboardList, Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { useFluxoTarefa } from "../hooks/tarefas_useFluxoTarefa";
import { useAprovadorActions } from "../hooks/tarefas_useAprovadorActions";
import { useFluxoPermissoes } from "../hooks/tarefas_useFluxoPermissoes";
import { statusLabel } from "../services/tarefas_fluxoStatusMachine";
import { ItensPlanoBuilder, type ItemPlano } from "@/modules/tarefas/components/tarefas_itensPlanoBuilder";
import { EvidenciaPreview } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { FluxoBannerPendenciaAuditor } from "./tarefas_fluxoBannerPendenciaAuditor";
import { FluxoPerguntaHistoricoCard } from "./tarefas_fluxoPerguntaHistoricoCard";
import { FluxoBotaoConformeNaoConforme } from "./tarefas_fluxoBotaoConformeNaoConforme";
import { ResumoNotasModal } from "./tarefas_resumoNotasModal";
import type { RespostaPlanoValorJson } from "../types/tarefas_fluxoTypes";

interface Props {
  assignmentId: string;
}

interface PlanoDraft {
  instrucao: string;
  itens: ItemPlano[];
  prazoIso: string;
  prazoPadraoIso: string;
  criticidade: "baixa" | "media" | "alta";
}

function defaultPlano(): PlanoDraft {
  const prazo = new Date(Date.now() + 24 * 3600 * 1000);
  const prazoIso = prazo.toISOString().slice(0, 16);
  return {
    instrucao: "",
    itens: [],
    prazoIso,
    prazoPadraoIso: prazoIso,
    criticidade: "media",
  };
}

const formatarPrazoPlano = (value: string) => {
  const [data, hora] = value.split("T");
  const [ano, mes, dia] = (data ?? "").split("-");
  return dia && mes && ano && hora ? `${dia}/${mes}/${ano} ${hora}` : value;
};

const prazoAcimaDoSlaPadrao = (draft: PlanoDraft) => {
  const prazoPadrao = new Date(draft.prazoPadraoIso).getTime();
  const prazoAtual = new Date(draft.prazoIso).getTime();
  if (!Number.isFinite(prazoPadrao) || !Number.isFinite(prazoAtual)) return false;
  return prazoAtual > prazoPadrao;
};

export function FluxoAprovadorPanel({ assignmentId }: Props) {
  const { data, isLoading, invalidate } = useFluxoTarefa(assignmentId);
  const actions = useAprovadorActions(assignmentId);
  const perms = useFluxoPermissoes(data);

  // Avaliação local (conforme/nc) por field_id, antes de criar plano
  const [avaliacao, setAvaliacao] = useState<Record<string, "conforme" | "nao_conforme">>({});
  const [planosDraft, setPlanosDraft] = useState<Record<string, PlanoDraft>>({});
  // Resposta a planos do auditor: estrutura indexada por idx do item
  const [respostasAuditor, setRespostasAuditor] = useState<Record<string, RespostaPlanoValorJson>>({});
  const [resumoOpen, setResumoOpen] = useState(false);

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

  const handleAprovar = async (notas?: unknown) => {
    try {
      await actions.aprovarParaAuditoria.mutateAsync({ assignmentId, notas });
      setResumoOpen(false);
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

      {data.perguntas.map((p) => {
        const planosAuditorPendentes = p.planosAuditor.filter((x) => !x.respondido);
        const existePlanoExecutorPendente = p.planosAprovador.some((plano) => !plano.respondido && !plano.deleted_at);
        const decisaoPergunta = avaliacao[p.fieldId] ?? null;
        const bloquearRespostaAuditor = existePlanoExecutorPendente || decisaoPergunta !== "conforme";
        const motivoBloqueioRespostaAuditor = existePlanoExecutorPendente
          ? "Aguardando resposta do executor antes de responder ao auditor."
          : decisaoPergunta === "nao_conforme"
            ? "Envie o plano de ação ao executor; a resposta ao auditor fica bloqueada até o retorno."
            : "Marque Conforme para liberar o envio ao auditor ou Não Conforme para criar plano ao executor.";

        return (
        <FluxoPerguntaHistoricoCard
          key={p.fieldId}
          pergunta={p}
          papel="aprovador"
          acoesAtivas={true}
          prazoExecucao={a.prazo_execucao}
          onAprovadorResponderPlanoAuditor={(planoId) => handleResponderPlanoAuditor(planoId)}
          entrePlanosAprovadorEAuditor={
            perms.podeAprovadorCriarPlanoExecutorParaField(p.fieldId) ? (
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
                  disabled={actions.isSubmitting || existePlanoExecutorPendente}
                  labelNaoConforme={`Não Conforme · criar plano R${(p.planosAprovador.length || 0) + 1}`}
                />

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
            ) : null
          }
          rodape={
            <>
              {planosAuditorPendentes.length > 0 && (
                <div className="space-y-2 mt-2 border-t pt-2">
                  {/* Form de responder plano do auditor (na pergunta dele) */}
                  {planosAuditorPendentes.map((ap) => (
                    <PlanoAuditorRespostaForm
                      key={ap.id}
                      planoId={ap.id}
                      assignmentId={a.id}
                      tipoTarefa={(a.origem ?? "rotina") as string}
                      codigoTarefa={`#${String(a.numero_tarefa ?? "").padStart(4, "0")}`}
                      nomeTarefa={a.nome ?? "tarefa"}
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
                      disabled={bloquearRespostaAuditor}
                      disabledReason={motivoBloqueioRespostaAuditor}
                    />
                  ))}
                </div>
              )}
            </>
          }
        />
        );
      })}

      {/* Rodapé global: Aprovar e enviar para auditoria */}
      {perms.podeAprovarParaAuditoria && (
        <div className="sticky bottom-0 bg-background pt-2 border-t">
          <Button
            type="button"
            size="sm"
            onClick={() => setResumoOpen(true)}
            disabled={actions.isSubmitting}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {actions.isSubmitting ? "Aprovando..." : "Aprovar e ver resumo"}
          </Button>
        </div>
      )}

      <ResumoNotasModal
        open={resumoOpen}
        onOpenChange={setResumoOpen}
        modo="aprovador"
        data={data}
        isSubmitting={actions.isSubmitting}
        onConfirmar={handleAprovar}
      />
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
  const prazoPenalizado = prazoAcimaDoSlaPadrao(draft);

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
          {prazoPenalizado && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Prazo acima do SLA padrao ({formatarPrazoPlano(draft.prazoPadraoIso)}). Sera penalizado na nota.
              </span>
            </div>
          )}
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
  planoId,
  assignmentId,
  tipoTarefa,
  codigoTarefa,
  nomeTarefa,
  itens,
  resposta,
  onChangeResposta,
  onEnviar,
  isSubmitting,
  disabled,
  disabledReason,
}: {
  planoId: string;
  assignmentId: string;
  tipoTarefa: string;
  codigoTarefa: string;
  nomeTarefa: string;
  itens: ItemPlano[];
  resposta: RespostaPlanoValorJson;
  onChangeResposta: (idx: number, patch: any) => void;
  onEnviar: () => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const completo = itens.every((item, idx) => {
    if (!item.obrigatorio) return true;
    const r: any = resposta[String(idx)] ?? {};
    if (item.tipo === "texto" || (item.tipo as string) === "descricao") {
      return !!r.valor_texto?.trim();
    }
    return !!r.evidencia_url;
  });

  const mediaConfig = (tipo: string) => {
    if (tipo === "foto") return { accept: "image/*", capture: "environment" as const, label: "Tirar foto" };
    if (tipo === "video") return { accept: "video/*", capture: "environment" as const, label: "Gravar video" };
    if (tipo === "audio") return { accept: "audio/*", capture: undefined, label: "Gravar audio" };
    return { accept: "*/*", capture: undefined, label: "Selecionar arquivo" };
  };

  const handleUpload = async (idx: number, item: ItemPlano, file: File) => {
    const slot = String(idx);
    try {
      setUploadingSlot(slot);
      setProgress((prev) => ({ ...prev, [slot]: 0 }));

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessao expirada");

      const fd = new FormData();
      fd.append("file", file);
      fd.append("contexto_tipo", "plano_acao");
      fd.append("contexto_ref_id", planoId);
      fd.append("assignment_id", assignmentId);
      fd.append("tipo_tarefa", tipoTarefa);
      fd.append("codigo_tarefa", codigoTarefa);
      fd.append("nome_tarefa", nomeTarefa);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tarefas-storage-upload`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          setProgress((prev) => ({ ...prev, [slot]: Math.round((ev.loaded / ev.total) * 100) }));
        }
      };

      const result = await new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && json.ok) resolve(json);
            else reject(new Error(json?.erro || json?.error || "Erro ao enviar arquivo."));
          } catch {
            reject(new Error("Erro ao processar resposta do upload."));
          }
        };
        xhr.onerror = () => reject(new Error("Erro de rede ao enviar arquivo."));
        xhr.send(fd);
      });

      onChangeResposta(idx, {
        tipo: item.tipo,
        evidencia_url: result.anexo.path_relativo,
        evidencia_anexo_id: result.anexo.id,
        evidencia_mime_type: result.anexo.mime_type ?? file.type,
      });
    } catch (e: any) {
      toast.error(e.message || "Falha no upload");
    } finally {
      setUploadingSlot(null);
    }
  };

  return (
    <div className="border border-purple-300 rounded-md p-2 space-y-2 mt-2 max-w-full overflow-hidden">
      <p className="text-[11px] font-semibold text-purple-800">
        Responder ao auditor:
      </p>
      {disabled && disabledReason && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          {disabledReason}
        </div>
      )}
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
                disabled={disabled || isSubmitting}
                className="text-xs min-h-[44px]"
                placeholder={`Resposta: ${item.titulo || "..."}`}
              />
            </div>
          );
        }

        const cfg = mediaConfig(item.tipo);
        const slot = String(idx);
        const isUploadingThis = uploadingSlot === slot;
        const prog = progress[slot] ?? 0;

        return (
          <div key={idx} className="space-y-1">
            <Label className="text-[10px]">
              #{idx + 1} {item.titulo} ({item.tipo})
              {item.obrigatorio && <span className="text-red-600 ml-1">*</span>}
            </Label>
            {r.evidencia_url ? (
              <div className="space-y-1.5">
                <EvidenciaPreview
                  anexoId={r.evidencia_anexo_id ?? null}
                  url={r.evidencia_url}
                  mimeType={r.evidencia_mime_type ?? null}
                  onRemove={() =>
                    onChangeResposta(idx, {
                      tipo: item.tipo,
                      evidencia_url: null,
                      evidencia_anexo_id: null,
                      evidencia_mime_type: null,
                    })
                  }
                />
                <p className="text-[10px] text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Evidencia anexada.
                </p>
              </div>
            ) : (
              <label className={`flex items-center justify-center gap-2 border border-dashed rounded p-3 cursor-pointer hover:border-purple-500 transition-colors min-h-[48px] ${(isUploadingThis || disabled || isSubmitting) ? "opacity-60 pointer-events-none" : ""}`}>
                {isUploadingThis ? (
                  <div className="flex flex-col items-center gap-1 w-full">
                    <Loader2 className="h-4 w-4 animate-spin text-purple-700" />
                    <span className="text-xs">{prog}%</span>
                    <div className="w-full bg-muted rounded-full h-1">
                      <div className="bg-purple-600 h-1 rounded-full transition-all" style={{ width: `${prog}%` }} />
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5 text-purple-700" />
                    <span className="text-xs">{cfg.label}</span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept={cfg.accept}
                  capture={cfg.capture}
                  disabled={disabled || isSubmitting}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(idx, item, file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        size="sm"
        onClick={onEnviar}
        disabled={disabled || isSubmitting || !completo}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white"
      >
        {isSubmitting ? "Enviando..." : "Enviar resposta ao auditor"}
      </Button>
      {!completo && (
        <p className="text-[10px] text-muted-foreground text-center">
          Preencha todos os itens obrigatórios antes de enviar.
        </p>
      )}
    </div>
  );
}

export default FluxoAprovadorPanel;
