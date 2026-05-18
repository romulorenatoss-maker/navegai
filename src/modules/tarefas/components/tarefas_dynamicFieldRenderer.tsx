import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, X, AlertTriangle, RotateCcw, Camera, Eye, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AnexoViewer } from "@/modules/tarefas/components/anexos/AnexoViewer";
import { tarefas_storage_service } from "@/modules/tarefas/services/tarefas_storage_service";

export interface SnapshotField {
  id: string;
  label: string;
  descricao?: string;
  tipo: string;
  ordem: number;
  obrigatorio: boolean;
  peso: number;
  nota_maxima: number;
  impacta_score: boolean;
  criticidade: string;
  gera_contingencia: boolean;
  exige_evidencia: boolean;
  tipo_evidencia?: string;
  opcoes?: string[];
  opcoes_regras?: Array<{
    valor: string;
    label: string;
    cor: string;
    requer_descricao: boolean;
    requer_evidencia: boolean;
    tipos_evidencia?: string[];
    gera_contingencia: boolean;
  }>;
  validacao?: any;
  condicao_visibilidade?: any;
  formula?: any;
  visivel_para: string[];
  editavel_por: string[];
  section_id?: string;
  // Instrução visual (referência para responder a pergunta)
  instrucao_url?: string;
  instrucao_tipo?: string;
  // Approver review fields
  aprovador_verificar?: boolean;
  aprovador_pergunta?: string;
  aprovador_tipo_resposta?: string;
  aprovador_peso?: number;
  aprovador_obriga_observacao_nao?: boolean;
  aprovador_exige_evidencia_nao?: boolean;
  aprovador_tipos_evidencia?: string[];
  aprovador_tipo?: string;
  aprovador_opcoes?: string[];
  aprovador_regras_por_opcao?: Array<{
    valor: string;
    label?: string;
    exige_observacao?: boolean;
    exige_evidencia?: boolean;
    gera_plano_acao?: boolean;
    permite_devolucao?: boolean;
  }>;
  auditor_verificar?: boolean;
  auditor_pergunta?: string;
  auditor_tipo?: string;
  auditor_opcoes?: string[];
  auditor_regras_por_opcao?: Array<{
    valor: string;
    label?: string;
    exige_observacao?: boolean;
    exige_evidencia?: boolean;
    gera_plano_acao?: boolean;
    permite_devolucao?: boolean;
  }>;
  auditor_peso?: number;
}

export interface FieldAnswer {
  field_id: string;
  valor_texto?: string | null;
  valor_numero?: number | null;
  valor_booleano?: boolean | null;
  valor_data?: string | null;
  valor_json?: any;
  evidencia_url?: string | null;       // path_relativo no Drive (para referência)
  evidencia_anexo_id?: string | null;  // UUID da tarefas_anexos (para signed URL via AnexoViewer)
  evidencia_mime_type?: string | null; // mime type para o viewer saber como renderizar
  observacao?: string | null;
  // Metadata for display
  respondido_por_nome?: string | null;
  respondido_em?: string | null;
  versao?: number;
  historico_alteracoes?: Array<{ nome: string; data: string; versao: number }>;
}

export interface FieldReview {
  field_id: string;
  conforme: boolean | null;
  observacao?: string;
  devolvido: boolean;
  motivo_devolucao?: string;
  rodada: number;
}

interface Props {
  field: SnapshotField;
  answer: FieldAnswer | undefined;
  review?: FieldReview | undefined;
  userRole: "executor" | "avaliador" | "aprovador";
  disabled: boolean;
  allAnswers: Record<string, FieldAnswer>;
  onChange: (fieldId: string, answer: Partial<FieldAnswer>) => void;
  assignmentId: string;
  /** Para compor o path de upload: número, nome e origem da tarefa */
  numeroTarefa: number | string;
  nomeTarefa: string;
  origemTarefa: "rotina" | "ad_hoc";
  showValidation?: boolean;
  approverPlan?: {
    plano_acao_descricao?: string | null;
    plano_acao_prazo?: string | null;
    plano_acao_anexo_url?: string | null;
    flag_prazo_alterado?: boolean | null;
    justificativa_alteracao_prazo?: string | null;
    tipo_evidencia_exigida?: string | null;
  } | null;
  allReviews?: any[];
  horarioLimite?: string | null;
  dataPrevista?: string | null;
  profileId?: string | null;
  responsavelId?: string | null;
  setorExecutorId?: string | null;
  meusSetorIds?: string[];
  isAdmin?: boolean;
}

function evaluateVisibility(condition: any, allAnswers: Record<string, FieldAnswer>): boolean {
  if (!condition) return true;
  const { campo_ref, operador, valor } = condition;
  if (!campo_ref) return true;
  const ref = allAnswers[campo_ref];
  if (!ref) return true;
  const refVal = ref.valor_booleano ?? ref.valor_texto ?? ref.valor_numero;
  switch (operador) {
    case "igual": return refVal === valor;
    case "diferente": return refVal !== valor;
    case "maior": return typeof refVal === "number" && refVal > valor;
    case "menor": return typeof refVal === "number" && refVal < valor;
    case "preenchido": return refVal != null && refVal !== "";
    case "vazio": return refVal == null || refVal === "";
    default: return true;
  }
}

function validateField(field: SnapshotField, answer: FieldAnswer | undefined): string | null {
  const hasValue = answer && (
    answer.valor_texto != null && answer.valor_texto !== "" ||
    answer.valor_numero != null ||
    answer.valor_booleano != null ||
    answer.valor_data != null ||
    answer.valor_json != null ||
    answer.evidencia_url != null && answer.evidencia_url !== ""
  );

  if (field.obrigatorio && !hasValue) return "Campo obrigatório";

  if (hasValue && field.validacao) {
    const v = field.validacao;
    if (v.min != null && answer?.valor_numero != null && answer.valor_numero < v.min) return `Valor mínimo: ${v.min}`;
    if (v.max != null && answer?.valor_numero != null && answer.valor_numero > v.max) return `Valor máximo: ${v.max}`;
    if (v.regex && answer?.valor_texto) {
      try { if (!new RegExp(v.regex).test(answer.valor_texto)) return "Formato inválido"; } catch {}
    }
  }

  if (field.exige_evidencia && (!answer?.evidencia_url)) return "Evidência obrigatória";

  return null;
}

export { evaluateVisibility, validateField };

// ── EvidenciaPreview ──────────────────────────────────────────────────────────
// Renderiza preview inline + loading + tela cheia via AnexoViewer (signed URL).
// Suporta dados novos (anexo_id) e legados (url direta).
export function EvidenciaPreview({
  anexoId, url, mimeType, onRemove, disabled,
}: {
  anexoId?: string | null;
  url?: string | null;
  mimeType?: string | null;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const mt = (mimeType ?? "").toLowerCase();
  const isAudio = mt.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/i.test(url ?? "");
  const isVideo = !isAudio && (mt.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(url ?? ""));
  const isImage = mt.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(url ?? "");

  React.useEffect(() => {
    if (!anexoId) { setSignedUrl(url ?? null); return; }
    setLoadingPreview(true);
    tarefas_storage_service.getSignedUrl(anexoId)
      .then(({ url: u }) => setSignedUrl(u))
      .catch(() => setSignedUrl(null))
      .finally(() => setLoadingPreview(false));
  }, [anexoId, url]);

  const RemoveBtn = () => !disabled && onRemove ? (
    <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={onRemove}>
      <X className="w-3 h-3" />
    </Button>
  ) : null;

  if (loadingPreview) {
    return (
      <div className="flex items-center gap-2 p-2 rounded border border-border bg-muted/30 mt-1">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  if (isAudio && signedUrl) {
    return (
      <div className="flex items-center gap-2 p-2 rounded border border-border bg-muted/30 mt-1 w-full">
        <span className="text-sm shrink-0">🎵</span>
        <audio src={signedUrl} controls className="flex-1 h-8" style={{ minWidth: 0 }} />
        <RemoveBtn />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <div
        className="relative w-16 h-16 rounded border border-border bg-muted flex items-center justify-center overflow-hidden cursor-pointer shrink-0"
        onClick={() => setViewerOpen(true)}
      >
        {signedUrl && isImage ? (
          <img src={signedUrl} alt="Evidência" className="w-full h-full object-cover" />
        ) : signedUrl && isVideo ? (
          <video src={signedUrl} className="w-full h-full object-cover" muted />
        ) : (
          <Eye className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground flex-1">
        <span>{isImage ? "📷 Foto anexada" : isVideo ? "🎥 Vídeo anexado" : "📎 Arquivo anexado"}</span>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs w-fit" onClick={() => setViewerOpen(true)}>
          <Eye className="w-3 h-3 mr-1" /> Ver em tela cheia
        </Button>
      </div>
      <RemoveBtn />
      {anexoId ? (
        <AnexoViewer anexoId={anexoId} mimeType={mimeType} open={viewerOpen} onOpenChange={setViewerOpen} />
      ) : signedUrl && viewerOpen ? (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setViewerOpen(false)}>
          {isImage && <img src={signedUrl} alt="Evidência" className="max-h-[90vh] max-w-[90vw] object-contain" />}
          {isVideo && <video src={signedUrl} controls className="max-h-[90vh] max-w-[90vw]" autoPlay />}
        </div>
      ) : null}
    </div>
  );
}

export function DynamicFieldRenderer({ field, answer, review, userRole, disabled, allAnswers, onChange, assignmentId, numeroTarefa, nomeTarefa, origemTarefa, showValidation = true, approverPlan, allReviews = [], horarioLimite, dataPrevista, profileId, responsavelId, setorExecutorId, meusSetorIds = [], isAdmin = false }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingPlano, setUploadingPlano] = useState<Record<string, boolean>>({});
  const [uploadProgressPlano, setUploadProgressPlano] = useState<Record<string, number>>({});

  const isVisible = field.visivel_para.includes(userRole) && evaluateVisibility(field.condicao_visibilidade, allAnswers);
  if (!isVisible) return null;

  const isEditable = !disabled && field.editavel_por.includes(userRole);

  const isExecutorCorreto = useMemo(() => {
    if (userRole !== "executor") return true;
    if (!profileId) return false;
    if (responsavelId) return profileId === responsavelId;
    if (setorExecutorId) return meusSetorIds.includes(setorExecutorId);
    return true;
  }, [userRole, profileId, responsavelId, setorExecutorId, meusSetorIds]);

  const isEditableEfetivo = isEditable && isExecutorCorreto && !(isAdmin && !isExecutorCorreto);

  const preenchidoComAtraso = useMemo(() => {
    if (!answer?.respondido_em || !dataPrevista || !horarioLimite) return false;
    try {
      const limite = new Date(`${String(dataPrevista).slice(0, 10)}T${String(horarioLimite).slice(0, 5)}:00`);
      const respondidoEm = new Date(answer.respondido_em);
      return respondidoEm > limite;
    } catch { return false; }
  }, [answer?.respondido_em, dataPrevista, horarioLimite]);

  const isReturned = review?.devolvido === true;
  const hasApproverPlan = !!approverPlan && review?.devolvido === true;
  const planRound = Number(review?.rodada ?? 1);
  const planResponseFieldId = `${field.id}__plano_acao__r${planRound}`;
  const planAnswer: FieldAnswer = allAnswers?.[planResponseFieldId] || { field_id: planResponseFieldId };
  const isOriginalLockedByPlan = isReturned; // Campo bloqueado sempre que devolvido — evidência original preservada
  const [openRodada, setOpenRodada] = useState<number | null>(review?.rodada ?? null);
  const error = showValidation ? validateField(field, answer) : null;
  const val: FieldAnswer = answer || { field_id: field.id };

  const originalEditable = isEditableEfetivo && !isOriginalLockedByPlan;
  const updateOriginal = (patch: Partial<FieldAnswer>) => onChange(field.id, patch);
  const updatePlanAnswer = (patch: Partial<FieldAnswer>) => onChange(planResponseFieldId, patch);
  const update = (patch: Partial<FieldAnswer>) => {
    if (isOriginalLockedByPlan) return;
    updateOriginal(patch);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      // Busca token de autenticação
      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData.session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const { buildStoragePath } = await import('@/modules/tarefas/utils/tarefas_storagePath');
      const path_relativo = buildStoragePath({
        numero_tarefa: numeroTarefa,
        nome_tarefa: nomeTarefa,
        origem: origemTarefa,
        nome_arquivo: file.name,
      });

      // Upload com XHR para acompanhar progresso
      const fd = new FormData();
      fd.append('file', file);
      fd.append('contexto_tipo', 'evidencia');
      fd.append('path_relativo', path_relativo);
      if (assignmentId) fd.append('assignment_id', assignmentId);
      fd.append('contexto_ref_id', field.id);

      const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

      const anexo = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${FN_BASE}/tarefas-storage-upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && json.ok) {
              resolve(json.anexo);
            } else {
              reject(new Error(json.detail ?? json.error ?? 'upload_failed'));
            }
          } catch {
            reject(new Error('Resposta inválida do servidor'));
          }
        };

        xhr.onerror = () => reject(new Error('Erro de rede ao enviar arquivo'));
        xhr.send(fd);
      });

      update({
        evidencia_url: anexo.path_relativo,
        evidencia_anexo_id: anexo.id,
        evidencia_mime_type: anexo.mime_type ?? file.type,
      });
      setUploadProgress(100);
    } catch (e: any) {
      toast.error("Erro no upload: " + (e.message || "falha desconhecida"));
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadPlan = async (file: File, itemTipo: string) => {
    setUploadingPlano(prev => ({ ...prev, [itemTipo]: true }));
    setUploadProgressPlano(prev => ({ ...prev, [itemTipo]: 0 }));
    const planItemFieldId = `${planResponseFieldId}__${itemTipo}`;
    try {
      const { data: sessData } = await supabase.auth.getSession();
      const token = sessData.session?.access_token;
      if (!token) throw new Error("Não autenticado");
      const { buildStoragePath } = await import('@/modules/tarefas/utils/tarefas_storagePath');
      const path_relativo = buildStoragePath({ numero_tarefa: numeroTarefa, nome_tarefa: nomeTarefa, origem: origemTarefa, nome_arquivo: file.name });
      const fd = new FormData();
      fd.append('file', file);
      fd.append('contexto_tipo', 'plano_acao');
      fd.append('path_relativo', path_relativo);
      if (assignmentId) fd.append('assignment_id', assignmentId);
      fd.append('contexto_ref_id', field.id);
      const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      const anexo = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${FN_BASE}/tarefas-storage-upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadProgressPlano(prev => ({ ...prev, [itemTipo]: Math.round((e.loaded / e.total) * 100) })); };
        xhr.onload = () => { try { const j = JSON.parse(xhr.responseText); if (xhr.status < 300 && j.ok) resolve(j.anexo); else reject(new Error(j.detail ?? 'upload_failed')); } catch { reject(new Error('Resposta inválida')); } };
        xhr.onerror = () => reject(new Error('Erro de rede'));
        xhr.send(fd);
      });
      // Salva em chave separada por tipo de item
      onChange(planItemFieldId, { field_id: planItemFieldId, evidencia_url: anexo.path_relativo, evidencia_anexo_id: anexo.id, evidencia_mime_type: anexo.mime_type ?? file.type } as any);
      setUploadProgressPlano(prev => ({ ...prev, [itemTipo]: 100 }));
    } catch (e: any) {
      toast.error("Erro no upload: " + (e.message || "falha desconhecida"));
      setUploadProgressPlano(prev => ({ ...prev, [itemTipo]: 0 }));
    } finally {
      setUploadingPlano(prev => ({ ...prev, [itemTipo]: false }));
    }
  };

  // Localiza a regra ativa baseada na opção selecionada (conforme/sim_nao/select)
  const opcoesRegras = Array.isArray(field.opcoes_regras) ? field.opcoes_regras : [];
  const activeRule = (() => {
    if (!opcoesRegras.length) return null;
    if (field.tipo === "conforme") {
      if (val.valor_booleano === true) return opcoesRegras.find(r => r.valor === "conforme") || null;
      if (val.valor_booleano === false) return opcoesRegras.find(r => r.valor === "nao_conforme") || null;
    }
    if (field.tipo === "sim_nao") {
      if (val.valor_booleano === true) return opcoesRegras.find(r => r.valor === "sim") || null;
      if (val.valor_booleano === false) return opcoesRegras.find(r => r.valor === "nao") || null;
    }
    if (field.tipo === "select" && val.valor_texto) {
      const v = val.valor_texto.toLowerCase().replace(/\s+/g, "_");
      return opcoesRegras.find(r => r.valor === v || r.label === val.valor_texto) || null;
    }
    return null;
  })();

  const renderInput = () => {
    switch (field.tipo) {
      case "conforme": {
        // Suporta opcoes_regras customizadas (Conforme/Não Conforme/N/A) ou padrão
        const opts = opcoesRegras.length
          ? opcoesRegras.map(r => ({
              label: r.label,
              val: r.valor === "conforme" ? true : r.valor === "nao_conforme" ? false : null,
              valorTexto: r.valor === "na" ? "na" : null, // N/A salva como valor_texto para distinguir de "não respondido"
              cls: r.cor === "success" ? "bg-green-100 text-green-800 border-green-300"
                : r.cor === "destructive" ? "bg-red-100 text-red-800 border-red-300"
                : "bg-muted text-muted-foreground border-border",
            }))
          : [
              { label: "Conforme", val: true, valorTexto: null, cls: "bg-green-100 text-green-800 border-green-300" },
              { label: "Não Conforme", val: false, valorTexto: null, cls: "bg-red-100 text-red-800 border-red-300" },
            ];
        const isNaSelected = val.valor_texto === "na" && val.valor_booleano == null;
        return (
          <div className="flex gap-2 flex-wrap">
            {opts.map(opt => {
              const selected = opt.valorTexto === "na"
                ? isNaSelected
                : val.valor_booleano === opt.val && !isNaSelected;
              return (
                <button key={String(opt.val) + opt.label} type="button" disabled={!originalEditable}
                  onClick={() => opt.valorTexto === "na"
                    ? update({ valor_booleano: null, valor_texto: "na" })
                    : update({ valor_booleano: opt.val, valor_texto: null })
                  }
                  className={`flex-1 min-w-[100px] px-3 py-2 rounded-md border text-sm font-medium transition-colors ${selected ? opt.cls + " ring-2 ring-offset-1 ring-primary/30" : "bg-card border-border text-muted-foreground"} ${!isEditableEfetivo ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                  {opt.label}
                </button>
              );
            })}
          </div>
        );
      }

      case "sim_nao": {
        const optsSimNao = opcoesRegras.length
          ? opcoesRegras.map(r => ({
              label: r.label,
              val: r.valor === "sim" ? true : r.valor === "nao" ? false : null,
              valorTexto: r.valor === "na" ? "na" : null,
              cls: r.cor === "success" ? "bg-green-100 text-green-800 border-green-300"
                : r.cor === "destructive" ? "bg-red-100 text-red-800 border-red-300"
                : "bg-muted text-muted-foreground border-border",
            }))
          : [
              { label: "Sim", val: true, valorTexto: null, cls: "bg-green-100 text-green-800 border-green-300" },
              { label: "Não", val: false, valorTexto: null, cls: "bg-red-100 text-red-800 border-red-300" },
            ];
        const isNaSelectedSN = val.valor_texto === "na" && val.valor_booleano == null;
        return (
          <div className="flex gap-2 flex-wrap">
            {optsSimNao.map(opt => {
              const selected = opt.valorTexto === "na"
                ? isNaSelectedSN
                : val.valor_booleano === opt.val && !isNaSelectedSN;
              return (
                <button key={String(opt.val) + opt.label} type="button" disabled={!originalEditable}
                  onClick={() => opt.valorTexto === "na"
                    ? update({ valor_booleano: null, valor_texto: "na" })
                    : update({ valor_booleano: opt.val, valor_texto: null })
                  }
                  className={`flex-1 min-w-[100px] px-3 py-2 rounded-md border text-sm font-medium transition-colors ${selected ? opt.cls + " ring-2 ring-offset-1 ring-primary/30" : "bg-card border-border text-muted-foreground"} ${!isEditableEfetivo ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                  {opt.label}
                </button>
              );
            })}
          </div>
        );
      }

      case "nota_avaliacao":
      case "numero":
        return <Input type="number" value={val.valor_numero ?? ""} onChange={e => update({ valor_numero: e.target.value === "" ? null : +e.target.value })}
          disabled={!originalEditable} min={field.validacao?.min} max={field.validacao?.max ?? field.nota_maxima}
          className={!isEditableEfetivo ? "opacity-60" : ""} />;

      case "texto":
        return <Textarea value={val.valor_texto ?? ""} onChange={e => update({ valor_texto: e.target.value })}
          disabled={!originalEditable} placeholder={field.descricao || "Digite..."} maxLength={5000}
          className={!isEditableEfetivo ? "opacity-60" : ""} />;

      case "data":
        return <Input type="date" value={val.valor_data?.slice(0, 10) ?? ""} onChange={e => update({ valor_data: e.target.value })}
          disabled={!originalEditable} className={!isEditableEfetivo ? "opacity-60" : ""} />;

      case "hora":
        return <Input type="time" value={val.valor_texto ?? ""} onChange={e => update({ valor_texto: e.target.value })}
          disabled={!originalEditable} className={!isEditableEfetivo ? "opacity-60" : ""} />;

      case "select":
        return (
          <Select value={val.valor_texto ?? ""} onValueChange={v => update({ valor_texto: v })} disabled={!originalEditable}>
            <SelectTrigger className={!isEditableEfetivo ? "opacity-60" : ""}><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{(field.opcoes || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        );

      case "multi_select":
        const selected: string[] = val.valor_json || [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {(field.opcoes || []).map(o => (
              <button key={o} type="button" disabled={!originalEditable}
                onClick={() => {
                  const next = selected.includes(o) ? selected.filter(s => s !== o) : [...selected, o];
                  update({ valor_json: next });
                }}
                className={`px-2.5 py-1 rounded text-xs border transition-colors ${selected.includes(o) ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-muted-foreground"} ${!isEditableEfetivo ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                {o}
              </button>
            ))}
          </div>
        );

      case "foto":
      case "arquivo":
      case "assinatura":
        return (
          <div className="space-y-2">
            {val.evidencia_url ? (
              <EvidenciaPreview
                anexoId={val.evidencia_anexo_id}
                url={val.evidencia_url}
                mimeType={val.evidencia_mime_type}
                disabled={!originalEditable}
                onRemove={originalEditable ? () => update({ evidencia_url: null, evidencia_anexo_id: null, evidencia_mime_type: null }) : undefined}
              />
            ) : originalEditable ? (
              <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors ${uploading ? "opacity-80 pointer-events-none" : ""}`}>
                {uploading ? (
                  <div className="flex flex-col items-center gap-2 w-full">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Enviando... {uploadProgress}%</span>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Toque para {field.tipo === "foto" ? "fotografar" : "enviar arquivo"}</span>
                  </>
                )}
                <input type="file" className="hidden" accept={field.tipo === "foto" ? "image/*" : "*"} capture={field.tipo === "foto" ? "environment" : undefined}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
              </label>
            ) : (
              <span className="text-sm text-muted-foreground">Sem evidência</span>
            )}
          </div>
        );

      default:
        return <Input value={val.valor_texto ?? ""} onChange={e => update({ valor_texto: e.target.value })} disabled={!originalEditable} />;
    }
  };

  return (
    <div className={`space-y-1.5 p-3 rounded-lg border transition-colors ${isReturned ? "border-amber-400 bg-amber-50/50" : error && !disabled ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          {field.label}
          {field.obrigatorio && <span className="text-destructive ml-0.5">*</span>}
          {field.instrucao_url && (
            <button
              type="button"
              title={`Ver instrução (${field.instrucao_tipo || "anexo"})`}
              onClick={() => window.open(field.instrucao_url!, "_blank", "noopener,noreferrer")}
              className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-primary/10 text-primary transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
        </Label>
        {field.criticidade === "critica" && <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">Crítico</span>}
        {field.criticidade === "alta" && <span className="text-[10px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded">Alta</span>}
      </div>
      {field.descricao && <p className="text-xs text-muted-foreground">{field.descricao}</p>}

      {renderInput()}

      {/* Indicador de regra ativa por resposta */}
      {activeRule && (
        <div className="mt-1 flex flex-wrap gap-1">
          {activeRule.gera_contingencia && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 font-medium">
              ⚠ Gera plano de ação
            </span>
          )}
          {activeRule.requer_evidencia && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 font-medium">
              📎 {(activeRule.tipos_evidencia || []).includes("foto") ? "📷 Foto" : (activeRule.tipos_evidencia || []).includes("video") ? "🎥 Vídeo" : (activeRule.tipos_evidencia || []).includes("audio") ? "🎵 Áudio" : "Evidência"} obrigatória
            </span>
          )}
          {activeRule.requer_descricao && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border font-medium">
              ✏️ Observação obrigatória
            </span>
          )}
        </div>
      )}

      {/* Follow-up dinâmico baseado na regra da opção selecionada */}
      {activeRule && (activeRule.requer_descricao || activeRule.requer_evidencia || activeRule.gera_contingencia) && (
        <div className="mt-2 p-2.5 rounded-md border border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800/50 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-3 h-3" />
            Ação requerida pela opção "{activeRule.label}"
            {activeRule.gera_contingencia && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800">
                Gera contingência
              </span>
            )}
          </div>
          {activeRule.requer_descricao && !activeRule.gera_contingencia && (
            <div className="space-y-1">
              <Label className="text-[11px]">Observação obrigatória *</Label>
              <Textarea
                value={val.observacao ?? val.valor_texto ?? ""}
                onChange={e => update({ observacao: e.target.value })}
                disabled={!originalEditable}
                placeholder="Descreva o motivo..."
                rows={2}
                className={!isEditableEfetivo ? "opacity-60" : ""}
                maxLength={2000}
              />
            </div>
          )}
          {activeRule.gera_contingencia && (
            <div className="space-y-2 p-2.5 rounded-md border border-orange-300/60 bg-orange-50/40 dark:bg-orange-950/20">
              <p className="text-[11px] font-semibold text-orange-800 dark:text-orange-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Gera plano de ação
              </p>
              <p className="text-[10px] text-orange-700 dark:text-orange-400">
                O aprovador criará as instruções e prazo para correção após o envio.
              </p>
            </div>
          )}
          {activeRule.requer_evidencia && (
            <div className="space-y-1">
              <Label className="text-[11px]">Evidência obrigatória *</Label>
              {val.evidencia_url ? (
                <EvidenciaPreview
                  anexoId={val.evidencia_anexo_id}
                  url={val.evidencia_url}
                  mimeType={val.evidencia_mime_type}
                  disabled={!originalEditable}
                  onRemove={originalEditable ? () => update({ evidencia_url: null, evidencia_anexo_id: null, evidencia_mime_type: null }) : undefined}
                />
              ) : originalEditable ? (
                <label className={`flex flex-col items-center justify-center gap-1 border border-dashed border-amber-400/60 rounded p-2 cursor-pointer hover:border-amber-500 transition-colors ${uploading ? "opacity-80 pointer-events-none" : ""}`}>
                  {uploading ? (
                    <div className="flex flex-col items-center gap-1 w-full">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                      <span className="text-xs text-amber-700">{uploadProgress}%</span>
                      <div className="w-full bg-muted rounded-full h-1">
                        <div className="bg-amber-500 h-1 rounded-full transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                      <span className="text-xs text-amber-800 dark:text-amber-300">
                        Anexar {(activeRule.tipos_evidencia || []).includes("foto") ? "foto" : (activeRule.tipos_evidencia || []).join("/") || "arquivo"}
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept={(activeRule.tipos_evidencia || []).includes("foto") && !(activeRule.tipos_evidencia || []).includes("qualquer") ? "image/*" : "*"}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                  />
                </label>
              ) : (
                <span className="text-xs text-muted-foreground">Sem evidência</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Who answered and when */}
      {val.respondido_por_nome && val.respondido_em && (() => {
        const historico: Array<{ nome: string; data: string; versao: number; resposta?: string }> =
          Array.isArray(val.historico_alteracoes) ? val.historico_alteracoes : [];
        return (
          <details className="mt-1 space-y-1 group">
            <summary className={`flex items-center gap-1.5 text-[10px] cursor-pointer list-none ${preenchidoComAtraso ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
              <span
                title="Ver histórico de preenchimento"
                className={`shrink-0 transition-colors hover:opacity-70 ${preenchidoComAtraso ? "text-red-500" : "text-emerald-500"}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </span>
              <span>
                Preenchido por <strong>{val.respondido_por_nome}</strong> em{" "}
                {format(new Date(val.respondido_em), "dd/MM/yyyy HH:mm")}
                {preenchidoComAtraso && <span className="ml-1 font-semibold">⚠ Atrasado</span>}
              </span>
              {historico.length > 1 && (
                <span className="text-muted-foreground">· {historico.length} versões</span>
              )}
            </summary>
            {historico.length > 0 && (
              <div className="ml-5 border-l-2 border-border pl-2 space-y-1 mt-1">
                {historico.slice().reverse().map((h, i) => {
                  let isAtrasado = false;
                  try {
                    if (dataPrevista && horarioLimite) {
                      const limite = new Date(`${String(dataPrevista).slice(0, 10)}T${String(horarioLimite).slice(0, 5)}:00`);
                      isAtrasado = new Date(h.data) > limite;
                    }
                  } catch {}
                  return (
                    <div key={i} className={`text-[10px] flex items-start gap-1.5 ${isAtrasado ? "text-red-500" : "text-muted-foreground"}`}>
                      <span className={`mt-0.5 shrink-0 ${isAtrasado ? "text-red-500" : "text-emerald-500"}`}>
                        {isAtrasado ? "⚠" : "✓"}
                      </span>
                      <span>
                        <strong>{h.nome}</strong> — v{h.versao} — {format(new Date(h.data), "dd/MM HH:mm")}
                        {h.resposta && <span className="ml-1 text-foreground">"{h.resposta}"</span>}
                        {isAtrasado && <span className="ml-1 font-semibold">Atrasado</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </details>
        );
      })()}

      {/* Evidence upload for non-file fields that require evidence */}
      {field.exige_evidencia && !["foto", "arquivo", "assinatura"].includes(field.tipo) && !(activeRule?.requer_evidencia || val.evidencia_url) && (
        <div className="mt-2">
          {val.evidencia_url ? (
            <EvidenciaPreview
              anexoId={val.evidencia_anexo_id}
              url={val.evidencia_url}
              mimeType={val.evidencia_mime_type}
              disabled={!isEditableEfetivo}
              onRemove={isEditableEfetivo ? () => update({ evidencia_url: null, evidencia_anexo_id: null, evidencia_mime_type: null }) : undefined}
            />
          ) : originalEditable ? (
            <label className={`flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors ${uploading ? "pointer-events-none" : ""}`}>
              {uploading ? (
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{uploadProgress}%</span>
                </div>
              ) : (
                <><Upload className="w-3.5 h-3.5" /> Anexar evidência</>
              )}
              <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </label>
          ) : null}
        </div>
      )}

      {/* Histórico tipo chat — planos de ação e devoluções por rodada */}
      {allReviews.length > 0 && (
        <div className="mt-2 space-y-2">
          {allReviews.map((r: any, idx: number) => {
            const isPlano = !!(approverPlan?.plano_acao_descricao) || !!(r.instrucao_aprovador && r.instrucao_aprovador !== r.motivo_devolucao);
            const isReincidencia = idx > 0;
            const rodadaLabel = idx + 1;
            const tipoLabel = isPlano ? `Plano de ação — R${rodadaLabel}` : `Devolução — R${rodadaLabel}`;
            const corBorda = isReincidencia ? "#ba7517" : "#e24b4a";
            const corHeader = isReincidencia ? "#faeeda" : "#fcebeb";
            const corTexto = isReincidencia ? "#854f0b" : "#a32d2d";
            const instrucao = r.instrucao_aprovador || r.motivo_devolucao || "";
            const tipoEv = r.tipo_evidencia_exigida || "nenhuma";
            const prazo = approverPlan?.plano_acao_prazo;
            const prazoAlterado = approverPlan?.flag_prazo_alterado && idx === allReviews.length - 1;
            const isUltimaRodada = idx === allReviews.length - 1;
            const aguardando = isReturned && isUltimaRodada && !val.evidencia_url && tipoEv !== "nenhuma" && tipoEv !== "texto";

            return (
              <div key={r.id || idx} className="flex gap-2">
                <div className="w-0.5 rounded-full shrink-0 mt-1" style={{ backgroundColor: corBorda, minHeight: "100%" }} />
                <div className="flex-1 border border-border rounded-lg overflow-hidden bg-card">

                  {/* Header */}
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border" style={{ backgroundColor: corHeader }}>
                    <span className="text-[11px] font-semibold" style={{ color: corTexto }}>{tipoLabel}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {r.avaliado_em ? format(new Date(r.avaliado_em), "dd/MM HH:mm") : ""}{r.profiles?.nome ? ` · ${r.profiles.nome}` : ""}
                    </span>
                  </div>

                  {/* Instrução + prazo + anexo de orientação do aprovador */}
                  {instrucao && (
                    <div className="px-3 py-2 space-y-1.5">
                      <p className="text-xs text-foreground whitespace-pre-wrap">{instrucao}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {prazo && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${prazoAlterado ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-blue-800"}`}>
                            {prazoAlterado ? "⚑ " : ""}Prazo: {format(new Date(prazo), "dd/MM HH:mm")}
                          </span>
                        )}
                        {Array.isArray(r.itens_plano) && r.itens_plano.length > 0 ? (
                          r.itens_plano.map((item: any, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800">
                              {item.tipo === "foto" ? "Foto" : item.tipo === "video" ? "Video" : item.tipo === "audio" ? "Audio" : "Texto"}{item.titulo ? `: ${item.titulo}` : ""}
                            </span>
                          ))
                        ) : tipoEv !== "nenhuma" && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800">
                            {tipoEv === "foto" ? "Foto" : tipoEv === "video" ? "Video" : tipoEv === "audio" ? "Audio" : "Descricao"}
                          </span>
                        )}
                      </div>
                      {/* Anexo de orientação do aprovador (instrução em mídia) */}
                      {r.anexo_orientacao_url && (
                        <EvidenciaPreview
                          anexoId={r.anexo_orientacao_anexo_id ?? null}
                          url={r.anexo_orientacao_url}
                          mimeType={r.anexo_orientacao_mime_type ?? null}
                          disabled
                        />
                      )}
                    </div>
                  )}

                  {/* Resposta do executor em rodadas anteriores — somente leitura */}
                  {!isUltimaRodada && (() => {
                    const itens: Array<{tipo: string; titulo: string; obrigatorio: boolean}> =
                      Array.isArray(r.itens_plano) && r.itens_plano.length > 0
                        ? r.itens_plano
                        : tipoEv !== "nenhuma" ? [{ tipo: tipoEv, titulo: "", obrigatorio: true }] : [];
                    if (itens.length === 0) return null;
                    const rodada = Number(r.rodada ?? 1);
                    const prefixoRodada = `${field.id}__plano_acao__r${rodada}__`;
                    const valorJson = (allAnswers?.[field.id] as any)?.valor_json || {};
                    const temResposta = itens.some(item => {
                      const dado = valorJson[`__plano_acao__r${rodada}__${item.tipo}`];
                      return !!(dado?.evidencia_url || dado?.valor_texto);
                    });
                    if (!temResposta) return null;
                    return (
                      <div className="px-3 py-2 border-t border-border space-y-2 bg-muted/5">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Resposta do executor — R{rodada}</p>
                        {itens.map((item, iIdx) => {
                          const dado = valorJson[`__plano_acao__r${rodada}__${item.tipo}`];
                          if (!dado) return null;
                          return (
                            <div key={iIdx} className="space-y-1">
                              {item.titulo && <p className="text-xs text-amber-800 font-medium">{item.titulo}</p>}
                              {(item.tipo === "texto" || item.tipo === "descricao") && dado.valor_texto && (
                                <div className="bg-card border border-border rounded p-2">
                                  <p className="text-xs">{dado.valor_texto}</p>
                                </div>
                              )}
                              {(item.tipo === "foto" || item.tipo === "video" || item.tipo === "audio") && dado.evidencia_url && (
                                <EvidenciaPreview
                                  anexoId={dado.evidencia_anexo_id ?? null}
                                  url={dado.evidencia_url}
                                  mimeType={dado.evidencia_mime_type ?? null}
                                  disabled
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Campos de resposta do executor ao plano (última rodada ativa) */}
                  {isReturned && isUltimaRodada && (() => {
                    const itens: Array<{tipo: string; titulo: string; obrigatorio: boolean}> =
                      Array.isArray(r.itens_plano) && r.itens_plano.length > 0
                        ? r.itens_plano
                        : tipoEv !== "nenhuma" ? [{ tipo: tipoEv, titulo: "", obrigatorio: true }] : [];

                    if (itens.length === 0) return null;

                    return (
                      <div className="px-3 py-2 border-t border-border space-y-3">
                        {itens.map((item, iIdx) => {
                          // Cada item tem sua própria chave de estado e answer
                          const itemFieldId = `${planResponseFieldId}__${item.tipo}`;
                          const itemAnswer = allAnswers?.[itemFieldId] || { field_id: itemFieldId };
                          const isUploadingItem = !!uploadingPlano[item.tipo];
                          const progressItem = uploadProgressPlano[item.tipo] ?? 0;
                          const hasMedia = !!(itemAnswer as any).evidencia_url;

                          return (
                          <div key={iIdx} className="space-y-1.5">
                            {item.titulo && (
                              <p className="text-xs text-amber-800 font-medium">{item.titulo}</p>
                            )}
                            {item.tipo === "foto" && !hasMedia && (
                              <label className={`flex items-center justify-center gap-2 border border-dashed border-amber-400 rounded-lg p-2.5 cursor-pointer hover:border-amber-600 transition-colors ${isUploadingItem ? "opacity-60 pointer-events-none" : ""}`}>
                                {isUploadingItem ? (
                                  <div className="flex flex-col items-center gap-1 w-full">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                    <span className="text-xs text-amber-700">{progressItem}%</span>
                                    <div className="w-full bg-muted rounded-full h-1"><div className="bg-amber-500 h-1 rounded-full transition-all" style={{ width: `${progressItem}%` }} /></div>
                                  </div>
                                ) : <><Camera className="w-3.5 h-3.5 text-amber-600" /><span className="text-xs text-amber-800 font-medium">📷 Tirar foto{item.obrigatorio ? " *" : ""}</span></>}
                                <input type="file" className="hidden" accept="image/*" capture="environment" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadPlan(f, item.tipo); }} />
                              </label>
                            )}
                            {item.tipo === "video" && !hasMedia && (
                              <label className={`flex items-center justify-center gap-2 border border-dashed border-amber-400 rounded-lg p-2.5 cursor-pointer hover:border-amber-600 transition-colors ${isUploadingItem ? "opacity-60 pointer-events-none" : ""}`}>
                                {isUploadingItem ? (
                                  <div className="flex flex-col items-center gap-1 w-full">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                    <span className="text-xs text-amber-700">{progressItem}%</span>
                                    <div className="w-full bg-muted rounded-full h-1"><div className="bg-amber-500 h-1 rounded-full transition-all" style={{ width: `${progressItem}%` }} /></div>
                                  </div>
                                ) : <><Upload className="w-3.5 h-3.5 text-amber-600" /><span className="text-xs text-amber-800 font-medium">🎥 Gravar vídeo{item.obrigatorio ? " *" : ""}</span></>}
                                <input type="file" className="hidden" accept="video/*" capture="environment" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadPlan(f, item.tipo); }} />
                              </label>
                            )}
                            {item.tipo === "audio" && !hasMedia && (
                              <label className={`flex items-center justify-center gap-2 border border-dashed border-amber-400 rounded-lg p-2.5 cursor-pointer hover:border-amber-600 transition-colors ${isUploadingItem ? "opacity-60 pointer-events-none" : ""}`}>
                                {isUploadingItem ? (
                                  <div className="flex flex-col items-center gap-1 w-full">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                    <span className="text-xs text-amber-700">{progressItem}%</span>
                                    <div className="w-full bg-muted rounded-full h-1"><div className="bg-amber-500 h-1 rounded-full transition-all" style={{ width: `${progressItem}%` }} /></div>
                                  </div>
                                ) : <><Upload className="w-3.5 h-3.5 text-amber-600" /><span className="text-xs text-amber-800 font-medium">🎵 Gravar áudio{item.obrigatorio ? " *" : ""}</span></>}
                                <input type="file" className="hidden" accept="audio/*" capture="user" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadPlan(f, item.tipo); }} />
                              </label>
                            )}
                            {(item.tipo === "texto" || item.tipo === "descricao") && (
                              <textarea
                                value={(itemAnswer as any).valor_texto ?? ""}
                                onChange={e => onChange(itemFieldId, { field_id: itemFieldId, valor_texto: e.target.value } as any)}
                                placeholder={`${item.titulo || "Descreva o que foi corrigido"}${item.obrigatorio ? " *" : ""}...`}
                                rows={3}
                                className="w-full text-xs rounded border border-amber-300 bg-white dark:bg-amber-950/10 px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
                              />
                            )}
                            {hasMedia && (
                              <EvidenciaPreview
                                anexoId={(itemAnswer as any).evidencia_anexo_id ?? null}
                                url={(itemAnswer as any).evidencia_url}
                                mimeType={(itemAnswer as any).evidencia_mime_type ?? null}
                                onRemove={() => onChange(itemFieldId, { field_id: itemFieldId, evidencia_url: null, evidencia_anexo_id: null, evidencia_mime_type: null } as any)}
                              />
                            )}
                          </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Aguardando resposta */}
                  {aguardando && !isEditable && (
                    <div className="px-3 py-2 border-t border-border bg-muted/20 flex items-center gap-2">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground italic">Aguardando resposta do executor...</span>
                    </div>
                  )}

                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && !disabled && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}