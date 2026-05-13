import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users } from "lucide-react";
import { TemplateForm } from "../types/tarefas_types";
import {
  TarefasResponsaveisBlocks,
  type RespBlocksValue,
  type RespValue,
} from "@/modules/tarefas/components/responsaveis/TarefasResponsaveisBlocks";

interface Props {
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
  setores: any[];
  colaboradores: any[];
}

// Tipo de execução: somente 2 opções (Tarefa simples / Por etapas).
const EXEC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "tarefa_simples", label: "Tarefa simples" },
  { value: "etapas", label: "Por etapas (mais de um agrupador)" },
];

// Mapeia colunas legacy do TemplateForm para o shape do componente de blocos.
function buildRespFromForm(form: TemplateForm): RespBlocksValue {
  const make = (profileId: string, setorId: string): RespValue => {
    if (profileId) return { mode: "individual", profileIds: [profileId], setorId: "" };
    if (setorId) return { mode: "setorial", profileIds: [], setorId };
    return { mode: "individual", profileIds: [], setorId: "" };
  };
  return {
    avaliado: make(form.executor_profile_id, form.executor_setor_id),
    // Bloco 2 (Avaliador) = fusão; lê de avaliador_* (validador_contingencia_* recebe espelho ao salvar).
    avaliador: make(form.avaliador_profile_id, form.avaliador_setor_id),
    aprovador: make(form.aprovador_profile_id, form.aprovador_setor_id),
    validadorFinal: form.ada_quem_avalia_tipo === "pessoa"
      ? { mode: "individual", profileIds: form.ada_quem_avalia_profile_id ? [form.ada_quem_avalia_profile_id] : [], setorId: "" }
      : form.ada_quem_avalia_tipo === "setor"
      ? { mode: "setorial", profileIds: [], setorId: form.ada_quem_avalia_setor_id || "" }
      : { mode: "individual", profileIds: [], setorId: "" },
  };
}

export function TabGeral({ form, set, setores, colaboradores }: Props) {
  // Vínculos colaborador↔setor para filtrar Avaliado pelo setor da rotina.
  const { data: colaboradorSetores = [] } = useQuery({
    queryKey: ["operational_colaborador_setores_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("colaborador_setores").select("profile_id, setor_id");
      if (error) throw error;
      return data || [];
    },
  });

  // Estado dos blocos: mantém também cliques de modo ainda sem seleção
  // (ex.: Setorial antes de escolher o setor), que não existem nas colunas legacy.
  const formBlocks = useMemo(() => buildRespFromForm(form), [
    form.executor_profile_id, form.executor_setor_id,
    form.avaliador_profile_id, form.avaliador_setor_id,
    form.aprovador_profile_id, form.aprovador_setor_id,
    form.ada_quem_avalia_tipo, form.ada_quem_avalia_profile_id, form.ada_quem_avalia_setor_id,
  ]);
  const formBlocksSignature = useMemo(() => JSON.stringify(formBlocks), [formBlocks]);
  const [blocks, setBlocks] = useState<RespBlocksValue>(formBlocks);

  useEffect(() => {
    setBlocks(formBlocks);
  }, [formBlocksSignature]);

  // Setor da rotina derivado do Avaliado (igual à tela avulsa).
  const derivedSetorId = useMemo(() => {
    const av = blocks.avaliado;
    if (av.mode === "setorial") return av.setorId || "";
    const pid = av.profileIds[0];
    if (!pid) return "";
    const link = (colaboradorSetores as any[]).find((cs) => cs.profile_id === pid);
    return link?.setor_id || "";
  }, [blocks.avaliado, colaboradorSetores]);

  useEffect(() => {
    if (derivedSetorId && derivedSetorId !== form.setor_id) {
      set("setor_id" as any, derivedSetorId as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivedSetorId]);

  const handleBlocksChange = (next: RespBlocksValue) => {
    setBlocks(next);

    // Bloco 1 — Avaliado → executor_*
    set("executor_profile_id" as any, (next.avaliado.mode === "individual" ? (next.avaliado.profileIds[0] || "") : "") as any);
    set("executor_setor_id" as any, (next.avaliado.mode === "setorial" ? next.avaliado.setorId : "") as any);
    // mantém compatibilidade com avaliado_* (mesma pessoa que executa)
    set("avaliado_profile_id" as any, (next.avaliado.mode === "individual" ? (next.avaliado.profileIds[0] || "") : "") as any);
    set("avaliado_setor_id" as any, (next.avaliado.mode === "setorial" ? next.avaliado.setorId : "") as any);


    // Bloco 2 — Avaliador (Plano de Ação) → fusão: avaliador_* + validador_contingencia_*
    const a2pid = next.avaliador.mode === "individual" ? (next.avaliador.profileIds[0] || "") : "";
    const a2sid = next.avaliador.mode === "setorial" ? next.avaliador.setorId : "";
    set("avaliador_profile_id" as any, a2pid as any);
    set("avaliador_setor_id" as any, a2sid as any);
    set("validador_contingencia_profile_id" as any, a2pid as any);
    set("validador_contingencia_setor_id" as any, a2sid as any);

    // Bloco 3 — Aprovador
    set("aprovador_profile_id" as any, (next.aprovador.mode === "individual" ? (next.aprovador.profileIds[0] || "") : "") as any);
    set("aprovador_setor_id" as any, (next.aprovador.mode === "setorial" ? next.aprovador.setorId : "") as any);
    // requer_aprovacao_gestor segue presença de aprovador
    const aprFilled = (next.aprovador.mode === "individual" && next.aprovador.profileIds.length > 0)
      || (next.aprovador.mode === "setorial" && !!next.aprovador.setorId);
    set("requer_aprovacao_gestor" as any, aprFilled as any);

    // Bloco 4 — Validador Final → ada_*
    const vfFilled = (next.validadorFinal.mode === "individual" && next.validadorFinal.profileIds.length > 0)
      || (next.validadorFinal.mode === "setorial" && !!next.validadorFinal.setorId);
    set("ada_enabled" as any, vfFilled as any);
    if (vfFilled) {
      set("ada_quem_avalia_tipo" as any, (next.validadorFinal.mode === "individual" ? "pessoa" : "setor") as any);
      set("ada_quem_avalia_profile_id" as any, (next.validadorFinal.mode === "individual" ? (next.validadorFinal.profileIds[0] || "") : "") as any);
      set("ada_quem_avalia_setor_id" as any, (next.validadorFinal.mode === "setorial" ? next.validadorFinal.setorId : "") as any);
      if (!form.ada_gerar_em) set("ada_gerar_em" as any, "pos_avaliacao" as any);
    } else {
      set("ada_quem_avalia_tipo" as any, "" as any);
      set("ada_quem_avalia_profile_id" as any, "" as any);
      set("ada_quem_avalia_setor_id" as any, "" as any);
    }
  };

  // Normaliza tipo_execucao legacy ("checklist_inspecao") para "etapas" no display
  // (não regrava no banco até o usuário salvar).
  const displayedExec = form.tipo_execucao === "tarefa_simples" ? "tarefa_simples" : "etapas";
  useEffect(() => {
    if (form.tipo_execucao !== "tarefa_simples" && form.tipo_execucao !== "etapas") {
      set("tipo_execucao" as any, "etapas" as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nome da Rotina *</Label>
        <Input value={form.nome} onChange={e => set("nome", e.target.value)} required placeholder="Ex: Inspeção de equipamentos" maxLength={255} />
      </div>
      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Textarea value={form.descricao} onChange={e => set("descricao", e.target.value)} placeholder="Detalhes da rotina..." maxLength={1000} />
      </div>
      <div className="space-y-1.5">
        <Label>Tipo de Execução</Label>
        <Select value={displayedExec} onValueChange={v => set("tipo_execucao", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {EXEC_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          "Por etapas" significa mais de um agrupador/bloco de perguntas. O setor da rotina é definido automaticamente pelo Avaliado.
        </p>
      </div>


      {/* Responsáveis — mesmo padrão visual da tela avulsa */}
      <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <Label className="text-sm font-semibold">Responsáveis</Label>
        </div>
        <TarefasResponsaveisBlocks
          value={blocks}
          onChange={handleBlocksChange}
          setores={setores}
          colaboradores={colaboradores}
          colaboradorSetores={colaboradorSetores as any}
          multiPersistWarning="Apenas o primeiro colaborador será gravado nesta versão (sem migration). Para gravar múltiplos, será necessária uma migração futura."
        />
      </div>
    </div>
  );
}
