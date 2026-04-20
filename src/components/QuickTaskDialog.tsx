import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, ListChecks, Users, Sliders, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabFormBuilder } from "@/modules/operacional/components/TabFormBuilder";
import { SectionForm, FieldForm, defaultSection, getLocalToday } from "@/modules/operacional/types";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

type Step = 1 | 2 | 3;

export default function QuickTaskDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [setorId, setSetorId] = useState("");
  const [dataPrevista, setDataPrevista] = useState(getLocalToday());
  const [horarioLimite, setHorarioLimite] = useState("18:00");
  // Responsáveis
  const [avaliadoId, setAvaliadoId] = useState(""); // quem responde + recebe nota
  const [requerValidacao, setRequerValidacao] = useState(false);
  const [validadorId, setValidadorId] = useState("");
  const [requerAprovacao, setRequerAprovacao] = useState(false);
  const [aprovadorId, setAprovadorId] = useState("");

  // Step 2 state
  const [sections, setSections] = useState<SectionForm[]>([]);
  const [fields, setFields] = useState<FieldForm[]>([]);

  // Step 3 state
  const [slaHoras, setSlaHoras] = useState(24);
  const [penalidadeForaPrazo, setPenalidadeForaPrazo] = useState(20);
  const [pesoNotaMaxima, setPesoNotaMaxima] = useState(100);

  const reset = () => {
    setStep(1);
    setNome(""); setDescricao(""); setSetorId("");
    setDataPrevista(getLocalToday()); setHorarioLimite("18:00");
    setAvaliadoId("");
    setRequerValidacao(false); setValidadorId("");
    setRequerAprovacao(false); setAprovadorId("");
    setSections([]); setFields([]);
    setSlaHoras(24); setPenalidadeForaPrazo(20); setPesoNotaMaxima(100);
  };

  useEffect(() => {
    if (open) {
      reset();
      const s = defaultSection(0);
      s.nome = "Itens";
      setSections([s]);
    }
  }, [open]);

  const { data: colaboradores = [] } = useQuery({
    queryKey: ["profiles_quicktask"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: setores = [] } = useQuery({
    queryKey: ["setores_quicktask"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Tarefa "para si mesmo" → criador == avaliado
  const isSelfTask = !!profile?.id && avaliadoId === profile.id;

  // Validador: nunca pode ser o avaliado (não pode validar a si mesmo)
  const validadorOptions = useMemo(
    () => (colaboradores as any[]).filter((c) => c.id !== avaliadoId),
    [colaboradores, avaliadoId]
  );

  // Aprovador: pode ser qualquer um, INCLUSIVE o avaliado.
  // EXCEÇÃO: se a tarefa é "para si mesmo" (criador == avaliado), o aprovador NÃO pode ser o próprio.
  const aprovadorOptions = useMemo(() => {
    if (isSelfTask) return (colaboradores as any[]).filter((c) => c.id !== profile?.id);
    return colaboradores as any[];
  }, [colaboradores, isSelfTask, profile?.id]);

  const canAdvanceStep1 = nome.trim().length > 0
    && !!avaliadoId
    && !!dataPrevista
    && (!requerValidacao || (!!validadorId && validadorId !== avaliadoId))
    && (!requerAprovacao || (!!aprovadorId && (!isSelfTask || aprovadorId !== profile?.id)));

  const canAdvanceStep2 = fields.length > 0 && fields.every((f) => f.label.trim().length > 0);

  const create = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("Sessão inválida");
      if (!canAdvanceStep1) throw new Error("Preencha os dados de designação");
      if (!canAdvanceStep2) throw new Error("Adicione ao menos 1 campo com nome");

      // 1) cria template ad-hoc (recorrência única)
      const templatePayload: any = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        tipo_execucao: "checklist_inspecao",
        setor_id: setorId || null,
        responsavel_id: avaliadoId,
        recorrencia_tipo: "unica",
        data_inicio: dataPrevista,
        data_fim: dataPrevista,
        horario_inicio_previsto: "08:00",
        horario_limite_execucao: horarioLimite,
        sla_horas: slaHoras,
        penalidade_fora_prazo: penalidadeForaPrazo,
        executor_profile_id: avaliadoId,
        executor_setor_id: setorId || null,
        avaliador_profile_id: requerValidacao ? validadorId : null,
        avaliado_profile_id: avaliadoId,
        aprovador_profile_id: requerAprovacao ? aprovadorId : null,
        requer_aprovacao_gestor: requerAprovacao,
        modo_pontuacao: "pontuar_avaliado",
        destino_score: "individual",
        tipo_atribuicao_avaliado: "individual",
        habilitar_perguntas_automaticas: false,
        ativo: true,
      };

      const { data: tpl, error: tplErr } = await (supabase as any)
        .from("operational_templates").insert(templatePayload).select().single();
      if (tplErr) throw tplErr;
      const templateId = tpl.id;

      // 2) sections
      const sectionIdMap: Record<string, string> = {};
      if (sections.length > 0) {
        const { data: insSecs, error } = await (supabase as any).from("operational_template_sections").insert(
          sections.map((s, i) => ({
            template_id: templateId, nome: s.nome || `Seção ${i + 1}`, descricao: s.descricao || null,
            peso: s.peso, ordem: i, cor: s.cor,
            horario_inicio: s.horario_inicio || null, horario_fim: s.horario_fim || null,
          }))
        ).select();
        if (error) throw error;
        sections.forEach((s, i) => { sectionIdMap[s.tempId] = insSecs[i].id; });
      }

      // 3) fields
      if (fields.length > 0) {
        const { error } = await (supabase as any).from("operational_template_fields").insert(
          fields.map((f) => ({
            template_id: templateId,
            section_id: sectionIdMap[f.sectionTempId] || null,
            label: f.label || "Campo sem nome",
            descricao: f.descricao || null,
            tipo: f.tipo, ordem: f.ordem,
            obrigatorio: f.obrigatorio, peso: f.peso,
            nota_maxima: pesoNotaMaxima,
            penalidade_reprovacao: f.penalidade_reprovacao,
            impacta_score: f.impacta_score,
            criticidade: f.criticidade, gera_contingencia: f.gera_contingencia,
            exige_evidencia: f.exige_evidencia, tipo_evidencia: f.tipo_evidencia || "foto",
            opcoes: f.opcoes?.length > 0 ? f.opcoes : null,
            opcoes_regras: f.opcoes_regras?.length > 0 ? f.opcoes_regras : [],
            validacao: f.validacao, condicao_visibilidade: f.condicao_visibilidade,
            formula: f.formula,
            visivel_para: f.visivel_para, editavel_por: f.editavel_por,
            aprovador_verificar: f.aprovador_verificar || false,
            aprovador_pergunta: f.aprovador_verificar ? (f.aprovador_pergunta || null) : null,
            aprovador_tipo_resposta: f.aprovador_tipo_resposta || "conforme",
            aprovador_peso: f.aprovador_peso ?? 1,
            aprovador_obriga_observacao_nao: f.aprovador_obriga_observacao_nao ?? true,
            aprovador_exige_evidencia_nao: f.aprovador_exige_evidencia_nao ?? false,
            aprovador_tipos_evidencia: f.aprovador_tipos_evidencia || ["foto"],
          }))
        );
        if (error) throw error;
      }

      // 4) cria assignment imediato para o avaliado (executor + recebe nota)
      const assignPayload: any = {
        template_id: templateId,
        responsavel_id: avaliadoId,
        data_prevista: dataPrevista,
        horario_limite: horarioLimite || null,
        status: "pendente",
        created_by: profile.id,
        avaliador_id: requerValidacao ? validadorId : null,
        avaliado_id: avaliadoId,
        aprovador_id: requerAprovacao ? aprovadorId : null,
        setor_executor_id: setorId || null,
      };
      const { error: assignErr } = await (supabase as any)
        .from("operational_assignments").insert(assignPayload);
      if (assignErr) throw assignErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_templates"] });
      toast.success("Tarefa criada e enviada ao responsável.");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar tarefa"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-base">Nova Tarefa Individual</DialogTitle>
          {/* Stepper */}
          <div className="flex items-center gap-2 mt-3">
            {[
              { n: 1, label: "Designação", icon: Users },
              { n: 2, label: "Campos", icon: ListChecks },
              { n: 3, label: "Prazo & Notas", icon: Sliders },
            ].map((s, i) => {
              const Icon = s.icon;
              const active = step === s.n;
              const done = step > s.n;
              return (
                <div key={s.n} className="flex items-center gap-2 flex-1">
                  <div className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors flex-1",
                    active && "bg-primary text-primary-foreground border-primary",
                    done && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300/50",
                    !active && !done && "bg-muted text-muted-foreground border-border",
                  )}>
                    {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{s.label}</span>
                    <span className="sm:hidden">{s.n}</span>
                  </div>
                  {i < 2 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome da tarefa *</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Limpar entrada principal" maxLength={120} />
              </div>

              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhes (opcional)" rows={2} maxLength={500} />
              </div>

              {/* Responsáveis */}
              <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-semibold">Responsáveis</Label>
                </div>

                <div className="space-y-1.5">
                  <Label>Avaliado *</Label>
                  <Select value={avaliadoId} onValueChange={setAvaliadoId}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {(colaboradores as any[]).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Pessoa que responde a tarefa e recebe a nota.</p>
                </div>

                <div className="border-t border-border/60 pt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-sm">Validar execução antes?</Label>
                      <p className="text-[11px] text-muted-foreground">Um validador revisa a execução antes da aprovação.</p>
                    </div>
                    <Switch checked={requerValidacao} onCheckedChange={setRequerValidacao} />
                  </div>
                  {requerValidacao && (
                    <div className="space-y-1.5">
                      <Label>Validador *</Label>
                      <Select value={validadorId} onValueChange={setValidadorId} disabled={!avaliadoId}>
                        <SelectTrigger><SelectValue placeholder={avaliadoId ? "Selecionar..." : "Escolha o avaliado primeiro"} /></SelectTrigger>
                        <SelectContent>
                          {validadorOptions.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Não pode ser o próprio avaliado.</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-border/60 pt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-sm">Requer aprovação?</Label>
                      <p className="text-[11px] text-muted-foreground">Aprovador final valida a nota. Pode ser o próprio avaliado, exceto quando a tarefa é criada para si mesmo.</p>
                    </div>
                    <Switch checked={requerAprovacao} onCheckedChange={setRequerAprovacao} />
                  </div>
                  {requerAprovacao && (
                    <div className="space-y-1.5">
                      <Label>Aprovador *</Label>
                      <Select value={aprovadorId} onValueChange={setAprovadorId} disabled={!avaliadoId}>
                        <SelectTrigger><SelectValue placeholder={avaliadoId ? "Selecionar..." : "Escolha o avaliado primeiro"} /></SelectTrigger>
                        <SelectContent>
                          {aprovadorOptions.map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}{c.id === avaliadoId ? " (próprio avaliado)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isSelfTask && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">Tarefa criada para si mesmo: o aprovador não pode ser você.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Setor</Label>
                  <Select value={setorId} onValueChange={setSetorId}>
                    <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                    <SelectContent>
                      {(setores as any[]).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Data prevista *</Label>
                  <Input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Horário limite</Label>
                  <Input type="time" value={horarioLimite} onChange={(e) => setHorarioLimite(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2 text-xs text-foreground">
                Arraste para reordenar. Clique em <strong>+ Campo</strong> para adicionar. Use o ícone de engrenagem para configurar opções avançadas.
              </div>
              <TabFormBuilder
                sections={sections}
                setSections={setSections}
                fields={fields}
                setFields={setFields}
                setores={setores as any[]}
                tipoExecucao="checklist_inspecao"
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Prazo SLA (horas)</Label>
                  <Input type="number" min={1} max={720} value={slaHoras} onChange={(e) => setSlaHoras(+e.target.value || 24)} />
                  <p className="text-[10px] text-muted-foreground">Tempo para concluir após criação.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Penalidade fora do prazo (%)</Label>
                  <Input type="number" min={0} max={100} value={penalidadeForaPrazo} onChange={(e) => setPenalidadeForaPrazo(+e.target.value || 0)} />
                  <p className="text-[10px] text-muted-foreground">Desconto aplicado na nota se atrasar.</p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Nota máxima por campo</Label>
                  <Input type="number" min={1} max={1000} value={pesoNotaMaxima} onChange={(e) => setPesoNotaMaxima(+e.target.value || 100)} />
                  <p className="text-[10px] text-muted-foreground">Pontuação máxima de cada campo (padrão 100).</p>
                </div>
              </div>

              <div className="bg-muted/40 border border-border rounded-md p-3 space-y-1.5">
                <p className="text-xs font-semibold text-foreground">Resumo</p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p><strong>Tarefa:</strong> {nome || "—"}</p>
                  <p><strong>Responsável:</strong> {(colaboradores as any[]).find((c) => c.id === responsavelId)?.nome || "—"}</p>
                  <p><strong>Data:</strong> {dataPrevista} • limite {horarioLimite}</p>
                  <p><strong>Avaliada:</strong> {serAvaliado ? `Sim (${(colaboradores as any[]).find((c) => c.id === avaliadoId)?.nome} → avaliada por ${(colaboradores as any[]).find((c) => c.id === avaliadorId)?.nome})` : "Não"}</p>
                  <p><strong>Aprovação:</strong> {requerAprovacao ? (colaboradores as any[]).find((c) => c.id === aprovadorId)?.nome : "Não"}</p>
                  <p><strong>Campos:</strong> {fields.length} em {sections.length} seção(ões)</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2 shrink-0 bg-card">
          <Button
            type="button"
            variant="outline"
            onClick={() => step === 1 ? onOpenChange(false) : setStep((step - 1) as Step)}
            disabled={create.isPending}
          >
            {step === 1 ? "Cancelar" : (<><ChevronLeft className="w-4 h-4 mr-1" />Voltar</>)}
          </Button>

          {step < 3 ? (
            <Button
              type="button"
              onClick={() => setStep((step + 1) as Step)}
              disabled={(step === 1 && !canAdvanceStep1) || (step === 2 && !canAdvanceStep2)}
            >
              Avançar <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Criando…</> : <><Check className="w-4 h-4 mr-1.5" />Criar Tarefa</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
