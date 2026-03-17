import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, LogIn, LogOut, Timer, RefreshCw, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  profileId: string;
  userId: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeReason(reason: string | null): string {
  if (!reason) return "manual";
  const r = reason.toLowerCase();
  if (r === "inatividade" || r.includes("idle") || r.includes("inativ")) return "inatividade";
  return "manual";
}

const reasonLabels: Record<string, { label: string; className: string }> = {
  manual: { label: "Saída Manual", className: "text-foreground bg-muted" },
  inatividade: { label: "Inatividade", className: "text-warning bg-warning/10" },
};

export default function SessoesUsuarioTab({ profileId, userId }: Props) {
  const [filterDate, setFilterDate] = useState<Date>(new Date());

  const { data: sessoes = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["sessoes_usuario", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sessoes_usuario")
        .select("*")
        .eq("user_id", userId)
        .order("login_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      return (data || []).map((s: any) => {
        let dur = s.duracao_segundos;
        if (!dur && s.login_at && s.logout_at) {
          dur = Math.round((new Date(s.logout_at).getTime() - new Date(s.login_at).getTime()) / 1000);
        }
        if (!dur && s.login_at && !s.logout_at) {
          dur = Math.round((Date.now() - new Date(s.login_at).getTime()) / 1000);
        }
        return { ...s, _duracao: dur || 0, _reason: normalizeReason(s.logout_reason) };
      });
    },
  });

  const filterDateStr = format(filterDate, "yyyy-MM-dd");

  const filteredSessoes = useMemo(() => {
    return sessoes.filter((s: any) => s.login_at?.startsWith(filterDateStr));
  }, [sessoes, filterDateStr]);

  const totalDia = useMemo(() => {
    return filteredSessoes.reduce((acc: number, s: any) => acc + (s._duracao || 0), 0);
  }, [filteredSessoes]);

  if (isLoading) {
    return <p className="text-body text-muted-foreground py-6 text-center">Carregando sessões...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Header with date filter + refresh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs px-3 gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5" />
                {format(filterDate, "dd/MM/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filterDate}
                onSelect={(d) => d && setFilterDate(d)}
                locale={ptBR}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8 text-xs px-3">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-muted/30 border border-border rounded-lg p-3">
          <p className="text-caption text-muted-foreground">Sessões no dia</p>
          <p className="text-lg font-bold text-foreground font-tabular">{filteredSessoes.length}</p>
        </div>
        <div className="bg-muted/30 border border-border rounded-lg p-3">
          <p className="text-caption text-muted-foreground">Tempo total no dia</p>
          <p className="text-lg font-bold text-foreground font-tabular">{formatDuration(totalDia)}</p>
        </div>
        <div className="bg-muted/30 border border-border rounded-lg p-3">
          <p className="text-caption text-muted-foreground">Último login</p>
          <p className="text-sm font-medium text-foreground">{filteredSessoes.length > 0 ? formatDate(filteredSessoes[0].login_at) : "—"}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">
                  <div className="flex items-center gap-1"><LogIn className="w-3.5 h-3.5" /> Login</div>
                </th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">
                  <div className="flex items-center gap-1"><LogOut className="w-3.5 h-3.5" /> Logout</div>
                </th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">
                  <div className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> Duração</div>
                </th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSessoes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Nenhuma sessão nesta data.</td>
                </tr>
              ) : filteredSessoes.map((s: any) => {
                const isActive = !s.logout_at;
                const reason = reasonLabels[s._reason] || reasonLabels.manual;
                return (
                  <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5 text-foreground font-tabular">{formatDate(s.login_at)}</td>
                    <td className="px-4 py-2.5 font-tabular">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-success text-caption font-medium">
                          <Clock className="w-3 h-3 animate-pulse" /> Online
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{formatDate(s.logout_at)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground font-semibold font-tabular">{formatDuration(s._duracao)}</td>
                    <td className="px-4 py-2.5">
                      {isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium text-success bg-success/10 border border-success/20">Ativa</span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${reason.className}`}>{reason.label}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
  const { data: sessoes = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["sessoes_usuario", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sessoes_usuario")
        .select("*")
        .eq("user_id", userId)
        .order("login_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      return (data || []).map((s: any) => {
        let dur = s.duracao_segundos;
        if (!dur && s.login_at && s.logout_at) {
          dur = Math.round((new Date(s.logout_at).getTime() - new Date(s.login_at).getTime()) / 1000);
        }
        if (!dur && s.login_at && !s.logout_at) {
          dur = Math.round((Date.now() - new Date(s.login_at).getTime()) / 1000);
        }
        return { ...s, _duracao: dur || 0, _reason: normalizeReason(s.logout_reason) };
      });
    },
  });

  const totalHoje = sessoes
    .filter((s: any) => {
      const today = new Date().toISOString().slice(0, 10);
      return s.login_at?.startsWith(today);
    })
    .reduce((acc: number, s: any) => acc + (s._duracao || 0), 0);

  if (isLoading) {
    return <p className="text-body text-muted-foreground py-6 text-center">Carregando sessões...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-end">
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8 text-xs px-3">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-muted/30 border border-border rounded-lg p-3">
          <p className="text-caption text-muted-foreground">Sessões (total)</p>
          <p className="text-lg font-bold text-foreground font-tabular">{sessoes.length}</p>
        </div>
        <div className="bg-muted/30 border border-border rounded-lg p-3">
          <p className="text-caption text-muted-foreground">Tempo hoje</p>
          <p className="text-lg font-bold text-foreground font-tabular">{formatDuration(totalHoje)}</p>
        </div>
        <div className="bg-muted/30 border border-border rounded-lg p-3">
          <p className="text-caption text-muted-foreground">Último login</p>
          <p className="text-sm font-medium text-foreground">{sessoes.length > 0 ? formatDate(sessoes[0].login_at) : "—"}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">
                  <div className="flex items-center gap-1"><LogIn className="w-3.5 h-3.5" /> Login</div>
                </th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">
                  <div className="flex items-center gap-1"><LogOut className="w-3.5 h-3.5" /> Logout</div>
                </th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">
                  <div className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" /> Duração</div>
                </th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sessoes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Nenhuma sessão registrada.</td>
                </tr>
              ) : sessoes.map((s: any) => {
                const isActive = !s.logout_at;
                const reason = reasonLabels[s._reason] || reasonLabels.manual;
                return (
                  <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-2.5 text-foreground font-tabular">{formatDate(s.login_at)}</td>
                    <td className="px-4 py-2.5 font-tabular">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 text-success text-caption font-medium">
                          <Clock className="w-3 h-3 animate-pulse" /> Online
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{formatDate(s.logout_at)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground font-semibold font-tabular">{formatDuration(s._duracao)}</td>
                    <td className="px-4 py-2.5">
                      {isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium text-success bg-success/10 border border-success/20">Ativa</span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${reason.className}`}>{reason.label}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
