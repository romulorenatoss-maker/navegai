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
  const scoringFields = fields.filter(f => f.impacta_score);
  const approverFields = fields.filter(f => f.aprovador_pergunta?.trim());

  const totalPesosCampos = scoringFields.reduce((s, f) => s + (f.peso * f.nota_maxima), 0);
  const totalPesosAprovador = approverFields.reduce((s, f) => s + f.aprovador_peso, 0);

  const autoQuestions = [
    { label: "Houve contingência nesta tarefa?", pontos: form.penalidade_contingencia, tipo: "Penalidade" },
    { label: "Contingência resolvida dentro do prazo?", pontos: form.penalidade_sla_contingencia, tipo: "Penalidade" },
  ];

  const totalPenalidades = form.penalidade_contingencia + form.penalidade_sla_contingencia;
  const totalGeral = totalPesosCampos + totalPesosAprovador + totalPenalidades;

  return (
    <div className="space-y-4">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <p className="text-caption text-muted-foreground">Gera automaticamente perguntas sobre contingência e SLA na tela de aprovação final.</p>
          </div>
        </div>

        {/* Resumo de pontuação */}
        <div className="border border-border rounded-lg overflow-hidden mt-4">
          <div className="bg-muted px-4 py-2">
            <p className="text-sm font-semibold">Resumo de Pontuação do Template</p>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pergunta / Campo</TableHead>
                <TableHead className="w-[100px] text-center">Tipo</TableHead>
                <TableHead className="w-[80px] text-center">Peso</TableHead>
                <TableHead className="w-[100px] text-center">Nota Máx.</TableHead>
                <TableHead className="w-[100px] text-right">Pontos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Campos que impactam score */}
              {scoringFields.length > 0 && (
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={5} className="py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                    Campos de Avaliação
                  </TableCell>
                </TableRow>
              )}
              {scoringFields.map(f => (
                <TableRow key={f.tempId}>
                  <TableCell className="text-sm">{f.label || <span className="text-muted-foreground italic">Sem nome</span>}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-xs">{f.tipo}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm">{f.peso}</TableCell>
                  <TableCell className="text-center text-sm">{f.nota_maxima}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{f.peso * f.nota_maxima}</TableCell>
                </TableRow>
              ))}
              {scoringFields.length > 0 && (
                <TableRow className="bg-muted/20">
                  <TableCell colSpan={4} className="text-sm font-medium text-right">Subtotal Campos</TableCell>
                  <TableCell className="text-right text-sm font-bold">{totalPesosCampos}</TableCell>
                </TableRow>
              )}

              {/* Perguntas do aprovador */}
              {approverFields.length > 0 && (
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={5} className="py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                    Perguntas do Aprovador
                  </TableCell>
                </TableRow>
              )}
              {approverFields.map(f => (
                <TableRow key={`apr-${f.tempId}`}>
                  <TableCell className="text-sm">{f.aprovador_pergunta}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs">Aprovador</Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm">{f.aprovador_peso}</TableCell>
                  <TableCell className="text-center text-sm">—</TableCell>
                  <TableCell className="text-right text-sm font-medium">{f.aprovador_peso}</TableCell>
                </TableRow>
              ))}
              {approverFields.length > 0 && (
                <TableRow className="bg-muted/20">
                  <TableCell colSpan={4} className="text-sm font-medium text-right">Subtotal Aprovador</TableCell>
                  <TableCell className="text-right text-sm font-bold">{totalPesosAprovador}</TableCell>
                </TableRow>
              )}

              {/* Perguntas automáticas / penalidades */}
              {form.habilitar_perguntas_automaticas && (
                <>
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={5} className="py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                      Perguntas Automáticas (Penalidades)
                    </TableCell>
                  </TableRow>
                  {autoQuestions.map((q, i) => (
                    <TableRow key={`auto-${i}`}>
                      <TableCell className="text-sm">{q.label}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="destructive" className="text-xs">{q.tipo}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">—</TableCell>
                      <TableCell className="text-center text-sm">—</TableCell>
                      <TableCell className="text-right text-sm font-medium text-destructive">-{q.pontos}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/20">
                    <TableCell colSpan={4} className="text-sm font-medium text-right">Subtotal Penalidades</TableCell>
                    <TableCell className="text-right text-sm font-bold text-destructive">-{totalPenalidades}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="text-sm font-bold text-right">Pontos Totais</TableCell>
                <TableCell className="text-right text-sm font-bold">{totalGeral}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          {fields.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Adicione campos na aba "Formulário" para visualizar a pontuação.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
