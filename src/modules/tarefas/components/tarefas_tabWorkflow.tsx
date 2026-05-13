import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Info, UserCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { TemplateForm, FieldForm } from "../types/tarefas_types";
import { supabase } from "@/integrations/supabase/client";
import { getAdaConfig } from "@/modules/tarefas/services/tarefas_ada_config_service";

const LS_DEFAULTS_KEY = "quicktask_workflow_defaults_v1";
type DefKey = "penalidade_fora_prazo" | "penalidade_contingencia" | "penalidade_sla_contingencia";
const saveDefault = (key: DefKey, value: number) => {
  try {
    const raw = localStorage.getItem(LS_DEFAULTS_KEY);
    const cur = raw ? JSON.parse(raw) : {};
    localStorage.setItem(LS_DEFAULTS_KEY, JSON.stringify({ ...cur, [key]: value }));
    toast.success(`Valor padrão salvo: ${value} pontos`);
  } catch {
    toast.error("Não foi possível salvar o valor padrão");
  }
};

interface Props {
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
  fields?: FieldForm[];
}

export function TabWorkflow({ form, set, fields = [] }: Props) {
  const aprovacaoAtiva = !!form.requer_aprovacao_gestor;

  // Perguntas automáticas agora são DERIVADAS da Designação (aprovação final).
  // Sem toggle separado: se há aprovador → habilitadas; senão → desabilitadas.
  // Mantém compatibilidade com payload (`habilitar_perguntas_automaticas`).
  useEffect(() => {
    if (form.habilitar_perguntas_automaticas !== aprovacaoAtiva) {
      set("habilitar_perguntas_automaticas" as any, aprovacaoAtiva as any);
    }
  }, [aprovacaoAtiva, form.habilitar_perguntas_automaticas, set]);

  const uniqueFields = fields
    .filter((f, i, arr) => arr.findIndex(x => x.tempId === f.tempId) === i)
    .filter(f => f.aprovador_verificar && f.aprovador_pergunta?.trim());

  const autoQuestions = [
    { label: "Tarefa executada fora do prazo?", key: "penalidade_fora_prazo" as const, pontos: form.penalidade_fora_prazo },
    { label: "Houve plano de ação nesta tarefa?", key: "penalidade_contingencia" as const, pontos: form.penalidade_contingencia },
    { label: "Plano de Ação resolvido dentro do prazo?", key: "penalidade_sla_contingencia" as const, pontos: form.penalidade_sla_contingencia },
  ];

  const totalPenalidades = autoQuestions.reduce((s, q) => s + q.pontos, 0);
  const totalCampos = uniqueFields.reduce((s, f) => s + f.aprovador_peso, 0);
  const totalGeral = totalCampos + totalPenalidades;

  if (!aprovacaoAtiva) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 p-4 rounded-lg border border-border bg-muted/40">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Sem aprovação final configurada</p>
            <p className="text-xs mt-1">
              Esta tarefa não terá pontuação, penalidades, perguntas automáticas nem SLA de aprovação.
              Para habilitar, ative <strong>"Aprovação final e pontuação"</strong> na etapa <strong>Designação</strong>.
            </p>
          </div>
        </div>
        <AdaSection form={form} set={set} />
      </div>
    );
  }


  return (
    <div className="space-y-4">

      {/* Perguntas de Aprovação Final */}
      <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
        <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Perguntas de Aprovação Final</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            { key: "penalidade_fora_prazo" as const, label: "Penalidade fora do prazo (pontos)" },
            { key: "penalidade_contingencia" as const, label: "Penalidade por plano de ação (pontos)" },
            { key: "penalidade_sla_contingencia" as const, label: "Penalidade SLA plano de ação (pontos)" },
          ]).map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <Label>{label}</Label>
              <div className="flex items-center gap-1.5 max-w-[240px]">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form[key]}
                  onChange={e => set(key, +e.target.value)}
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" title="Salvar como valor padrão">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 space-y-2">
                    <p className="text-sm font-semibold">Valor padrão</p>
                    <p className="text-xs text-muted-foreground">
                      Salvar <strong>{form[key]} pontos</strong> como valor padrão para novas tarefas individuais.
                    </p>
                    <Button type="button" size="sm" className="w-full" onClick={() => saveDefault(key, form[key] as number)}>
                      Salvar como padrão
                    </Button>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ))}
        </div>

        {/* Tabela unificada — perguntas automáticas sempre presentes (derivado da Designação) */}
        <div className="border border-border rounded-lg overflow-hidden mt-4">
          <div className="bg-muted px-4 py-2">
            <p className="text-sm font-semibold">Resumo de Pontuação do Template</p>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] text-center">#</TableHead>
                <TableHead>Pergunta / Campo</TableHead>
                <TableHead className="w-[100px] text-center">Tipo</TableHead>
                <TableHead className="w-[100px] text-right">Pontos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {autoQuestions.map((q, i) => (
                <TableRow key={`auto-${i}`} className="bg-destructive/5">
                  <TableCell className="text-center text-sm text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium">{q.label}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="destructive" className="text-xs">Automática</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-destructive">-{q.pontos}</TableCell>
                </TableRow>
              ))}

              <TableRow className="bg-muted/30">
                <TableCell colSpan={3} className="text-xs font-medium text-right text-muted-foreground">Subtotal Penalidades</TableCell>
                <TableCell className="text-right text-sm font-bold text-destructive">-{totalPenalidades}</TableCell>
              </TableRow>

              {uniqueFields.map((f, i) => {
                const idx = autoQuestions.length + i + 1;
                return (
                  <TableRow key={f.tempId}>
                    <TableCell className="text-center text-sm text-muted-foreground">{idx}</TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{f.aprovador_pergunta}</div>
                      <div className="text-xs text-muted-foreground">Campo: {f.label}</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs">Aprovador</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">{f.aprovador_peso}</TableCell>
                  </TableRow>
                );
              })}

              {uniqueFields.length > 0 && (
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={3} className="text-xs font-medium text-right text-muted-foreground">Subtotal Campos</TableCell>
                  <TableCell className="text-right text-sm font-bold">{totalCampos}</TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-sm font-bold text-right">Pontos Totais</TableCell>
                <TableCell className="text-right text-sm font-bold">{totalGeral}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          {uniqueFields.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Adicione perguntas para o aprovador na aba "Formulário" para somar pontos além das penalidades automáticas.
            </div>
          )}
        </div>
      </div>

      <AdaSection form={form} set={set} />
    </div>
  );
}

// Avaliação do Avaliador (AdA) — seção embutida.
interface AdaProps {
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
}

function AdaSection({ form, set }: AdaProps) {
  const [colaboradores, setColaboradores] = useState<Array<{ id: string; nome: string }>>([]);
  const [setores, setSetores] = useState<Array<{ id: string; nome: string }>>([]);
  const [snapshotInfo, setSnapshotInfo] = useState<string>("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [{ data: profs }, { data: sets }] = await Promise.all([
        supabase.from("profiles").select("id, nome").order("nome"),
        supabase.from("setores").select("id, nome").eq("ativo", true).order("nome"),
      ]);
      if (cancel) return;
      setColaboradores((profs ?? []) as any);
      setSetores((sets ?? []) as any);
    })();
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (!form.ada_enabled) return;
    if (form.ada_config_snapshot) {
      const snap: any = form.ada_config_snapshot;
      const qtd = Array.isArray(snap?.perguntas_padrao) ? snap.perguntas_padrao.length : 0;
      setSnapshotInfo(`Snapshot carregado: ${qtd} pergunta(s), prazo ${snap?.prazo_horas ?? "?"}h.`);
      return;
    }
    getAdaConfig().then((cfg) => {
      set("ada_config_snapshot" as any, cfg as any);
      setSnapshotInfo(`Snapshot inicial: ${cfg.perguntas_padrao.length} pergunta(s) padrão, prazo ${cfg.prazo_horas}h.`);
      if (!form.ada_gerar_em) set("ada_gerar_em" as any, "pos_avaliacao" as any);
      if (!form.ada_quem_avalia_tipo) set("ada_quem_avalia_tipo" as any, "responsavel_padrao" as any);
    }).catch(() => setSnapshotInfo("Não foi possível carregar a configuração padrão."));
  }, [form.ada_enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-muted/40 rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <UserCheck className="w-4 h-4 text-primary mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Avaliação do Avaliador</p>
            <p className="text-xs text-muted-foreground">
              Após a tarefa principal, gera automaticamente uma avaliação para quem avaliou. Configure o padrão em
              <strong> Configurações → Tarefas → Avaliação do Avaliador</strong>.
            </p>
          </div>
        </div>
        <Switch
          checked={form.ada_enabled}
          onCheckedChange={(v) => set("ada_enabled" as any, v as any)}
          aria-label="Avaliar também o avaliador"
        />
      </div>

      {form.ada_enabled && (
        <div className="space-y-3 pt-2 border-t">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Quando gerar</Label>
              <Select
                value={form.ada_gerar_em || "pos_avaliacao"}
                onValueChange={(v) => set("ada_gerar_em" as any, v as any)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pos_avaliacao">Após avaliação concluída</SelectItem>
                  <SelectItem value="pos_aprovacao">Após aprovação final</SelectItem>
                  <SelectItem value="pos_plano_acao">Após plano de ação respondido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Quem avalia o avaliador</Label>
              <Select
                value={form.ada_quem_avalia_tipo || "responsavel_padrao"}
                onValueChange={(v) => {
                  set("ada_quem_avalia_tipo" as any, v as any);
                  if (v !== "pessoa") set("ada_quem_avalia_profile_id" as any, "" as any);
                  if (v !== "setor") set("ada_quem_avalia_setor_id" as any, "" as any);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pessoa">Pessoa específica</SelectItem>
                  <SelectItem value="setor">Setor</SelectItem>
                  <SelectItem value="administrador">Administrador (qualquer admin)</SelectItem>
                  <SelectItem value="responsavel_padrao">Responsável padrão (aprovador / criador)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.ada_quem_avalia_tipo === "pessoa" && (
              <div className="sm:col-span-2">
                <Label className="text-xs">Selecionar pessoa</Label>
                <Select
                  value={form.ada_quem_avalia_profile_id || ""}
                  onValueChange={(v) => set("ada_quem_avalia_profile_id" as any, v as any)}
                >
                  <SelectTrigger><SelectValue placeholder="Escolha um colaborador…" /></SelectTrigger>
                  <SelectContent>
                    {colaboradores.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.ada_quem_avalia_tipo === "setor" && (
              <div className="sm:col-span-2">
                <Label className="text-xs">Selecionar setor</Label>
                <Select
                  value={form.ada_quem_avalia_setor_id || ""}
                  onValueChange={(v) => set("ada_quem_avalia_setor_id" as any, v as any)}
                >
                  <SelectTrigger><SelectValue placeholder="Escolha um setor…" /></SelectTrigger>
                  <SelectContent>
                    {setores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {snapshotInfo && <p className="text-xs text-muted-foreground">{snapshotInfo}</p>}
          <p className="text-[11px] text-muted-foreground">
            O responsável definido aqui é gravado diretamente no registro da tarefa-filha gerada. Se for "setor" ou
            "administrador", a tarefa-filha fica disponível para qualquer membro elegível atender.
          </p>
        </div>
      )}
    </div>
  );
}
