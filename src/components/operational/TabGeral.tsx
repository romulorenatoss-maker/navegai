import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TemplateForm } from "./types";
import { TIPO_EXECUCAO_LABELS } from "@/hooks/useOperationalScoring";

interface Props {
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
  setores: any[];
  colaboradores: any[];
}

export function TabGeral({ form, set, setores, colaboradores }: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nome da Rotina *</Label>
        <Input value={form.nome} onChange={e => set("nome", e.target.value)} required placeholder="Ex: Inspeção de equipamentos" maxLength={255} />
      </div>
      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Textarea value={form.descricao} onChange={e => set("descricao", e.target.value)} placeholder="Detalhes da rotina..." maxLength={1000} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Tipo de Execução</Label>
          <Select value={form.tipo_execucao} onValueChange={v => set("tipo_execucao", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(TIPO_EXECUCAO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Setor</Label>
          <Select value={form.setor_id} onValueChange={v => set("setor_id", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Responsáveis */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Responsáveis</p>
        {[
          { label: "Executor", profileKey: "executor_profile_id" as const, setorKey: "executor_setor_id" as const, hint: "Quem executa a tarefa" },
          { label: "Avaliador", profileKey: "avaliador_profile_id" as const, setorKey: "avaliador_setor_id" as const, hint: "Quem audita/inspeciona" },
          { label: "Avaliado", profileKey: "avaliado_profile_id" as const, setorKey: "avaliado_setor_id" as const, hint: "Quem recebe a nota" },
          { label: "Aprovador", profileKey: "aprovador_profile_id" as const, setorKey: "aprovador_setor_id" as const, hint: "Aprovação final (opcional)" },
          { label: "Validador Contingência", profileKey: "validador_contingencia_profile_id" as const, setorKey: "validador_contingencia_setor_id" as const, hint: "Valida contingências (opcional)" },
        ].map(r => (
          <div key={r.label} className="bg-muted/50 rounded-lg border border-border p-3">
            <p className="text-caption font-medium text-muted-foreground mb-2">{r.label} — <span className="font-normal">{r.hint}</span></p>
            <div className="grid grid-cols-2 gap-3">
              <Select value={form[r.profileKey]} onValueChange={v => set(r.profileKey, v)}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Colaborador" /></SelectTrigger>
                <SelectContent>{colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form[r.setorKey]} onValueChange={v => set(r.setorKey, v)}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Setor" /></SelectTrigger>
                <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>

      {/* Pontuação */}
      <div className="bg-muted/50 rounded-lg border border-border p-3 space-y-3">
        <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Pontuação</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Quem pontuar</Label>
            <Select value={form.modo_pontuacao} onValueChange={v => set("modo_pontuacao", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pontuar_executor">Somente Executor</SelectItem>
                <SelectItem value="pontuar_avaliado">Somente Avaliado</SelectItem>
                <SelectItem value="pontuar_ambos">Ambos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Destino do Score</Label>
            <Select value={form.destino_score} onValueChange={v => set("destino_score", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="setor">Setorial</SelectItem>
                <SelectItem value="executor_avaliado">Executor + Avaliado</SelectItem>
                <SelectItem value="ambos">Ambos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* SLA / Horários */}
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label>Horário Início</Label>
          <Input type="time" value={form.horario_inicio_previsto} onChange={e => set("horario_inicio_previsto", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Horário Limite</Label>
          <Input type="time" value={form.horario_limite_execucao} onChange={e => set("horario_limite_execucao", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Tolerância (min)</Label>
          <Input type="number" min={0} value={form.tolerancia_minutos} onChange={e => set("tolerancia_minutos", +e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>SLA (horas)</Label>
          <Input type="number" min={1} value={form.sla_horas} onChange={e => set("sla_horas", +e.target.value)} />
        </div>
      </div>
    </div>
  );
}
