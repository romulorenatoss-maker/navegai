/**
 * Subaba Configurações → Tarefas → Pontuação / SLA.
 * Configura pontos e penalidades por camada (Avaliado, Aprovador, Plano de Ação, Validador).
 * Cada camada tem seu próprio SLA e regras de penalidade.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPontuacaoConfig,
  setPontuacaoConfig,
  TAREFAS_PONTUACAO_DEFAULTS,
  type TarefasPontuacaoConfig,
  type CamadaSlaConfig,
} from "../../services/tarefas_pontuacao_config_service";

type CamadaKey = "sla_executor" | "sla_aprovador" | "sla_plano_acao" | "sla_validador";

const CAMADAS: Array<{ key: CamadaKey; titulo: string; descricao: string }> = [
  {
    key: "sla_executor",
    titulo: "Avaliado (Executor)",
    descricao: "Penalidades aplicadas ao executor da tarefa.",
  },
  {
    key: "sla_aprovador",
    titulo: "Aprovador",
    descricao: "Penalidades aplicadas ao aprovador na revisão da execução.",
  },
  {
    key: "sla_plano_acao",
    titulo: "Plano de Ação",
    descricao: "Penalidades aplicadas quando há plano de ação aberto (atraso, não conclusão).",
  },
  {
    key: "sla_validador",
    titulo: "Validador (Auditoria)",
    descricao: "Penalidades aplicadas ao validador / auditor final.",
  },
];

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

  const updCamada = (key: CamadaKey, patch: Partial<CamadaSlaConfig>) =>
    setForm((f) => ({ ...f, [key]: { ...f[key], ...patch } }));

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const disabled = !isAdmin;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pontuação / SLA — padrões globais por camada</CardTitle>
          <p className="text-xs text-muted-foreground">
            Define quantos pontos cada infração custa, por camada. Cada nova tarefa nasce com esse
            padrão e mantém um snapshot editável próprio. Alterar aqui não afeta tarefas já criadas.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Accordion type="multiple" defaultValue={["sla_executor"]} className="w-full">
            {CAMADAS.map(({ key, titulo, descricao }) => {
              const c = form[key];
              return (
                <AccordionItem key={key} value={key}>
                  <AccordionTrigger className="text-sm font-medium">
                    {titulo}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">{descricao}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="SLA (horas)">
                        <Input type="number" min={0} disabled={disabled}
                          value={c.sla_horas}
                          onChange={(e) => updCamada(key, { sla_horas: Number(e.target.value) })} />
                      </Field>
                      <Field label="Atrasou — penalidade (pts)">
                        <Input type="number" min={0} max={100} disabled={disabled}
                          value={c.penalidade_atraso}
                          onChange={(e) => updCamada(key, { penalidade_atraso: Number(e.target.value) })} />
                      </Field>
                      <Field label="Não respondeu — penalidade (pts)">
                        <Input type="number" min={0} max={100} disabled={disabled}
                          value={c.penalidade_nao_resposta}
                          onChange={(e) => updCamada(key, { penalidade_nao_resposta: Number(e.target.value) })} />
                      </Field>
                      <Field label="Não conformidade — penalidade (pts)">
                        <Input type="number" min={0} max={100} disabled={disabled}
                          value={c.penalidade_nao_conformidade}
                          onChange={(e) => updCamada(key, { penalidade_nao_conformidade: Number(e.target.value) })} />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                      <SwitchField
                        label="Permite ponderação manual"
                        hint="Auditor pode ajustar a nota automática."
                        checked={c.permite_ponderacao}
                        disabled={disabled}
                        onChange={(v) => updCamada(key, { permite_ponderacao: v })}
                      />
                      <SwitchField
                        label="Exige justificativa ao ponderar"
                        hint="Obriga texto explicando a alteração da nota."
                        checked={c.exige_justificativa_ponderacao}
                        disabled={disabled}
                        onChange={(v) => updCamada(key, { exige_justificativa_ponderacao: v })}
                      />
                      <SwitchField
                        label="Gera plano de ação automático"
                        hint="Cria plano de ação quando há não conformidade."
                        checked={c.gera_plano_acao_auto}
                        disabled={disabled}
                        onChange={(v) => updCamada(key, { gera_plano_acao_auto: v })}
                      />
                      <SwitchField
                        label="Permite reabertura"
                        hint="Permite reabrir a camada após concluída."
                        checked={c.permite_reabertura}
                        disabled={disabled}
                        onChange={(v) => updCamada(key, { permite_reabertura: v })}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

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

function SwitchField({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded border p-2">
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <div className="min-w-0">
        <Label className="text-xs">{label}</Label>
        {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
      </div>
    </div>
  );
}
