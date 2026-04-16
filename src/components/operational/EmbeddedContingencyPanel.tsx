import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle, Play, CheckCircle2, XCircle, Clock, Shield, History,
  FileText, Trash2, Timer, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CONTINGENCY_STATUS } from "@/hooks/useOperationalScoring";
import { useContingencyManagement } from "@/hooks/useContingencyManagement";

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

interface Props {
  assignmentId: string;
}

export function EmbeddedContingencyPanel({ assignmentId }: Props) {
  const { profile, isAdmin } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Dialogs
  const [slaDialogOpen, setSlaDialogOpen] = useState(false);
  const [slaHoras, setSlaHoras] = useState(24);
  const [slaTargetId, setSlaTargetId] = useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveObs, setResolveObs] = useState("");
  const [resolveTargetId, setResolveTargetId] = useState<string | null>(null);
  const [validateOpen, setValidateOpen] = useState(false);
  const [validateApproved, setValidateApproved] = useState(true);
  const [validateObs, setValidateObs] = useState("");
  const [validateTargetId, setValidateTargetId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardObs, setDiscardObs] = useState("");
  const [discardTargetId, setDiscardTargetId] = useState<string | null>(null);

  const cm = useContingencyManagement();

  // Load contingencies for this assignment
  const { data: contingencies = [], isLoading } = useQuery({
    queryKey: ["embedded_contingencies", assignmentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_contingencies")
        .select(`
          *,
          responsavel:profiles!operational_contingencies_responsavel_id_fkey(id, nome),
          validador:profiles!operational_contingencies_validada_por_fkey(id, nome)
        `)
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 10000,
  });

  // Load assignment to check validador_contingencia_id
  const { data: assignment } = useQuery({
    queryKey: ["embedded_cont_assignment", assignmentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_assignments")
        .select("validador_contingencia_id, responsavel_id")
        .eq("id", assignmentId)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 30000,
  });

  const canManage = (c: any): boolean => {
    if (isAdmin) return true;
    if (c.responsavel_id === profile?.id) return true;
    if (assignment?.validador_contingencia_id === profile?.id) return true;
    return false;
  };

  const canValidateContingency = (c: any): boolean => {
    if (isAdmin) return true;
    if (assignment?.validador_contingencia_id === profile?.id) return true;
    return false;
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
            {/* Header - always visible */}
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

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-border p-3 space-y-3">
                {/* SLA countdown */}
                {c.prazo_sla && <SlaCountdown prazoSla={c.prazo_sla} />}

                {/* Info */}
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

                {/* Resolution logs inline */}
                <ContingencyTimeline contingencyId={c.id} />

                {/* Action buttons */}
                {userCanManage && isPending && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {c.status === "aberta" && (
                      <Button size="sm" variant="outline" className="text-blue-700 border-blue-300 hover:bg-blue-50 flex-1"
                        disabled={cm.isSaving}
                        onClick={() => { setSlaTargetId(c.id); setSlaHoras(24); setSlaDialogOpen(true); }}>
                        <Play className="w-3 h-3 mr-1" /> Iniciar
                      </Button>
                    )}
                    {c.status === "em_andamento" && (
                      <Button size="sm" className="flex-1" disabled={cm.isSaving}
                        onClick={() => { setResolveTargetId(c.id); setResolveObs(""); setResolveOpen(true); }}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Resolver
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-muted-foreground"
                      disabled={cm.isSaving}
                      onClick={() => { setDiscardTargetId(c.id); setDiscardObs(""); setDiscardOpen(true); }}>
                      <Trash2 className="w-3 h-3 mr-1" /> Descartar
                    </Button>
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
              <Timer className="w-4 h-4" /> Definir Prazo de SLA
            </DialogTitle>
            <DialogDescription>Informe o prazo em horas para resolver.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm">Prazo SLA (horas)</Label>
            <Input type="number" min={1} max={720} value={slaHoras} onChange={(e) => setSlaHoras(Math.max(1, +e.target.value))} />
            <p className="text-xs text-muted-foreground">
              Expira em {new Date(Date.now() + slaHoras * 3600000).toLocaleString("pt-BR")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSlaDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={cm.isSaving || slaHoras < 1}
              onClick={() => {
                if (!slaTargetId) return;
                cm.startTreatment.mutate({ contingencyId: slaTargetId, slaHoras }, {
                  onSuccess: () => setSlaDialogOpen(false),
                });
              }}>
              {cm.isSaving ? "Salvando..." : "Iniciar"}
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
          <div>
            <Label className="text-xs">Ação corretiva <span className="text-destructive">*</span></Label>
            <Textarea value={resolveObs} onChange={(e) => setResolveObs(e.target.value)}
              placeholder="Descreva o que foi feito..." className="mt-1 min-h-[60px] text-sm" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResolveOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={cm.isSaving || !resolveObs.trim()}
              onClick={() => {
                if (!resolveTargetId) return;
                cm.resolveContingency.mutate({ contingencyId: resolveTargetId, observacao: resolveObs }, {
                  onSuccess: () => setResolveOpen(false),
                });
              }}>
              {cm.isSaving ? "Salvando..." : "Confirmar"}
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
