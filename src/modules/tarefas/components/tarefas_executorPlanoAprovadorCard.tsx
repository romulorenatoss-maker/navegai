/**
 * Card dedicado a resposta do executor ao plano de acao aberto pelo aprovador.
 * Le de tarefas_planos_acao_aprovador via prop e escreve pela RPC
 * tarefas_rpc_executor_responder_plano_aprovador.
 *
 * Responsabilidade unica: render, estado local e chamada a mutation.
 *
 * Doc:
 *   src/modules/tarefas/docs/tarefas_rpc_executor_responder_plano_aprovador.md
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Upload, Loader2, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EvidenciaPreview } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { toast } from "sonner";
import type {
  PlanoAcaoRow,
  PlanoAcaoItem,
  PlanoAcaoRespostaPayload,
} from "@/modules/tarefas/hooks/tarefas_usePlanosAcao";

interface Props {
  plano: PlanoAcaoRow;
  fieldLabel?: string;
  assignmentId: string;
  /** Origem da tarefa: "rotina" ou "ad_hoc". Usado para montar o path no Drive. */
  tipoTarefa: string;
  /** Código visível da tarefa (ex: "#0025"). Vai pra pasta no Drive. */
  codigoTarefa: string;
  /** Nome da tarefa (do template). Vira slug na pasta do Drive. */
  nomeTarefa: string;
  onResponder: (input: { planoId: string; respostaValorJson: PlanoAcaoRespostaPayload }) => Promise<unknown>;
  isResponding?: boolean;
}

export function ExecutorPlanoAprovadorCard({ plano, fieldLabel, assignmentId, tipoTarefa, codigoTarefa, nomeTarefa, onResponder, isResponding }: Props) {
  const [respostas, setRespostas] = useState<PlanoAcaoRespostaPayload>({});
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const itens = (plano.itens_plano ?? []) as PlanoAcaoItem[];
  // 🆕 Validação por ÍNDICE do item (suporta N do mesmo tipo).
  const completo = itens.every((item, idx) => {
    if (!item.obrigatorio) return true;
    const r = respostas[String(idx)];
    if (item.tipo === "texto" || (item.tipo as string) === "descricao") return !!r?.valor_texto?.trim();
    return !!r?.evidencia_url;
  });

  const handleUpload = async (item: PlanoAcaoItem, idx: number, file: File) => {
    const slot = String(idx);
    try {
      setUploadingTipo(slot);
      setProgress((p) => ({ ...p, [slot]: 0 }));
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessão expirada");

      const fd = new FormData();
      fd.append("file", file);
      // contexto_tipo "plano_acao" está na whitelist da edge function
      // (supabase/functions/tarefas-storage-upload/index.ts:20-23)
      fd.append("contexto_tipo", "plano_acao");
      fd.append("contexto_ref_id", plano.id);
      fd.append("assignment_id", assignmentId);
      // 🆕 Propaga campos para buildPathRelativo do storage provider montar
      // o caminho correto no Drive:
      //   tarefas/{MM-YYYY}/{DD}/{tipoTarefa}/{codigoTarefa}-{slug-nome}/plano_acao/arquivo
      // Doc: supabase/functions/_shared/tarefas_storage_provider.ts (buildPathRelativo)
      fd.append("tipo_tarefa", tipoTarefa);
      fd.append("codigo_tarefa", codigoTarefa);
      fd.append("nome_tarefa", nomeTarefa);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tarefas-storage-upload`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          setProgress((p) => ({ ...p, [slot]: Math.round((ev.loaded / ev.total) * 100) }));
        }
      };
      const result = await new Promise<any>((resolve, reject) => {
        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && json.ok) resolve(json);
            else reject(new Error("Erro ao enviar arquivo."));
          } catch {
            reject(new Error("Erro ao processar resposta."));
          }
        };
        xhr.onerror = () => reject(new Error("Erro de rede ao enviar arquivo."));
        xhr.send(fd);
      });
      setRespostas((prev) => ({
        ...prev,
        [slot]: {
          tipo: item.tipo,
          evidencia_url: result.anexo.path_relativo,
          evidencia_anexo_id: result.anexo.id,
          evidencia_mime_type: result.anexo.mime_type ?? file.type,
        },
      }));
    } catch (e: any) {
      toast.error(e.message || "Falha no upload");
    } finally {
      setUploadingTipo(null);
    }
  };

  const handleEnviar = async () => {
    if (!completo) {
      toast.error("Preencha todos os itens obrigatórios.");
      return;
    }
    try {
      await onResponder({ planoId: plano.id, respostaValorJson: respostas });
      // Mutation já invalida queries e mostra toast no hook usePlanosAcao
    } catch (e: any) {
      // Toast já é mostrado pelo onError do hook
    }
  };

  const prazoAtrasado = (() => {
    if (!plano.prazo_resolucao) return false;
    try {
      return new Date(plano.prazo_resolucao).getTime() < Date.now();
    } catch {
      return false;
    }
  })();

  const corBorda = plano.criticidade === "alta" ? "border-red-300" : plano.criticidade === "media" ? "border-amber-300" : "border-emerald-300";
  const corHeader = plano.criticidade === "alta" ? "bg-red-50" : plano.criticidade === "media" ? "bg-amber-50" : "bg-emerald-50";
  const corTexto = plano.criticidade === "alta" ? "text-red-800" : plano.criticidade === "media" ? "text-amber-800" : "text-emerald-800";

  return (
    <Card className={`${corBorda} border-2`}>
      <CardHeader className={`pb-2 ${corHeader} border-b`}>
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className={`flex items-center gap-2 ${corTexto}`}>
            <AlertTriangle className="h-4 w-4" />
            Plano de ação R{plano.rodada}
            {fieldLabel && <span className="text-xs font-normal text-muted-foreground">— {fieldLabel}</span>}
          </span>
          {plano.prazo_resolucao && (
            <span className={`text-[10px] flex items-center gap-1 ${prazoAtrasado ? "text-red-700 font-bold" : "text-muted-foreground"}`}>
              <Clock className="h-3 w-3" />
              {new Date(plano.prazo_resolucao).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {prazoAtrasado && " ⚠ Atrasado"}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">
        {plano.instrucao && (
          <p className="text-xs text-foreground bg-muted/30 rounded p-2 border-l-2 border-l-primary/40">
            {plano.instrucao}
          </p>
        )}

        {itens.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Plano sem itens estruturados.</p>
        )}

        {itens.map((item, idx) => {
          const slot = String(idx);
          const r = respostas[slot];
          const temMedia = !!(r?.evidencia_url || r?.valor_texto);
          const isUploadingThis = uploadingTipo === slot;
          const prog = progress[slot] ?? 0;
          return (
            <div key={`item-${idx}`} className="space-y-1.5 border rounded-md p-2 bg-card">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">
                  <span className="text-muted-foreground mr-1">#{idx + 1}</span>
                  {item.titulo || item.tipo}
                  {item.obrigatorio && <span className="text-red-600 ml-1">*</span>}
                </Label>
                {temMedia && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
              </div>
              {(item.tipo === "texto" || (item.tipo as string) === "descricao") ? (
                <Textarea
                  value={r?.valor_texto ?? ""}
                  onChange={(e) => setRespostas((prev) => ({ ...prev, [slot]: { ...(prev[slot] ?? {}), tipo: item.tipo, valor_texto: e.target.value } }))}
                  placeholder={`Descreva: ${item.titulo || "..."}`}
                  className="text-xs min-h-[60px]"
                  disabled={isResponding}
                />
              ) : temMedia && r?.evidencia_url ? (
                <div className="space-y-1.5">
                  <EvidenciaPreview
                    anexoId={r.evidencia_anexo_id ?? null}
                    url={r.evidencia_url}
                    mimeType={r.evidencia_mime_type ?? null}
                    onRemove={() => setRespostas((prev) => { const n = { ...prev }; delete n[slot]; return n; })}
                  />
                </div>
              ) : (
                <label className={`flex items-center justify-center gap-2 border border-dashed rounded p-3 cursor-pointer hover:border-primary transition-colors min-h-[48px] ${isUploadingThis ? "opacity-60 pointer-events-none" : ""}`}>
                  {isUploadingThis ? (
                    <div className="flex flex-col items-center gap-1 w-full">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-xs">{prog}%</span>
                      <div className="w-full bg-muted rounded-full h-1">
                        <div className="bg-primary h-1 rounded-full transition-all" style={{ width: `${prog}%` }} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs">
                        {item.tipo === "foto" ? "Tirar foto" : item.tipo === "video" ? "Gravar vídeo" : "Gravar áudio"}
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept={item.tipo === "foto" ? "image/*" : item.tipo === "video" ? "video/*" : "audio/*"}
                    capture="environment"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(item, idx, file);
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
          disabled={!completo || isResponding}
          onClick={handleEnviar}
          className="w-full"
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          {isResponding ? "Enviando resposta..." : "Enviar resposta ao aprovador"}
        </Button>
        {!completo && (
          <p className="text-[10px] text-muted-foreground text-center">
            Preencha todos os itens obrigatórios antes de enviar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ExecutorPlanoAprovadorCard;
