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
  APROVADOR_PACOTE_PADRAO_DEFAULT,
  VALIDADOR_PACOTE_PADRAO_DEFAULT,
  type TarefasPontuacaoConfig,
  type CamadaSlaConfig,
  type AprovadorPerguntaPadrao,
} from "../../services/tarefas_pontuacao_config_service";
import { Badge } from "@/components/ui/badge";
import { Settings2, RotateCcw } from "lucide-react";
import { FieldConfigSheet } from "@/modules/tarefas/components/builder/FieldConfigSheet";

type CamadaKey = "sla_aprovador" | "sla_plano_acao" | "sla_validador";

const CAMADAS: Array<{ key: CamadaKey; titulo: string; descricao: string }> = [
  {
    key: "sla_aprovador",
    titulo: "Aprovador",
    descricao: "Penalidades aplicadas ao aprovador na revisão da execução. As perguntas avaliativas sobre o Executor (atraso, não conformidade, evidências) são respondidas aqui.",
  },
  {
    key: "sla_plano_acao",
    titulo: "Plano de Ação",
    descricao: "Penalidades aplicadas quando há plano de ação aberto (atraso, não conclusão).",
  },
  {
    key: "sla_validador",
    titulo: "Validador (Auditoria)",
    descricao: "Penalidades aplicadas ao validador / auditor final, que audita a atuação do Aprovador.",
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
      <PacotePadraoAprovadorCard
        items={form.aprovador_pacote_padrao ?? APROVADOR_PACOTE_PADRAO_DEFAULT}
        disabled={disabled}
        onChange={(items) => upd("aprovador_pacote_padrao", items)}
        onSave={() => save.mutate()}
        saving={save.isPending}
      />
    </div>
  );
}

function PacotePadraoAprovadorCard({
  items, disabled, onChange, onSave, saving,
}: {
  items: AprovadorPerguntaPadrao[];
  disabled: boolean;
  onChange: (next: AprovadorPerguntaPadrao[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = items.find(i => i.id === editingId) ?? null;
  const total = items.filter(i => i.ativo !== false).reduce((s, i) => s + (Number(i.peso) || 0), 0);

  const update = (id: string, patch: Partial<AprovadorPerguntaPadrao>) =>
    onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Pacote padrão do Aprovador</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Estas perguntas são carregadas automaticamente em <strong>novas rotinas</strong>,
              após as perguntas replicadas do Avaliado. Cada uma vira um item editável no snapshot da rotina.
              Alterações aqui não afetam rotinas já criadas.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Nota total ativo</div>
            <div className="text-sm font-bold text-primary">{total}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((p) => (
          <div key={p.id} className="border border-border rounded-lg bg-card p-3 flex items-start gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold shrink-0">
              {p.ordem}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-semibold bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                  AUTO
                </Badge>
                {p.ativo === false && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">INATIVA</Badge>
                )}
              </div>
              <p className="text-sm font-medium text-foreground leading-snug">{p.pergunta}</p>
              <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                <span>Tipo: <span className="text-foreground">{p.tipo}</span></span>
                <span>Nota: <span className="text-foreground font-semibold">{p.peso}</span></span>
                <span>Métrica: <span className="text-foreground">{p.metrica_calculo}</span></span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Switch
                checked={p.ativo !== false}
                disabled={disabled}
                onCheckedChange={(v) => update(p.id, { ativo: v })}
              />
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={disabled} onClick={() => setEditingId(p.id)}>
                <Settings2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}

        <div className="flex justify-between pt-2 border-t">
          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(APROVADOR_PACOTE_PADRAO_DEFAULT)}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restaurar padrões
          </Button>
          <Button onClick={onSave} disabled={disabled || saving}>
            <Save className="w-4 h-4 mr-2" /> Salvar pacote
          </Button>
        </div>
      </CardContent>

      {editing && (
        <FieldConfigSheet
          open={!!editingId}
          onOpenChange={(o) => { if (!o) setEditingId(null); }}
          title={`Configurar: ${editing.pergunta}`}
          value={{
            pergunta_padrao: editing.pergunta,
            tipo_resposta: editing.tipo,
            tipo: editing.tipo as any,
            opcoes: (editing as any).opcoes,
            regras_por_opcao: (editing as any).regras_por_opcao,
            peso: editing.peso,
            permite_ponderacao_auditor: editing.permite_ponderacao_auditor,
            exige_justificativa_ponderacao: editing.exige_justificativa_ponderacao,
          }}
          onSave={(next) => {
            const regs = next.regras_por_opcao ?? [];
            update(editing.id, {
              pergunta: next.pergunta_padrao,
              tipo: next.tipo_resposta as AprovadorPerguntaPadrao["tipo"],
              peso: next.peso,
              exige_observacao: regs.some(r => r.exige_observacao),
              exige_evidencia: regs.some(r => r.exige_evidencia),
              permite_devolucao: regs.some(r => r.permite_devolucao),
              gera_plano_acao: regs.some(r => r.gera_plano_acao),
              permite_ponderacao_auditor: next.permite_ponderacao_auditor,
              exige_justificativa_ponderacao: next.exige_justificativa_ponderacao,
              opcoes: next.opcoes,
              regras_por_opcao: next.regras_por_opcao,
            } as any);
          }}
        />
      )}
    </Card>
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
