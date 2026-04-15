import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertTriangle, Play, CheckCircle2, XCircle, Clock, Shield, History,
  ChevronLeft, FileText, RotateCcw, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CONTINGENCY_STATUS } from "@/hooks/useOperationalScoring";
import { useContingencyManagement } from "@/hooks/useContingencyManagement";

export default function OperationalContingenciasPage() {
  const { profile, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("abertas");
  const [selected, setSelected] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Action dialogs
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveObs, setResolveObs] = useState("");
  const [validateOpen, setValidateOpen] = useState(false);
  const [validateApproved, setValidateApproved] = useState(true);
  const [validateObs, setValidateObs] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardObs, setDiscardObs] = useState("");

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

  const slaInfo = selected ? cm.getSlaInfo(selected) : null;
  const isPending = selected && ["aberta", "em_andamento"].includes(selected.status);
  const isResolved = selected?.status === "resolvida";
  const isMyContingency = selected?.responsavel_id === profile?.id;

  const tabData: Record<string, { list: any[]; empty: string }> = {
    abertas: { list: cm.abertas, empty: "Nenhuma contingência aberta." },
    em_tratamento: { list: cm.emTratamento, empty: "Nenhuma em tratamento." },
    resolvidas: { list: cm.resolvidas, empty: "Nenhuma aguardando validação." },
    validadas: { list: cm.validadas, empty: "Nenhuma validada/descartada." },
    vencidas: { list: cm.vencidas, empty: "Nenhuma contingência vencida." },
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
            { key: "resolvidas", label: "Resolvidas", count: cm.resolvidas.length, accent: "bg-amber-500/20 text-amber-700" },
            { key: "validadas", label: "Validadas", count: cm.validadas.length, accent: "bg-emerald-500/20 text-emerald-700" },
            { key: "vencidas", label: "Vencidas", count: cm.vencidas.length, accent: "bg-red-600/20 text-red-800" },
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
            {/* SLA bar */}
            {slaInfo && (
              <div className={`rounded-lg border p-3 ${slaInfo.isExpired ? "border-destructive/50 bg-destructive/5" : "border-amber-200 bg-amber-50/50"}`}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    SLA
                  </span>
                  <span className={`font-mono font-bold ${slaInfo.isExpired ? "text-destructive" : "text-amber-700"}`}>
                    {slaInfo.label}
                  </span>
                </div>
                {selected?.prazo_sla && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Prazo: {new Date(selected.prazo_sla).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
            )}

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2 border rounded bg-muted/30">
                <span className="text-muted-foreground">Executor</span>
                <p className="font-medium">{selected?.assignment?.executor?.nome || "—"}</p>
              </div>
              <div className="p-2 border rounded bg-muted/30">
                <span className="text-muted-foreground">Avaliado</span>
                <p className="font-medium">{selected?.assignment?.avaliado?.nome || "—"}</p>
              </div>
              <div className="p-2 border rounded bg-muted/30">
                <span className="text-muted-foreground">Criado em</span>
                <p className="font-medium">{selected?.created_at ? new Date(selected.created_at).toLocaleString("pt-BR") : "—"}</p>
              </div>
              <div className="p-2 border rounded bg-muted/30">
                <span className="text-muted-foreground">Resolvido em</span>
                <p className="font-medium">{selected?.resolvida_em ? new Date(selected.resolvida_em).toLocaleString("pt-BR") : "—"}</p>
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
                {/* Responsible actions */}
                {isPending && (isMyContingency || isAdmin) && (
                  <>
                    {selected?.status === "aberta" && (
                      <Button size="sm" variant="outline" onClick={() => cm.startTreatment.mutate(selected.id)}
                        disabled={cm.isSaving} className="text-blue-700 border-blue-300 hover:bg-blue-50">
                        <Play className="w-3.5 h-3.5 mr-1" /> Iniciar Tratamento
                      </Button>
                    )}
                    {selected?.status === "em_andamento" && (
                      <Button size="sm" onClick={() => { setResolveObs(""); setResolveOpen(true); }}
                        disabled={cm.isSaving}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Resolver
                      </Button>
                    )}
                    <Button size="sm" variant="outline"
                      onClick={() => { setDiscardObs(""); setDiscardOpen(true); }}
                      disabled={cm.isSaving} className="text-muted-foreground">
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Descartar
                    </Button>
                  </>
                )}

                {/* Validator actions */}
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
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={resolveOpen} onOpenChange={(v) => { if (!v) setResolveOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver Contingência</DialogTitle>
            <DialogDescription>Descreva a ação corretiva aplicada.</DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-sm">Ação corretiva <span className="text-destructive">*</span></Label>
            <Textarea value={resolveObs} onChange={(e) => setResolveObs(e.target.value)}
              placeholder="Descreva o que foi feito..." className="mt-1 min-h-[80px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancelar</Button>
            <Button disabled={cm.isSaving || !resolveObs.trim()}
              onClick={() => {
                if (!selected) return;
                cm.resolveContingency.mutate(
                  { contingencyId: selected.id, observacao: resolveObs },
                  { onSuccess: () => { setResolveOpen(false); closeDetail(); } }
                );
              }}>
              {cm.isSaving ? "Salvando..." : "Confirmar Resolução"}
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
