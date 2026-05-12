import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle, Play, CheckCircle2, XCircle, Shield, History,
  ChevronLeft, FileText, Trash2, Timer, Paperclip, Camera, Video, File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CONTINGENCY_STATUS } from "@/modules/tarefas/hooks/tarefas_useScoring";
import { useContingencyManagement, uploadContingencyAttachment } from "@/modules/tarefas/hooks/tarefas_useContingencyManagement";
import { toast } from "sonner";

function SlaCountdown({ prazoSla }: { prazoSla: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const slaMs = new Date(prazoSla).getTime();
  const diffMs = slaMs - now;
  const isExpired = diffMs < 0;
  const absDiff = Math.abs(diffMs);
  const hours = Math.floor(absDiff / 3600000);
  const mins = Math.floor((absDiff % 3600000) / 60000);
  const secs = Math.floor((absDiff % 60000) / 1000);
  const timeStr = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return (
    <div className={`rounded-lg border p-3 ${isExpired ? "border-destructive/50 bg-destructive/5" : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700"}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5"><Timer className="w-4 h-4" /> SLA</span>
        <span className={`font-mono font-bold text-lg ${isExpired ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}>
          {isExpired ? `-${timeStr}` : timeStr}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-muted-foreground">Prazo: {new Date(prazoSla).toLocaleString("pt-BR")}</p>
        {isExpired && <span className="text-[10px] font-bold text-destructive uppercase">Vencido</span>}
      </div>
    </div>
  );
}

function SlaElapsed({ prazoSla, resolvidaEm, createdAt }: { prazoSla: string; resolvidaEm?: string; createdAt?: string }) {
  const endTime = resolvidaEm ? new Date(resolvidaEm).getTime() : Date.now();
  const slaMs = new Date(prazoSla).getTime();
  const startTime = createdAt ? new Date(createdAt).getTime() : endTime;
  const elapsed = endTime - startTime;
  const dentroPrazo = endTime <= slaMs;
  const hours = Math.floor(elapsed / 3600000);
  const mins = Math.floor((elapsed % 3600000) / 60000);
  const timeStr = hours > 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h ${mins}min` : `${hours}h ${mins}min`;
  return (
    <div className={`rounded-lg border p-3 ${dentroPrazo ? "border-green-300 bg-green-50/50 dark:bg-green-950/20 dark:border-green-700" : "border-destructive/50 bg-destructive/5"}`}>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5"><Timer className="w-4 h-4" /> SLA — {dentroPrazo ? "Dentro do prazo ✅" : "Fora do prazo ❌"}</span>
        <span className={`font-mono font-bold text-lg ${dentroPrazo ? "text-green-700 dark:text-green-400" : "text-destructive"}`}>{timeStr}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Prazo: {new Date(prazoSla).toLocaleString("pt-BR")}
        {resolvidaEm && ` • Resolvido: ${new Date(resolvidaEm).toLocaleString("pt-BR")}`}
      </p>
    </div>
  );
}

function formatDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface Props {
  contingency: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Diálogo de detalhe/tratamento de Plano de Ação (contingência).
 * Reutiliza a UI/lógica da OperationalContingenciasPage para tratar
 * a tarefa SEM sair da tela atual (ex.: Minhas Tarefas).
 */
export function ContingencyDetailDialog({ contingency, open, onOpenChange }: Props) {
  const { profile, isAdmin } = useAuth();
  const cm = useContingencyManagement();
  const resolutionLogs = cm.useResolutionLogs(contingency?.id || null);

  const [selected, setSelected] = useState<any>(contingency);
  useEffect(() => { setSelected(contingency); }, [contingency]);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveObs, setResolveObs] = useState("");
  const [resolveFile, setResolveFile] = useState<File | null>(null);
  const [validateOpen, setValidateOpen] = useState(false);
  const [validateApproved, setValidateApproved] = useState(true);
  const [validateObs, setValidateObs] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardObs, setDiscardObs] = useState("");
  const [slaDialogOpen, setSlaDialogOpen] = useState(false);
  const [slaDatetime, setSlaDatetime] = useState("");
  const [slaJustificativa, setSlaJustificativa] = useState("");
  const [slaPlanoAcao, setSlaPlanoAcao] = useState("");
  const [slaTiposEvidencia, setSlaTiposEvidencia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const resolveFileRef = useRef<HTMLInputElement>(null);

  const close = () => onOpenChange(false);

  const isPending = selected && ["aberta", "em_andamento"].includes(selected.status);
  const isResolved = selected?.status === "resolvida";
  const isMyContingency = selected?.responsavel_id === profile?.id;
  const isValidador = isAdmin || selected?.assignment?.validador_contingencia_id === profile?.id;
  const isAvaliado = selected?.assignment?.avaliado_id === profile?.id;
  const isAvaliador = selected?.assignment?.avaliador_id === profile?.id;
  const canInitiate = isAdmin || isValidador || isAvaliador;
  const canResolveAction = isAdmin || isMyContingency || isValidador || isAvaliado;
  const canDiscardAction = isAdmin || isValidador || isAvaliador;

  const initSlaDialog = () => {
    const defaultDate = new Date(Date.now() + 24 * 3600000);
    setSlaDatetime(formatDatetimeLocal(defaultDate));
    setSlaJustificativa("");
    setSlaPlanoAcao("");
    setSlaTiposEvidencia([]);
    setSlaDialogOpen(true);
  };

  const toggleEvidenceType = (tipo: string) => {
    setSlaTiposEvidencia(prev => prev.includes(tipo) ? prev.filter(t => t !== tipo) : [...prev, tipo]);
  };

  const handleStartTreatment = async () => {
    if (!selected || !slaJustificativa.trim()) return;
    if (slaTiposEvidencia.length === 0) { toast.error("Selecione pelo menos um tipo de evidência requerida."); return; }
    setUploading(true);
    try {
      cm.startTreatment.mutate(
        { contingencyId: selected.id, prazoSlaDatetime: slaDatetime, justificativa: slaJustificativa, planoAcao: slaPlanoAcao, tiposEvidenciaRequeridos: slaTiposEvidencia },
        {
          onSuccess: () => {
            setSlaDialogOpen(false);
            setSelected((prev: any) => prev ? { ...prev, status: "em_andamento", prazo_sla: new Date(slaDatetime).toISOString(), plano_acao: slaPlanoAcao, tipos_evidencia_requeridos: slaTiposEvidencia } : prev);
          },
          onSettled: () => setUploading(false),
        }
      );
    } catch (err: any) { toast.error(err.message); setUploading(false); }
  };

  const handleResolve = async () => {
    if (!selected || !resolveObs.trim()) return;
    setUploading(true);
    try {
      let evidenciaUrl: string | undefined;
      if (resolveFile) evidenciaUrl = await uploadContingencyAttachment(resolveFile, selected.id);
      cm.resolveContingency.mutate(
        { contingencyId: selected.id, observacao: resolveObs, evidenciaUrl },
        { onSuccess: () => { setResolveOpen(false); close(); }, onSettled: () => setUploading(false) }
      );
    } catch (err: any) { toast.error(err.message); setUploading(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={close}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate">{selected?.descricao}</h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
                  <span>{selected?.assignment?.template?.nome || "—"}</span>
                  <span>•</span>
                  <span>Responsável: {selected?.responsavel?.nome || "—"}</span>
                  {selected?.status && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${CONTINGENCY_STATUS[selected.status]?.class || ""}`}>
                      {CONTINGENCY_STATUS[selected.status]?.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {selected?.prazo_sla && selected?.status !== "aberta" && (
              ["resolvida", "validada", "descartada"].includes(selected.status)
                ? <SlaElapsed prazoSla={selected.prazo_sla} resolvidaEm={selected.resolvida_em} createdAt={selected.created_at} />
                : <SlaCountdown prazoSla={selected.prazo_sla} />
            )}

            <div className="border rounded-lg p-3 bg-destructive/5 border-destructive/20 space-y-2">
              <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Origem da Plano de Ação
              </h4>
              <p className="text-sm font-medium">{selected?.descricao}</p>
              {selected?.motivo_instrucao && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Instrução/Motivo:</span>
                  <p className="font-medium mt-0.5">{selected.motivo_instrucao}</p>
                </div>
              )}
              {selected?.origin_field && (
                <div className="p-2 border rounded bg-card text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Pergunta: {selected.origin_field.label}</span>
                    <span className="text-muted-foreground">Peso: {selected.origin_field.peso || 1}</span>
                  </div>
                  <span className="text-muted-foreground">Tipo: {selected.origin_field.tipo}</span>
                </div>
              )}
              {selected?.origin_review && (
                <div className="p-2 border rounded bg-card text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${selected.origin_review.conforme === false ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-green-100 text-green-700 border-green-300"}`}>
                      {selected.origin_review.conforme === false ? "Não Conforme" : "Conforme"}
                    </span>
                    {selected.origin_review.devolvido && <span className="text-amber-600 text-[10px] font-medium">Devolvido</span>}
                    <span className="text-muted-foreground">Rodada {selected.origin_review.rodada}</span>
                  </div>
                  {selected.origin_review.motivo_devolucao && (
                    <div><span className="text-muted-foreground">Motivo:</span><p className="font-medium text-destructive mt-0.5">"{selected.origin_review.motivo_devolucao}"</p></div>
                  )}
                  {selected.origin_review.observacao && (
                    <div><span className="text-muted-foreground">Observação:</span><p className="font-medium mt-0.5">"{selected.origin_review.observacao}"</p></div>
                  )}
                  {selected.origin_review.avaliador?.nome && <p className="text-muted-foreground">Avaliador: {selected.origin_review.avaliador.nome}</p>}
                </div>
              )}
              {selected?.check_answer && (
                <div className="p-2 border rounded bg-card text-xs space-y-1">
                  <p className="font-medium">Checklist: {selected.check_answer.check_item?.pergunta || "Item"}</p>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${selected.check_answer.conforme === false ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-green-100 text-green-700 border-green-300"}`}>
                    {selected.check_answer.conforme === false ? "Não Conforme" : "Conforme"}
                  </span>
                  {selected.check_answer.observacao && <p className="text-muted-foreground">"{selected.check_answer.observacao}"</p>}
                </div>
              )}
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-border">
                {selected?.assignment?.numero_tarefa && <span>Tarefa #{selected.assignment.numero_tarefa}</span>}
                <span>Template: {selected?.assignment?.template?.nome || "—"}</span>
                <span>Executor: {selected?.assignment?.executor?.nome || "—"}</span>
                {selected?.assignment?.avaliado?.nome && <span>Avaliado: {selected.assignment.avaliado.nome}</span>}
                <span>Rodada: {selected?.assignment?.rodada_atual || 1}</span>
              </div>
            </div>

            {selected?.plano_acao && selected?.status !== "aberta" && (
              <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 space-y-2">
                <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Plano de Ação</h4>
                <p className="text-sm">{selected.plano_acao}</p>
                {selected.observacao_tratamento && (
                  <div className="text-xs"><span className="text-muted-foreground">Observação:</span><p className="mt-0.5">{selected.observacao_tratamento}</p></div>
                )}
                {Array.isArray(selected.tipos_evidencia_requeridos) && selected.tipos_evidencia_requeridos.length > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">Evidências requeridas:</span>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {selected.tipos_evidencia_requeridos.map((t: string) => (
                        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-medium border border-blue-200 dark:border-blue-700">
                          {t === "foto" && <Camera className="w-3 h-3" />}
                          {t === "video" && <Video className="w-3 h-3" />}
                          {t === "documento" && <File className="w-3 h-3" />}
                          {t === "foto" ? "Foto" : t === "video" ? "Vídeo" : "Documento"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selected.justificativa_rejeicao && (
                  <div className="text-xs border-t border-blue-200 dark:border-blue-700 pt-2 mt-2">
                    <span className="text-destructive font-semibold">Justificativa da última rejeição:</span>
                    <p className="mt-0.5 text-destructive">"{selected.justificativa_rejeicao}"</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2 border rounded bg-muted/30"><span className="text-muted-foreground">Responsável</span><p className="font-medium">{selected?.responsavel?.nome || "—"}</p></div>
              <div className="p-2 border rounded bg-muted/30"><span className="text-muted-foreground">Criado em</span><p className="font-medium">{selected?.created_at ? new Date(selected.created_at).toLocaleString("pt-BR") : "—"}</p></div>
              {["resolvida", "validada", "descartada"].includes(selected?.status) && (
                <>
                  <div className="p-2 border rounded bg-muted/30"><span className="text-muted-foreground">Resolvido em</span><p className="font-medium">{selected?.resolvida_em ? new Date(selected.resolvida_em).toLocaleString("pt-BR") : "—"}</p></div>
                  <div className="p-2 border rounded bg-muted/30"><span className="text-muted-foreground">Dentro do prazo</span><p className="font-medium">{selected?.dentro_prazo === true ? "Sim ✅" : selected?.dentro_prazo === false ? "Não ❌" : "—"}</p></div>
                </>
              )}
              {selected?.validada_em && (
                <>
                  <div className="p-2 border rounded bg-muted/30"><span className="text-muted-foreground">Validado em</span><p className="font-medium">{new Date(selected.validada_em).toLocaleString("pt-BR")}</p></div>
                  <div className="p-2 border rounded bg-muted/30"><span className="text-muted-foreground">Validador</span><p className="font-medium">{selected?.validador?.nome || "—"}</p></div>
                </>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <History className="w-3 h-3" /> Timeline
              </h4>
              {resolutionLogs.data?.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum registro ainda.</p>
              ) : (
                <div className="space-y-2">
                  {(resolutionLogs.data || []).map((log: any) => (
                    <div key={log.id} className="flex items-start gap-2 p-2 border rounded text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium capitalize">{log.acao.replace(/_/g, " ")}</p>
                        {log.observacao && <p className="text-muted-foreground">"{log.observacao}"</p>}
                        {log.evidencia_url && (
                          <a href={log.evidencia_url} target="_blank" rel="noopener noreferrer" className="text-primary underline flex items-center gap-1 mt-0.5">
                            <FileText className="w-3 h-3" /> Ver evidência
                          </a>
                        )}
                        <p className="text-muted-foreground mt-0.5">{log.executor?.nome || "Sistema"} • {new Date(log.created_at).toLocaleString("pt-BR")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {(isPending || isResolved) && (
            <div className="border-t border-border p-3 bg-card safe-area-bottom">
              <div className="flex items-center gap-2 flex-wrap">
                {isPending && (
                  <>
                    {selected?.status === "aberta" && canInitiate && (
                      <Button size="sm" variant="outline" onClick={initSlaDialog} disabled={cm.isSaving} className="text-blue-700 border-blue-300 hover:bg-blue-50">
                        <Play className="w-3.5 h-3.5 mr-1" /> Iniciar Tratamento
                      </Button>
                    )}
                    {selected?.status === "em_andamento" && canResolveAction && (
                      <Button size="sm" onClick={() => { setResolveObs(""); setResolveFile(null); setResolveOpen(true); }} disabled={cm.isSaving}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Resolver
                      </Button>
                    )}
                    {canDiscardAction && (
                      <Button size="sm" variant="outline" onClick={() => { setDiscardObs(""); setDiscardOpen(true); }} disabled={cm.isSaving} className="text-muted-foreground">
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Descartar
                      </Button>
                    )}
                  </>
                )}
                {isResolved && selected && cm.canValidate(selected) && (
                  <>
                    <div className="flex-1" />
                    <Button size="sm" variant="outline" onClick={() => { setValidateApproved(false); setValidateObs(""); setValidateOpen(true); }} disabled={cm.isSaving} className="text-red-700 border-red-300 hover:bg-red-50">
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Reprovar
                    </Button>
                    <Button size="sm" onClick={() => { setValidateApproved(true); setValidateObs(""); setValidateOpen(true); }} disabled={cm.isSaving}>
                      <Shield className="w-3.5 h-3.5 mr-1" /> Validar
                    </Button>
                  </>
                )}
                {isPending && !canInitiate && !canResolveAction && !canDiscardAction && (
                  <p className="text-xs text-muted-foreground italic">Sem permissão para gerenciar esta plano de ação.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* SLA Dialog */}
      <Dialog open={slaDialogOpen} onOpenChange={(v) => { if (!v) setSlaDialogOpen(false); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Timer className="w-4 h-4" /> Iniciar Tratamento — Definir SLA</DialogTitle>
            <DialogDescription>Defina prazo, plano de ação e tipos de evidência requeridos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Prazo SLA (data e hora) <span className="text-destructive">*</span></Label>
              <Input type="datetime-local" value={slaDatetime} min={formatDatetimeLocal(new Date())} onChange={(e) => setSlaDatetime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Justificativa / Instrução inicial <span className="text-destructive">*</span></Label>
              <Textarea value={slaJustificativa} onChange={(e) => setSlaJustificativa(e.target.value)} placeholder="Descreva a justificativa..." className="min-h-[80px]" />
            </div>
            <div className="space-y-1.5">
              <Label>Plano de Ação <span className="text-destructive">*</span></Label>
              <Textarea value={slaPlanoAcao} onChange={(e) => setSlaPlanoAcao(e.target.value)} placeholder="Descreva o plano de ação..." className="min-h-[60px]" />
            </div>
            <div className="space-y-2">
              <Label>Tipos de evidência requeridos <span className="text-destructive">*</span></Label>
              <div className="flex flex-col gap-2">
                {[
                  { value: "foto", label: "Foto", icon: <Camera className="w-4 h-4" /> },
                  { value: "video", label: "Vídeo", icon: <Video className="w-4 h-4" /> },
                  { value: "documento", label: "Documento", icon: <File className="w-4 h-4" /> },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer p-2 rounded border hover:bg-muted/50 transition-colors">
                    <Checkbox checked={slaTiposEvidencia.includes(opt.value)} onCheckedChange={() => toggleEvidenceType(opt.value)} />
                    {opt.icon}
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlaDialogOpen(false)}>Cancelar</Button>
            <Button disabled={cm.isSaving || uploading || !slaDatetime || !slaJustificativa.trim() || !slaPlanoAcao.trim() || slaTiposEvidencia.length === 0} onClick={handleStartTreatment}>
              {cm.isSaving || uploading ? "Salvando..." : "Iniciar com SLA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={(v) => { if (!v) setResolveOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver Plano de Ação</DialogTitle>
            <DialogDescription>Descreva a ação corretiva aplicada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selected?.plano_acao && (
              <div className="border rounded p-2 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-xs space-y-1">
                <p className="font-semibold text-blue-700 dark:text-blue-400">Plano de Ação:</p>
                <p>{selected.plano_acao}</p>
              </div>
            )}
            <div>
              <Label className="text-sm">Ação corretiva <span className="text-destructive">*</span></Label>
              <Textarea value={resolveObs} onChange={(e) => setResolveObs(e.target.value)} placeholder="Descreva o que foi feito..." className="mt-1 min-h-[80px]" />
            </div>
            <div className="space-y-1.5">
              <Label>Anexo (evidência)</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => resolveFileRef.current?.click()}>
                  <Paperclip className="w-3.5 h-3.5 mr-1" /> {resolveFile ? "Trocar" : "Anexar"}
                </Button>
                {resolveFile && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{resolveFile.name}</span>}
              </div>
              <input ref={resolveFileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" className="hidden" onChange={(e) => setResolveFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancelar</Button>
            <Button disabled={cm.isSaving || uploading || !resolveObs.trim()} onClick={handleResolve}>
              {cm.isSaving || uploading ? "Salvando..." : "Confirmar Resolução"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validate Dialog */}
      <Dialog open={validateOpen} onOpenChange={(v) => { if (!v) setValidateOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{validateApproved ? "Validar Resolução" : "Reprovar Resolução"}</DialogTitle>
            <DialogDescription>
              {validateApproved ? "A plano de ação será marcada como validada." : "A plano de ação será devolvida ao executor."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-sm">{validateApproved ? "Observação" : "Justificativa"} {!validateApproved && <span className="text-destructive">*</span>}</Label>
            <Textarea value={validateObs} onChange={(e) => setValidateObs(e.target.value)} placeholder={validateApproved ? "Opcional..." : "Justifique..."} className="mt-1 min-h-[60px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateOpen(false)}>Cancelar</Button>
            <Button variant={validateApproved ? "default" : "destructive"} disabled={cm.isSaving || (!validateApproved && !validateObs.trim())}
              onClick={() => {
                if (!selected) return;
                cm.validateResolution.mutate(
                  { contingencyId: selected.id, approved: validateApproved, observacao: validateObs || undefined },
                  { onSuccess: () => { setValidateOpen(false); close(); } }
                );
              }}>
              {cm.isSaving ? "Salvando..." : validateApproved ? "Validar" : "Reprovar e Devolver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard Dialog */}
      <Dialog open={discardOpen} onOpenChange={(v) => { if (!v) setDiscardOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Descartar Plano de Ação</DialogTitle>
            <DialogDescription>A plano de ação será descartada permanentemente.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-sm">Justificativa <span className="text-destructive">*</span></Label>
            <Textarea value={discardObs} onChange={(e) => setDiscardObs(e.target.value)} placeholder="Motivo..." className="mt-1 min-h-[60px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={cm.isSaving || !discardObs.trim()}
              onClick={() => {
                if (!selected) return;
                cm.discardContingency.mutate(
                  { contingencyId: selected.id, observacao: discardObs },
                  { onSuccess: () => { setDiscardOpen(false); close(); } }
                );
              }}>
              {cm.isSaving ? "Salvando..." : "Descartar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
