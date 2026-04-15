import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TemplateForm, FieldForm } from "./types";

interface Props {
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
  fields?: FieldForm[];
}

export function TabWorkflow({ form, set, fields = [] }: Props) {
  // Only fields with aprovador_verificar enabled and a question filled
  const uniqueFields = fields
    .filter((f, i, arr) => arr.findIndex(x => x.tempId === f.tempId) === i)
    .filter(f => f.aprovador_verificar && f.aprovador_pergunta?.trim());

  const autoQuestions = [
    { label: "Tarefa executada fora do prazo?", key: "penalidade_fora_prazo" as const, pontos: form.penalidade_fora_prazo },
    { label: "Houve contingência nesta tarefa?", key: "penalidade_contingencia" as const, pontos: form.penalidade_contingencia },
    { label: "Contingência resolvida dentro do prazo?", key: "penalidade_sla_contingencia" as const, pontos: form.penalidade_sla_contingencia },
  ];

  const totalPenalidades = autoQuestions.reduce((s, q) => s + q.pontos, 0);
  const totalCampos = uniqueFields.reduce((s, f) => s + f.aprovador_peso, 0);
  const totalGeral = totalCampos + totalPenalidades;

  return (
    <div className="space-y-4">
      {/* Info sobre etapas */}
      {form.tipo_execucao === "etapas" && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
          <p className="text-caption font-medium text-primary uppercase tracking-wider">Controle Automático por Etapas</p>
          <p className="text-caption text-muted-foreground">
            Cada seção do formulário funciona como uma etapa com janela de horário. Se os campos de uma seção não forem preenchidos dentro do horário configurado, 
            a etapa e todos os campos pendentes serão automaticamente marcados como <strong className="text-destructive">atrasados</strong>.
          </p>
        </div>
      )}
      {/* Aprovação */}
      <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
        <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Aprovação</p>
        <div className="flex items-center gap-3">
          <Switch checked={form.requer_aprovacao_gestor} onCheckedChange={v => set("requer_aprovacao_gestor", v)} />
          <div>
            <Label className="cursor-pointer">Requer aprovação do gestor</Label>
            <p className="text-caption text-muted-foreground">Após avaliação, o assignment aguarda aprovação final.</p>
          </div>
        </div>
      </div>

      {/* Devolução */}
      <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
        <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Devolução</p>
        <div className="flex items-center gap-3">
          <Switch checked={form.permite_devolucao_parcial} onCheckedChange={v => set("permite_devolucao_parcial", v)} />
          <div>
            <Label className="cursor-pointer">Permitir devolução parcial por campo</Label>
            <p className="text-caption text-muted-foreground">Avaliador pode devolver campos específicos em vez do assignment inteiro.</p>
          </div>
        </div>
      </div>

      {/* Contingência */}
      <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
        <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Contingência</p>
        <div className="flex items-center gap-3">
          <Switch checked={form.gerar_contingencia_automatica} onCheckedChange={v => set("gerar_contingencia_automatica", v)} />
          <div>
            <Label className="cursor-pointer">Gerar contingência automática</Label>
            <p className="text-caption text-muted-foreground">Campos marcados como "gera contingência" criam registro automaticamente quando reprovados.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={form.bloquear_fechamento_com_contingencia} onCheckedChange={v => set("bloquear_fechamento_com_contingencia", v)} />
          <div>
            <Label className="cursor-pointer">Bloquear fechamento com contingências abertas</Label>
            <p className="text-caption text-muted-foreground">Impede conclusão enquanto houver contingências pendentes.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Prazo SLA Correção (horas)</Label>
          <Input type="number" min={1} value={form.prazo_sla_correcao_horas} onChange={e => set("prazo_sla_correcao_horas", +e.target.value)} className="max-w-[200px]" />
        </div>
      </div>

      {/* Penalidades de Gamificação */}
      <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
        <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Penalidades de Gamificação</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Penalidade fora do prazo (pontos)</Label>
            <Input type="number" min={0} max={100} value={form.penalidade_fora_prazo} onChange={e => set("penalidade_fora_prazo", +e.target.value)} className="max-w-[200px]" />
          </div>
          <div className="space-y-1.5">
            <Label>Penalidade por contingência (pontos)</Label>
            <Input type="number" min={0} max={100} value={form.penalidade_contingencia} onChange={e => set("penalidade_contingencia", +e.target.value)} className="max-w-[200px]" />
          </div>
          <div className="space-y-1.5">
            <Label>Penalidade SLA contingência (pontos)</Label>
            <Input type="number" min={0} max={100} value={form.penalidade_sla_contingencia} onChange={e => set("penalidade_sla_contingencia", +e.target.value)} className="max-w-[200px]" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch checked={form.habilitar_perguntas_automaticas} onCheckedChange={v => set("habilitar_perguntas_automaticas", v)} />
          <div>
            <Label className="cursor-pointer">Habilitar perguntas automáticas na aprovação</Label>
            <p className="text-caption text-muted-foreground">Gera automaticamente perguntas sobre prazo, contingência e SLA na aprovação final.</p>
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
              {/* 1) Perguntas automáticas primeiro */}
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

              {/* 2) Campos do formulário na ordem original */}
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
