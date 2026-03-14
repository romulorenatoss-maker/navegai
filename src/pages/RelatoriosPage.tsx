import { useState, useMemo, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  CalendarIcon, Filter, Trash2, Download, Loader2, CheckSquare,
  Square, AlertTriangle, FileText
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

// --- Types ---
interface OSRow {
  id: string;
  numero_os: string;
  status: string;
  created_at: string;
  cliente_nome: string | null;
  tipo_servico_id: string | null;
  tipo_servico_nome: string | null;
}

// --- Helpers ---
function getCompetenceMonths(): { value: string; label: string }[] {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy", { locale: ptBR }),
    });
  }
  return months;
}

const statusText: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

const statusBadge: Record<string, string> = {
  aberta: "border-warning/40 bg-warning/10 text-warning",
  em_andamento: "border-primary/40 bg-primary/10 text-primary",
  concluida: "border-success/40 bg-success/10 text-success",
};

// --- Main ---
export default function RelatoriosPage() {
  const { isAdmin, user } = useAuth();

  // Filters
  const now = new Date();
  const [competenceMonth, setCompetenceMonth] = useState(format(now, "yyyy-MM"));
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(now));

  const handleCompetenceChange = (val: string) => {
    setCompetenceMonth(val);
    const [y, m] = val.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    setStartDate(startOfMonth(d));
    setEndDate(endOfMonth(d));
  };

  // Data
  const [osList, setOsList] = useState<OSRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Export loading
  const [exportLoading, setExportLoading] = useState(false);

  const competenceMonths = useMemo(() => getCompetenceMonths(), []);

  // Fetch OS
  const fetchOS = useCallback(async () => {
    setLoading(true);
    const from = startDate ? startDate.toISOString() : startOfMonth(now).toISOString();
    const to = endDate ? endOfMonth(endDate).toISOString() : endOfMonth(now).toISOString();

    const { data: osData } = await supabase
      .from("ordens_servico")
      .select("id, numero_os, status, created_at, cliente_nome, tipo_servico_id")
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: false });

    if (!osData) {
      setOsList([]);
      setLoading(false);
      return;
    }

    const tipoIds = [...new Set(osData.map((o) => o.tipo_servico_id).filter(Boolean))] as string[];
    let tipoNames: Record<string, string> = {};
    if (tipoIds.length > 0) {
      const { data: tipos } = await supabase.from("tipos_servico").select("id, nome").in("id", tipoIds);
      tipos?.forEach((t) => { tipoNames[t.id] = t.nome; });
    }

    setOsList(
      osData.map((os) => ({
        ...os,
        tipo_servico_nome: os.tipo_servico_id ? tipoNames[os.tipo_servico_id] || null : null,
      }))
    );
    setSelected(new Set());
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => { fetchOS(); }, [fetchOS]);

  // Selection
  const allSelected = osList.length > 0 && selected.size === osList.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(osList.map((o) => o.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Delete
  const handleDeleteSelected = async () => {
    if (!user || !deletePassword) return;
    setDeleteLoading(true);

    try {
      // Verify password
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: deletePassword,
      });
      if (authError) {
        toast.error("Senha incorreta.");
        setDeleteLoading(false);
        return;
      }

      const osIds = [...selected];

      // 1. Get avaliacoes for these OS
      const { data: avaliacoes } = await supabase
        .from("avaliacoes")
        .select("id")
        .in("ordem_servico_id", osIds);
      const avalIds = avaliacoes?.map((a) => a.id) || [];

      // 2. Get evidencia URLs to delete from storage
      if (avalIds.length > 0) {
        const { data: respostas } = await supabase
          .from("respostas_avaliacao")
          .select("evidencia_url")
          .in("avaliacao_id", avalIds)
          .not("evidencia_url", "is", null);

        if (respostas && respostas.length > 0) {
          const paths = respostas
            .map((r) => r.evidencia_url)
            .filter(Boolean)
            .map((url) => {
              // Extract path from full URL
              const match = url!.match(/evidencias\/(.+)$/);
              return match ? match[1] : null;
            })
            .filter(Boolean) as string[];

          if (paths.length > 0) {
            await supabase.storage.from("evidencias").remove(paths);
          }
        }

        // 3. Delete respostas
        await supabase.from("respostas_avaliacao").delete().in("avaliacao_id", avalIds);
      }

      // 4. Delete inconsistencias
      await supabase.from("avaliacoes_inconsistencias").delete().in("ordem_servico_id", osIds);

      // 5. Delete avaliacoes
      if (avalIds.length > 0) {
        await supabase.from("avaliacoes").delete().in("id", avalIds);
      }

      // 6. Delete OS
      await supabase.from("ordens_servico").delete().in("id", osIds);

      // 7. Audit log
      for (const osId of osIds) {
        const osInfo = osList.find((o) => o.id === osId);
        await supabase.from("audit_logs").insert({
          user_id: user.id,
          acao: "exclusao_relatorio",
          tabela: "ordens_servico",
          registro_id: osId,
          dados_anteriores: osInfo ? { numero_os: osInfo.numero_os, cliente_nome: osInfo.cliente_nome } : null,
        });
      }

      toast.success(`${osIds.length} OS(s) e todos os dados vinculados foram excluídos.`);
      setDeleteDialogOpen(false);
      setDeletePassword("");
      fetchOS();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Export CSV — columnar format with questions as headers
  const handleExportSelected = async () => {
    if (selected.size === 0) return;
    setExportLoading(true);

    try {
      const osIds = [...selected];

      // 1. Get OS data with colaborador_avaliado_id
      const { data: osData } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, status, created_at, cliente_nome, cliente_cpf, tipo_servico_id, colaborador_avaliado_id")
        .in("id", osIds);

      if (!osData || osData.length === 0) {
        toast.error("Nenhum dado encontrado.");
        setExportLoading(false);
        return;
      }

      // 2. Get tipo_servico names
      const tipoIds = [...new Set(osData.map((o) => o.tipo_servico_id).filter(Boolean))] as string[];
      let tipoNames: Record<string, string> = {};
      if (tipoIds.length > 0) {
        const { data: tipos } = await supabase.from("tipos_servico").select("id, nome").in("id", tipoIds);
        tipos?.forEach((t) => { tipoNames[t.id] = t.nome; });
      }

      // 3. Get avaliacoes
      const { data: avaliacoes } = await supabase
        .from("avaliacoes")
        .select("id, ordem_servico_id, avaliador_id, concluida, nota_final, created_at")
        .in("ordem_servico_id", osIds);

      const avalIds = avaliacoes?.map((a) => a.id) || [];

      // 4. Get all respostas
      let respostas: { avaliacao_id: string; pergunta_id: string; resposta: string | null }[] = [];
      if (avalIds.length > 0) {
        const { data } = await supabase
          .from("respostas_avaliacao")
          .select("avaliacao_id, pergunta_id, resposta")
          .in("avaliacao_id", avalIds);
        respostas = data || [];
      }

      // 5. Get all perguntas that were answered, ordered by `ordem`
      const perguntaIds = [...new Set(respostas.map((r) => r.pergunta_id))];
      let perguntas: { id: string; pergunta: string; ordem: number }[] = [];
      if (perguntaIds.length > 0) {
        const { data } = await supabase
          .from("perguntas_avaliacao")
          .select("id, pergunta, ordem")
          .in("id", perguntaIds)
          .order("ordem");
        perguntas = data || [];
      }

      // 6. Get profile names (avaliadores + colaboradores avaliados)
      const profileIds = [
        ...new Set([
          ...(avaliacoes?.map((a) => a.avaliador_id) || []),
          ...osData.map((o) => o.colaborador_avaliado_id).filter(Boolean) as string[],
        ]),
      ];
      let profileNames: Record<string, string> = {};
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, nome").in("id", profileIds);
        profiles?.forEach((p) => { profileNames[p.id] = p.nome; });
      }

      // 7. Build answer map: respostas keyed by avaliacao_id -> pergunta_id
      const answerMap: Record<string, Record<string, string>> = {};
      respostas.forEach((r) => {
        if (!answerMap[r.avaliacao_id]) answerMap[r.avaliacao_id] = {};
        const val = r.resposta === "sim" ? "SIM" : r.resposta === "nao" ? "NÃO" : r.resposta === "na" ? "N/A" : "";
        answerMap[r.avaliacao_id][r.pergunta_id] = val;
      });

      // 8. Build CSV with questions as columns
      const fixedHeaders = [
        "Número OS", "Nome Cliente", "CPF Cliente", "Data Avaliação",
        "Avaliador", "Tipo Serviço", "Colaborador Avaliado", "Nota Final"
      ];
      const questionHeaders = perguntas.map((p) => p.pergunta);
      const csvHeader = [...fixedHeaders, ...questionHeaders].map(escapeCSV).join(";");

      const csvRows: string[] = [];
      for (const os of osData) {
        const osAvals = avaliacoes?.filter((a) => a.ordem_servico_id === os.id) || [];

        if (osAvals.length === 0) {
          // OS without evaluations — one row with empty answers
          const row = [
            os.numero_os,
            os.cliente_nome || "",
            os.cliente_cpf || "",
            format(new Date(os.created_at), "dd/MM/yyyy"),
            "",
            os.tipo_servico_id ? tipoNames[os.tipo_servico_id] || "" : "",
            os.colaborador_avaliado_id ? profileNames[os.colaborador_avaliado_id] || "" : "",
            "",
            ...perguntas.map(() => ""),
          ];
          csvRows.push(row.map(escapeCSV).join(";"));
          continue;
        }

        for (const aval of osAvals) {
          const answers = answerMap[aval.id] || {};
          const row = [
            os.numero_os,
            os.cliente_nome || "",
            os.cliente_cpf || "",
            format(new Date(aval.created_at), "dd/MM/yyyy"),
            profileNames[aval.avaliador_id] || "",
            os.tipo_servico_id ? tipoNames[os.tipo_servico_id] || "" : "",
            os.colaborador_avaliado_id ? profileNames[os.colaborador_avaliado_id] || "" : "",
            aval.nota_final != null ? aval.nota_final.toString().replace(".", ",") : "",
            ...perguntas.map((p) => answers[p.id] || ""),
          ];
          csvRows.push(row.map(escapeCSV).join(";"));
        }
      }

      const csvContent = "\uFEFF" + csvHeader + "\n" + csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio_os_${competenceMonth}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Exportação de ${selected.size} OS(s) concluída.`);
    } catch (err: any) {
      toast.error("Erro ao exportar: " + err.message);
    } finally {
      setExportLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-2">
          <AlertTriangle className="w-10 h-10 text-warning mx-auto" />
          <p className="text-body text-muted-foreground">Acesso restrito ao administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-section font-semibold text-foreground">Relatórios</h1>
        <p className="text-body text-muted-foreground">Gerencie e exporte dados de Ordens de Serviço</p>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1.5 min-w-[200px]">
            <label className="text-caption font-medium text-muted-foreground">Mês de Competência</label>
            <Select value={competenceMonth} onValueChange={handleCompetenceChange}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {competenceMonths.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="capitalize">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
        </div>
      </div>

      {/* Action bar */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-lg p-3 shadow-card flex items-center justify-between"
        >
          <span className="text-body font-medium text-foreground">
            {selected.size} OS(s) selecionada(s)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportSelected}
              disabled={exportLoading}
            >
              {exportLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
              Exportar CSV
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Excluir Selecionadas
            </Button>
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
              <FileText className="w-4 h-4 text-primary" />
              Ordens de Serviço ({osList.length})
            </h2>
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
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Data</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo de Serviço</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {osList.map((item) => (
                  <tr
                    key={item.id}
                    className={cn(
                      "hover:bg-muted/50 transition-colors",
                      selected.has(item.id) && "bg-primary/5"
                    )}
                  >
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggleOne(item.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-body font-medium font-tabular text-foreground">{item.numero_os}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground font-tabular">
                      {format(new Date(item.created_at), "dd/MM/yyyy")}
                    </td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{item.cliente_nome || "—"}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{item.tipo_servico_nome || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", statusBadge[item.status])}>
                        {statusText[item.status] || item.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {osList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-body text-muted-foreground">
                      Nenhuma OS encontrada no período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!deleteLoading) setDeleteDialogOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Confirmar Exclusão
            </DialogTitle>
            <DialogDescription>
              Você está prestes a excluir <strong>{selected.size} OS(s)</strong> e <strong>todos os dados vinculados</strong>:
              respostas, evidências (fotos), avaliações e inconsistências.
              <br /><br />
              <strong>Cadastros de clientes NÃO serão removidos.</strong>
              <br /><br />
              Esta ação é irreversível. Digite sua senha para confirmar.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            placeholder="Sua senha"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleDeleteSelected()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeletePassword(""); }} disabled={deleteLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteSelected} disabled={deleteLoading || !deletePassword}>
              {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Excluir {selected.size} OS(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function escapeCSV(val: string): string {
  if (val.includes(";") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
