// src/modules/tarefas/components/rotinas/RotinasTabRotina.tsx
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Save, CalendarDays, Play, RefreshCw } from "lucide-react";
import { TemplateForm, getLocalToday } from "@/modules/tarefas/types/tarefas_types";
import { cn } from "@/lib/utils";

interface Props {
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
  templateId: string | null;
  onSave: () => Promise<void>;
  saving: boolean;
}

const RECORRENCIA_LABELS: Record<string, string> = {
  unica: "Única", diaria: "Diária", semanal: "Semanal",
  mensal: "Mensal", personalizada: "Personalizada",
};
const PESO_MAP: Record<string, number> = {
  unica: 2.0, diaria: 1.0, semanal: 1.5, mensal: 3.0, personalizada: 2.0,
};
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pendente:              { label: "Pendente",       cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  em_andamento:          { label: "Em andamento",   cls: "bg-blue-100 text-blue-800 border-blue-200" },
  concluida:             { label: "Concluída",      cls: "bg-green-100 text-green-800 border-green-200" },
  aguardando_aprovacao:  { label: "Aguard. aprova", cls: "bg-purple-100 text-purple-800 border-purple-200" },
  aguardando_auditoria:  { label: "Aguard. audit",  cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  devolvida:             { label: "Devolvida",      cls: "bg-amber-100 text-amber-800 border-amber-200" },
  contingenciado:        { label: "Plano de ação",  cls: "bg-orange-100 text-orange-800 border-orange-200" },
  cancelada:             { label: "Cancelada",      cls: "bg-red-100 text-red-800 border-red-200" },
};

function gerarDatas(form: TemplateForm): Date[] {
  if (form.recorrencia_tipo === "unica") {
    if (!form.data_inicio) return [];
    const d = new Date(form.data_inicio + "T12:00:00");
    return isNaN(d.getTime()) ? [] : [d];
  }
  const now = new Date();
  const start = form.data_inicio ? new Date(form.data_inicio + "T00:00:00") : now;
  if (isNaN(start.getTime())) return [];

  const repetirSempre = !form.data_fim || form.data_fim === "";
  const endLimit = new Date(now); endLimit.setMonth(endLimit.getMonth() + 3);

  let end = endLimit;
  if (!repetirSempre && form.data_fim) {
    const dataFimParsed = new Date(form.data_fim + "T23:59:59");
    if (!isNaN(dataFimParsed.getTime())) {
      end = new Date(Math.min(dataFimParsed.getTime(), endLimit.getTime()));
    }
  }

  const dates: Date[] = [];
  const cursor = new Date(Math.max(start.getTime(), now.getTime()));
  cursor.setHours(0, 0, 0, 0);

  if (form.recorrencia_tipo === "diaria") {
    while (cursor <= end && dates.length < 50) { dates.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1); }
  } else if (form.recorrencia_tipo === "semanal") {
    const dias = form.dias_da_semana.length > 0 ? form.dias_da_semana : [1, 2, 3, 4, 5];
    while (cursor <= end && dates.length < 50) {
      if (dias.includes(cursor.getDay())) dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
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

// Formata data para chave de comparação YYYY-MM-DD
function toDateKey(d: Date): string {
  // Usa data local para evitar problema de fuso com toISOString (que converte pra UTC)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function RotinasTabRotina({ form, set, templateId, onSave, saving }: Props) {
  const qc = useQueryClient();
  const repetirSempre = !form.data_fim && form.recorrencia_tipo !== "unica";

  const dates = useMemo(() => gerarDatas(form), [
    form.recorrencia_tipo, form.dias_da_semana, form.intervalo_dias,
    form.pular_semanas, form.dia_fixo_mes, form.data_inicio,
    form.data_fim,
  ]);

  const grouped: Record<string, Date[]> = {};
  for (const d of dates) {
    const key = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    (grouped[key] ??= []).push(d);
  }

  const toggleDia = (dia: number) =>
    set("dias_da_semana", form.dias_da_semana.includes(dia)
      ? form.dias_da_semana.filter((d) => d !== dia)
      : [...form.dias_da_semana, dia].sort());

  // ── Lista de assignments gerados por este template ──
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ["rotina_assignments", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_assignments")
        .select("id, status, data_prevista, horario_inicio_previsto, created_at, responsavel_id, profiles:responsavel_id(nome)")
        .eq("template_id", templateId)
        .order("data_prevista", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  // Datas já geradas (chave YYYY-MM-DD) — usa slice para evitar problema de fuso
  const assignmentDates = useMemo(() =>
    new Set(assignments.map((a: any) =>
      a.data_prevista ? String(a.data_prevista).slice(0, 10) : null
    ).filter(Boolean)),
    [assignments]
  );

  // ── Forçar geração do 1º ciclo ──
  const gerarMutation = useMutation({
    mutationFn: async () => {
      if (!templateId) throw new Error("Salve a aba Geral primeiro.");
      if (!form.data_inicio) throw new Error("Configure a data de início antes de gerar.");

      // Data alvo: data_inicio configurada
      const dataAlvo = form.data_inicio; // formato YYYY-MM-DD
      const dataKey = dataAlvo;

      // Verifica se já existe assignment para esta data
      if (assignmentDates.has(dataKey)) {
        throw new Error("Já existe uma tarefa gerada para este dia. Remova a existente antes de gerar outra.");
      }

      // data_prevista = DATE (YYYY-MM-DD), horario = TIME (HH:MM)
      const dataPrevista = dataAlvo; // só a data, sem hora
      const horarioInicio = (form.horario_inicio_previsto || "08:00").slice(0, 5);
      const horarioLimite = (form.horario_limite_execucao || "18:00").slice(0, 5);

      // Busca o template completo para pegar executor/aprovador/auditor
      const { data: tmpl, error: tmplErr } = await (supabase as any)
        .from("operational_templates")
        .select("*")
        .eq("id", templateId)
        .single();
      if (tmplErr) throw tmplErr;

      // Busca sections e fields para montar template_snapshot
      const { data: secs } = await (supabase as any)
        .from("operational_template_sections")
        .select("*").eq("template_id", templateId).order("ordem");
      const { data: flds } = await (supabase as any)
        .from("operational_template_fields")
        .select("*").eq("template_id", templateId).order("ordem");

      const templateSnapshot = {
        nome: tmpl.nome,
        tipo_execucao: tmpl.tipo_execucao,
        sections: secs || [],
        fields: flds || [],
        ada_config_snapshot: tmpl.ada_config_snapshot,
        sla_horas: tmpl.sla_horas,
        requer_aprovacao_gestor: tmpl.requer_aprovacao_gestor,
        horario_inicio_previsto: horarioInicio,
        horario_limite_execucao: horarioLimite,
      };

      const payload: any = {
        template_id: templateId,
        status: "pendente",
        // DATE e TIME separados conforme schema real
        data_prevista: dataPrevista,
        horario_inicio_previsto: horarioInicio,
        horario_limite: horarioLimite,
        template_snapshot: templateSnapshot,
        template_versao: 1,
        rodada_atual: 1,
        // Responsáveis — nomes exatos das colunas do banco
        responsavel_id: tmpl.executor_profile_id || null,
        setor_executor_id: tmpl.executor_setor_id || null,
        avaliado_id: tmpl.avaliado_profile_id || null,
        setor_avaliado_id: tmpl.avaliado_setor_id || null,
        aprovador_id: tmpl.aprovador_profile_id || null,
        setor_aprovador_id: tmpl.aprovador_setor_id || null,
        auditor_id: tmpl.auditor_profile_id || null,
        setor_auditor_id: tmpl.auditor_setor_id || null,
      };

      const { error } = await (supabase as any)
        .from("operational_assignments")
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rotina_assignments", templateId] });
      toast.success("Tarefa gerada com sucesso.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5 p-1">
      {/* Tipo de Recorrência */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tipo de Recorrência</Label>
          <Select
            value={form.recorrencia_tipo}
            onValueChange={(v) => { set("recorrencia_tipo", v); set("peso_recorrencia", PESO_MAP[v] ?? 1.0); }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(RECORRENCIA_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Horários */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Horário Início</Label>
          <Input type="time" value={form.horario_inicio_previsto} onChange={(e) => set("horario_inicio_previsto", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Horário Limite</Label>
          <Input type="time" value={form.horario_limite_execucao} onChange={(e) => set("horario_limite_execucao", e.target.value)} />
        </div>
      </div>

      {/* Repetir sempre */}
      {form.recorrencia_tipo !== "unica" && (
        <div className="flex items-center gap-3 bg-muted/50 rounded-lg border border-border p-3">
          <Switch
            checked={repetirSempre}
            onCheckedChange={(v) => {
              if (v) {
                const t = getLocalToday();
                set("data_inicio", form.data_inicio >= t ? form.data_inicio : t);
                set("data_fim", "");
              } else {
                set("data_fim", "");
              }
            }}
          />
          <div>
            <Label className="cursor-pointer">Repetir sempre</Label>
            <p className="text-[10px] text-muted-foreground">Sem data fim.</p>
          </div>
        </div>
      )}

      {/* Datas */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Início do Ciclo</Label>
          <Input type="date" min={getLocalToday()} value={form.data_inicio}
            onChange={(e) => { const t = getLocalToday(); set("data_inicio", e.target.value >= t ? e.target.value : t); }} />
        </div>
        {!repetirSempre && (
          <div className="space-y-1.5">
            <Label>Data Fim (opcional)</Label>
            <Input type="date" value={form.data_fim} onChange={(e) => set("data_fim", e.target.value)} />
          </div>
        )}
      </div>

      {/* Dias da semana */}
      {(form.recorrencia_tipo === "semanal" || form.recorrencia_tipo === "personalizada") && (
        <div className="space-y-1.5">
          <Label>Dias da Semana</Label>
          <div className="flex gap-2 flex-wrap">
            {DIAS_SEMANA.map((d, i) => (
              <button key={i} type="button" onClick={() => toggleDia(i)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  form.dias_da_semana.includes(i)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted"
                }`}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {form.recorrencia_tipo === "personalizada" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Intervalo (dias)</Label>
            <Input type="number" min={1} value={form.intervalo_dias} onChange={(e) => set("intervalo_dias", +e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Pular Semanas</Label>
            <Input type="number" min={0} value={form.pular_semanas} onChange={(e) => set("pular_semanas", +e.target.value)} />
          </div>
        </div>
      )}

      {form.recorrencia_tipo === "mensal" && (
        <div className="space-y-1.5">
          <Label>Dia Fixo do Mês</Label>
          <Input type="number" min={1} max={31} value={form.dia_fixo_mes || ""} onChange={(e) => set("dia_fixo_mes", +e.target.value || null)} />
        </div>
      )}

      {/* SLA do executor */}
      <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
        <div className="space-y-1.5">
          <Label>SLA do Executor (horas)</Label>
          <Input type="number" min={1} value={form.sla_horas || 24} onChange={(e) => set("sla_horas", +e.target.value || 24)} />
          <p className="text-[10px] text-muted-foreground">Tempo máximo para o executor concluir.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Tolerância de Atraso (minutos)</Label>
          <Input type="number" min={0} value={form.tolerancia_minutos || 0} onChange={(e) => set("tolerancia_minutos", +e.target.value || 0)} />
          <p className="text-[10px] text-muted-foreground">Minutos extras sem penalidade.</p>
        </div>
      </div>

      {/* Preview + Botão forçar geração */}
      <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            <p className="text-sm font-medium">Preview — próximas {dates.length} ocorrências</p>
            {repetirSempre && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">∞ Sem fim</span>
            )}
          </div>
          {/* Botão forçar geração do primeiro ciclo */}
          {templateId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => gerarMutation.mutate()}
              disabled={gerarMutation.isPending || !form.data_inicio}
              className="gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              {gerarMutation.isPending ? "Gerando..." : "Forçar geração"}
            </Button>
          )}
        </div>

        {dates.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Nenhuma data gerada.</p>
        ) : (
          <div className="max-h-[200px] overflow-y-auto space-y-3 pr-1">
            {Object.entries(grouped).map(([month, monthDates]) => (
              <div key={month}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 capitalize">{month}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {monthDates.map((d, i) => {
                    const key = toDateKey(d);
                    const jaGerada = assignmentDates.has(key);
                    return (
                      <div key={i} className={cn(
                        "flex items-center gap-2 border rounded px-2 py-1.5 text-xs",
                        jaGerada ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800" : "bg-card border-border"
                      )}>
                        <span className="font-medium">{d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                        <span className="text-muted-foreground">{DIAS_FULL[d.getDay()].slice(0, 3)}</span>
                        {form.horario_inicio_previsto && (
                          <span className="text-primary font-medium ml-auto">{form.horario_inicio_previsto}</span>
                        )}
                        {jaGerada && <span className="text-green-600 dark:text-green-400 text-[10px] ml-auto">✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lista de tarefas geradas */}
      {templateId && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
            <p className="text-xs font-semibold text-foreground">Tarefas geradas por esta rotina</p>
            <button
              type="button"
              onClick={() => qc.invalidateQueries({ queryKey: ["rotina_assignments", templateId] })}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Atualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {loadingAssignments ? (
            <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>
          ) : assignments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma tarefa gerada ainda.</p>
          ) : (
            <div className="divide-y divide-border max-h-[280px] overflow-y-auto">
              {assignments.map((a: any) => {
                const badge = STATUS_BADGE[a.status] ?? { label: a.status, cls: "bg-muted text-muted-foreground border-border" };
                const raw = a.data_prevista ? String(a.data_prevista) : null;
                // data_prevista é DATE (YYYY-MM-DD), hora vem de horario_inicio_previsto (TIME HH:MM)
                const dataPrevista = raw
                  ? raw.slice(8, 10) + "/" + raw.slice(5, 7) + "/" + raw.slice(0, 4)
                  : "—";
                const horario = a.horario_inicio_previsto
                  ? String(a.horario_inicio_previsto).slice(0, 5)
                  : "";
                return (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{dataPrevista} {horario && <span className="text-primary">{horario}</span>}</p>
                      {a.profiles?.nome && (
                        <p className="text-[10px] text-muted-foreground">Executor: {a.profiles.nome}</p>
                      )}
                    </div>
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border shrink-0", badge.cls)}>
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Botão salvar */}
      <div className="flex justify-end pt-2 border-t border-border">
        <Button onClick={onSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar Rotina"}
        </Button>
      </div>
    </div>
  );
}
