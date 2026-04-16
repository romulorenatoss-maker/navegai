import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle, Play, CheckCircle2, XCircle, Clock, Shield, History,
  FileText, Trash2, Timer, ChevronDown, Paperclip, Camera, Video, File,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
    <div className={`rounded-lg border p-2.5 ${isExpired ? "border-destructive/50 bg-destructive/5" : "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700"}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1">
          <Timer className="w-3.5 h-3.5" /> SLA
        </span>
        <span className={`font-mono font-bold text-sm ${isExpired ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}>
          {isExpired ? `-${timeStr}` : timeStr}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">
        Prazo: {new Date(prazoSla).toLocaleString("pt-BR")}
        {isExpired && <span className="ml-1 text-destructive font-bold">• VENCIDO</span>}
      </p>
    </div>
  );
}

function formatDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface Props {
  assignmentId: string;
}

export function EmbeddedContingencyPanel({ assignmentId }: Props) {
  const { profile, isAdmin } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // SLA dialog
  const [slaDialogOpen, setSlaDialogOpen] = useState(false);
  const [slaDatetime, setSlaDatetime] = useState("");
  const [slaJustificativa, setSlaJustificativa] = useState("");
  const [slaFile, setSlaFile] = useState<File | null>(null);
  const [slaTargetId, setSlaTargetId] = useState<string | null>(null);
  const slaFileRef = useRef<HTMLInputElement>(null);

  // Resolve dialog
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveObs, setResolveObs] = useState("");
  const [resolveFile, setResolveFile] = useState<File | null>(null);
  const [resolveTargetId, setResolveTargetId] = useState<string | null>(null);
  const resolveFileRef = useRef<HTMLInputElement>(null);

  // Validate dialog
  const [validateOpen, setValidateOpen] = useState(false);
  const [validateApproved, setValidateApproved] = useState(true);
  const [validateObs, setValidateObs] = useState("");
  const [validateTargetId, setValidateTargetId] = useState<string | null>(null);

  // Discard dialog
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardObs, setDiscardObs] = useState("");
  const [discardTargetId, setDiscardTargetId] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);

  const cm = useContingencyManagement();

  const { data: contingencies = [], isLoading } = useQuery({
    queryKey: ["embedded_contingencies", assignmentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_contingencies")
        .select(`
          *,
          responsavel:profiles!operational_contingencies_responsavel_id_fkey(id, nome),
          validador:profiles!operational_contingencies_validada_por_fkey(id, nome),
          origin_field:operational_template_fields!operational_contingencies_origin_field_id_fkey(id, label, tipo, peso),
          origin_review:operational_field_reviews!operational_contingencies_origin_review_id_fkey(id, conforme, devolvido, motivo_devolucao, observacao, rodada,
            avaliador:profiles!operational_field_reviews_avaliador_id_fkey(nome)
          ),
          check_answer:operational_execution_check_answers!operational_contingencies_check_answer_id_fkey(id, conforme, observacao, resposta,
            check_item:operational_template_check_items!operational_execution_check_answers_check_item_id_fkey(pergunta)
          )
        `)
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 10000,
  });

  const { data: assignment } = useQuery({
    queryKey: ["embedded_cont_assignment", assignmentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_assignments")
        .select("validador_contingencia_id, responsavel_id, avaliado_id, avaliador_id")
        .eq("id", assignmentId)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 30000,
  });

  // Avaliado can manage contingencies (attach evidence, resolve)
  const isAvaliado = assignment?.avaliado_id === profile?.id;
  const isResponsavel = assignment?.responsavel_id === profile?.id;
  const isValidador = assignment?.validador_contingencia_id === profile?.id;
  const isAvaliador = assignment?.avaliador_id === profile?.id;

  const canManage = (c: any): boolean => {
    if (isAdmin) return true;
    if (c.responsavel_id === profile?.id) return true;
    if (isValidador) return true;
    if (isAvaliado) return true;
    if (isAvaliador) return true;
    return false;
  };

  const canValidateContingency = (_c: any): boolean => {
    if (isAdmin) return true;
    if (isValidador) return true;
    return false;
  };

  // Avaliado can only attach evidence and resolve, not initiate treatment or discard
  const canInitiateTreatment = (_c: any): boolean => {
    if (isAdmin) return true;
    if (isValidador) return true;
    if (isAvaliador) return true;
    return false;
  };

  const canResolve = (_c: any): boolean => {
    if (isAdmin) return true;
    if (isValidador) return true;
    if (isAvaliado) return true;
    if (isResponsavel) return true;
    return false;
  };

  const canDiscard = (_c: any): boolean => {
    if (isAdmin) return true;
    if (isValidador) return true;
    if (isAvaliador) return true;
    return false;
  };

  const initSlaDialog = (cId: string) => {
    const defaultDate = new Date(Date.now() + 24 * 3600000);
    setSlaDatetime(formatDatetimeLocal(defaultDate));
    setSlaJustificativa("");
    setSlaFile(null);
    setSlaTargetId(cId);
    setSlaDialogOpen(true);
  };

  const handleStartTreatment = async () => {
    if (!slaTargetId || !slaJustificativa.trim()) return;
    setUploading(true);
    try {
      let evidenciaUrl: string | undefined;
      if (slaFile) {
        evidenciaUrl = await uploadContingencyAttachment(slaFile, slaTargetId);
      }
      cm.startTreatment.mutate(
        { contingencyId: slaTargetId, prazoSlaDatetime: slaDatetime, justificativa: slaJustificativa, evidenciaUrl },
        { onSuccess: () => setSlaDialogOpen(false), onSettled: () => setUploading(false) }
      );
    } catch (err: any) {
      toast.error(err.message);
      setUploading(false);
    }
  };

  const handleResolve = async () => {
    if (!resolveTargetId || !resolveObs.trim()) return;
    setUploading(true);
    try {
      let evidenciaUrl: string | undefined;
      if (resolveFile) {
        evidenciaUrl = await uploadContingencyAttachment(resolveFile, resolveTargetId);
      }
      cm.resolveContingency.mutate(
        { contingencyId: resolveTargetId, observacao: resolveObs, evidenciaUrl },
        { onSuccess: () => setResolveOpen(false), onSettled: () => setUploading(false) }
      );
    } catch (err: any) {
      toast.error(err.message);
      setUploading(false);
    }
  };

  if (isLoading) return <p className="text-xs text-muted-foreground text-center py-3">Carregando contingências...</p>;
  if (contingencies.length === 0) return <p className="text-xs text-muted-foreground text-center py-3">Nenhuma contingência registrada.</p>;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
        Contingências ({contingencies.length})
      </h4>

      {contingencies.map((c: any) => {
        const statusCfg = CONTINGENCY_STATUS[c.status] || { label: c.status, class: "bg-muted text-muted-foreground border-border" };
        const isExpanded = expandedId === c.id;
        const isPending = ["aberta", "em_andamento"].includes(c.status);
        const isResolved = c.status === "resolvida";
        const userCanManage = canManage(c);
        const userCanValidate = canValidateContingency(c);

        return (
          <div key={c.id} className="border rounded-lg overflow-hidden bg-card">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : c.id)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{c.descricao}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Resp: {c.responsavel?.nome || "—"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusCfg.class}`}>
                  {statusCfg.label}
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-border p-3 space-y-3">
                {c.prazo_sla && c.status !== "aberta" && <SlaCountdown prazoSla={c.prazo_sla} />}

                {/* Origem da contingência */}
                <div className="border rounded p-2 bg-destructive/5 border-destructive/20 space-y-1.5 text-[11px]">
                  <p className="font-semibold text-destructive text-[10px] uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Origem
                  </p>
                  {c.motivo_instrucao && (
                    <p className="text-xs"><span className="text-muted-foreground">Instrução:</span> {c.motivo_instrucao}</p>
                  )}
                  {c.origin_field && (
                    <p><span className="text-muted-foreground">Pergunta:</span> <span className="font-medium">{c.origin_field.label}</span> (peso {c.origin_field.peso || 1})</p>
                  )}
                  {c.origin_review && (
                    <div className="space-y-0.5">
                      <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium border ${
                        c.origin_review.conforme === false ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-green-100 text-green-700 border-green-300"
                      }`}>
                        {c.origin_review.conforme === false ? "Não Conforme" : "Conforme"}
                      </span>
                      {c.origin_review.motivo_devolucao && (
                        <p className="text-destructive font-medium">"{c.origin_review.motivo_devolucao}"</p>
                      )}
                      {c.origin_review.observacao && (
                        <p className="text-muted-foreground">"{c.origin_review.observacao}"</p>
                      )}
                      {c.origin_review.avaliador?.nome && (
                        <p className="text-muted-foreground">Avaliador: {c.origin_review.avaliador.nome}</p>
                      )}
                    </div>
                  )}
                  {c.check_answer && (
                    <div className="space-y-0.5">
                      <p><span className="text-muted-foreground">Checklist:</span> {c.check_answer.check_item?.pergunta || "Item"}</p>
                      <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium border ${
                        c.check_answer.conforme === false ? "bg-destructive/10 text-destructive border-destructive/30" : "bg-green-100 text-green-700 border-green-300"
                      }`}>
                        {c.check_answer.conforme === false ? "Não Conforme" : "Conforme"}
                      </span>
                      {c.check_answer.observacao && <p className="text-muted-foreground">"{c.check_answer.observacao}"</p>}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-1.5 border rounded bg-muted/30">
                    <span className="text-muted-foreground">Criado</span>
                    <p className="font-medium">{new Date(c.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="p-1.5 border rounded bg-muted/30">
                    <span className="text-muted-foreground">Resolvido</span>
                    <p className="font-medium">{c.resolvida_em ? new Date(c.resolvida_em).toLocaleString("pt-BR") : "—"}</p>
                  </div>
                </div>

                <ContingencyTimeline contingencyId={c.id} />

                {userCanManage && isPending && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {c.status === "aberta" && canInitiateTreatment(c) && (
                      <Button size="sm" variant="outline" className="text-blue-700 border-blue-300 hover:bg-blue-50 flex-1"
                        disabled={cm.isSaving || uploading}
                        onClick={() => initSlaDialog(c.id)}>
                        <Play className="w-3 h-3 mr-1" /> Iniciar
                      </Button>
                    )}
                    {c.status === "em_andamento" && canResolve(c) && (
                      <Button size="sm" className="flex-1" disabled={cm.isSaving || uploading}
                        onClick={() => { setResolveTargetId(c.id); setResolveObs(""); setResolveFile(null); setResolveOpen(true); }}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Resolver
                      </Button>
                    )}
                    {canDiscard(c) && (
                      <Button size="sm" variant="outline" className="text-muted-foreground"
                        disabled={cm.isSaving || uploading}
                        onClick={() => { setDiscardTargetId(c.id); setDiscardObs(""); setDiscardOpen(true); }}>
                        <Trash2 className="w-3 h-3 mr-1" /> Descartar
                      </Button>
                    )}
                  </div>
                )}

                {userCanValidate && isResolved && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="text-red-700 border-red-300 hover:bg-red-50 flex-1"
                      disabled={cm.isSaving}
                      onClick={() => { setValidateTargetId(c.id); setValidateApproved(false); setValidateObs(""); setValidateOpen(true); }}>
                      <XCircle className="w-3 h-3 mr-1" /> Reprovar
                    </Button>
                    <Button size="sm" className="flex-1" disabled={cm.isSaving}
                      onClick={() => { setValidateTargetId(c.id); setValidateApproved(true); setValidateObs(""); setValidateOpen(true); }}>
                      <Shield className="w-3 h-3 mr-1" /> Validar
                    </Button>
                  </div>
                )}

                {!userCanManage && !userCanValidate && (
                  <p className="text-[10px] text-muted-foreground italic text-center py-1">Sem permissão para gerenciar esta contingência.</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* SLA Dialog */}
      <Dialog open={slaDialogOpen} onOpenChange={(v) => { if (!v) setSlaDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Timer className="w-4 h-4" /> Iniciar Tratamento — SLA
            </DialogTitle>
            <DialogDescription>Defina prazo, justificativa e anexo opcional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Prazo SLA (data e hora) <span className="text-destructive">*</span></Label>
              <Input
                type="datetime-local"
                value={slaDatetime}
                min={formatDatetimeLocal(new Date())}
                onChange={(e) => setSlaDatetime(e.target.value)}
              />
              {slaDatetime && (
                <p className="text-xs text-muted-foreground">
                  Expira: {new Date(slaDatetime).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Justificativa <span className="text-destructive">*</span></Label>
              <Textarea
                value={slaJustificativa}
                onChange={(e) => setSlaJustificativa(e.target.value)}
                placeholder="Justifique o início do tratamento..."
                className="min-h-[60px] text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Anexo <span className="text-muted-foreground text-xs">— opcional</span></Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => slaFileRef.current?.click()}>
                  <Paperclip className="w-3 h-3 mr-1" /> {slaFile ? "Trocar" : "Anexar"}
                </Button>
                {slaFile && <span className="text-xs text-muted-foreground truncate max-w-[140px]">{slaFile.name}</span>}
              </div>
              <input ref={slaFileRef} type="file" accept="image/*,video/*" className="hidden"
                onChange={(e) => setSlaFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSlaDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={cm.isSaving || uploading || !slaDatetime || !slaJustificativa.trim()}
              onClick={handleStartTreatment}>
              {cm.isSaving || uploading ? "Salvando..." : "Iniciar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={(v) => { if (!v) setResolveOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Resolver Contingência</DialogTitle>
            <DialogDescription>Descreva a ação corretiva.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Ação corretiva <span className="text-destructive">*</span></Label>
              <Textarea value={resolveObs} onChange={(e) => setResolveObs(e.target.value)}
                placeholder="Descreva o que foi feito..." className="mt-1 min-h-[60px] text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Anexo <span className="text-muted-foreground text-[10px]">— opcional</span></Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => resolveFileRef.current?.click()}>
                  <Paperclip className="w-3 h-3 mr-1" /> {resolveFile ? "Trocar" : "Anexar"}
                </Button>
                {resolveFile && <span className="text-xs text-muted-foreground truncate max-w-[140px]">{resolveFile.name}</span>}
              </div>
              <input ref={resolveFileRef} type="file" accept="image/*,video/*" className="hidden"
                onChange={(e) => setResolveFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResolveOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={cm.isSaving || uploading || !resolveObs.trim()} onClick={handleResolve}>
              {cm.isSaving || uploading ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validate Dialog */}
      <Dialog open={validateOpen} onOpenChange={(v) => { if (!v) setValidateOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{validateApproved ? "Validar" : "Reprovar"} Resolução</DialogTitle>
            <DialogDescription>
              {validateApproved ? "A contingência será validada." : "A contingência será reaberta."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Observação</Label>
            <Textarea value={validateObs} onChange={(e) => setValidateObs(e.target.value)}
              placeholder="Observações..." className="mt-1 min-h-[50px] text-sm" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setValidateOpen(false)}>Cancelar</Button>
            <Button size="sm" variant={validateApproved ? "default" : "destructive"} disabled={cm.isSaving}
              onClick={() => {
                if (!validateTargetId) return;
                cm.validateResolution.mutate(
                  { contingencyId: validateTargetId, approved: validateApproved, observacao: validateObs || undefined },
                  { onSuccess: () => setValidateOpen(false) }
                );
              }}>
              {cm.isSaving ? "Salvando..." : validateApproved ? "Validar" : "Reprovar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard Dialog */}
      <Dialog open={discardOpen} onOpenChange={(v) => { if (!v) setDiscardOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Descartar Contingência</DialogTitle>
            <DialogDescription>A contingência será descartada.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Justificativa <span className="text-destructive">*</span></Label>
            <Textarea value={discardObs} onChange={(e) => setDiscardObs(e.target.value)}
              placeholder="Motivo..." className="mt-1 min-h-[50px] text-sm" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDiscardOpen(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" disabled={cm.isSaving || !discardObs.trim()}
              onClick={() => {
                if (!discardTargetId) return;
                cm.discardContingency.mutate(
                  { contingencyId: discardTargetId, observacao: discardObs },
                  { onSuccess: () => setDiscardOpen(false) }
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

function ContingencyTimeline({ contingencyId }: { contingencyId: string }) {
  const { data: logs = [] } = useQuery({
    queryKey: ["embedded_cont_logs", contingencyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_contingency_resolution_logs")
        .select("*, executor:profiles!operational_contingency_resolution_logs_executado_por_fkey(nome)")
        .eq("contingency_id", contingencyId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    staleTime: 15000,
  });

  if (logs.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <History className="w-3 h-3" /> Timeline
      </p>
      <div className="space-y-1">
        {logs.map((log: any) => (
          <div key={log.id} className="flex items-start gap-1.5 text-[10px]">
            <div className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-medium capitalize">{log.acao.replace(/_/g, " ")}</span>
              {log.observacao && <span className="text-muted-foreground ml-1">— {log.observacao}</span>}
              {log.evidencia_url && (
                <a href={log.evidencia_url} target="_blank" rel="noopener noreferrer"
                  className="text-primary underline flex items-center gap-0.5 mt-0.5">
                  <FileText className="w-2.5 h-2.5" /> Evidência
                </a>
              )}
              <p className="text-muted-foreground">
                {log.executor?.nome || "Sistema"} • {new Date(log.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
