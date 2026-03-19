import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, MessageSquare, PhoneCall, Clock, User, UserCheck, Plus, RefreshCw,
  ArrowRight, FileText, CalendarClock, Trash2, AlertTriangle, History, Zap, ExternalLink,
} from "lucide-react";

const fmtDate = (d: string | Date) => {
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return String(d); }
};

const EVENTO_LABELS: Record<string, string> = {
  criacao: "Criação do Lead",
  tentativa_contato: "Tentativa de Contato",
  tentativa_registrada: "Tentativa Registrada",
  tentativa_atrasada: "Tentativa Atrasada",
  transferencia_automatica: "Transferência Automática",
  transferencia_manual: "Transferência Manual",
  transferencia_decisao: "Decisão Avaliador",
  conversao_cliente: "Conversão em Cliente",
  alteracao_status: "Alteração de Status",
  contato_adicionado: "Contato Adicionado",
  contato_removido: "Contato Removido",
  telefone_existente: "Telefone Existente",
  cliente_existente: "Cliente Existente",
  vinculo_cliente_existente: "Vínculo c/ Cliente",
  tentativas_finalizadas: "Tentativas Finalizadas",
  rotina_reiniciada: "Rotina Reiniciada",
  lead_arquivado: "Lead Arquivado",
  lead_desarquivado: "Lead Desarquivado",
  agendamento_retorno: "Agendamento de Retorno",
  objecao_registrada: "Objeção Registrada",
  perfil_alterado: "Perfil Alterado",
  repetidor_alterado: "Repetidor Alterado",
  observacao_adicionada: "Observação Adicionada",
  dados_alterados: "Dados Alterados",
  agendamento_removido: "Agendamento Removido",
  lead_reaberto_captura: "Lead Reaberto p/ Captura",
  lead_capturado: "Lead Capturado",
  lead_reservado: "Lead Reservado",
  reserva_liberada: "Reserva Liberada",
  captura_expirada: "Captura Expirada",
  reserva_expirada: "Reserva Expirada",
  lead_cancelado: "Lead Cancelado",
};

const EVENTO_ICONS: Record<string, typeof Phone> = {
  criacao: Plus, tentativa_contato: PhoneCall, tentativa_registrada: PhoneCall,
  tentativa_atrasada: AlertTriangle, transferencia_automatica: ArrowRight,
  transferencia_manual: ArrowRight, transferencia_decisao: ArrowRight,
  conversao_cliente: UserCheck, alteracao_status: RefreshCw,
  contato_adicionado: Plus, contato_removido: Trash2, tentativas_finalizadas: Clock,
  rotina_reiniciada: RefreshCw, lead_arquivado: FileText, lead_desarquivado: RefreshCw,
  agendamento_retorno: CalendarClock, objecao_registrada: AlertTriangle,
  perfil_alterado: User, lead_capturado: UserCheck, reserva_liberada: RefreshCw,
  captura_expirada: Clock, lead_cancelado: Trash2,
};

interface LeadPostCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string | null;
  leadName: string;
  onGoToLead: () => void;
}

export default function LeadPostCaptureDialog({ open, onOpenChange, leadId, leadName, onGoToLead }: LeadPostCaptureDialogProps) {
  const { data: historico = [], isLoading } = useQuery({
    queryKey: ["post-capture-historico", leadId],
    enabled: open && !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_historico")
        .select("*")
        .eq("lead_id", leadId!)
        .order("data_evento", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: interacoes = [] } = useQuery({
    queryKey: ["post-capture-interacoes", leadId],
    enabled: open && !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_interacoes")
        .select("*")
        .eq("lead_id", leadId!)
        .order("data_interacao", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: contatos = [] } = useQuery({
    queryKey: ["post-capture-contatos", leadId],
    enabled: open && !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_contatos")
        .select("*")
        .eq("lead_id", leadId!)
        .eq("tipo_contato", "telefone");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["profiles-post-capture"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true);
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const getProfileName = (id?: string | null) => {
    if (!id) return "Sistema";
    return allProfiles.find((p: any) => p.id === id)?.nome || "—";
  };

  // Merge timeline
  const timeline = useMemo(() => {
    const items: { id: string; date: string; type: "historico" | "interacao"; evento?: string; descricao?: string | null; usuario_id?: string; colaborador_id?: string; tipo_contato?: string; numero_utilizado?: string | null; resultado?: string | null }[] = [];

    historico.forEach((h: any) => {
      items.push({ id: h.id, date: h.data_evento, type: "historico", evento: h.tipo_evento, descricao: h.descricao, usuario_id: h.usuario_id });
    });

    interacoes.forEach((i: any) => {
      const hasHistorico = historico.some((h: any) =>
        h.tipo_evento === "tentativa_contato" &&
        Math.abs(new Date(h.data_evento).getTime() - new Date(i.data_interacao).getTime()) < 5000
      );
      if (!hasHistorico) {
        items.push({ id: `inter-${i.id}`, date: i.data_interacao, type: "interacao", colaborador_id: i.colaborador_id, tipo_contato: i.tipo_contato, numero_utilizado: i.numero_utilizado, resultado: i.resultado });
      }
    });

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [historico, interacoes]);

  const totalInteracoes = interacoes.length;
  const hasHistory = timeline.length > 1; // More than just "lead_capturado"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserCheck className="w-5 h-5 text-primary" />
            Lead Capturado — {leadName}
          </DialogTitle>
        </DialogHeader>

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-xs gap-1">
            <Phone className="w-3 h-3" />
            {contatos.length} telefone{contatos.length !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="secondary" className="text-xs gap-1">
            <PhoneCall className="w-3 h-3" />
            {totalInteracoes} interaç{totalInteracoes !== 1 ? "ões" : "ão"}
          </Badge>
          <Badge variant="secondary" className="text-xs gap-1">
            <History className="w-3 h-3" />
            {timeline.length} evento{timeline.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Phones */}
        {contatos.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {contatos.map((c: any) => (
              <Badge key={c.id} variant="outline" className="text-xs gap-1">
                <Phone className="w-3 h-3" />
                {c.valor}
                {c.tem_whatsapp && <MessageSquare className="w-3 h-3 text-green-600" />}
              </Badge>
            ))}
          </div>
        )}

        {/* Alert if lead has previous history */}
        {hasHistory && (
          <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Este lead já possui histórico anterior. Revise antes de agir.</span>
          </div>
        )}

        {/* Timeline */}
        <ScrollArea className="flex-1 min-h-0 max-h-[350px]">
          <div className="space-y-0 pr-2">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Carregando histórico...</div>
            ) : timeline.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Nenhum registro anterior</div>
            ) : (
              <div className="relative">
                <div className="absolute left-3.5 top-3 bottom-3 w-px bg-border" />
                {timeline.map((item) => {
                  const IconComp = item.type === "historico"
                    ? (EVENTO_ICONS[item.evento || ""] || Clock)
                    : PhoneCall;
                  const isInteracao = item.type === "interacao" || item.evento === "tentativa_contato";
                  const isTransfer = item.evento?.includes("transferencia");
                  const isCriacao = item.evento === "criacao";
                  const isCaptured = item.evento === "lead_capturado";
                  const isAlert = item.evento === "tentativa_atrasada" || item.evento === "captura_expirada";

                  return (
                    <div key={item.id} className="relative pl-9 pb-3 last:pb-0">
                      <div className={`absolute left-1 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-background ${
                        isCaptured ? "bg-primary" :
                        isCriacao ? "bg-blue-500" :
                        isAlert ? "bg-amber-500" :
                        isTransfer ? "bg-amber-500" :
                        isInteracao ? "bg-primary" :
                        "bg-muted-foreground/30"
                      }`}>
                        <IconComp className="w-2.5 h-2.5 text-white" />
                      </div>

                      <div className={`rounded-lg p-2 border text-xs ${
                        isCaptured ? "bg-primary/5 border-primary/20" :
                        isInteracao ? "bg-primary/5 border-primary/20" :
                        isAlert ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" :
                        isTransfer ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" :
                        isCriacao ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" :
                        "bg-card border-border"
                      }`}>
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {item.type === "historico"
                              ? (EVENTO_LABELS[item.evento || ""] || item.evento)
                              : `${item.tipo_contato === "whatsapp" ? "WhatsApp" : "Telefone"}`}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtDate(item.date)}</span>
                        </div>

                        {item.type === "historico" && item.descricao && (
                          <p className="text-[11px] text-foreground/80 mt-1">• {item.descricao}</p>
                        )}
                        {item.type === "interacao" && (
                          <p className="text-[11px] text-foreground/80 mt-1">
                            • {item.tipo_contato === "whatsapp" ? "WhatsApp" : "Telefone"}
                            {item.numero_utilizado ? ` → ${item.numero_utilizado}` : ""}
                            {item.resultado ? `: ${item.resultado}` : ""}
                          </p>
                        )}

                        <p className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-1">
                          <User className="w-2.5 h-2.5" />
                          {getProfileName(item.usuario_id || item.colaborador_id)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Fechar
          </Button>
          <Button onClick={() => { onOpenChange(false); onGoToLead(); }} className="flex-1 gap-1.5 press-effect">
            <Zap className="w-4 h-4" /> Ir para Atendimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
