import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { TemplateForm } from "../types";
import { TIPO_EXECUCAO_LABELS } from "@/modules/operacional/hooks/useOperationalScoring";

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
  const [membrosDialogOpen, setMembrosDialogOpen] = useState(false);
  const [membrosDialogTitle, setMembrosDialogTitle] = useState("");
  const [membrosDialogList, setMembrosDialogList] = useState<any[]>([]);

  const openMembrosDialog = (title: string, membros: any[]) => {
    setMembrosDialogTitle(title);
    setMembrosDialogList(membros);
    setMembrosDialogOpen(true);
  };
  // Fetch colaborador_setores to know who belongs to which sector
  const { data: colaboradorSetores = [] } = useQuery({
    queryKey: ["operational_colaborador_setores_all"],
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
    { label: "Quem recebe a nota", profileKey: "executor_profile_id", setorKey: "executor_setor_id", hint: "Pessoa/setor que será pontuado pelas perguntas da aprovação final", showSetorMembers: true },
    { label: "Avaliador (Checklist)", profileKey: "avaliador_profile_id", setorKey: "avaliador_setor_id", hint: "Quem responde o checklist (se setor, qualquer membro pode). Administradores podem assumir este papel.", showSetorMembers: true },
  ];

  const validadorMode = getAssignmentMode("validador_contingencia_profile_id", "validador_contingencia_setor_id");

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

      {/* Responsáveis */}
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
                    <Label htmlFor={`${r.label}-nome`} className="text-xs cursor-pointer">Individual</Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <RadioGroupItem value="setor" id={`${r.label}-setor`} className="h-3 w-3" />
                    <Label htmlFor={`${r.label}-setor`} className="text-xs cursor-pointer">Setorial</Label>
                  </div>
                </RadioGroup>
              </div>
              {mode === "nome" ? (
                <>
                  <Select value={form[r.profileKey] as string} onValueChange={v => set(r.profileKey as any, v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Selecione colaborador" /></SelectTrigger>
                    <SelectContent>
                      {colaboradores
                        .filter((c: any) => {
                          // Avaliador não pode ser o mesmo que executor (quem recebe a nota) nem que avaliado
                          if (r.profileKey === "avaliador_profile_id") {
                            if (form.executor_profile_id && c.id === form.executor_profile_id) return false;
                            if (form.avaliado_profile_id && c.id === form.avaliado_profile_id) return false;
                          }
                          return true;
                        })
                        .map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {r.profileKey === "avaliador_profile_id" && form.avaliador_profile_id && (
                    (form.avaliador_profile_id === form.executor_profile_id ||
                     form.avaliador_profile_id === form.avaliado_profile_id) && (
                      <p className="text-[10px] text-destructive mt-1">O avaliador não pode ser o mesmo que recebe a nota.</p>
                    )
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <Select value={form[r.setorKey] as string} onValueChange={v => set(r.setorKey as any, v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Selecione setor" /></SelectTrigger>
                    <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                  </Select>
                  {form[r.setorKey] && (() => {
                    const membros = getMembrosDoSetor(form[r.setorKey] as string);
                    const setorNome = setores.find((s: any) => s.id === form[r.setorKey])?.nome || "Setor";
                    return membros.length > 0 ? (
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                        onClick={() => openMembrosDialog(`Membros — ${setorNome} (${r.label})`, membros)}>
                        <Users className="w-3 h-3" /> {membros.length} membro{membros.length !== 1 ? "s" : ""}
                      </Button>
                    ) : (
                      <p className="text-[10px] text-destructive">Nenhum colaborador associado</p>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}

        {/* Validador Plano de Ação — Individual OU Setorial */}
        <div className="bg-muted/50 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-muted-foreground">Validador Plano de Ação — <span className="font-normal">Quem valida e ajusta planos de ação. Administradores podem assumir este papel.</span></p>
            <RadioGroup
              value={validadorMode}
              onValueChange={v => handleModeChange("validador_contingencia_profile_id", "validador_contingencia_setor_id", v)}
              className="flex gap-3"
            >
              <div className="flex items-center gap-1">
                <RadioGroupItem value="nome" id="validador-individual" className="h-3 w-3" />
                <Label htmlFor="validador-individual" className="text-xs cursor-pointer">Individual</Label>
              </div>
              <div className="flex items-center gap-1">
                <RadioGroupItem value="setor" id="validador-setorial" className="h-3 w-3" />
                <Label htmlFor="validador-setorial" className="text-xs cursor-pointer">Setorial</Label>
              </div>
            </RadioGroup>
          </div>
          {validadorMode === "nome" ? (
            <Select value={form.validador_contingencia_profile_id} onValueChange={v => set("validador_contingencia_profile_id", v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="Selecione colaborador" /></SelectTrigger>
              <SelectContent>{colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <div className="space-y-2">
              <Select value={form.validador_contingencia_setor_id} onValueChange={v => set("validador_contingencia_setor_id", v)}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Selecione setor" /></SelectTrigger>
                <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
              </Select>
              {form.validador_contingencia_setor_id && (() => {
                const membros = getMembrosDoSetor(form.validador_contingencia_setor_id);
                const setorNome = setores.find((s: any) => s.id === form.validador_contingencia_setor_id)?.nome || "Setor";
                return membros.length > 0 ? (
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                    onClick={() => openMembrosDialog(`Membros — ${setorNome} (Validador)`, membros)}>
                    <Users className="w-3 h-3" /> {membros.length} membro{membros.length !== 1 ? "s" : ""}
                  </Button>
                ) : (
                  <p className="text-[10px] text-destructive">Nenhum colaborador associado</p>
                );
              })()}
            </div>
          )}
        </div>

        {/* Aprovador Final — Individual OU Setorial */}
        {(() => {
          const aprovadorMode = getAssignmentMode("aprovador_profile_id", "aprovador_setor_id");
          return (
            <div className="bg-muted/50 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">Aprovador Final — <span className="font-normal">Quem responde as perguntas de aprovação final para concluir a tarefa. Administradores podem assumir este papel.</span></p>
                <RadioGroup
                  value={aprovadorMode}
                  onValueChange={v => handleModeChange("aprovador_profile_id", "aprovador_setor_id", v)}
                  className="flex gap-3"
                >
                  <div className="flex items-center gap-1">
                    <RadioGroupItem value="nome" id="aprovador-individual" className="h-3 w-3" />
                    <Label htmlFor="aprovador-individual" className="text-xs cursor-pointer">Individual</Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <RadioGroupItem value="setor" id="aprovador-setorial" className="h-3 w-3" />
                    <Label htmlFor="aprovador-setorial" className="text-xs cursor-pointer">Setorial</Label>
                  </div>
                </RadioGroup>
              </div>
              {aprovadorMode === "nome" ? (
                <>
                  <Select value={form.aprovador_profile_id as string} onValueChange={v => set("aprovador_profile_id" as any, v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Selecione colaborador" /></SelectTrigger>
                    <SelectContent>
                      {colaboradores
                        .filter((c: any) => !form.avaliado_profile_id || c.id !== form.avaliado_profile_id)
                        .map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {form.avaliado_profile_id && form.aprovador_profile_id === form.avaliado_profile_id && (
                    <p className="text-[10px] text-destructive mt-1">O aprovador não pode ser o mesmo que o avaliado.</p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <Select value={form.aprovador_setor_id as string} onValueChange={v => set("aprovador_setor_id" as any, v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="Selecione setor" /></SelectTrigger>
                    <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                  </Select>
                  {form.aprovador_setor_id && (() => {
                    const membros = getMembrosDoSetor(form.aprovador_setor_id as string);
                    const setorNome = setores.find((s: any) => s.id === form.aprovador_setor_id)?.nome || "Setor";
                    return membros.length > 0 ? (
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                        onClick={() => openMembrosDialog(`Membros — ${setorNome} (Aprovador Final)`, membros)}>
                        <Users className="w-3 h-3" /> {membros.length} membro{membros.length !== 1 ? "s" : ""}
                      </Button>
                    ) : (
                      <p className="text-[10px] text-destructive">Nenhum colaborador associado</p>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })()}
      </div>


      {/* Dialog de Membros */}
      <Dialog open={membrosDialogOpen} onOpenChange={setMembrosDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{membrosDialogTitle}</DialogTitle></DialogHeader>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {membrosDialogList.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border">
                <span className="text-sm text-foreground">{c.nome}</span>
              </div>
            ))}
            {membrosDialogList.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum membro encontrado.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
