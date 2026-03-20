import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchNotasPorSetor, calcularNotaPorOS } from "@/hooks/useNotasPorSetor";
import { getScoreColorClass } from "@/lib/score-colors";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  User, FileText, Trash2, Lock, Loader2, ShieldCheck, ShieldOff,
  Eye, MessageSquare, CheckCircle2, Clock, AlertCircle, Shield
} from "lucide-react";
import PermissoesTelasTab from "@/components/PermissoesTelasTab";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborator: (Profile & { _setoresNomes?: string[] }) | null;
}

const getScoreColor = getScoreColorClass;

const statusConfig: Record<string, { text: string; icon: typeof CheckCircle2; color: string }> = {
  aberta: { text: "Aberta", icon: Clock, color: "bg-warning/10 text-warning border-warning/30" },
  em_andamento: { text: "Em andamento", icon: AlertCircle, color: "bg-primary/10 text-primary border-primary/30" },
  concluida: { text: "Concluída", icon: CheckCircle2, color: "bg-success/10 text-success border-success/30" },
};

const cargoLabels: Record<string, string> = {
  administrador: "Administrador",
  avaliador: "Avaliador",
  executor: "Executor",
  atendente: "Atendente",
  tecnico: "Técnico",
};

export default function ColaboradorDetailDialog({ open, onOpenChange, collaborator }: Props) {
  const { profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dados");
  const [selectedOsIds, setSelectedOsIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [detailOsId, setDetailOsId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaUnenrolling, setMfaUnenrolling] = useState(false);

  // Reset state when dialog closes
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setSelectedOsIds(new Set());
      setActiveTab("dados");
      setDetailOsId(null);
      setNewPassword("");
      setConfirmPassword("");
    }
    onOpenChange(v);
  };

  // Fetch ALL OS related to this collaborator:
  // 1. As evaluated (tecnico_id, atendente_id, colaborador_avaliado_id)
  // 2. As evaluator (avaliador in avaliacoes table)
  const { data: osList = [], refetch: refetchOs } = useQuery({
    queryKey: ["colab_detail_os", collaborator?.id],
    queryFn: async () => {
      if (!collaborator) return [];

      // OS where they are evaluated employee
      const { data: osAsAvaliado } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, tipo_servico_id, created_at, cliente_nome, status, data_conclusao, tecnico_id, atendente_id, colaborador_avaliado_id")
        .or(`tecnico_id.eq.${collaborator.id},atendente_id.eq.${collaborator.id},colaborador_avaliado_id.eq.${collaborator.id}`)
        .order("created_at", { ascending: false });

      // OS where they are the evaluator (via avaliacoes)
      const { data: avalsAsAvaliador } = await supabase
        .from("avaliacoes")
        .select("ordem_servico_id")
        .eq("avaliador_id", collaborator.id);

      const avaliadorOsIds = [...new Set(avalsAsAvaliador?.map(a => a.ordem_servico_id) || [])];
      let osAsAvaliador: any[] = [];
      if (avaliadorOsIds.length > 0) {
        const existingIds = new Set(osAsAvaliado?.map(o => o.id) || []);
        const missingIds = avaliadorOsIds.filter(id => !existingIds.has(id));
        if (missingIds.length > 0) {
          const { data } = await supabase
            .from("ordens_servico")
            .select("id, numero_os, tipo_servico_id, created_at, cliente_nome, status, data_conclusao, tecnico_id, atendente_id, colaborador_avaliado_id")
            .in("id", missingIds)
            .order("created_at", { ascending: false });
          osAsAvaliador = data || [];
        }
      }

      const allOs = [...(osAsAvaliado || []), ...osAsAvaliador];
      // Dedupe
      const seen = new Set<string>();
      const deduped = allOs.filter(o => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      });

      // Sort newest first
      deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Get tipo_servico names
      const tsIds = [...new Set(deduped.map(o => o.tipo_servico_id).filter(Boolean))] as string[];
      let tsMap: Record<string, string> = {};
      if (tsIds.length > 0) {
        const { data: tss } = await supabase.from("tipos_servico").select("id, nome").in("id", tsIds);
        tss?.forEach(t => { tsMap[t.id] = t.nome; });
      }

      // Get per-sector scores using SQL function
      const osIds = deduped.map(o => o.id);
      const notas = await fetchNotasPorSetor();

      const { data: avals } = await supabase.from("avaliacoes")
        .select("ordem_servico_id, avaliador_id")
        .in("ordem_servico_id", osIds);

      const avaliadorOsSet = new Set<string>();
      avals?.forEach(a => {
        if (a.avaliador_id === collaborator.id) avaliadorOsSet.add(a.ordem_servico_id);
      });

      return deduped.map(os => {
        const isAvaliado = os.tecnico_id === collaborator.id || os.atendente_id === collaborator.id || os.colaborador_avaliado_id === collaborator.id;
        const isAvaliador = avaliadorOsSet.has(os.id);
        return {
          ...os,
          tipo_servico_nome: tsMap[os.tipo_servico_id || ""] || "—",
          avg_nota: calcularNotaPorOS(notas, collaborator.id, os.id),
          papel: isAvaliador && isAvaliado ? "Avaliador / Avaliado" : isAvaliador ? "Avaliador" : "Avaliado",
        };
      });
    },
    enabled: open && !!collaborator,
  });

  // OS detail
  const { data: osDetail } = useQuery({
    queryKey: ["colab_os_detail", detailOsId],
    queryFn: async () => {
      if (!detailOsId) return null;
      const { data: avals } = await supabase.from("avaliacoes")
        .select("id, avaliador_id, tipo_avaliacao_id, nota_final, concluida")
        .eq("ordem_servico_id", detailOsId);
      if (!avals?.length) return null;

      const avalIds = avals.map(a => a.id);
      const { data: respostas } = await supabase.from("respostas_avaliacao")
        .select("avaliacao_id, pergunta_id, resposta, observacao, evidencia_url")
        .in("avaliacao_id", avalIds);

      const perguntaIds = [...new Set(respostas?.map(r => r.pergunta_id) || [])];
      let perguntaMap: Record<string, { pergunta: string; peso: number; ordem: number }> = {};
      if (perguntaIds.length > 0) {
        const { data: perguntas } = await supabase.from("perguntas_avaliacao")
          .select("id, pergunta, peso, ordem").in("id", perguntaIds).order("ordem");
        perguntas?.forEach(p => { perguntaMap[p.id] = { pergunta: p.pergunta, peso: p.peso, ordem: p.ordem }; });
      }

      const avaliadorIds = [...new Set(avals.map(a => a.avaliador_id))];
      let avaliadorNames: Record<string, string> = {};
      if (avaliadorIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, nome").in("id", avaliadorIds);
        profiles?.forEach(p => { avaliadorNames[p.id] = p.nome; });
      }

      const taIds = [...new Set(avals.map(a => a.tipo_avaliacao_id).filter(Boolean))] as string[];
      let taNames: Record<string, string> = {};
      if (taIds.length > 0) {
        const { data: tas } = await supabase.from("tipos_avaliacao").select("id, nome").in("id", taIds);
        tas?.forEach(t => { taNames[t.id] = t.nome; });
      }

      return avals.map(a => {
        const avalRespostas = (respostas || [])
          .filter(r => r.avaliacao_id === a.id)
          .map(r => ({
            ...r,
            pergunta: perguntaMap[r.pergunta_id]?.pergunta || "—",
            peso: perguntaMap[r.pergunta_id]?.peso || 0,
            ordem: perguntaMap[r.pergunta_id]?.ordem || 0,
          }))
          .sort((x, y) => x.ordem - y.ordem);

        // Recalculate nota: SIM/NA = peso, NAO = 0
        const totalPeso = avalRespostas.reduce((acc, r) => r.resposta ? acc + r.peso : acc, 0);
        const earnedPeso = avalRespostas.reduce((acc, r) => (r.resposta === "sim" || r.resposta === "na") ? acc + r.peso : acc, 0);
        const calculatedNota = totalPeso > 0 ? (earnedPeso / totalPeso) * 100 : null;

        return {
          id: a.id,
          avaliador_nome: avaliadorNames[a.avaliador_id] || "—",
          tipo_avaliacao_nome: a.tipo_avaliacao_id ? taNames[a.tipo_avaliacao_id] || "—" : "—",
          nota_final: calculatedNota ?? a.nota_final,
          concluida: a.concluida,
          respostas: avalRespostas,
        };
      });
    },
    enabled: !!detailOsId,
  });

  const toggleSelectAll = () => {
    if (selectedOsIds.size === osList.length) {
      setSelectedOsIds(new Set());
    } else {
      setSelectedOsIds(new Set(osList.map(o => o.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedOsIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedOsIds.size === 0) return;
    setDeletePassword("");
    setDeleteDialogOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    if (!profile || selectedOsIds.size === 0) return;
    if (!deletePassword.trim()) { toast.error("Informe sua senha."); return; }

    setDeleteLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const authEmail = authData.user?.email || profile.email;
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: deletePassword,
      });
      if (authError) { toast.error("Senha incorreta."); return; }

      const idsToDelete = Array.from(selectedOsIds);

      for (const osId of idsToDelete) {
        // Get avaliacoes for this OS
        const { data: avals } = await supabase.from("avaliacoes").select("id").eq("ordem_servico_id", osId);
        if (avals?.length) {
          const avalIds = avals.map(a => a.id);
          // Delete evidencias from storage
          const { data: respostas } = await supabase
            .from("respostas_avaliacao")
            .select("evidencia_url")
            .in("avaliacao_id", avalIds)
            .not("evidencia_url", "is", null);
          if (respostas?.length) {
            const paths = respostas
              .map(r => r.evidencia_url)
              .filter(Boolean)
              .map(url => { const m = url!.match(/evidencias\/(.+)$/); return m ? m[1] : null; })
              .filter(Boolean) as string[];
            if (paths.length > 0) await supabase.storage.from("evidencias").remove(paths);
          }
          await supabase.from("respostas_avaliacao").delete().in("avaliacao_id", avalIds);
          await supabase.from("inconsistencias_vinculadas").delete().in("avaliacao_id", avalIds);
        }
        await supabase.from("avaliacoes_inconsistencias").delete().eq("ordem_servico_id", osId);
        await supabase.from("inconsistencias_vinculadas").delete().eq("ordem_servico_id", osId);
        await supabase.from("os_perguntas").delete().eq("os_id", osId);
        await supabase.from("avaliacoes").delete().eq("ordem_servico_id", osId);
        await supabase.from("ordens_servico").delete().eq("id", osId);
      }

      // Audit log
      const osNumbers = osList.filter(o => selectedOsIds.has(o.id)).map(o => o.numero_os);
      await supabase.from("audit_logs").insert({
        user_id: profile.user_id,
        acao: "exclusao_os_lote",
        tabela: "ordens_servico",
        dados_anteriores: { numeros_os: osNumbers, quantidade: idsToDelete.length },
      } as any);

      toast.success(`${idsToDelete.length} OS excluída(s) com sucesso.`);
      setSelectedOsIds(new Set());
      setDeleteDialogOpen(false);
      setDeletePassword("");
      refetchOs();
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err: any) {
      toast.error("Erro ao excluir: " + (err?.message || "falha desconhecida"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!collaborator) return;
    if (newPassword.length < 6) { toast.error("Senha deve ter no mínimo 6 caracteres."); return; }
    if (newPassword !== confirmPassword) { toast.error("As senhas não coincidem."); return; }

    setPasswordLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("admin-update-password", {
        body: { target_user_id: collaborator.user_id, new_password: newPassword },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "falha desconhecida"));
    } finally {
      setPasswordLoading(false);
    }
  };

  if (!collaborator) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {collaborator.cargo === "administrador" && <ShieldCheck className="w-5 h-5 text-success" />}
              {collaborator.nome}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="dados" className="flex items-center gap-1.5">
                <User className="w-4 h-4" /> Dados
              </TabsTrigger>
              <TabsTrigger value="permissoes" className="flex items-center gap-1.5">
                <Shield className="w-4 h-4" /> Permissões
              </TabsTrigger>
              <TabsTrigger value="os" className="flex items-center gap-1.5">
                <FileText className="w-4 h-4" /> Ordens de Serviço
                {osList.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs h-5 min-w-5 flex items-center justify-center">
                    {osList.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Dados Tab */}
            <TabsContent value="dados" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-caption text-muted-foreground uppercase tracking-wider font-medium">Nome</p>
                  <p className="text-body font-medium text-foreground">{collaborator.nome}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-caption text-muted-foreground uppercase tracking-wider font-medium">Email</p>
                  <p className="text-body text-foreground">{collaborator.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-caption text-muted-foreground uppercase tracking-wider font-medium">Cargo</p>
                  <p className="text-body text-foreground">{cargoLabels[collaborator.cargo || ""] || collaborator.cargo || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-caption text-muted-foreground uppercase tracking-wider font-medium">Status</p>
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border",
                    collaborator.ativo ? "badge-complete" : "badge-expired"
                  )}>
                    {collaborator.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-caption text-muted-foreground uppercase tracking-wider font-medium">Setores</p>
                  <p className="text-body text-foreground">
                    {(collaborator as any)._setoresNomes?.length > 0
                      ? (collaborator as any)._setoresNomes.join(" / ")
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Alterar Senha */}
              {isAdmin && (
                <div className="border border-border rounded-lg p-4 space-y-3 mt-2">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <p className="text-body font-medium text-foreground">Alterar Senha</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Nova Senha</Label>
                      <Input
                        type="password"
                        placeholder="Mínimo 6 caracteres"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Confirmar Senha</Label>
                      <Input
                        type="password"
                        placeholder="Repita a senha"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleChangePassword}
                    disabled={passwordLoading || !newPassword || !confirmPassword}
                    className="press-effect"
                  >
                    {passwordLoading ? "Salvando..." : "Alterar Senha"}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Permissões Tab */}
            <TabsContent value="permissoes" className="mt-4">
              <PermissoesTelasTab
                profileId={collaborator.id}
                isAdminProfile={collaborator.cargo === "administrador"}
              />
            </TabsContent>

            {/* OS Tab */}
            <TabsContent value="os" className="mt-4 space-y-3">
              {isAdmin && selectedOsIds.size > 0 && (
                <div className="flex items-center gap-3 bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-3">
                  <span className="text-body font-medium text-foreground">
                    {selectedOsIds.size} OS selecionada(s)
                  </span>
                  <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="ml-auto press-effect">
                    <Trash2 className="w-4 h-4 mr-1.5" /> Excluir Selecionadas
                  </Button>
                </div>
              )}

              <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        {isAdmin && (
                          <th className="px-3 py-2 w-10">
                            <Checkbox
                              checked={osList.length > 0 && selectedOsIds.size === osList.length}
                              onCheckedChange={toggleSelectAll}
                            />
                          </th>
                        )}
                        <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
                        <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Data</th>
                        <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo Serviço</th>
                        <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Papel</th>
                        <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                        <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nota</th>
                        <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {osList.map(os => {
                        const sc = statusConfig[os.status] || statusConfig.aberta;
                        const StatusIcon = sc.icon;
                        return (
                          <tr key={os.id} className={cn(
                            "hover:bg-muted/50 transition-colors",
                            selectedOsIds.has(os.id) && "bg-destructive/5"
                          )}>
                            {isAdmin && (
                              <td className="px-3 py-3">
                                <Checkbox
                                  checked={selectedOsIds.has(os.id)}
                                  onCheckedChange={() => toggleSelect(os.id)}
                                />
                              </td>
                            )}
                            <td className="px-4 py-3 text-body font-medium text-primary font-tabular">{os.numero_os}</td>
                            <td className="px-4 py-3 text-body text-muted-foreground">{format(new Date(os.created_at), "dd/MM/yyyy")}</td>
                            <td className="px-4 py-3 text-body text-muted-foreground">{os.tipo_servico_nome}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-caption">{os.papel}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-caption font-medium border", sc.color)}>
                                <StatusIcon className="w-3 h-3" />
                                {sc.text}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {os.avg_nota != null ? (
                                <span className={cn("font-bold font-tabular", getScoreColor(os.avg_nota))}>{os.avg_nota.toFixed(1)}%</span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailOsId(os.id)}>
                                <Eye className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                      {osList.length === 0 && (
                        <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-body text-muted-foreground">
                          Nenhuma OS encontrada para este colaborador.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* OS Detail Dialog */}
      <Dialog open={!!detailOsId} onOpenChange={v => { if (!v) setDetailOsId(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Avaliação</DialogTitle>
          </DialogHeader>
          {osDetail?.map((evalDetail: any) => (
            <div key={evalDetail.id} className="border border-border rounded-lg mb-4">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full shrink-0", evalDetail.concluida ? "bg-success" : "bg-warning")} />
                  <h3 className="text-body font-semibold text-foreground">{evalDetail.tipo_avaliacao_nome}</h3>
                  <span className="text-caption text-muted-foreground">— {evalDetail.avaliador_nome}</span>
                </div>
                {evalDetail.nota_final != null && (
                  <span className={cn("text-body font-bold font-tabular",
                    evalDetail.nota_final >= 85 ? "text-success" : evalDetail.nota_final >= 75 ? "text-warning" : "text-destructive"
                  )}>
                    {Number(evalDetail.nota_final).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="divide-y divide-border">
                {evalDetail.respostas.map((resp: any, idx: number) => (
                  <div key={resp.pergunta_id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="text-caption font-medium text-muted-foreground font-tabular w-6 shrink-0 pt-0.5">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{resp.pergunta}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border",
                            resp.resposta === "sim" ? "border-success/40 bg-success/10 text-success" :
                            resp.resposta === "nao" ? "border-destructive/40 bg-destructive/10 text-destructive" :
                            "border-muted-foreground/30 bg-muted text-muted-foreground"
                          )}>
                            {resp.resposta === "sim" ? "SIM" : resp.resposta === "nao" ? "NÃO" : "N/A"}
                          </span>
                          <span className="text-caption text-muted-foreground">Peso: {resp.peso}</span>
                        </div>
                        {resp.observacao && (
                          <div className="mt-2 bg-muted/50 border border-border rounded p-2">
                            <p className="text-caption text-muted-foreground flex items-center gap-1 mb-0.5">
                              <MessageSquare className="w-3 h-3" /> Observação:
                            </p>
                            <p className="text-sm text-foreground">{resp.observacao}</p>
                          </div>
                        )}
                        {resp.evidencia_url && (
                          <div className="mt-2">
                            <img src={resp.evidencia_url} alt="Evidência"
                              className="rounded-lg border border-border max-h-32 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => window.open(resp.evidencia_url, "_blank")} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {evalDetail.respostas.length === 0 && (
                  <p className="px-4 py-6 text-center text-body text-muted-foreground">Nenhuma resposta registrada.</p>
                )}
              </div>
            </div>
          ))}
          {!osDetail && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Password Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={v => { if (!deleteLoading) setDeleteDialogOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Lock className="w-5 h-5" /> Confirmar Exclusão em Lote
            </DialogTitle>
            <DialogDescription>
              Você está prestes a excluir <strong>{selectedOsIds.size} OS</strong> e todos os dados vinculados (avaliações, respostas e evidências). Esta ação é irreversível.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Digite sua senha para confirmar</Label>
              <Input
                type="password"
                placeholder="Sua senha de acesso"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleConfirmBulkDelete()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmBulkDelete} disabled={deleteLoading || !deletePassword.trim()}>
              {deleteLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Excluir {selectedOsIds.size} OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
