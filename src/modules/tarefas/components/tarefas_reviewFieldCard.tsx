import { useState } from "react";
import { SnapshotField } from "./tarefas_dynamicFieldRenderer";
import { FieldReviewDraft } from "@/modules/tarefas/hooks/tarefas_useAssignmentReview";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, RotateCcw, AlertTriangle, ExternalLink, Clock } from "lucide-react";

interface Props {
  field: SnapshotField;
  answer: any;
  review: FieldReviewDraft | undefined;
  previousReview?: any;
  onChange: (fieldId: string, patch: Partial<FieldReviewDraft>) => void;
  disabled?: boolean;
  contingencyPrazoHoras?: number;
  onContingencyPrazoChange?: (fieldId: string, horas: number) => void;
  onContingencyConfirm?: (fieldId: string, prazoResolucao: string, motivoInstrucao: string) => void;
}

function renderAnswerValue(field: SnapshotField, answer: any) {
  if (!answer) return <span className="text-muted-foreground italic text-xs">Sem resposta</span>;

  switch (field.tipo) {
    case "conforme":
    case "sim_nao":
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${answer.valor_booleano === true ? "bg-green-100 text-green-800" : answer.valor_booleano === false ? "bg-red-100 text-red-800" : "bg-muted text-muted-foreground"}`}>
          {answer.valor_booleano === true ? "Sim / Conforme" : answer.valor_booleano === false ? "Não / Não Conforme" : "—"}
        </span>
      );
    case "nota_avaliacao":
    case "numero":
      return <span className="font-mono text-sm">{answer.valor_numero ?? "—"}</span>;
    case "texto":
      return <p className="text-sm whitespace-pre-wrap">{answer.valor_texto || "—"}</p>;
    case "data":
      return <span className="text-sm">{answer.valor_data?.slice(0, 10) || "—"}</span>;
    case "hora":
      return <span className="text-sm">{answer.valor_texto || "—"}</span>;
    case "select":
      return <span className="text-sm">{answer.valor_texto || "—"}</span>;
    case "multi_select":
      const items: string[] = answer.valor_json || [];
      return items.length > 0 ? (
        <div className="flex flex-wrap gap-1">{items.map(i => <span key={i} className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs">{i}</span>)}</div>
      ) : <span className="text-muted-foreground text-xs">—</span>;
    default:
      return <span className="text-sm">{answer.valor_texto || "—"}</span>;
  }
}

export function ReviewFieldCard({ field, answer, review, previousReview, onChange, disabled, contingencyPrazoHoras, onContingencyPrazoChange, onContingencyConfirm }: Props) {
  const draft: FieldReviewDraft = review || { field_id: field.id, conforme: null, observacao: "", devolvido: false, motivo_devolucao: "" };
  const isReincidente = previousReview?.conforme === false;
  const executorNaoConforme = (field.tipo === "conforme" || field.tipo === "sim_nao") && answer?.valor_booleano === false;
  const optionRules = Array.isArray((field as any).opcoes_regras) ? (field as any).opcoes_regras : [];
  const answerTriggersContingency = field.gera_contingencia || (
    field.tipo === "conforme"
      ? answer?.valor_booleano === false && optionRules.some((rule: any) => rule?.valor === "nao_conforme" && rule?.gera_contingencia)
      : field.tipo === "sim_nao"
        ? answer?.valor_booleano === false && optionRules.some((rule: any) => rule?.valor === "nao" && rule?.gera_contingencia)
        : field.tipo === "select"
          ? optionRules.some((rule: any) => rule?.label === answer?.valor_texto && rule?.gera_contingencia)
          : false
  );

  const [contingencyModalOpen, setContingencyModalOpen] = useState(false);
  const [contingencyPrazo, setContingencyPrazo] = useState("");
  const [contingencyMotivo, setContingencyMotivo] = useState("");

  const handleNaoConformeClick = () => {
    onChange(field.id, { conforme: false });
    if (answerTriggersContingency && onContingencyConfirm && !disabled) {
      const defaultPrazo = new Date(Date.now() + 24 * 3600000);
      setContingencyPrazo(defaultPrazo.toISOString().slice(0, 16));
      setContingencyMotivo("");
      setContingencyModalOpen(true);
    }
  };

  const handleContingencyConfirm = () => {
    if (!contingencyPrazo || !contingencyMotivo.trim()) return;
    onContingencyConfirm?.(field.id, contingencyPrazo, contingencyMotivo);
    setContingencyModalOpen(false);
  };

  return (
    <>
      <div className={`border rounded-lg overflow-hidden transition-colors ${draft.conforme === false ? "border-red-300 bg-red-50/30" : draft.conforme === true ? "border-green-300 bg-green-50/30" : executorNaoConforme ? "border-orange-300 bg-orange-50/20" : "border-border bg-card"}`}>
        {executorNaoConforme && draft.conforme === null && (
          <div className="bg-orange-100 border-b border-orange-200 px-3 py-1.5 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-700" />
            <span className="text-[11px] font-medium text-orange-800">Executor marcou como Não Conforme — requer avaliação</span>
          </div>
        )}
        <div className="flex items-center justify-between p-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">{field.label}</Label>
            {field.obrigatorio && <span className="text-destructive text-xs">*</span>}
            {field.criticidade === "critica" && <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">Crítico</span>}
            {answerTriggersContingency && <span className="text-[10px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded">Gera Plano de Ação</span>}
            {isReincidente && <span className="text-[10px] bg-red-200 text-red-800 border border-red-300 px-1.5 py-0.5 rounded flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />Reincidente</span>}
          </div>
          <div className="text-xs text-muted-foreground">Peso: {field.peso} | Máx: {field.nota_maxima}</div>
        </div>

        <div className="grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border/50">
          <div className="p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Resposta do Executor</p>
            {renderAnswerValue(field, answer)}
            {answer?.evidencia_url && (
              <div className="mt-2">
                {field.tipo === "foto" ? (
                  <img src={answer.evidencia_url} alt="Evidência" className="max-h-28 rounded border border-border cursor-pointer" onClick={() => window.open(answer.evidencia_url, "_blank")} />
                ) : (
                  <a href={answer.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1"><ExternalLink className="w-3 h-3" />Ver evidência</a>
                )}
              </div>
            )}
            {field.exige_evidencia && !answer?.evidencia_url && (
              <p className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Evidência obrigatória não anexada</p>
            )}
          </div>

          <div className="p-3 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Avaliação</p>

            <div className="flex gap-2">
              <button type="button" disabled={disabled}
                onClick={() => onChange(field.id, { conforme: true, devolvido: false, motivo_devolucao: "" })}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${draft.conforme === true ? "bg-green-100 text-green-800 border-green-300 ring-2 ring-green-400/30" : "bg-card border-border text-muted-foreground hover:bg-green-50"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Conforme
              </button>
              <button type="button" disabled={disabled}
                onClick={handleNaoConformeClick}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${draft.conforme === false ? "bg-red-100 text-red-800 border-red-300 ring-2 ring-red-400/30" : "bg-card border-border text-muted-foreground hover:bg-red-50"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                <XCircle className="w-3.5 h-3.5" /> Não Conforme
              </button>
            </div>

            <Textarea placeholder="Observação do avaliador..." value={draft.observacao} disabled={disabled}
              onChange={e => onChange(field.id, { observacao: e.target.value })}
              className="text-xs min-h-[40px]" maxLength={2000} />

            {draft.conforme === false && (
              <div className="space-y-2 p-2 bg-amber-50 border border-amber-200 rounded">
                <div className="flex items-center gap-2">
                  <Switch checked={draft.devolvido} disabled={disabled}
                    onCheckedChange={v => onChange(field.id, { devolvido: v })} />
                  <Label className="text-xs text-amber-800 flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Devolver campo</Label>
                </div>
                {draft.devolvido && (
                  <Textarea placeholder="Motivo da devolução..." value={draft.motivo_devolucao} disabled={disabled}
                    onChange={e => onChange(field.id, { motivo_devolucao: e.target.value })}
                    className="text-xs min-h-[30px] border-amber-300" />
                )}
              </div>
            )}

            {draft.conforme === false && answerTriggersContingency && onContingencyPrazoChange && (
              <div className="p-2 bg-orange-50 border border-orange-200 rounded space-y-1">
                <Label className="text-xs text-orange-800 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Prazo para resolução (horas)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={contingencyPrazoHoras ?? 24}
                  disabled={disabled}
                  onChange={e => onContingencyPrazoChange(field.id, Number(e.target.value) || 24)}
                  className="text-xs h-8 w-32 border-orange-300"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contingency confirmation modal */}
      <Dialog open={contingencyModalOpen} onOpenChange={setContingencyModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600" /> Enviar para Plano de Ação?
            </DialogTitle>
            <DialogDescription>
              O campo "{field.label}" foi marcado como Não Conforme. Deseja criar uma plano de ação formal para correção?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Prazo de correção <span className="text-destructive">*</span></Label>
              <Input
                type="datetime-local"
                value={contingencyPrazo}
                onChange={e => setContingencyPrazo(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Motivo / Instrução de correção <span className="text-destructive">*</span></Label>
              <Textarea
                value={contingencyMotivo}
                onChange={e => setContingencyMotivo(e.target.value)}
                placeholder="Descreva o que deve ser corrigido..."
                className="min-h-[80px] text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setContingencyModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleContingencyConfirm}
              disabled={!contingencyPrazo || !contingencyMotivo.trim()}
              className="bg-orange-600 hover:bg-orange-700 text-white">
              Criar Plano de Ação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
