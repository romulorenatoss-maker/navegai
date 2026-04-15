import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Upload, X, AlertTriangle, RotateCcw, Camera } from "lucide-react";
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
  penalidade_reprovacao: number;
  impacta_score: boolean;
  criticidade: string;
  gera_contingencia: boolean;
  exige_evidencia: boolean;
  tipo_evidencia?: string;
  opcoes?: string[];
  validacao?: any;
  condicao_visibilidade?: any;
  formula?: any;
  visivel_para: string[];
  editavel_por: string[];
  section_id?: string;
}

export interface FieldAnswer {
  field_id: string;
  valor_texto?: string | null;
  valor_numero?: number | null;
  valor_booleano?: boolean | null;
  valor_data?: string | null;
  valor_json?: any;
  evidencia_url?: string | null;
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
    answer.valor_json != null
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

export function DynamicFieldRenderer({ field, answer, review, userRole, disabled, allAnswers, onChange, assignmentId }: Props) {
  const [uploading, setUploading] = useState(false);

  const isVisible = field.visivel_para.includes(userRole) && evaluateVisibility(field.condicao_visibilidade, allAnswers);
  if (!isVisible) return null;

  const isEditable = !disabled && field.editavel_por.includes(userRole);
  const isReturned = review?.devolvido === true;
  const error = validateField(field, answer);
  const val: FieldAnswer = answer || { field_id: field.id };

  const update = (patch: Partial<FieldAnswer>) => onChange(field.id, patch);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${assignmentId}/${field.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("evidencias").upload(path, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("evidencias").getPublicUrl(path);
      update({ evidencia_url: urlData.publicUrl });
    } catch (e: any) {
      console.error("Upload failed:", e);
    } finally {
      setUploading(false);
    }
  };

  const renderInput = () => {
    switch (field.tipo) {
      case "conforme":
        return (
          <div className="flex gap-2">
            {[{ label: "Conforme", val: true, cls: "bg-green-100 text-green-800 border-green-300" },
              { label: "Não Conforme", val: false, cls: "bg-red-100 text-red-800 border-red-300" }].map(opt => (
              <button key={String(opt.val)} type="button" disabled={!isEditable}
                onClick={() => update({ valor_booleano: opt.val })}
                className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${val.valor_booleano === opt.val ? opt.cls + " ring-2 ring-offset-1 ring-primary/30" : "bg-card border-border text-muted-foreground"} ${!isEditable ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
                {opt.label}
              </button>
            ))}
          </div>
        );

      case "sim_nao":
        return (
          <div className="flex items-center gap-3">
            <Switch checked={val.valor_booleano === true} onCheckedChange={v => update({ valor_booleano: v })} disabled={!isEditable} />
            <span className="text-sm">{val.valor_booleano === true ? "Sim" : val.valor_booleano === false ? "Não" : "—"}</span>
          </div>
        );

      case "nota_avaliacao":
      case "numero":
        return <Input type="number" value={val.valor_numero ?? ""} onChange={e => update({ valor_numero: e.target.value === "" ? null : +e.target.value })}
          disabled={!isEditable} min={field.validacao?.min} max={field.validacao?.max ?? field.nota_maxima}
          className={!isEditable ? "opacity-60" : ""} />;

      case "texto":
        return <Textarea value={val.valor_texto ?? ""} onChange={e => update({ valor_texto: e.target.value })}
          disabled={!isEditable} placeholder={field.descricao || "Digite..."} maxLength={5000}
          className={!isEditable ? "opacity-60" : ""} />;

      case "data":
        return <Input type="date" value={val.valor_data?.slice(0, 10) ?? ""} onChange={e => update({ valor_data: e.target.value })}
          disabled={!isEditable} className={!isEditable ? "opacity-60" : ""} />;

      case "hora":
        return <Input type="time" value={val.valor_texto ?? ""} onChange={e => update({ valor_texto: e.target.value })}
          disabled={!isEditable} className={!isEditable ? "opacity-60" : ""} />;

      case "select":
        return (
          <Select value={val.valor_texto ?? ""} onValueChange={v => update({ valor_texto: v })} disabled={!isEditable}>
            <SelectTrigger className={!isEditable ? "opacity-60" : ""}><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{(field.opcoes || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        );

      case "multi_select":
        const selected: string[] = val.valor_json || [];
        return (
          <div className="flex flex-wrap gap-1.5">
            {(field.opcoes || []).map(o => (
              <button key={o} type="button" disabled={!isEditable}
                onClick={() => {
                  const next = selected.includes(o) ? selected.filter(s => s !== o) : [...selected, o];
                  update({ valor_json: next });
                }}
                className={`px-2.5 py-1 rounded text-xs border transition-colors ${selected.includes(o) ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-muted-foreground"} ${!isEditable ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
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
                ) : (
                  <a href={val.evidencia_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Ver arquivo</a>
                )}
                {isEditable && (
                  <Button type="button" variant="destructive" size="sm" className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full"
                    onClick={() => update({ evidencia_url: null })}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ) : isEditable ? (
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
        return <Input value={val.valor_texto ?? ""} onChange={e => update({ valor_texto: e.target.value })} disabled={!isEditable} />;
    }
  };

  return (
    <div className={`space-y-1.5 p-3 rounded-lg border transition-colors ${isReturned ? "border-amber-400 bg-amber-50/50" : error && !disabled ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-2">
        <Label className="text-sm font-medium">
          {field.label}
          {field.obrigatorio && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        {field.criticidade === "critica" && <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">Crítico</span>}
        {field.criticidade === "alta" && <span className="text-[10px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded">Alta</span>}
      </div>
      {field.descricao && <p className="text-xs text-muted-foreground">{field.descricao}</p>}

      {renderInput()}

      {/* Evidence upload for non-file fields that require evidence */}
      {field.exige_evidencia && !["foto", "arquivo", "assinatura"].includes(field.tipo) && (
        <div className="mt-2">
          {val.evidencia_url ? (
            <div className="flex items-center gap-2">
              <a href={val.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Evidência anexada</a>
              {isEditable && <Button type="button" variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => update({ evidencia_url: null })}><X className="w-3 h-3" /></Button>}
            </div>
          ) : isEditable ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-primary transition-colors">
              <Upload className="w-3.5 h-3.5" /> Anexar evidência
              <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </label>
          ) : null}
        </div>
      )}

      {/* Devolution info */}
      {isReturned && review && (
        <div className="flex items-start gap-2 mt-2 p-2 bg-amber-100/50 rounded border border-amber-200">
          <RotateCcw className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-medium text-amber-800">Campo devolvido — Rodada {review.rodada}</p>
            {review.motivo_devolucao && <p className="text-xs text-amber-700 mt-0.5">{review.motivo_devolucao}</p>}
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