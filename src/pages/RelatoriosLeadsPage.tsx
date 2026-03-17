import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { motion } from "framer-motion";
import {
  CalendarIcon, Filter, Trash2, Download, Loader2,
  FileText, Search, Users, Eye, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import AdminPasswordDialog from "@/components/AdminPasswordDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LeadRow {
  id: string;
  nome: string;
  status_lead: string;
  origem_lead: string | null;
  responsavel_nome: string | null;
  data_criacao: string;
  telefone: string | null;
  plano_nome: string | null;
  repetidor: string | null;
  atrasos: number;
}

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_atendimento: "Em Atendimento",
  convertido: "Convertido",
  sem_interesse: "Sem Interesse",
  perdido: "Perdido",
  arquivado: "Arquivado",
  aguardando_decisao_avaliador: "Aguard. Decisão",
};

const STATUS_BADGE: Record<string, string> = {
  novo: "border-primary/40 bg-primary/10 text-primary",
  em_atendimento: "border-warning/40 bg-warning/10 text-warning",
  convertido: "border-success/40 bg-success/10 text-success",
  sem_interesse: "border-muted-foreground/40 bg-muted/30 text-muted-foreground",
  perdido: "border-destructive/40 bg-destructive/10 text-destructive",
  arquivado: "border-muted-foreground/40 bg-muted/30 text-muted-foreground",
  aguardando_decisao_avaliador: "border-warning/40 bg-warning/10 text-warning",
};

export default function RelatoriosLeadsPage() {
  const { isAdmin, user } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();
  const urlCidadeId = searchParams.get("cidade_id");
  const urlBairroId = searchParams.get("bairro_id");
  const urlRuaId = searchParams.get("rua_id");
  const urlStatus = searchParams.get("status");
  const urlStart = searchParams.get("start");
  const urlEnd = searchParams.get("end");
  const hasAddressFilter = !!(urlCidadeId || urlBairroId || urlRuaId);
  const hasUrlDateFilter = !!(urlStart || urlEnd);

  const now = new Date();
  const [startDate, setStartDate] = useState<Date | undefined>(() => {
    if (urlStart) return startOfDay(new Date(urlStart + "T00:00:00"));
    if (hasAddressFilter) return undefined;
    return startOfMonth(now);
  });
  const [endDate, setEndDate] = useState<Date | undefined>(() => {
    if (urlEnd) return endOfDay(new Date(urlEnd + "T00:00:00"));
    if (hasAddressFilter) return undefined;
    return endOfMonth(now);
  });

  const [filterStatus, setFilterStatus] = useState(urlStatus || "todos");
  const [filterOrigem, setFilterOrigem] = useState("todos");
  const [filterResponsavel, setFilterResponsavel] = useState("todos");
  const [filterNome, setFilterNome] = useState("");

  const [responsaveis, setResponsaveis] = useState<{ id: string; nome: string }[]>([]);

  // Lead detail dialog
  const [viewLeadId, setViewLeadId] = useState<string | null>(null);
  const [viewLeadData, setViewLeadData] = useState<any>(null);
  const [viewLeadLoading, setViewLeadLoading] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome").then(({ data }) => {
      setResponsaveis(data || []);
    });
  }, []);

  const [leadsList, setLeadsList] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportAllLoading, setExportAllLoading] = useState(false);

  const isDirectSearch = filterNome.trim() !== "";

  const fetchLeads = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("leads")
      .select("id, nome, status_lead, origem_lead, responsavel_id, data_criacao, plano_id, repetidor, cidade_id, bairro_id, rua_id");

    // Address filters from URL
    if (urlCidadeId) query = query.eq("cidade_id", urlCidadeId);
    if (urlBairroId) query = query.eq("bairro_id", urlBairroId);
    if (urlRuaId) query = query.eq("rua_id", urlRuaId);

    if (isDirectSearch) {
      query = query.ilike("nome", `%${filterNome.trim()}%`);
    } else if (!hasAddressFilter) {
      const from = startDate ? startOfDay(startDate).toISOString() : startOfDay(startOfMonth(now)).toISOString();
      const to = endDate ? endOfDay(endDate).toISOString() : endOfDay(endOfMonth(now)).toISOString();
      query = query.gte("data_criacao", from).lte("data_criacao", to);
    }

    if (filterStatus !== "todos") query = query.eq("status_lead", filterStatus);
    if (filterOrigem !== "todos") query = query.eq("origem_lead", filterOrigem);
    if (filterResponsavel !== "todos") query = query.eq("responsavel_id", filterResponsavel);

    const { data: leadsData } = await query.order("data_criacao", { ascending: false });
    if (!leadsData) { setLeadsList([]); setLoading(false); return; }

    const leadIds = leadsData.map((l) => l.id);
    const planoIds = [...new Set(leadsData.map((l) => l.plano_id).filter(Boolean))] as string[];
    const respIds = [...new Set(leadsData.map((l) => l.responsavel_id).filter(Boolean))] as string[];

    const [contatosRes, planosRes, profilesRes, atrasosRes] = await Promise.all([
      leadIds.length > 0 ? supabase.from("lead_contatos").select("lead_id, valor").eq("tipo_contato", "telefone").in("lead_id", leadIds) : Promise.resolve({ data: [] }),
      planoIds.length > 0 ? supabase.from("planos").select("id, nome_plano").in("id", planoIds) : Promise.resolve({ data: [] }),
      respIds.length > 0 ? supabase.from("profiles").select("id, nome").in("id", respIds) : Promise.resolve({ data: [] }),
      leadIds.length > 0 ? supabase.from("lead_tarefas_contato").select("lead_id").eq("fora_do_prazo", true).in("lead_id", leadIds) : Promise.resolve({ data: [] }),
    ]);

    const phoneMap: Record<string, string> = {};
    (contatosRes.data || []).forEach((c: any) => { if (!phoneMap[c.lead_id]) phoneMap[c.lead_id] = c.valor; });
    const planoMap: Record<string, string> = {};
    (planosRes.data || []).forEach((p: any) => { planoMap[p.id] = p.nome_plano; });
    const profileMap: Record<string, string> = {};
    (profilesRes.data || []).forEach((p: any) => { profileMap[p.id] = p.nome; });
    const atrasosMap: Record<string, number> = {};
    (atrasosRes.data || []).forEach((a: any) => { atrasosMap[a.lead_id] = (atrasosMap[a.lead_id] || 0) + 1; });

    setLeadsList(leadsData.map((l) => ({
      id: l.id,
      nome: l.nome,
      status_lead: l.status_lead,
      origem_lead: l.origem_lead,
      responsavel_nome: l.responsavel_id ? profileMap[l.responsavel_id] || null : null,
      data_criacao: l.data_criacao,
      telefone: phoneMap[l.id] || null,
      plano_nome: l.plano_id ? planoMap[l.plano_id] || null : null,
      repetidor: (l as any).repetidor || null,
      atrasos: atrasosMap[l.id] || 0,
    })));
    setSelected(new Set());
    setLoading(false);
  }, [startDate, endDate, filterStatus, filterOrigem, filterResponsavel, filterNome, urlCidadeId, urlBairroId, urlRuaId]);

  useEffect(() => { fetchLeads(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── View Lead Detail ──────────────────────────────
  const openLeadDetail = async (leadId: string) => {
    setViewLeadId(leadId);
    setViewLeadLoading(true);
    try {
      const [leadRes, contatosRes, historicoRes] = await Promise.all([
        supabase.from("leads").select("*, cidade:cidades(nome), bairro:bairros(nome), rua:ruas(nome), plano:planos(nome_plano)").eq("id", leadId).single(),
        supabase.from("lead_contatos").select("*").eq("lead_id", leadId),
        supabase.from("lead_historico").select("*, usuario:profiles(nome)").eq("lead_id", leadId).order("data_evento", { ascending: false }).limit(20),
      ]);
      const responsavelNome = leadRes.data?.responsavel_id
        ? responsaveis.find(r => r.id === leadRes.data.responsavel_id)?.nome || "—"
        : "—";
      setViewLeadData({
        ...leadRes.data,
        responsavel_nome: responsavelNome,
        contatos: contatosRes.data || [],
        historico: historicoRes.data || [],
      });
    } catch {
      toast.error("Erro ao carregar detalhes do lead.");
    } finally {
      setViewLeadLoading(false);
    }
  };

  const allSelected = leadsList.length > 0 && selected.size === leadsList.length;
  const someSelected = selected.size > 0 && !allSelected;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(leadsList.map((l) => l.id)));
  const toggleOne = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ─── Delete leads and ALL related records ───────────
  const executeDeleteSelected = async () => {
    if (!user) return;
    const ids = [...selected];

    // Delete child records in order
    await supabase.from("lead_tarefas_contato").delete().in("lead_id", ids);
    await supabase.from("lead_interacoes").delete().in("lead_id", ids);
    await supabase.from("lead_historico").delete().in("lead_id", ids);
    await supabase.from("lead_contatos").delete().in("lead_id", ids);
    await supabase.from("registro_atraso_tentativa").delete().in("lead_id", ids);
    await supabase.from("registro_objecao_lead").delete().in("lead_id", ids);
    await supabase.from("leads").delete().in("id", ids);

    // Audit
    for (const id of ids) {
      const info = leadsList.find((l) => l.id === id);
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        acao: "exclusao_lead_relatorio",
        tabela: "leads",
        registro_id: id,
        dados_anteriores: info ? { nome: info.nome, status: info.status_lead } : null,
      });
    }

    toast.success(`${ids.length} lead(s) e todos os dados vinculados foram excluídos.`);
    fetchLeads();
  };

  // ─── Delete ALL filtered leads and ALL related records ─
  const executeDeleteAllFiltered = async () => {
    if (!user) return;
    const ids = leadsList.map((l) => l.id);
    if (ids.length === 0) return;

    await supabase.from("lead_tarefas_contato").delete().in("lead_id", ids);
    await supabase.from("lead_interacoes").delete().in("lead_id", ids);
    await supabase.from("lead_historico").delete().in("lead_id", ids);
    await supabase.from("lead_contatos").delete().in("lead_id", ids);
    await supabase.from("registro_atraso_tentativa").delete().in("lead_id", ids);
    await supabase.from("registro_objecao_lead").delete().in("lead_id", ids);
    await supabase.from("leads").delete().in("id", ids);

    for (const id of ids) {
      const info = leadsList.find((l) => l.id === id);
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        acao: "exclusao_lead_relatorio_massa",
        tabela: "leads",
        registro_id: id,
        dados_anteriores: info ? { nome: info.nome, status: info.status_lead } : null,
      });
    }

    toast.success(`${ids.length} lead(s) e todos os dados vinculados foram removidos do sistema.`);
    fetchLeads();
  };

  // ─── Export selected to Excel ───────────────────────
  const handleExportSelected = async () => {
    if (selected.size === 0) return;
    setExportLoading(true);
    try {
      exportToExcel(leadsList.filter((l) => selected.has(l.id)));
      toast.success(`Exportação de ${selected.size} lead(s) concluída.`);
    } catch (err: any) {
      toast.error("Erro ao exportar: " + err.message);
    } finally {
      setExportLoading(false);
    }
  };

  // ─── Export all filtered ────────────────────────────
  const handleExportAllFiltered = async () => {
    if (leadsList.length === 0) { toast.error("Nenhum lead disponível."); return; }
    setExportAllLoading(true);
    try {
      exportToExcel(leadsList);
      toast.success(`Relatório exportado com ${leadsList.length} lead(s).`);
    } catch (err: any) {
      toast.error("Erro ao exportar: " + err.message);
    } finally {
      setExportAllLoading(false);
    }
  };

  const exportToExcel = (data: LeadRow[]) => {
    const headers = ["Nome", "Telefone", "Status", "Origem", "Responsável", "Perfil Identificado", "Repetidor", "Data Criação", "Atrasos"];
    const wsData: (string | number)[][] = [headers];
    for (const l of data) {
      wsData.push([
        l.nome,
        l.telefone || "",
        STATUS_LABELS[l.status_lead] || l.status_lead,
        l.origem_lead || "",
        l.responsavel_nome || "",
        l.plano_nome || "",
        l.repetidor ? (l.repetidor === "fast" ? "Fast" : "Dual") : "",
        format(new Date(l.data_criacao), "dd/MM/yyyy"),
        l.atrasos > 0 ? `${l.atrasos} fora do prazo` : "No prazo",
      ]);
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = headers.map((h, i) => ({ wch: Math.min(Math.max(h.length, ...wsData.slice(1).map((r) => String(r[i] ?? "").length)) + 2, 40) }));
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, `relatorio_leads_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-section font-semibold text-foreground">Relatórios de Leads</h1>
        <p className="text-body text-muted-foreground">Gerencie e exporte dados de Leads</p>
      </div>

      {hasUrlDateFilter && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-foreground">
            📊 Filtro aplicado do Dashboard — Status: <strong>{STATUS_LABELS[urlStatus || ""] || urlStatus}</strong>
            {urlStart && urlEnd && <> · Período: <strong>{format(new Date(urlStart + "T00:00:00"), "dd/MM/yyyy")} a {format(new Date(urlEnd + "T00:00:00"), "dd/MM/yyyy")}</strong></>}
          </span>
          <Button
            variant="ghost" size="sm"
            onClick={() => {
              setSearchParams({});
              setFilterStatus("todos");
              setStartDate(startOfMonth(now));
              setEndDate(endOfMonth(now));
              setTimeout(() => fetchLeads(), 100);
            }}
          >
            <X className="w-3.5 h-3.5 mr-1" /> Limpar filtro
          </Button>
        </div>
      )}

      {hasAddressFilter && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-foreground">
            🔍 Filtrando por endereço — mostrando todos os leads associados
          </span>
          <Button
            variant="ghost" size="sm"
            onClick={() => { setSearchParams({}); setStartDate(startOfMonth(now)); setEndDate(endOfMonth(now)); }}
          >
            <X className="w-3.5 h-3.5 mr-1" /> Limpar filtro
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Filtros</span>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-muted-foreground">Data Início</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 w-[160px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {startDate ? format(startDate, "dd/MM/yyyy") : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="p-3 pointer-events-auto" locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-muted-foreground">Data Fim</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 w-[160px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {endDate ? format(endDate, "dd/MM/yyyy") : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus className="p-3 pointer-events-auto" locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={fetchLeads} disabled={loading} className="h-9">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
            Buscar
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 items-end mt-4 pt-4 border-t border-border">
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-caption font-medium text-muted-foreground">Status</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-caption font-medium text-muted-foreground">Origem</label>
            <Select value={filterOrigem} onValueChange={setFilterOrigem}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="importacao">Importação</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-caption font-medium text-muted-foreground">Responsável</label>
            <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {responsaveis.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-caption font-medium text-muted-foreground">Nome do Lead</label>
            <Input className="h-9" placeholder="Buscar..." value={filterNome} onChange={(e) => setFilterNome(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Action bar */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-lg p-3 shadow-card flex items-center justify-between"
        >
          <span className="text-body font-medium text-foreground">{selected.size} lead(s) selecionado(s)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)} disabled={exportLoading}>
              {exportLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
              Exportar Excel
            </Button>
            {isAdmin && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="w-4 h-4 mr-1" /> Excluir Selecionados
              </Button>
            )}
          </div>
        </motion.div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg shadow-card">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-body font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Leads ({leadsList.length})
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportAllFiltered}
                disabled={exportAllLoading || leadsList.length === 0}
              >
                {exportAllLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
                Exportar Relatório ({leadsList.length})
              </Button>
              {isAdmin && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteAllDialogOpen(true)}
                  disabled={leadsList.length === 0}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Remover Dados ({leadsList.length})
                </Button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      className="translate-y-[1px]"
                      {...(someSelected ? { "data-state": "indeterminate" } : {})}
                    />
                  </th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nome</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Telefone</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Origem</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Responsável</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Data Criação</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Atrasos</th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leadsList.map((item) => (
                  <tr
                    key={item.id}
                    className={cn("hover:bg-muted/50 transition-colors", selected.has(item.id) && "bg-primary/5")}
                  >
                    <td className="px-4 py-3">
                      <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleOne(item.id)} />
                    </td>
                    <td className="px-4 py-3 text-body font-medium text-foreground">{item.nome}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground font-tabular">{item.telefone || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", STATUS_BADGE[item.status_lead] || "border-border bg-muted text-muted-foreground")}>
                        {STATUS_LABELS[item.status_lead] || item.status_lead}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{item.origem_lead || "—"}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{item.responsavel_nome || "—"}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground font-tabular">
                      {format(new Date(item.data_criacao), "dd/MM/yyyy")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.atrasos > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border border-destructive/40 bg-destructive/10 text-destructive">
                          {item.atrasos} fora do prazo
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                          No prazo
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver detalhes" onClick={() => openLeadDetail(item.id)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {leadsList.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-body text-muted-foreground">
                      Nenhum lead encontrado no período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Password Dialog */}
      <AdminPasswordDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Confirmar Exclusão"
        description={`Você está prestes a excluir ${selected.size} lead(s) e todos os dados vinculados (contatos, tarefas, interações, histórico). Esta ação é irreversível.`}
        onConfirm={executeDeleteSelected}
      />

      {/* Export Selected Password Dialog */}
      <AdminPasswordDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title="Confirmar Exportação"
        description={`Informe sua senha para exportar ${selected.size} lead(s) selecionado(s).`}
        onConfirm={handleExportSelected}
      />

      {/* Delete ALL filtered Password Dialog */}
      <AdminPasswordDialog
        open={deleteAllDialogOpen}
        onOpenChange={setDeleteAllDialogOpen}
        title="Remover Todos os Dados"
        description={`Você está prestes a remover ${leadsList.length} lead(s) listados e TODOS os dados vinculados (contatos, tarefas, interações, histórico, atrasos, objeções). Nada restará no sistema. Esta ação é irreversível.`}
        onConfirm={executeDeleteAllFiltered}
      />

      {/* Lead Detail Dialog */}
      <Dialog open={!!viewLeadId} onOpenChange={(o) => { if (!o) { setViewLeadId(null); setViewLeadData(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4" /> Detalhes do Lead
            </DialogTitle>
          </DialogHeader>
          {viewLeadLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : viewLeadData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Nome:</span> <span className="font-medium">{viewLeadData.nome}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className="ml-1 text-[10px]">{STATUS_LABELS[viewLeadData.status_lead] || viewLeadData.status_lead}</Badge></div>
                <div><span className="text-muted-foreground">Responsável:</span> <span className="font-medium">{viewLeadData.responsavel_nome}</span></div>
                <div><span className="text-muted-foreground">Origem:</span> {viewLeadData.origem_lead || "—"}</div>
                <div><span className="text-muted-foreground">Cidade:</span> {viewLeadData.cidade?.nome || "—"}</div>
                <div><span className="text-muted-foreground">Bairro:</span> {viewLeadData.bairro?.nome || "—"}</div>
                <div><span className="text-muted-foreground">Rua:</span> {viewLeadData.rua?.nome || "—"}</div>
                <div><span className="text-muted-foreground">Plano:</span> {viewLeadData.plano?.nome_plano || "—"}</div>
                <div><span className="text-muted-foreground">Repetidor:</span> {viewLeadData.repetidor ? (viewLeadData.repetidor === "fast" ? "Fast" : "Dual") : "Nenhum"}</div>
                <div><span className="text-muted-foreground">Criado em:</span> {format(new Date(viewLeadData.data_criacao), "dd/MM/yyyy HH:mm")}</div>
              </div>

              {viewLeadData.contatos?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Contatos</p>
                  <div className="space-y-1">
                    {viewLeadData.contatos.map((c: any) => (
                      <div key={c.id} className="text-sm flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{c.tipo_contato}</Badge>
                        <span>{c.valor}</span>
                        {c.tem_whatsapp && <Badge className="text-[9px] bg-green-100 text-green-800 border-0">WhatsApp</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewLeadData.historico?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Histórico Recente</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {viewLeadData.historico.map((h: any) => (
                      <div key={h.id} className="text-xs border-l-2 border-border pl-2">
                        <span className="text-muted-foreground">{format(new Date(h.data_evento), "dd/MM HH:mm")}</span>
                        {" — "}
                        <span className="font-medium">{h.tipo_evento}</span>
                        {h.descricao && <span className="text-muted-foreground"> — {h.descricao}</span>}
                        <span className="text-muted-foreground ml-1">({h.usuario?.nome || "—"})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
