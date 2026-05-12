import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { TemplateForm, FieldForm } from "../types/tarefas_types";

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

        <div className="flex items-center gap-3">
          <Switch checked={form.habilitar_perguntas_automaticas} onCheckedChange={v => set("habilitar_perguntas_automaticas", v)} />
          <div>
            <Label className="cursor-pointer">Habilitar perguntas automáticas na aprovação</Label>
            <p className="text-caption text-muted-foreground">Gera automaticamente perguntas sobre prazo, plano de ação e SLA na aprovação final.</p>
          </div>
        </div>

        {/* Tabela unificada de pontuação */}
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
              {form.habilitar_perguntas_automaticas && autoQuestions.map((q, i) => (
                <TableRow key={`auto-${i}`} className="bg-destructive/5">
                  <TableCell className="text-center text-sm text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium">{q.label}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="destructive" className="text-xs">Automática</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-destructive">-{q.pontos}</TableCell>
                </TableRow>
              ))}

              {form.habilitar_perguntas_automaticas && (
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={3} className="text-xs font-medium text-right text-muted-foreground">Subtotal Penalidades</TableCell>
                  <TableCell className="text-right text-sm font-bold text-destructive">-{totalPenalidades}</TableCell>
                </TableRow>
              )}

              {uniqueFields.map((f, i) => {
                const idx = (form.habilitar_perguntas_automaticas ? autoQuestions.length : 0) + i + 1;
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

          {uniqueFields.length === 0 && !form.habilitar_perguntas_automaticas && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Adicione campos na aba "Formulário" para visualizar a pontuação.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
