import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalRankings, RankingRole, RankingPeriod } from "@/hooks/useOperationalRankings";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Trophy, TrendingUp, TrendingDown, Minus, CalendarIcon, Medal,
  ChevronDown, ChevronUp, Target, User, BarChart3, AlertTriangle,
  Clock, Filter, Award, Star, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ROLE_CONFIG: Record<RankingRole, { label: string; icon: any; description: string }> = {
  executor: { label: "Executor", icon: Target, description: "Quem executa as rotinas operacionais" },
  avaliado: { label: "Avaliado", icon: User, description: "Quem é auditado/inspecionado" },
  avaliador: { label: "Avaliador", icon: Shield, description: "Quem realiza as auditorias" },
};

const PERIOD_OPTIONS: { value: RankingPeriod; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
  { value: "trimestre", label: "Trimestre" },
  { value: "custom", label: "Personalizado" },
];

const scoreColor = (v: number) => {
  if (v >= 90) return "text-emerald-600";
  if (v >= 70) return "text-amber-600";
  return "text-red-600";
};

const scoreBg = (v: number) => {
  if (v >= 90) return "bg-emerald-500/20 border-emerald-500/30";
  if (v >= 70) return "bg-amber-500/20 border-amber-500/30";
  return "bg-destructive/20 border-destructive/30";
};

function getTier(score: number): { label: string; emoji: string; class: string } {
  if (score >= 95) return { label: "Diamante", emoji: "💎", class: "text-blue-500" };
  if (score >= 90) return { label: "Ouro", emoji: "🥇", class: "text-amber-500" };
  if (score >= 80) return { label: "Prata", emoji: "🥈", class: "text-gray-400" };
  if (score >= 70) return { label: "Bronze", emoji: "🥉", class: "text-orange-700" };
  return { label: "Em desenvolvimento", emoji: "📈", class: "text-muted-foreground" };
}

export default function RankingsOperacionalPage() {
  const { profile } = useAuth();
  const [role, setRole] = useState<RankingRole>("executor");
  const [period, setPeriod] = useState<RankingPeriod>("mes");
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [minEvaluations, setMinEvaluations] = useState(3);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { rankings, isLoading, dateRange } = useOperationalRankings({
    role,
    period,
    customStart,
    customEnd,
    minEvaluations,
  });

  const eligible = rankings.filter((r) => r.eligible);
  const ineligible = rankings.filter((r) => !r.eligible);
  const myPosition = eligible.findIndex((r) => r.profileId === profile?.id) + 1;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" /> Rankings Operacionais
          </h1>
          <p className="text-sm text-muted-foreground">
            Performance por papel · Mínimo {minEvaluations} avaliações para elegibilidade
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <Select value={period} onValueChange={(v) => setPeriod(v as RankingPeriod)}>
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Custom date */}
          {period === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarIcon className="w-4 h-4 mr-1" />
                  {customStart ? format(customStart, "dd/MM", { locale: ptBR }) : "—"} – {customEnd ? format(customEnd, "dd/MM", { locale: ptBR }) : "—"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar mode="range"
                  selected={{ from: customStart, to: customEnd }}
                  onSelect={(range) => { setCustomStart(range?.from); setCustomEnd(range?.to); }}
                  locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          )}

          {/* Min evaluations */}
          <Select value={String(minEvaluations)} onValueChange={(v) => setMinEvaluations(Number(v))}>
            <SelectTrigger className="h-8 text-xs w-28">
              <SelectValue placeholder="Mín. aval." />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 5, 10].map((n) => (
                <SelectItem key={n} value={String(n)}>Mín. {n} aval.</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Role tabs */}
      <Tabs value={role} onValueChange={(v) => { setRole(v as RankingRole); setExpandedId(null); }}>
        <TabsList className="h-auto flex-wrap gap-1">
          {(Object.keys(ROLE_CONFIG) as RankingRole[]).map((r) => {
            const cfg = ROLE_CONFIG[r];
            const Icon = cfg.icon;
            return (
              <TabsTrigger key={r} value={r} className="text-xs gap-1">
                <Icon className="w-3.5 h-3.5" /> {cfg.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(Object.keys(ROLE_CONFIG) as RankingRole[]).map((r) => (
          <TabsContent key={r} value={r} className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Participantes" value={eligible.length} icon={<User className="w-4 h-4" />} />
              <StatCard label="Score Médio" value={eligible.length > 0 ? Math.round(eligible.reduce((s, r) => s + r.scoreMedio, 0) / eligible.length) : null} icon={<BarChart3 className="w-4 h-4" />} />
              <StatCard label="Sua Posição" value={myPosition || null} suffix={`/ ${eligible.length}`} icon={<Medal className="w-4 h-4" />} />
              <StatCard label="Não Elegíveis" value={ineligible.length} icon={<AlertTriangle className="w-4 h-4" />} muted />
            </div>

            {/* Top 3 Podium */}
            {eligible.length >= 3 && (
              <div className="grid grid-cols-3 gap-3">
                {eligible.slice(0, 3).map((collab, i) => {
                  const tier = getTier(collab.scoreMedio);
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <div key={collab.profileId}
                      className={cn(
                        "bg-card border rounded-lg p-4 text-center transition-all",
                        i === 0 ? "border-amber-400/50 shadow-md" : "border-border",
                        collab.profileId === profile?.id && "ring-2 ring-primary/30"
                      )}>
                      <div className="text-3xl mb-1">{medals[i]}</div>
                      <p className="font-semibold text-foreground text-sm truncate">{collab.nome}</p>
                      <p className={cn("text-2xl font-bold font-mono mt-1", scoreColor(collab.scoreMedio))}>
                        {collab.scoreMedio}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {collab.totalAvaliacoes} avaliações · {tier.emoji} {tier.label}
                      </p>
                      <TrendBadge tendencia={collab.tendencia} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full ranking table */}
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="divide-y divide-border">
                  {eligible.length === 0 && ineligible.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      Sem dados de score no período selecionado.
                    </div>
                  )}

                  {eligible.map((collab, i) => (
                    <RankingRow
                      key={collab.profileId}
                      collab={collab}
                      position={i + 1}
                      isMe={collab.profileId === profile?.id}
                      expanded={expandedId === collab.profileId}
                      onToggle={() => setExpandedId(expandedId === collab.profileId ? null : collab.profileId)}
                      role={role}
                    />
                  ))}

                  {/* Ineligible section */}
                  {ineligible.length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-muted/30">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                          Dados insuficientes (menos de {minEvaluations} avaliações)
                        </p>
                      </div>
                      {ineligible.map((collab) => (
                        <RankingRow
                          key={collab.profileId}
                          collab={collab}
                          position={null}
                          isMe={collab.profileId === profile?.id}
                          expanded={expandedId === collab.profileId}
                          onToggle={() => setExpandedId(expandedId === collab.profileId ? null : collab.profileId)}
                          role={role}
                          dimmed
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Formula transparency */}
            <div className="bg-muted/30 border border-border rounded-lg p-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                📐 Como o ranking é calculado
              </h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• <strong>Score Médio</strong>: Média aritmética de todos os scores finais no período selecionado.</p>
                <p>• <strong>Elegibilidade</strong>: Mínimo de {minEvaluations} avaliações para aparecer no ranking oficial.</p>
                <p>• <strong>Tendência</strong>: Compara a média atual com a do período anterior (mesma duração).</p>
                <p>• <strong>Tier</strong>: 💎 Diamante (≥95) · 🥇 Ouro (≥90) · 🥈 Prata (≥80) · 🥉 Bronze (≥70) · 📈 Em desenvolvimento (&lt;70)</p>
                {role === "executor" && <p>• <strong>Executor</strong>: Pontualidade 40% + Conformidade 30% + Evidência 20% + SLA 10%.</p>}
                {role === "avaliado" && <p>• <strong>Avaliado</strong>: Soma ponderada dos itens do checklist: Σ(peso × nota) / Σ(peso × max).</p>}
                {role === "avaliador" && <p>• <strong>Avaliador</strong>: Prazo da auditoria 70% + Completude 30%.</p>}
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ── Sub-components ──

function RankingRow({ collab, position, isMe, expanded, onToggle, role, dimmed }: {
  collab: any; position: number | null; isMe: boolean; expanded: boolean;
  onToggle: () => void; role: RankingRole; dimmed?: boolean;
}) {
  const tier = getTier(collab.scoreMedio);
  return (
    <div className={cn(dimmed && "opacity-60")}>
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-muted/30",
          isMe && "bg-primary/5"
        )}
        onClick={onToggle}
      >
        {/* Position */}
        <div className="w-8 text-center shrink-0">
          {position != null ? (
            position <= 3 ? (
              <span className="text-lg">{["🥇", "🥈", "🥉"][position - 1]}</span>
            ) : (
              <span className="text-sm font-bold text-muted-foreground font-mono">{position}</span>
            )
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>

        {/* Name + tier */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {collab.nome} {isMe && <span className="text-xs text-primary">(você)</span>}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {collab.totalAvaliacoes} aval. · {tier.emoji} {tier.label}
            {collab.contingencias > 0 && (
              <span className="text-destructive ml-1">· {collab.contingencias} contingências</span>
            )}
          </p>
        </div>

        {/* Trend */}
        <TrendBadge tendencia={collab.tendencia} />

        {/* Score */}
        <div className={cn("px-3 py-1 rounded-md border text-center min-w-[60px]", scoreBg(collab.scoreMedio))}>
          <span className={cn("text-lg font-bold font-mono", scoreColor(collab.scoreMedio))}>
            {collab.scoreMedio}
          </span>
        </div>

        {/* Expand */}
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>

      {/* Drill-down */}
      {expanded && (
        <div className="px-4 pb-4 bg-muted/10">
          <DrillDown collab={collab} role={role} />
        </div>
      )}
    </div>
  );
}

function DrillDown({ collab, role }: { collab: any; role: RankingRole }) {
  const logs = collab.scoreLogs || [];

  // Group by template
  const byTemplate: Record<string, { nome: string; scores: number[]; count: number }> = {};
  logs.forEach((l: any) => {
    const tname = l.operational_assignments?.operational_templates?.nome || "—";
    const tid = l.operational_assignments?.template_id || "unknown";
    if (!byTemplate[tid]) byTemplate[tid] = { nome: tname, scores: [], count: 0 };
    if (l.score_final != null) byTemplate[tid].scores.push(Number(l.score_final));
    byTemplate[tid].count += 1;
  });

  const templates = Object.values(byTemplate).sort((a, b) => b.count - a.count);

  // Recent scores timeline
  const recent = logs
    .filter((l: any) => l.score_final != null)
    .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

  return (
    <div className="space-y-4 pt-3">
      {/* Score timeline */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Últimas Avaliações</h4>
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados.</p>
        ) : (
          <div className="space-y-1">
            {recent.map((log: any) => (
              <div key={log.id} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-muted-foreground font-mono shrink-0">
                  {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </span>
                <span className="text-muted-foreground truncate flex-1">
                  {log.operational_assignments?.operational_templates?.nome || "—"}
                </span>
                <span className={cn("font-bold font-mono w-8 text-right", scoreColor(log.score_final))}>
                  {log.score_final}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* By template */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Por Template</h4>
        {templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {templates.map((t, i) => {
              const avg = t.scores.length > 0 ? Math.round(t.scores.reduce((s, v) => s + v, 0) / t.scores.length) : 0;
              return (
                <div key={i} className="flex items-center justify-between p-2 border border-border rounded text-xs bg-card">
                  <span className="text-foreground truncate flex-1">{t.nome}</span>
                  <span className="text-muted-foreground mx-2">{t.count}x</span>
                  <span className={cn("font-bold font-mono", scoreColor(avg))}>{avg}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Score breakdown (executor only) */}
      {role === "executor" && recent.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Breakdown Médio</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {["pontualidade", "conformidade", "qualidade_evidencia", "sla_correcoes"].map((key) => {
              const vals = logs.filter((l: any) => l[key] != null).map((l: any) => Number(l[key]));
              const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
              const labels: Record<string, string> = {
                pontualidade: "Pontualidade",
                conformidade: "Conformidade",
                qualidade_evidencia: "Evidência",
                sla_correcoes: "SLA",
              };
              return (
                <div key={key} className="p-2 border border-border rounded text-center bg-card">
                  <p className="text-[10px] text-muted-foreground">{labels[key]}</p>
                  <p className={cn("text-lg font-bold font-mono", avg != null ? scoreColor(avg) : "text-muted-foreground")}>
                    {avg ?? "—"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TrendBadge({ tendencia }: { tendencia: "up" | "down" | "stable" | null }) {
  if (!tendencia) return null;
  if (tendencia === "up") return <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />;
  if (tendencia === "down") return <TrendingDown className="w-4 h-4 text-destructive shrink-0" />;
  return <Minus className="w-4 h-4 text-muted-foreground shrink-0" />;
}

function StatCard({ label, value, suffix, icon, muted }: {
  label: string; value: number | null; suffix?: string; icon: React.ReactNode; muted?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold font-mono", muted ? "text-muted-foreground" : "text-foreground")}>
        {value != null ? value : "—"}
        {value != null && suffix && <span className="text-sm font-normal ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}
