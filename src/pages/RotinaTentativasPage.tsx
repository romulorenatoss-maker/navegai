import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings, Save, Loader2, Plus, Trash2 } from "lucide-react";

interface RotinaTentativa {
  id: string;
  tentativa_numero: number;
  dias_apos_anterior: number;
  periodo_contato: string;
  prioridade: string;
  ativo: boolean;
}

interface ConfigFluxo {
  id: string;
  quantidade_tentativas: number;
  acao_quando_atrasar: string;
  acao_apos_finalizar_tentativas: string;
  permitir_reiniciar_rotina: boolean;
  tipo_servico_conversao_id: string | null;
}

const PERIODO_LABELS: Record<string, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
const PRIORIDADE_LABELS: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const PRIORIDADE_COLORS: Record<string, string> = {
  alta: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  media: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  baixa: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

export default function RotinaTentativasPage() {
  const queryClient = useQueryClient();
  const [localTentativas, setLocalTentativas] = useState<Omit<RotinaTentativa, "id">[]>([]);
  const [localConfig, setLocalConfig] = useState<Omit<ConfigFluxo, "id"> | null>(null);

  const { data: tiposServico = [] } = useQuery({
    queryKey: ["tipos_servico_rotina"],
    queryFn: async () => {
      const { data } = await supabase.from("tipos_servico").select("id, nome").eq("ativo", true).order("nome");
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: tentativas = [], isLoading: loadingTentativas } = useQuery({
    queryKey: ["rotina-tentativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotina_tentativas_leads")
        .select("*")
        .order("tentativa_numero", { ascending: true });
      if (error) throw error;
      return data as RotinaTentativa[];
    },
  });

  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ["config-fluxo-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_fluxo_leads")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data as ConfigFluxo;
    },
  });

  useEffect(() => {
    if (tentativas.length > 0) {
      setLocalTentativas(tentativas.map(({ id, ...rest }) => rest));
    }
  }, [tentativas]);

  useEffect(() => {
    if (config) {
      const { id, ...rest } = config;
      setLocalConfig(rest);
    }
  }, [config]);

  const handleQtdChange = (newQtd: number) => {
    if (!localConfig) return;
    const clamped = Math.max(1, Math.min(20, newQtd));
    setLocalConfig({ ...localConfig, quantidade_tentativas: clamped });

    const current = [...localTentativas];
    if (clamped > current.length) {
      for (let i = current.length + 1; i <= clamped; i++) {
        current.push({
          tentativa_numero: i,
          dias_apos_anterior: 1,
          periodo_contato: "manha",
          prioridade: "media",
          ativo: true,
        });
      }
    } else {
      current.splice(clamped);
    }
    setLocalTentativas(current);
  };

  const updateTentativa = (idx: number, field: string, value: any) => {
    setLocalTentativas((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!localConfig || !config) throw new Error("Configuração não carregada.");

      // Update config
      const { error: e1 } = await supabase
        .from("configuracao_fluxo_leads")
        .update({
          quantidade_tentativas: localConfig.quantidade_tentativas,
          acao_quando_atrasar: localConfig.acao_quando_atrasar,
          acao_apos_finalizar_tentativas: localConfig.acao_apos_finalizar_tentativas,
          permitir_reiniciar_rotina: localConfig.permitir_reiniciar_rotina,
          tipo_servico_conversao_id: localConfig.tipo_servico_conversao_id,
        } as any)
        .eq("id", config.id);
      if (e1) throw e1;

      // Delete all existing tentativas and re-insert
      const { error: e2 } = await supabase
        .from("rotina_tentativas_leads")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // delete all
      if (e2) throw e2;

      const rows = localTentativas.map((t, i) => ({
        tentativa_numero: i + 1,
        dias_apos_anterior: t.dias_apos_anterior,
        periodo_contato: t.periodo_contato,
        prioridade: t.prioridade,
        ativo: t.ativo,
      }));

      if (rows.length > 0) {
        const { error: e3 } = await supabase.from("rotina_tentativas_leads").insert(rows);
        if (e3) throw e3;
      }
    },
    onSuccess: () => {
      toast.success("Configuração salva com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["rotina-tentativas"] });
      queryClient.invalidateQueries({ queryKey: ["config-fluxo-leads"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const loading = loadingTentativas || loadingConfig;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5" /> Configuração da Rotina de Tentativas
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure a cadência de tentativas de contato para leads.
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Carregando...</div>
      ) : (
        <>
          {/* Config Fluxo */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Configurações do Fluxo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Quantidade de Tentativas</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={localConfig?.quantidade_tentativas || 7}
                    onChange={(e) => handleQtdChange(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Ação quando atrasar</Label>
                  <div className="space-y-2 pt-1">
                    {[
                      { value: "registrar_atraso", label: "Registrar Atraso" },
                      { value: "notificar_avaliador", label: "Notificar Avaliador (mostrar no Dashboard)" },
                    ].map((opt) => {
                      const currentValues = (localConfig?.acao_quando_atrasar || "").split(",").filter(Boolean);
                      const isChecked = currentValues.includes(opt.value);
                      return (
                        <div key={opt.value} className="flex items-center gap-2">
                          <Checkbox
                            id={`acao-atraso-${opt.value}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (!localConfig) return;
                              let next: string[];
                              if (checked) {
                                next = [...currentValues, opt.value];
                              } else {
                                next = currentValues.filter((v) => v !== opt.value);
                              }
                              if (next.length === 0) next = ["registrar_atraso"];
                              setLocalConfig({ ...localConfig, acao_quando_atrasar: next.join(",") });
                            }}
                          />
                          <Label htmlFor={`acao-atraso-${opt.value}`} className="text-sm font-normal cursor-pointer">
                            {opt.label}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Ação após finalizar tentativas</Label>
                  <Select
                    value={localConfig?.acao_apos_finalizar_tentativas || "enviar_avaliador"}
                    onValueChange={(v) => localConfig && setLocalConfig({ ...localConfig, acao_apos_finalizar_tentativas: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enviar_avaliador">Enviar ao Avaliador</SelectItem>
                      <SelectItem value="arquivar_lead">Arquivar Lead</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <Switch
                    checked={localConfig?.permitir_reiniciar_rotina ?? true}
                    onCheckedChange={(v) => localConfig && setLocalConfig({ ...localConfig, permitir_reiniciar_rotina: v })}
                  />
                  <Label>Permitir reiniciar rotina</Label>
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de Serviço na Conversão de Lead</Label>
                  <Select
                    value={localConfig?.tipo_servico_conversao_id || ""}
                    onValueChange={(v) => localConfig && setLocalConfig({ ...localConfig, tipo_servico_conversao_id: v || null })}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione o tipo de serviço" /></SelectTrigger>
                    <SelectContent>
                      {tiposServico.map((ts: any) => (
                        <SelectItem key={ts.id} value={ts.id}>{ts.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Define qual checklist será usado na OS criada ao converter um lead em cliente.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tentativas Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Tabela de Tentativas
                <Badge variant="secondary" className="text-xs">{localTentativas.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Tentativa</TableHead>
                      <TableHead>Dias após anterior</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead className="w-16">Ativo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {localTentativas.map((t, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-center">{idx + 1}ª</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="w-20"
                            value={t.dias_apos_anterior}
                            onChange={(e) => updateTentativa(idx, "dias_apos_anterior", parseInt(e.target.value) || 0)}
                          />
                        </TableCell>
                        <TableCell>
                          <Select value={t.periodo_contato} onValueChange={(v) => updateTentativa(idx, "periodo_contato", v)}>
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manha">Manhã</SelectItem>
                              <SelectItem value="tarde">Tarde</SelectItem>
                              <SelectItem value="noite">Noite</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={t.prioridade} onValueChange={(v) => updateTentativa(idx, "prioridade", v)}>
                            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="alta">Alta</SelectItem>
                              <SelectItem value="media">Média</SelectItem>
                              <SelectItem value="baixa">Baixa</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={t.ativo}
                            onCheckedChange={(v) => updateTentativa(idx, "ativo", v)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="press-effect">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar Configuração
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
