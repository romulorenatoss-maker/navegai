import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { TemplateForm } from "./types";
import { TIPO_EXECUCAO_LABELS } from "@/hooks/useOperationalScoring";

interface Props {
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
  setores: any[];
  colaboradores: any[];
}

type RoleConfig = {
  label: string;
  profileKey: keyof TemplateForm;
  setorKey: keyof TemplateForm;
  hint: string;
  showSetorMembers?: boolean;
};

export function TabGeral({ form, set, setores, colaboradores }: Props) {
  // Fetch colaborador_setores to know who belongs to which sector
  const { data: colaboradorSetores = [] } = useQuery({
    queryKey: ["colaborador_setores_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("colaborador_setores").select("profile_id, setor_id");
      if (error) throw error;
      return data;
    },
  });

  // Map setor_id → list of profiles in that sector
  const setorMembros = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const cs of colaboradorSetores) {
      if (!map.has(cs.setor_id)) map.set(cs.setor_id, []);
      map.get(cs.setor_id)!.push(cs.profile_id);
    }
    return map;
  }, [colaboradorSetores]);

  // Get members for any sector
  const getMembrosDoSetor = useCallback((setorId: string) => {
    if (!setorId) return [];
    const ids = setorMembros.get(setorId) || [];
    return colaboradores.filter((c: any) => ids.includes(c.id));
  }, [setorMembros, colaboradores]);

  // Get members for avaliado sector
  const avaliadoSetorMembers = useMemo(() => getMembrosDoSetor(form.avaliado_setor_id), [form.avaliado_setor_id, getMembrosDoSetor]);

  const getAssignmentMode = (profileKey: keyof TemplateForm, setorKey: keyof TemplateForm): "nome" | "setor" => {
    if (form[profileKey]) return "nome";
    if (form[setorKey]) return "setor";
    return "nome";
  };

  const handleModeChange = (profileKey: keyof TemplateForm, setorKey: keyof TemplateForm, mode: string) => {
    if (mode === "nome") {
      set(setorKey as any, "");
    } else {
      set(profileKey as any, "");
    }
  };

  const roles: RoleConfig[] = [
    { label: "Executor", profileKey: "executor_profile_id", setorKey: "executor_setor_id", hint: "Quem executa a tarefa" },
    { label: "Avaliador", profileKey: "avaliador_profile_id", setorKey: "avaliador_setor_id", hint: "Quem audita/inspeciona" },
  ];

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
          <Label>Setor da Rotina</Label>
          <Select value={form.setor_id} onValueChange={v => set("setor_id", v)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Executor e Avaliador — Nome OU Setor */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Responsáveis</p>
        {roles.map(r => {
          const mode = getAssignmentMode(r.profileKey, r.setorKey);
          return (
            <div key={r.label} className="bg-muted/50 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">{r.label} — <span className="font-normal">{r.hint}</span></p>
                <RadioGroup
                  value={mode}
                  onValueChange={v => handleModeChange(r.profileKey, r.setorKey, v)}
                  className="flex gap-3"
                >
                  <div className="flex items-center gap-1">
                    <RadioGroupItem value="nome" id={`${r.label}-nome`} className="h-3 w-3" />
                    <Label htmlFor={`${r.label}-nome`} className="text-xs cursor-pointer">Por Nome</Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <RadioGroupItem value="setor" id={`${r.label}-setor`} className="h-3 w-3" />
                    <Label htmlFor={`${r.label}-setor`} className="text-xs cursor-pointer">Por Setor</Label>
                  </div>
                </RadioGroup>
              </div>
              {mode === "nome" ? (
                <Select value={form[r.profileKey] as string} onValueChange={v => set(r.profileKey as any, v)}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Selecione colaborador" /></SelectTrigger>
                  <SelectContent>{colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <div className="space-y-2">
                  <Select value={form[r.setorKey] as string} onValueChange={v => set(r.setorKey as any, v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Selecione setor" /></SelectTrigger>
                    <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                  </Select>
                  {form[r.setorKey] && (() => {
                    const membros = getMembrosDoSetor(form[r.setorKey] as string);
                    return membros.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium">Membros do setor ({membros.length}):</p>
                        <div className="flex flex-wrap gap-1">
                          {membros.map((c: any) => (
                            <Badge key={c.id} variant="outline" className="text-[10px]">{c.nome}</Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-amber-600">Nenhum colaborador associado a este setor</p>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}

        {/* Avaliado — Setor + membros */}
        <div className="bg-muted/50 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Avaliado — <span className="font-normal">Quem recebe a nota</span></p>
            <RadioGroup
              value={form.tipo_atribuicao_avaliado}
              onValueChange={v => set("tipo_atribuicao_avaliado", v)}
              className="flex gap-3"
            >
              <div className="flex items-center gap-1">
                <RadioGroupItem value="individual" id="avaliado-individual" className="h-3 w-3" />
                <Label htmlFor="avaliado-individual" className="text-xs cursor-pointer">Individual</Label>
              </div>
              <div className="flex items-center gap-1">
                <RadioGroupItem value="setorial" id="avaliado-setorial" className="h-3 w-3" />
                <Label htmlFor="avaliado-setorial" className="text-xs cursor-pointer">Setorial</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Select value={form.avaliado_setor_id} onValueChange={v => { set("avaliado_setor_id", v); set("avaliado_profile_id", ""); }}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Selecione o setor avaliado" /></SelectTrigger>
              <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
            </Select>
            {form.avaliado_setor_id && form.tipo_atribuicao_avaliado === "individual" && (
              <div>
                {avaliadoSetorMembers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum membro associado a este setor</p>
                ) : (
                  <Select value={form.avaliado_profile_id} onValueChange={v => set("avaliado_profile_id", v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Selecione pessoa (opcional)" /></SelectTrigger>
                    <SelectContent>
                      {avaliadoSetorMembers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {avaliadoSetorMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {avaliadoSetorMembers.map((c: any) => (
                      <Badge key={c.id} variant={form.avaliado_profile_id === c.id ? "default" : "outline"} className="text-xs cursor-pointer" onClick={() => set("avaliado_profile_id", c.id)}>
                        {c.nome}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
            {form.avaliado_setor_id && form.tipo_atribuicao_avaliado === "setorial" && (
              <p className="text-xs text-muted-foreground">Nota será atribuída ao setor inteiro ({avaliadoSetorMembers.length} membro{avaliadoSetorMembers.length !== 1 ? "s" : ""})</p>
            )}
          </div>
        </div>

        {/* Aprovador */}
        <div className="bg-muted/50 rounded-lg border border-border p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Aprovador — <span className="font-normal">Aprovação final (opcional)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <Select value={form.aprovador_profile_id} onValueChange={v => set("aprovador_profile_id", v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>{colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.aprovador_setor_id} onValueChange={v => set("aprovador_setor_id", v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Setor" /></SelectTrigger>
              <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Validador Contingência */}
        <div className="bg-muted/50 rounded-lg border border-border p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Validador Contingência — <span className="font-normal">Valida contingências (opcional)</span></p>
          <div className="grid grid-cols-2 gap-3">
            <Select value={form.validador_contingencia_profile_id} onValueChange={v => set("validador_contingencia_profile_id", v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>{colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.validador_contingencia_setor_id} onValueChange={v => set("validador_contingencia_setor_id", v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Setor" /></SelectTrigger>
              <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
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
