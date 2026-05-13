/**
 * Subaba Configurações → Tarefas → Pontuação / Notas.
 * Edita valores padrão globais usados na criação de novas tarefas.
 * Snapshot por tarefa permanece editável e independente.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPontuacaoConfig,
  setPontuacaoConfig,
  TAREFAS_PONTUACAO_DEFAULTS,
  type TarefasPontuacaoConfig,
} from "../../services/tarefas_pontuacao_config_service";

export function TarefasConfigPontuacao() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<TarefasPontuacaoConfig>(TAREFAS_PONTUACAO_DEFAULTS);

  const { data, isLoading } = useQuery({
    queryKey: ["tarefas_pontuacao_config"],
    queryFn: getPontuacaoConfig,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () => setPontuacaoConfig(form, profile?.id ?? null),
    onSuccess: () => {
      toast.success("Configuração de pontuação salva.");
      qc.invalidateQueries({ queryKey: ["tarefas_pontuacao_config"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar configuração."),
  });

  const upd = <K extends keyof TarefasPontuacaoConfig>(k: K, v: TarefasPontuacaoConfig[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const disabled = !isAdmin;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pontuação / Notas — padrões globais</CardTitle>
          <p className="text-xs text-muted-foreground">
            Esses valores são carregados como padrão ao criar uma nova tarefa. Cada tarefa salva seu
            próprio snapshot editável — alterar valores aqui não afeta tarefas já criadas.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Penalidade fora do prazo (pts)">
              <Input type="number" min={0} max={100} disabled={disabled}
                value={form.penalidade_fora_prazo}
                onChange={(e) => upd("penalidade_fora_prazo", Number(e.target.value))} />
            </Field>
            <Field label="Penalidade plano de ação (pts)">
              <Input type="number" min={0} max={100} disabled={disabled}
                value={form.penalidade_contingencia}
                onChange={(e) => upd("penalidade_contingencia", Number(e.target.value))} />
            </Field>
            <Field label="Penalidade SLA plano de ação (pts)">
              <Input type="number" min={0} max={100} disabled={disabled}
                value={form.penalidade_sla_contingencia}
                onChange={(e) => upd("penalidade_sla_contingencia", Number(e.target.value))} />
            </Field>
            <Field label="Nota mínima">
              <Input type="number" min={0} max={100} disabled={disabled}
                value={form.nota_minima}
                onChange={(e) => upd("nota_minima", Number(e.target.value))} />
            </Field>
            <Field label="Nota máxima">
              <Input type="number" min={0} max={1000} disabled={disabled}
                value={form.nota_maxima}
                onChange={(e) => upd("nota_maxima", Number(e.target.value))} />
            </Field>
            <Field label="Penalidade por reprovação (pts)">
              <Input type="number" min={0} max={100} disabled={disabled}
                value={form.penalidade_reprovacao}
                onChange={(e) => upd("penalidade_reprovacao", Number(e.target.value))} />
            </Field>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t">
            <Switch checked={form.pontuacao_automatica_padrao} disabled={disabled}
              onCheckedChange={(v) => upd("pontuacao_automatica_padrao", v)} />
            <div>
              <Label className="text-sm">Usar pontuação automática como padrão</Label>
              <p className="text-xs text-muted-foreground">
                Novas tarefas iniciam com perguntas automáticas e penalidades ativas.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descrição / observações (opcional)</Label>
            <Textarea disabled={disabled} value={form.descricao ?? ""} maxLength={2000}
              onChange={(e) => upd("descricao", e.target.value || null)} />
          </div>

          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={disabled || save.isPending}>
              <Save className="w-4 h-4 mr-2" /> Salvar padrões
            </Button>
          </div>
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">
              Apenas administradores podem alterar a configuração global.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
