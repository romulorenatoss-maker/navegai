import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle, Play, CheckCircle2, XCircle, Clock, Shield, History,
  ChevronLeft, FileText, RotateCcw, Trash2, Timer, Paperclip, Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { CONTINGENCY_STATUS } from "@/hooks/useOperationalScoring";
import { useContingencyManagement, uploadContingencyAttachment } from "@/hooks/useContingencyManagement";
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
        <span className="flex items-center gap-1.5">
          <Timer className="w-4 h-4" />
          SLA
        </span>
        <span className={`font-mono font-bold text-lg ${isExpired ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}>
          {isExpired ? `-${timeStr}` : timeStr}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-muted-foreground">
          Prazo: {new Date(prazoSla).toLocaleString("pt-BR")}
        </p>
        {isExpired && (
          <span className="text-[10px] font-bold text-destructive uppercase">Vencido</span>
        )}
      </div>
    </div>
  );
}

function formatDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function OperationalContingenciasPage() {
  const { profile, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("abertas");
  const [selected, setSelected] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Action dialogs
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveObs, setResolveObs] = useState("");
  const [resolveFile, setResolveFile] = useState<File | null>(null);
  const [validateOpen, setValidateOpen] = useState(false);
  const [validateApproved, setValidateApproved] = useState(true);
  const [validateObs, setValidateObs] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardObs, setDiscardObs] = useState("");

  // SLA dialog
  const [slaDialogOpen, setSlaDialogOpen] = useState(false);
  const [slaDatetime, setSlaDatetime] = useState("");
  const [slaJustificativa, setSlaJustificativa] = useState("");
  const [slaFile, setSlaFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const slaFileRef = useRef<HTMLInputElement>(null);
  const resolveFileRef = useRef<HTMLInputElement>(null);

  const cm = useContingencyManagement();
  const resolutionLogs = cm.useResolutionLogs(selected?.id || null);

  const openDetail = (c: any) => {
    setSelected(c);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelected(null);
  };

  const isPending = selected && ["aberta", "em_andamento"].includes(selected.status);
  const isResolved = selected?.status === "resolvida";
  const isMyContingency = selected?.responsavel_id === profile?.id;
  const isValidador = isAdmin || selected?.assignment?.validador_contingencia_id === profile?.id;
  const isAvaliado = selected?.assignment?.avaliado_id === profile?.id;
  const isAvaliador = selected?.assignment?.avaliador_id === profile?.id;
  const canInitiate = isAdmin || isValidador || isAvaliador;
  const canResolveAction = isAdmin || isMyContingency || isValidador || isAvaliado;
  const canDiscardAction = isAdmin || isValidador || isAvaliador;

  const tabData: Record<string, { list: any[]; empty: string }> = {
    abertas: { list: cm.abertas, empty: "Nenhuma contingência aberta." },
    em_tratamento: { list: cm.emTratamento, empty: "Nenhuma em tratamento." },
    vencidas: { list: cm.vencidas, empty: "Nenhuma contingência vencida." },
    resolvidas: { list: cm.resolvidas, empty: "Nenhuma aguardando validação." },
  };

  const renderCard = (c: any) => {
    const statusCfg = CONTINGENCY_STATUS[c.status] || { label: c.status, class: "bg-muted text-muted-foreground border-border" };
    const sla = cm.getSlaInfo(c);

    return (
      <div
        key={c.id}
        onClick={() => openDetail(c)}
        className={`p-3 border rounded-lg cursor-pointer hover:shadow-sm transition-shadow ${
          sla?.isExpired ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{c.descricao}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
              <span>{c.assignment?.template?.nome || "—"}</span>
              <span>•</span>
              <span>Resp: {c.responsavel?.nome || "—"}</span>
              {c.assignment?.executor?.nome && (
                <>
                  <span>•</span>
                  <span>Exec: {c.assignment.executor.nome}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusCfg.class}`}>
              {statusCfg.label}
            </span>
            {sla && (
              <span className={`text-[10px] font-mono ${sla.isExpired ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                {sla.label}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const initSlaDialog = () => {
    const defaultDate = new Date(Date.now() + 24 * 3600000);
    setSlaDatetime(formatDatetimeLocal(defaultDate));
    setSlaJustificativa("");
    setSlaFile(null);
    setSlaDialogOpen(true);
  };

  const handleStartTreatment = async () => {
    if (!selected || !slaJustificativa.trim()) return;
    setUploading(true);
    try {
      let evidenciaUrl: string | undefined;
      if (slaFile) {
        evidenciaUrl = await uploadContingencyAttachment(slaFile, selected.id);
      }
      cm.startTreatment.mutate(
        {
          contingencyId: selected.id,
          prazoSlaDatetime: slaDatetime,
          justificativa: slaJustificativa,
          evidenciaUrl,
        },
        {
          onSuccess: () => {
            setSlaDialogOpen(false);
            setSelected((prev: any) => prev ? {
              ...prev,
              status: "em_andamento",
              prazo_sla: new Date(slaDatetime).toISOString(),
            } : prev);
          },
          onSettled: () => setUploading(false),
        }
      );
    } catch (err: any) {
      toast.error(err.message);
      setUploading(false);
    }
  };

  const handleResolve = async () => {
    if (!selected || !resolveObs.trim()) return;
    setUploading(true);
    try {
      let evidenciaUrl: string | undefined;
      if (resolveFile) {
        evidenciaUrl = await uploadContingencyAttachment(resolveFile, selected.id);
      }
      cm.resolveContingency.mutate(
        { contingencyId: selected.id, observacao: resolveObs, evidenciaUrl },
        {
          onSuccess: () => { setResolveOpen(false); closeDetail(); },
          onSettled: () => setUploading(false),
        }
      );
    } catch (err: any) {
      toast.error(err.message);
      setUploading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-destructive" /> Gestão de Contingências
        </h1>
        <p className="text-sm text-muted-foreground">Tratamento, resolução e validação de contingências operacionais.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full mb-4 flex-wrap h-auto gap-1">
          {[
            { key: "abertas", label: "Abertas", count: cm.abertas.length, accent: "bg-red-500/20 text-red-700" },
            { key: "em_tratamento", label: "Em Tratamento", count: cm.emTratamento.length, accent: "bg-blue-500/20 text-blue-700" },
            { key: "vencidas", label: "Vencidas", count: cm.vencidas.length, accent: "bg-red-600/20 text-red-800" },
            { key: "resolvidas", label: "Resolvidas", count: cm.resolvidas.length, accent: "bg-amber-500/20 text-amber-700" },
          ].map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="flex-1 min-w-[60px] text-xs">
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1 px-1.5 rounded-full text-[10px] ${t.accent}`}>{t.count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(tabData).map(([key, { list, empty }]) => (
          <TabsContent key={key} value={key} className="space-y-3">
            {cm.isLoading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
            ) : list.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">{empty}</div>
            ) : (
              list.map(renderCard)
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(v) => { if (!v) closeDetail(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={closeDetail}>
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
            {selected?.prazo_sla && (
              <SlaCountdown prazoSla={selected.prazo_sla} />
            )}

            {/* Origem da Contingência */}
            <div className="border rounded-lg p-3 bg-destructive/5 border-destructive/20 space-y-2">
              <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Origem da Contingência
              </h4>
              <p className="text-sm font-medium">{selected?.descricao}</p>

              {selected?.motivo_instrucao && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Instrução/Motivo:</span>
                  <p className="font-medium mt-0.5">{selected.motivo_instrucao}</p>
                </div>
              )}

              {/* Campo de origem (template field) */}
              {selected?.origin_field && (
                <div className="p-2 border rounded bg-card text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Pergunta: {selected.origin_field.label}</span>
                    <span className="text-muted-foreground">Peso: {selected.origin_field.peso || 1}</span>
                  </div>
                  <span className="text-muted-foreground">Tipo: {selected.origin_field.tipo}</span>
                </div>
              )}

              {/* Review de origem (não conformidade) */}
              {selected?.origin_review && (
                <div className="p-2 border rounded bg-card text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                      selected.origin_review.conforme === false
                        ? "bg-destructive/10 text-destructive border-destructive/30"
                        : "bg-green-100 text-green-700 border-green-300"
                    }`}>
                      {selected.origin_review.conforme === false ? "Não Conforme" : "Conforme"}
                    </span>
                    {selected.origin_review.devolvido && (
                      <span className="text-amber-600 text-[10px] font-medium">Devolvido</span>
                    )}
                    <span className="text-muted-foreground">Rodada {selected.origin_review.rodada}</span>
                  </div>
                  {selected.origin_review.motivo_devolucao && (
                    <div>
                      <span className="text-muted-foreground">Motivo da não conformidade:</span>
                      <p className="font-medium text-destructive mt-0.5">"{selected.origin_review.motivo_devolucao}"</p>
                    </div>
                  )}
                  {selected.origin_review.observacao && (
                    <div>
                      <span className="text-muted-foreground">Observação:</span>
                      <p className="font-medium mt-0.5">"{selected.origin_review.observacao}"</p>
                    </div>
                  )}
                  {selected.origin_review.avaliador?.nome && (
                    <p className="text-muted-foreground">Avaliador: {selected.origin_review.avaliador.nome}</p>
                  )}
                </div>
              )}

              {/* Check answer de origem */}
              {selected?.check_answer && (
                <div className="p-2 border rounded bg-card text-xs space-y-1">
                  <p className="font-medium">
                    Checklist: {selected.check_answer.check_item?.descricao || "Item"}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                      selected.check_answer.conforme === false
                        ? "bg-destructive/10 text-destructive border-destructive/30"
                        : "bg-green-100 text-green-700 border-green-300"
                    }`}>
                      {selected.check_answer.conforme === false ? "Não Conforme" : "Conforme"}
                    </span>
                  </div>
                  {selected.check_answer.observacao && (
                    <p className="text-muted-foreground">"{selected.check_answer.observacao}"</p>
                  )}
                  {selected.check_answer.resposta && (
                    <p className="text-muted-foreground">Resposta: {selected.check_answer.resposta}</p>
                  )}
                </div>
              )}

              {/* Tarefa info */}
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-border">
                {selected?.assignment?.numero_tarefa && (
                  <span>Tarefa #{selected.assignment.numero_tarefa}</span>
                )}
                <span>Template: {selected?.assignment?.template?.nome || "—"}</span>
                <span>Executor: {selected?.assignment?.executor?.nome || "—"}</span>
                {selected?.assignment?.avaliado?.nome && (
                  <span>Avaliado: {selected.assignment.avaliado.nome}</span>
                )}
                <span>Rodada: {selected?.assignment?.rodada_atual || 1}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2 border rounded bg-muted/30">
                <span className="text-muted-foreground">Responsável</span>
                <p className="font-medium">{selected?.responsavel?.nome || "—"}</p>
              </div>
              <div className="p-2 border rounded bg-muted/30">
                <span className="text-muted-foreground">Criado em</span>
                <p className="font-medium">{selected?.created_at ? new Date(selected.created_at).toLocaleString("pt-BR") : "—"}</p>
              </div>
              <div className="p-2 border rounded bg-muted/30">
                <span className="text-muted-foreground">Resolvido em</span>
                <p className="font-medium">{selected?.resolvida_em ? new Date(selected.resolvida_em).toLocaleString("pt-BR") : "—"}</p>
              </div>
              <div className="p-2 border rounded bg-muted/30">
                <span className="text-muted-foreground">Dentro do prazo</span>
                <p className="font-medium">{selected?.dentro_prazo === true ? "Sim ✅" : selected?.dentro_prazo === false ? "Não ❌" : "—"}</p>
              </div>
              {selected?.validada_em && (
                <>
                  <div className="p-2 border rounded bg-muted/30">
                    <span className="text-muted-foreground">Validado em</span>
                    <p className="font-medium">{new Date(selected.validada_em).toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="p-2 border rounded bg-muted/30">
                    <span className="text-muted-foreground">Validador</span>
                    <p className="font-medium">{selected?.validador?.nome || "—"}</p>
                  </div>
                </>
              )}
            </div>

            {/* Resolution timeline */}
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
                          <a href={log.evidencia_url} target="_blank" rel="noopener noreferrer"
                            className="text-primary underline flex items-center gap-1 mt-0.5">
                            <FileText className="w-3 h-3" /> Ver evidência
                          </a>
                        )}
                        <p className="text-muted-foreground mt-0.5">
                          {log.executor?.nome || "Sistema"} • {new Date(log.created_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action bar */}
          {(isPending || isResolved) && (
            <div className="border-t border-border p-3 bg-card safe-area-bottom">
              <div className="flex items-center gap-2 flex-wrap">
                {isPending && (
                  <>
                    {selected?.status === "aberta" && canInitiate && (
                      <Button size="sm" variant="outline" onClick={initSlaDialog}
                        disabled={cm.isSaving} className="text-blue-700 border-blue-300 hover:bg-blue-50">
                        <Play className="w-3.5 h-3.5 mr-1" /> Iniciar Tratamento
                      </Button>
                    )}
                    {selected?.status === "em_andamento" && canResolveAction && (
                      <Button size="sm" onClick={() => { setResolveObs(""); setResolveFile(null); setResolveOpen(true); }}
                        disabled={cm.isSaving}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Resolver
                      </Button>
                    )}
                    {canDiscardAction && (
                      <Button size="sm" variant="outline"
                        onClick={() => { setDiscardObs(""); setDiscardOpen(true); }}
                        disabled={cm.isSaving} className="text-muted-foreground">
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Descartar
                      </Button>
                    )}
                  </>
                )}

                {isResolved && selected && cm.canValidate(selected) && (
                  <>
                    <div className="flex-1" />
                    <Button size="sm" variant="outline"
                      onClick={() => { setValidateApproved(false); setValidateObs(""); setValidateOpen(true); }}
                      disabled={cm.isSaving} className="text-red-700 border-red-300 hover:bg-red-50">
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Reprovar
                    </Button>
                    <Button size="sm"
                      onClick={() => { setValidateApproved(true); setValidateObs(""); setValidateOpen(true); }}
                      disabled={cm.isSaving}>
                      <Shield className="w-3.5 h-3.5 mr-1" /> Validar
                    </Button>
                  </>
                )}

                {isPending && !canInitiate && !canResolveAction && !canDiscardAction && (
                  <p className="text-xs text-muted-foreground italic">Sem permissão para gerenciar esta contingência.</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* SLA Dialog */}
      <Dialog open={slaDialogOpen} onOpenChange={(v) => { if (!v) setSlaDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="w-4 h-4" /> Iniciar Tratamento — Definir SLA
            </DialogTitle>
            <DialogDescription>
              Defina a data e hora limite para resolução e justifique o início do tratamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Prazo SLA (data e hora) <span className="text-destructive">*</span></Label>
              <Input
                type="datetime-local"
                value={slaDatetime}
                min={formatDatetimeLocal(new Date())}
                onChange={(e) => setSlaDatetime(e.target.value)}
              />
              {slaDatetime && (
                <p className="text-xs text-muted-foreground">
                  Expira em: {new Date(slaDatetime).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Justificativa <span className="text-destructive">*</span></Label>
              <Textarea
                value={slaJustificativa}
                onChange={(e) => setSlaJustificativa(e.target.value)}
                placeholder="Descreva a justificativa para iniciar o tratamento..."
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Anexo (foto/vídeo) <span className="text-muted-foreground text-xs">— opcional</span></Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => slaFileRef.current?.click()}>
                  <Paperclip className="w-3.5 h-3.5 mr-1" /> {slaFile ? "Trocar" : "Anexar"}
                </Button>
                {slaFile && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">{slaFile.name}</span>
                )}
              </div>
              <input
                ref={slaFileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => setSlaFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlaDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={cm.isSaving || uploading || !slaDatetime || !slaJustificativa.trim()}
              onClick={handleStartTreatment}
            >
              {cm.isSaving || uploading ? "Salvando..." : "Iniciar com SLA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={(v) => { if (!v) setResolveOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver Contingência</DialogTitle>
            <DialogDescription>Descreva a ação corretiva aplicada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Ação corretiva <span className="text-destructive">*</span></Label>
              <Textarea value={resolveObs} onChange={(e) => setResolveObs(e.target.value)}
                placeholder="Descreva o que foi feito..." className="mt-1 min-h-[80px]" />
            </div>
            <div className="space-y-1.5">
              <Label>Anexo (foto/vídeo) <span className="text-muted-foreground text-xs">— opcional</span></Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => resolveFileRef.current?.click()}>
                  <Paperclip className="w-3.5 h-3.5 mr-1" /> {resolveFile ? "Trocar" : "Anexar"}
                </Button>
                {resolveFile && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">{resolveFile.name}</span>
                )}
              </div>
              <input
                ref={resolveFileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => setResolveFile(e.target.files?.[0] || null)}
              />
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
              {validateApproved
                ? "A contingência será marcada como validada."
                : "A contingência será reaberta para novo tratamento."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-sm">Observação</Label>
            <Textarea value={validateObs} onChange={(e) => setValidateObs(e.target.value)}
              placeholder="Observações opcionais..." className="mt-1 min-h-[60px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateOpen(false)}>Cancelar</Button>
            <Button
              variant={validateApproved ? "default" : "destructive"}
              disabled={cm.isSaving}
              onClick={() => {
                if (!selected) return;
                cm.validateResolution.mutate(
                  { contingencyId: selected.id, approved: validateApproved, observacao: validateObs || undefined },
                  { onSuccess: () => { setValidateOpen(false); closeDetail(); } }
                );
              }}>
              {cm.isSaving ? "Salvando..." : validateApproved ? "Validar" : "Reprovar e Reabrir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard Dialog */}
      <Dialog open={discardOpen} onOpenChange={(v) => { if (!v) setDiscardOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Descartar Contingência</DialogTitle>
            <DialogDescription>A contingência será descartada permanentemente.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-sm">Justificativa <span className="text-destructive">*</span></Label>
            <Textarea value={discardObs} onChange={(e) => setDiscardObs(e.target.value)}
              placeholder="Motivo do descarte..." className="mt-1 min-h-[60px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={cm.isSaving || !discardObs.trim()}
              onClick={() => {
                if (!selected) return;
                cm.discardContingency.mutate(
                  { contingencyId: selected.id, observacao: discardObs },
                  { onSuccess: () => { setDiscardOpen(false); closeDetail(); } }
                );
              }}>
              {cm.isSaving ? "Salvando..." : "Descartar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
