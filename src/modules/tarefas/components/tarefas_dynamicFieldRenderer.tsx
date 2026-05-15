import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, X, AlertTriangle, RotateCcw, Camera, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  evidencia_url?: string | null;
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
  showValidation?: boolean;
  approverPlan?: {
    plano_acao_descricao?: string | null;
    plano_acao_prazo?: string | null;
    plano_acao_anexo_url?: string | null;
    flag_prazo_alterado?: boolean | null;
    justificativa_alteracao_prazo?: string | null;
    tipo_evidencia_exigida?: string | null;
  } | null;
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

export function DynamicFieldRenderer({ field, answer, review, userRole, disabled, allAnswers, onChange, assignmentId, showValidation = true, approverPlan, horarioLimite, dataPrevista, profileId, responsavelId, setorExecutorId, meusSetorIds = [], isAdmin = false }: Props) {
  const [uploading, setUploading] = useState(false);

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
  const [openRodada, setOpenRodada] = useState<number | null>(review?.rodada ?? null);
  const error = showValidation ? validateField(field, answer) : null;
  const val: FieldAnswer = answer || { field_id: field.id };

  const update = (patch: Partial<FieldAnswer>) => onChange(field.id, patch);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${assignmentId}/${field.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("evidencias").upload(path, file);
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage.from("evidencias").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      update({ evidencia_url: signed.signedUrl });
    } catch (e: any) {
      console.error("Upload failed:", e);
    } finally {
      setUploading(false);
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
              cls: r.cor === "success" ? "bg-green-100 text-green-800 border-green-300"
                : r.cor === "destructive" ? "bg-red-100 text-red-800 border-red-300"
                : "bg-muted text-muted-foreground border-border",
            }))
          : [
              { label: "Conforme", val: true, cls: "bg-green-100 text-green-800 border-green-300" },
              { label: "Não Conforme", val: false, cls: "bg-red-100 text-red-800 border-red-300" },
            ];
        return (
          <div className="flex gap-2 flex-wrap">
            {opts.map(opt => (
              <button key={String(opt.val) + opt.label} type="button" disabled={!isEditableEfetivo}
                onClick={() => update({ valor_booleano: opt.val })}
                className={`flex-1 min-w-[100px] px-3 py-2 rounded-md border text-sm font-medium transition-colors ${val.valor_booleano === opt.val ? opt.cls + " ring-2 ring-offset-1 ring-primary/30" : "bg-card border-border text-muted-foreground"} ${!isEditableEfetivo ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                {opt.label}
              </button>
            ))}
          </div>
        );
      }

      case "sim_nao": {
        const opts = opcoesRegras.length
          ? opcoesRegras.map(r => ({
              label: r.label,
              val: r.valor === "sim" ? true : r.valor === "nao" ? false : null,
              cls: r.cor === "success" ? "bg-green-100 text-green-800 border-green-300"
                : r.cor === "destructive" ? "bg-red-100 text-red-800 border-red-300"
                : "bg-muted text-muted-foreground border-border",
            }))
          : [
              { label: "Sim", val: true, cls: "bg-green-100 text-green-800 border-green-300" },
              { label: "Não", val: false, cls: "bg-red-100 text-red-800 border-red-300" },
            ];
        return (
          <div className="flex gap-2 flex-wrap">
            {opts.map(opt => (
              <button key={String(opt.val) + opt.label} type="button" disabled={!isEditableEfetivo}
                onClick={() => update({ valor_booleano: opt.val })}
                className={`flex-1 min-w-[100px] px-3 py-2 rounded-md border text-sm font-medium transition-colors ${val.valor_booleano === opt.val ? opt.cls + " ring-2 ring-offset-1 ring-primary/30" : "bg-card border-border text-muted-foreground"} ${!isEditableEfetivo ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                {opt.label}
              </button>
            ))}
          </div>
        );
      }

      case "nota_avaliacao":
      case "numero":
        return <Input type="number" value={val.valor_numero ?? ""} onChange={e => update({ valor_numero: e.target.value === "" ? null : +e.target.value })}
          disabled={!isEditableEfetivo} min={field.validacao?.min} max={field.validacao?.max ?? field.nota_maxima}
          className={!isEditableEfetivo ? "opacity-60" : ""} />;

      case "texto":
        return <Textarea value={val.valor_texto ?? ""} onChange={e => update({ valor_texto: e.target.value })}
          disabled={!isEditableEfetivo} placeholder={field.descricao || "Digite..."} maxLength={5000}
          className={!isEditableEfetivo ? "opacity-60" : ""} />;

      case "data":
        return <Input type="date" value={val.valor_data?.slice(0, 10) ?? ""} onChange={e => update({ valor_data: e.target.value })}
          disabled={!isEditableEfetivo} className={!isEditableEfetivo ? "opacity-60" : ""} />;

      case "hora":
        return <Input type="time" value={val.valor_texto ?? ""} onChange={e => update({ valor_texto: e.target.value })}
          disabled={!isEditableEfetivo} className={!isEditableEfetivo ? "opacity-60" : ""} />;

      case "select":
        return (
          <Select value={val.valor_texto ?? ""} onValueChange={v => update({ valor_texto: v })} disabled={!isEditableEfetivo}>
            <SelectTrigger className={!isEditableEfetivo ? "opacity-60" : ""}><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{(field.opcoes || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        );

      case "multi_select":
        const selected: string[] = val.valor_json || [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {(field.opcoes || []).map(o => (
              <button key={o} type="button" disabled={!isEditableEfetivo}
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
              <div className="relative inline-block">
                {field.tipo === "foto" ? (
                  <img src={val.evidencia_url} alt="Evidência" className="max-h-32 rounded border border-border" />
                ) : /\.(mp4|webm|mov)$/i.test(val.evidencia_url) ? (
                  <video src={val.evidencia_url} controls className="max-h-40 rounded border border-border" />
                ) : /\.(mp3|wav|ogg|m4a|webm)$/i.test(val.evidencia_url) ? (
                  <audio src={val.evidencia_url} controls className="w-full max-w-xs" />
                ) : (
                  <a href={val.evidencia_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Ver arquivo</a>
                )}
                {isEditableEfetivo && (
                  <Button type="button" variant="destructive" size="sm" className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full"
                    onClick={() => update({ evidencia_url: null })}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ) : isEditableEfetivo ? (
              <label className={`flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                {uploading ? <span className="text-sm text-muted-foreground">Enviando...</span> : (
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
        return <Input value={val.valor_texto ?? ""} onChange={e => update({ valor_texto: e.target.value })} disabled={!isEditableEfetivo} />;
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
          {activeRule.requer_descricao && (
            <div className="space-y-1">
              <Label className="text-[11px]">Justificativa / Plano de ação *</Label>
              <Textarea
                value={val.valor_texto ?? ""}
                onChange={e => update({ valor_texto: e.target.value })}
                disabled={!isEditableEfetivo}
                placeholder="Descreva o motivo / ação corretiva..."
                rows={2}
                className={!isEditableEfetivo ? "opacity-60" : ""}
                maxLength={2000}
              />
            </div>
          )}
          {activeRule.requer_evidencia && (
            <div className="space-y-1">
              <Label className="text-[11px]">Evidência obrigatória *</Label>
              {val.evidencia_url ? (
                <div className="flex items-center gap-2">
                  {/\.(jpg|jpeg|png|gif|webp)$/i.test(val.evidencia_url) ? (
                    <img src={val.evidencia_url} alt="Evidência" className="max-h-24 rounded border border-border" />
                  ) : /\.(mp4|webm|mov)$/i.test(val.evidencia_url) ? (
                    <video src={val.evidencia_url} controls className="max-h-24 rounded border border-border" />
                  ) : (
                    <a href={val.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Ver evidência</a>
                  )}
                  {isEditableEfetivo && (
                    <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => update({ evidencia_url: null })}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ) : isEditableEfetivo ? (
                <label className={`flex items-center justify-center gap-2 border border-dashed border-amber-400/60 rounded p-2 cursor-pointer hover:border-amber-500 transition-colors ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                  {uploading ? <span className="text-xs text-muted-foreground">Enviando...</span> : (
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
      {val.respondido_por_nome && val.respondido_em && (
        <div className={`flex items-center gap-1.5 text-[10px] mt-1 ${preenchidoComAtraso ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
          <button
            type="button"
            title="Ver histórico de preenchimento"
            className={`shrink-0 transition-colors ${preenchidoComAtraso ? "text-red-500" : "text-emerald-500"}`}
            onClick={() => {/* histórico — implementar depois */}}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </button>
          <span>
            Preenchido por <strong>{val.respondido_por_nome}</strong> em{" "}
            {format(new Date(val.respondido_em), "dd/MM/yyyy HH:mm")}
            {preenchidoComAtraso && <span className="ml-1 font-semibold">⚠ Atrasado</span>}
          </span>
        </div>
      )}

      {/* Evidence upload for non-file fields that require evidence */}
      {field.exige_evidencia && !["foto", "arquivo", "assinatura"].includes(field.tipo) && (
        <div className="mt-2">
          {val.evidencia_url ? (
            <div className="space-y-1.5">
              {/\.(mp3|wav|ogg|m4a|webm)$/i.test(val.evidencia_url) ? (
                <audio src={val.evidencia_url} controls className="w-full max-w-xs" />
              ) : /\.(mp4|webm|mov)$/i.test(val.evidencia_url) ? (
                <video src={val.evidencia_url} controls className="max-h-32 rounded border border-border" />
              ) : /\.(jpg|jpeg|png|gif|webp)$/i.test(val.evidencia_url) ? (
                <img src={val.evidencia_url} alt="Evidência" className="max-h-24 rounded border border-border" />
              ) : (
                <a href={val.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Evidência anexada</a>
              )}
              {isEditableEfetivo && <Button type="button" variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => update({ evidencia_url: null })}><X className="w-3 h-3" /></Button>}
            </div>
          ) : isEditableEfetivo ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors">
              <Upload className="w-3.5 h-3.5" /> Anexar evidência
              <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </label>
          ) : null}
        </div>
      )}

      {/* Histórico de rodadas — accordion */}
      {isReturned && review && (
        <div className="mt-2 rounded-lg border border-amber-300 dark:border-amber-800 overflow-hidden">
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-3 py-2 bg-amber-100/80 dark:bg-amber-900/30">
            <div className="flex items-center gap-2">
              <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                Histórico de devoluções ({review.rodada} rodada{review.rodada > 1 ? "s" : ""})
              </p>
            </div>
          </div>

          {/* Rodada atual aberta por padrão */}
          <div className="divide-y divide-amber-200 dark:divide-amber-800">
            {[review].map((r: any) => {
              const isOpen = openRodada === r.rodada;
              const tipoEv = r.tipo_evidencia_exigida || "nenhuma";
              return (
                <div key={r.rodada}>
                  {/* Tab da rodada */}
                  <button
                    type="button"
                    onClick={() => setOpenRodada(isOpen ? null : r.rodada)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                  >
                    <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      Rodada {r.rodada}
                      {r.profiles?.nome && <span className="text-[10px] text-muted-foreground ml-2">· {r.profiles.nome}</span>}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{isOpen ? "▲" : "▼"}</span>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 space-y-3 bg-amber-50/40 dark:bg-amber-950/10">
                      {/* Instrução do aprovador */}
                      {r.instrucao_aprovador && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Instrução do aprovador</p>
                          <p className="text-xs text-amber-800 dark:text-amber-300 whitespace-pre-wrap">{r.instrucao_aprovador}</p>
                        </div>
                      )}

                      {/* Tipo de evidência exigida */}
                      {tipoEv !== "nenhuma" && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1.5">
                            Evidência exigida: {tipoEv === "foto" ? "📷 Foto (câmera)" : tipoEv === "video" ? "🎥 Vídeo" : tipoEv === "audio" ? "🎵 Áudio" : "✏️ Descrição"}
                          </p>
                          {/* Upload — câmera sempre, nunca galeria */}
                          {val.evidencia_url ? (
                            <div className="space-y-1">
                              {/\.(jpg|jpeg|png|gif|webp)$/i.test(val.evidencia_url) ? (
                                <img
                                  src={val.evidencia_url}
                                  alt="Evidência"
                                  className="w-full max-h-48 rounded border border-border object-cover cursor-pointer"
                                  onClick={() => window.open(val.evidencia_url!, "_blank")}
                                />
                              ) : /\.(mp4|webm|mov)$/i.test(val.evidencia_url) ? (
                                <video src={val.evidencia_url} controls playsInline className="w-full max-h-48 rounded border border-border" />
                              ) : /\.(mp3|wav|ogg|m4a)$/i.test(val.evidencia_url) ? (
                                <audio src={val.evidencia_url} controls className="w-full" />
                              ) : (
                                <a href={val.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Ver evidência</a>
                              )}
                              {isEditableEfetivo && (
                                <button type="button" onClick={() => update({ evidencia_url: null })} className="text-[10px] text-destructive hover:underline">Remover</button>
                              )}
                            </div>
                          ) : isEditableEfetivo ? (
                            <label className={`flex items-center justify-center gap-2 border border-dashed border-amber-400 rounded-lg p-3 cursor-pointer hover:border-amber-600 transition-colors ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
                              {uploading ? (
                                <span className="text-xs text-amber-700">Enviando...</span>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4 text-amber-600" />
                                  <span className="text-xs text-amber-800 font-medium">
                                    {tipoEv === "foto" ? "📷 Abrir câmera" : tipoEv === "video" ? "🎥 Gravar vídeo" : "🎵 Gravar áudio"} *
                                  </span>
                                </>
                              )}
                              <input
                                type="file"
                                className="hidden"
                                accept={tipoEv === "foto" ? "image/*" : tipoEv === "video" ? "video/*" : tipoEv === "audio" ? "audio/*" : "*"}
                                capture={tipoEv === "foto" || tipoEv === "video" ? "environment" : tipoEv === "audio" ? "user" : undefined}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                              />
                            </label>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">Sem evidência anexada</p>
                          )}
                        </div>
                      )}

                      {/* Justificativa do executor */}
                      {userRole === "executor" && isEditableEfetivo && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1">Justificativa do que foi feito *</p>
                          <textarea
                            value={val.observacao ?? ""}
                            onChange={e => update({ observacao: e.target.value })}
                            placeholder="Descreva o que foi corrigido..."
                            rows={2}
                            className="w-full text-xs rounded border border-amber-300 bg-white dark:bg-amber-950/10 px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Validation error */}
      {error && !disabled && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}