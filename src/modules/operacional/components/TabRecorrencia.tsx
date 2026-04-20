import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TemplateForm, getLocalToday } from "./types";
import { RECORRENCIA_LABELS, DIAS_SEMANA } from "@/hooks/useOperationalScoring";

const PESO_MAP: Record<string, number> = { unica: 2.0, diaria: 1.0, semanal: 1.5, quinzenal: 2.0, mensal: 3.0, personalizada: 2.0 };
const DIAS_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function generatePreviewDates(form: TemplateForm): Date[] {
  if (form.recorrencia_tipo === "unica") {
    return form.data_inicio ? [new Date(form.data_inicio + "T12:00:00")] : [new Date()];
  }
  const now = new Date();
  const start = form.data_inicio ? new Date(form.data_inicio + "T00:00:00") : now;
  const endLimit = new Date(now); endLimit.setMonth(endLimit.getMonth() + 3);
  const end = form.data_fim && !form.repetir_sempre ? new Date(Math.min(new Date(form.data_fim + "T23:59:59").getTime(), endLimit.getTime())) : endLimit;
  const dates: Date[] = [];
  const cursor = new Date(Math.max(start.getTime(), now.getTime()));
  cursor.setHours(0, 0, 0, 0);

  if (form.recorrencia_tipo === "diaria") {
    while (cursor <= end && dates.length < 50) { dates.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
  } else if (form.recorrencia_tipo === "semanal") {
    const dias = form.dias_da_semana.length > 0 ? form.dias_da_semana : [1, 2, 3, 4, 5];
    while (cursor <= end && dates.length < 50) { if (dias.includes(cursor.getDay())) dates.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
  } else if (form.recorrencia_tipo === "mensal") {
    const diaFixo = form.dia_fixo_mes || cursor.getDate();
    const m = new Date(cursor); m.setDate(diaFixo);
    if (m < cursor) m.setMonth(m.getMonth() + 1);
    while (m <= end && dates.length < 50) { dates.push(new Date(m)); m.setMonth(m.getMonth() + 1); }
  } else if (form.recorrencia_tipo === "personalizada") {
    const dias = form.dias_da_semana.length > 0 ? form.dias_da_semana : null;
    const intervalo = form.intervalo_dias || 1;
    let weekCounter = 0, lastWeek = -1;
    while (cursor <= end && dates.length < 50) {
      const curWeek = Math.floor(cursor.getTime() / (7 * 86400000));
      if (curWeek !== lastWeek) { lastWeek = curWeek; weekCounter++; }
      const skip = form.pular_semanas > 0 && weekCounter % (form.pular_semanas + 1) !== 1;
      if (!skip && (!dias || dias.includes(cursor.getDay()))) dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + (dias ? 1 : intervalo));
    }
  }
  return dates;
}

interface Props {
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
}

export function TabRecorrencia({ form, set }: Props) {
  const dates = useMemo(() => generatePreviewDates(form), [form.recorrencia_tipo, form.dias_da_semana, form.intervalo_dias, form.pular_semanas, form.dia_fixo_mes, form.data_inicio, form.data_fim, form.repetir_sempre]);

  const toggleDia = (dia: number) => set("dias_da_semana", form.dias_da_semana.includes(dia) ? form.dias_da_semana.filter(d => d !== dia) : [...form.dias_da_semana, dia].sort());

  const grouped: Record<string, Date[]> = {};
  for (const d of dates) { const key = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); (grouped[key] ??= []).push(d); }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tipo de Recorrência</Label>
          <Select value={form.recorrencia_tipo} onValueChange={v => { set("recorrencia_tipo", v); set("peso_recorrencia", PESO_MAP[v] ?? 1.0); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(RECORRENCIA_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Horários */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Horário Início</Label>
          <Input type="time" value={form.horario_inicio_previsto} onChange={e => set("horario_inicio_previsto", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Horário Limite</Label>
          <Input type="time" value={form.horario_limite_execucao} onChange={e => set("horario_limite_execucao", e.target.value)} />
        </div>
      </div>

      {form.recorrencia_tipo !== "unica" && (
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg border border-border p-3">
          <Switch checked={form.repetir_sempre} onCheckedChange={v => { set("repetir_sempre", v); if (v) { const t = getLocalToday(); set("data_inicio", form.data_inicio >= t ? form.data_inicio : t); set("data_fim", ""); } }} />
          <div>
            <Label className="cursor-pointer">Repetir sempre</Label>
            <p className="text-caption text-muted-foreground">Sem data fim.</p>
          </div>
        </div>
      )}

      {form.repetir_sempre ? (
        <div className="space-y-1.5">
          <Label>Início do Ciclo</Label>
          <Input type="date" min={getLocalToday()} value={form.data_inicio} onChange={e => { const t = getLocalToday(); set("data_inicio", e.target.value >= t ? e.target.value : t); }} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Data Início</Label><Input type="date" value={form.data_inicio} onChange={e => set("data_inicio", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Data Fim (opcional)</Label><Input type="date" value={form.data_fim} onChange={e => set("data_fim", e.target.value)} /></div>
        </div>
      )}

      {(form.recorrencia_tipo === "semanal" || form.recorrencia_tipo === "personalizada") && (
        <div className="space-y-1.5">
          <Label>Dias da Semana</Label>
          <div className="flex gap-2 flex-wrap">
            {DIAS_SEMANA.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleDia(i)}
                className={`px-3 py-1.5 rounded-md text-caption font-medium border transition-colors ${form.dias_da_semana.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted"}`}>{d}</button>
            ))}
          </div>
        </div>
      )}
      {form.recorrencia_tipo === "personalizada" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Intervalo (dias)</Label><Input type="number" min={1} value={form.intervalo_dias} onChange={e => set("intervalo_dias", +e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Pular Semanas</Label><Input type="number" min={0} value={form.pular_semanas} onChange={e => set("pular_semanas", +e.target.value)} /></div>
        </div>
      )}
      {form.recorrencia_tipo === "mensal" && (
        <div className="space-y-1.5"><Label>Dia Fixo do Mês</Label><Input type="number" min={1} max={31} value={form.dia_fixo_mes || ""} onChange={e => set("dia_fixo_mes", +e.target.value || null)} /></div>
      )}

      {/* Preview */}
      <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Preview — próximas {dates.length} ocorrências</p>
          {form.repetir_sempre && <span className="text-caption bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">∞ Sem fim</span>}
        </div>
        {dates.length === 0 ? (
          <p className="text-caption text-muted-foreground text-center py-2">Nenhuma data gerada.</p>
        ) : (
          <div className="max-h-[200px] overflow-y-auto space-y-3 pr-1">
            {Object.entries(grouped).map(([month, monthDates]) => (
              <div key={month}>
                <p className="text-caption font-semibold text-muted-foreground uppercase tracking-wider mb-1 capitalize">{month}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {monthDates.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 bg-card border border-border rounded px-2 py-1.5 text-caption">
                      <span className="font-medium text-foreground">{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                      <span className="text-muted-foreground">{DIAS_FULL[d.getDay()].slice(0, 3)}</span>
                      {form.horario_inicio_previsto && <span className="text-primary font-medium ml-auto">{form.horario_inicio_previsto}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
