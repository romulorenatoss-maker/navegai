import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Phone, MessageSquare, Loader2, ListOrdered } from "lucide-react";

// ─── Types ──────────────────────────────────────────────
interface Lead {
  id: string;
  nome: string;
  status_lead: string;
  responsavel_id: string | null;
  updated_at: string;
}

interface LeadContato {
  id: string;
  lead_id: string;
  tipo_contato: string;
  valor: string;
  tem_whatsapp: boolean;
}

interface LeadInteracao {
  id: string;
  lead_id: string;
  data_interacao: string;
}

interface CadenciaTentativa {
  id: string;
  numero_tentativa: number;
  dias_apos: number;
  periodo: string;
  prioridade: number;
}

interface QueueItem {
  lead: Lead;
  contatos: LeadContato[];
  tentativaAtual: number;
  proximoContato: Date | null;
  ultimaInteracao: string | null;
}

// ─── Helpers ────────────────────────────────────────────
const fmtDate = (d: string | Date) => {
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return String(d); }
};

const fmtDateShort = (d: Date | null) => {
  if (!d) return "Agora";
  try { return format(d, "dd/MM HH:mm", { locale: ptBR }); }
  catch { return "—"; }
};

const PERIODO_HORA: Record<string, number> = { manha: 9, tarde: 14, noite: 19 };

export default function FilaLeadsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Attempt dialog
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [attemptTipo, setAttemptTipo] = useState("telefone");
  const [attemptNumero, setAttemptNumero] = useState("");
  const [attemptResultado, setAttemptResultado] = useState("");

  // ─── Queries ──────────────────────────────────────
  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["fila-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .in("status_lead", ["novo", "em_contato", "interessado"])
        .order("updated_at", { ascending: true });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const leadIds = leads.map((l) => l.id);

  const { data: allContatos = [] } = useQuery({
    queryKey: ["fila-contatos", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_contatos")
        .select("*")
        .in("lead_id", leadIds);
      if (error) throw error;
      return data as LeadContato[];
    },
  });

  const { data: allInteracoes = [] } = useQuery({
    queryKey: ["fila-interacoes", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_interacoes")
        .select("id, lead_id, data_interacao")
        .in("lead_id", leadIds)
        .order("data_interacao", { ascending: false });
      if (error) throw error;
      return data as LeadInteracao[];
    },
  });

  const { data: cadencia = [] } = useQuery({
    queryKey: ["cadencia-tentativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cadencia_tentativas")
        .select("*")
        .order("numero_tentativa", { ascending: true });
      if (error) throw error;
      return data as CadenciaTentativa[];
    },
  });

  // ─── Build queue ──────────────────────────────────
  const queue = useMemo<QueueItem[]>(() => {
    return leads.map((lead) => {
      const contatos = allContatos.filter((c) => c.lead_id === lead.id);
      const interacoes = allInteracoes.filter((i) => i.lead_id === lead.id);
      const tentativaAtual = interacoes.length + 1;
      const ultimaInteracao = interacoes[0]?.data_interacao || null;

      // Calculate next contact based on cadência
      let proximoContato: Date | null = null;
      if (ultimaInteracao && cadencia.length > 0) {
        const regra = cadencia.find((c) => c.numero_tentativa === tentativaAtual)
          || cadencia[cadencia.length - 1];
        if (regra) {
          const base = addDays(new Date(ultimaInteracao), regra.dias_apos);
          base.setHours(PERIODO_HORA[regra.periodo] || 9, 0, 0, 0);
          proximoContato = base;
        }
      }

      return { lead, contatos, tentativaAtual, proximoContato, ultimaInteracao };
    });
  }, [leads, allContatos, allInteracoes, cadencia]);

  // ─── Register attempt ─────────────────────────────
  const attemptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem || !profile) throw new Error("Erro interno.");
      if (!attemptNumero) throw new Error("Selecione o número utilizado.");

      // Insert interaction
      const { error: e1 } = await supabase.from("lead_interacoes").insert({
        lead_id: selectedItem.lead.id,
        colaborador_id: profile.id,
        tipo_contato: attemptTipo,
        numero_utilizado: attemptNumero,
        resultado: attemptResultado.trim() || null,
      });
      if (e1) throw e1;

      // Log history
      await supabase.from("lead_historico").insert({
        lead_id: selectedItem.lead.id,
        usuario_id: profile.id,
        tipo_evento: "tentativa_contato",
        descricao: `Tentativa ${selectedItem.tentativaAtual} via ${attemptTipo}: ${attemptResultado.trim() || "sem resultado"}`,
      });

      // Touch updated_at to push to end of queue
      await supabase
        .from("leads")
        .update({ status_lead: selectedItem.lead.status_lead === "novo" ? "em_contato" : selectedItem.lead.status_lead })
        .eq("id", selectedItem.lead.id);
    },
    onSuccess: () => {
      toast.success("Tentativa registrada! Lead movido para o final da fila.");
      setSelectedItem(null);
      setAttemptNumero("");
      setAttemptResultado("");
      queryClient.invalidateQueries({ queryKey: ["fila-leads"] });
      queryClient.invalidateQueries({ queryKey: ["fila-interacoes"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Open attempt dialog ──────────────────────────
  const openAttempt = (item: QueueItem) => {
    setSelectedItem(item);
    setAttemptTipo("telefone");
    setAttemptNumero("");
    setAttemptResultado("");
  };

  // Phone options for selected lead
  const phoneOptions = selectedItem?.contatos.filter((c) => c.tipo_contato === "telefone") || [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ListOrdered className="w-5 h-5" /> Fila de Atendimento
        </h1>
        <p className="text-sm text-muted-foreground">
          Leads ativos ordenados por última interação. Registre tentativas para avançar na fila.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Fila de Leads
            <Badge variant="secondary" className="text-xs">{queue.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingLeads ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando fila...</div>
          ) : queue.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhum lead na fila</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Telefone(s)</TableHead>
                    <TableHead className="text-center">Tentativa</TableHead>
                    <TableHead>Próximo Contato</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((item, idx) => (
                    <TableRow key={item.lead.id}>
                      <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-sm">{item.lead.nome}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.contatos
                            .filter((c) => c.tipo_contato === "telefone")
                            .map((c) => (
                              <Badge key={c.id} variant="outline" className="text-xs gap-1">
                                <Phone className="w-3 h-3" />
                                {c.valor}
                                {c.tem_whatsapp && <MessageSquare className="w-3 h-3 text-green-600" />}
                              </Badge>
                            ))}
                          {item.contatos.filter((c) => c.tipo_contato === "telefone").length === 0 && (
                            <span className="text-xs text-muted-foreground">Sem telefone</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">{item.tentativaAtual}ª</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {fmtDateShort(item.proximoContato)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs border-0 ${
                          item.lead.status_lead === "novo" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                          item.lead.status_lead === "em_contato" ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
                          "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                        }`}>
                          {item.lead.status_lead === "novo" ? "Novo" :
                           item.lead.status_lead === "em_contato" ? "Em Contato" : "Interessado"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openAttempt(item)} className="press-effect">
                          <Phone className="w-3.5 h-3.5 mr-1" /> Registrar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Attempt Dialog ──────────────────────────── */}
      <Dialog open={!!selectedItem} onOpenChange={(o) => !o && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Registrar Tentativa — {selectedItem?.lead.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Tentativa: <Badge variant="secondary">{selectedItem?.tentativaAtual}ª</Badge>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de Contato</Label>
              <Select value={attemptTipo} onValueChange={setAttemptTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telefone">
                    <span className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> Telefone</span>
                  </SelectItem>
                  <SelectItem value="whatsapp">
                    <span className="flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Número Utilizado *</Label>
              <Select value={attemptNumero} onValueChange={setAttemptNumero}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o número..." />
                </SelectTrigger>
                <SelectContent>
                  {phoneOptions.map((c) => (
                    <SelectItem key={c.id} value={c.valor}>
                      {c.valor} {c.tem_whatsapp ? "(WhatsApp)" : ""}
                    </SelectItem>
                  ))}
                  {phoneOptions.length === 0 && (
                    <SelectItem value="__none" disabled>Nenhum telefone cadastrado</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Resultado</Label>
              <Textarea
                placeholder="Descreva o resultado da tentativa..."
                value={attemptResultado}
                onChange={(e) => setAttemptResultado(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedItem(null)}>Cancelar</Button>
            <Button
              onClick={() => attemptMutation.mutate()}
              disabled={attemptMutation.isPending || !attemptNumero}
              className="press-effect"
            >
              {attemptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Phone className="w-4 h-4 mr-1" />}
              Registrar Tentativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
