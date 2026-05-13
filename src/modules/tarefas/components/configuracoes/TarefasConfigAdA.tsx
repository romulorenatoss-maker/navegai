/**
 * Configurações → Tarefas → Avaliação do Avaliador.
 * CRUD do singleton tarefas_ada_config (perguntas padrão, anexos, SLA, pontuação).
 *
 * Não interfere no fluxo principal. É só o template global usado em PR B
 * para inicializar o snapshot de cada tarefa/rotina com AdA habilitado.
 */
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, GripVertical, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAdaConfig,
  setAdaConfig,
  newAdaPergunta,
  TAREFAS_ADA_DEFAULTS,
  type TarefasAdaConfig,
  type AdaPerguntaPadrao,
} from "@/modules/tarefas/services/tarefas_ada_config_service";

export function TarefasConfigAdA() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [cfg, setCfg] = useState<TarefasAdaConfig>(TAREFAS_ADA_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAdaConfig()
      .then(setCfg)
      .catch((e) => toast({ title: "Erro ao carregar configuração", description: String(e?.message ?? e), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  function patch<K extends keyof TarefasAdaConfig>(k: K, v: TarefasAdaConfig[K]) {
    setCfg((c) => ({ ...c, [k]: v }));
  }

  function addPergunta() {
    setCfg((c) => ({
      ...c,
      perguntas_padrao: [...c.perguntas_padrao, newAdaPergunta(c.perguntas_padrao.length)],
    }));
  }

  function updatePergunta(id: string, patch: Partial<AdaPerguntaPadrao>) {
    setCfg((c) => ({
      ...c,
      perguntas_padrao: c.perguntas_padrao.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function removePergunta(id: string) {
    setCfg((c) => ({ ...c, perguntas_padrao: c.perguntas_padrao.filter((p) => p.id !== id) }));
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await setAdaConfig(cfg, user?.id ?? null);
      setCfg(updated);
      toast({ title: "Configuração salva" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setCfg({ ...TAREFAS_ADA_DEFAULTS, id: cfg.id });
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Avaliação do Avaliador</h2>
          <p className="text-xs text-muted-foreground">
            Modelo padrão usado quando uma tarefa ou rotina marca <strong>“Avaliar também o avaliador”</strong>.
            Cada tarefa salva seu próprio snapshot editável; alterar aqui não afeta tarefas já criadas.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={resetDefaults} disabled={saving}>
            <RotateCcw className="w-4 h-4 mr-1" /> Padrões
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </header>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Perguntas padrão</h3>
          <Button variant="outline" size="sm" onClick={addPergunta}>
            <Plus className="w-4 h-4 mr-1" /> Pergunta
          </Button>
        </div>

        {cfg.perguntas_padrao.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma pergunta padrão. As tarefas começarão sem perguntas pré-preenchidas.</p>
        )}

        <div className="space-y-3">
          {cfg.perguntas_padrao.map((p) => (
            <div key={p.id} className="border rounded-md p-3 space-y-3 bg-muted/20">
              <div className="flex items-start gap-2">
                <GripVertical className="w-4 h-4 text-muted-foreground mt-2 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
                    <div>
                      <Label className="text-xs">Pergunta</Label>
                      <Input value={p.pergunta} onChange={(e) => updatePergunta(p.id, { pergunta: e.target.value })} placeholder="Ex.: A avaliação foi feita dentro do prazo?" />
                    </div>
                    <div>
                      <Label className="text-xs">Tipo de resposta</Label>
                      <Select value={p.tipo} onValueChange={(v) => updatePergunta(p.id, { tipo: v as any })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sim_nao">Sim / Não</SelectItem>
                          <SelectItem value="nota">Nota numérica</SelectItem>
                          <SelectItem value="texto">Texto livre</SelectItem>
                          <SelectItem value="escolha">Escolha única</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <label className="flex items-center gap-2">
                      <Switch checked={p.obrigatorio} onCheckedChange={(v) => updatePergunta(p.id, { obrigatorio: v })} /> Obrigatória
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch checked={p.gera_pontuacao} onCheckedChange={(v) => updatePergunta(p.id, { gera_pontuacao: v })} /> Gera pontuação
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch checked={p.gera_plano_acao} onCheckedChange={(v) => updatePergunta(p.id, { gera_plano_acao: v })} /> Gera plano de ação
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch checked={p.bloqueia_conclusao} onCheckedChange={(v) => updatePergunta(p.id, { bloqueia_conclusao: v })} /> Bloqueia conclusão
                    </label>
                  </div>

                  {p.gera_pontuacao && (
                    <div className="max-w-[200px]">
                      <Label className="text-xs">Pontos (+/-)</Label>
                      <Input type="number" value={p.pontos} onChange={(e) => updatePergunta(p.id, { pontos: Number(e.target.value) || 0 })} />
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => removePergunta(p.id)} aria-label="Remover">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <h3 className="font-medium text-sm">Anexos / Evidências</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={cfg.exige_anexo} onCheckedChange={(v) => patch("exige_anexo", v)} /> Exige anexo
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={cfg.anexo_obrigatorio} onCheckedChange={(v) => patch("anexo_obrigatorio", v)} disabled={!cfg.exige_anexo} /> Anexo obrigatório
          </label>
          <div>
            <Label className="text-xs">Tipo de anexo</Label>
            <Select value={cfg.anexo_tipo} onValueChange={(v) => patch("anexo_tipo", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="foto">Foto</SelectItem>
                <SelectItem value="video">Vídeo</SelectItem>
                <SelectItem value="documento">Documento</SelectItem>
                <SelectItem value="qualquer">Qualquer arquivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Quantidade mínima</Label>
            <Input type="number" min={0} value={cfg.anexo_quantidade_minima} onChange={(e) => patch("anexo_quantidade_minima", Number(e.target.value) || 0)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Instrução do anexo</Label>
            <Textarea rows={2} value={cfg.anexo_instrucao ?? ""} onChange={(e) => patch("anexo_instrucao", e.target.value || null)} placeholder="Ex.: anexe o print da avaliação devolvida ao executor." />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <h3 className="font-medium text-sm">SLA da Avaliação do Avaliador</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Prazo (horas)</Label>
            <Input type="number" min={1} value={cfg.prazo_horas} onChange={(e) => patch("prazo_horas", Number(e.target.value) || 1)} />
          </div>
          <div>
            <Label className="text-xs">Penalidade por atraso (pontos)</Label>
            <Input type="number" value={cfg.penalidade_atraso} onChange={(e) => patch("penalidade_atraso", Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="text-xs">Prioridade</Label>
            <Select value={cfg.prioridade} onValueChange={(v) => patch("prioridade", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Nota mínima</Label>
            <Input type="number" value={cfg.nota_minima} onChange={(e) => patch("nota_minima", Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="text-xs">Nota máxima</Label>
            <Input type="number" value={cfg.nota_maxima} onChange={(e) => patch("nota_maxima", Number(e.target.value) || 100)} />
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <Label className="text-xs">Descrição / observação interna</Label>
        <Textarea rows={2} value={cfg.descricao ?? ""} onChange={(e) => patch("descricao", e.target.value || null)} />
      </Card>
    </div>
  );
}
