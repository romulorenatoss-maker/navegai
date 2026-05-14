import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users } from "lucide-react";
import { TemplateForm, SectionForm, StepForm } from "../types/tarefas_types";
import {
  TarefasResponsaveisV2,
  emptyRespBlocksV2,
  type RespBlocksValueV2,
  type RespValueV2,
  respV2LegacyProfileId,
  respV2LegacySetorId,
} from "@/modules/tarefas/components/responsaveis/TarefasResponsaveisV2";

interface Props {
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
  setores: any[];
  colaboradores: any[];
  sections?: SectionForm[];
  steps?: StepForm[];
}

const EXEC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "tarefa_simples", label: "Tarefa simples" },
  { value: "etapas", label: "Por etapas (mais de um agrupador)" },
];

/**
 * Reconstrói RespBlocksValueV2 a partir de:
 *  1) form.template_snapshot.responsaveis_multi (fonte oficial nova)
 *  2) Fallback legacy (executor_*, avaliado_*, ...) — registros antigos.
 *
 * Mapeamento legacy:
 *   executor_*       → respondente
 *   avaliado_*       → avaliado (fallback: usa executor_* quando vazio)
 *   avaliador_*      → avaliador
 *   aprovador_*      → aprovadorFinal
 *   ada_quem_avalia_* → validadorFinal
 */
function buildBlocksFromForm(form: TemplateForm): RespBlocksValueV2 {
  const snap: any = (form as any).template_snapshot || {};
  const multi: Partial<RespBlocksValueV2> | undefined = snap?.responsaveis_multi;

  const fromLegacy = (profileId: string, setorId: string): RespValueV2 => {
    if (profileId) return { mode: "individual", profileIds: [profileId], setorId: "" };
    if (setorId) return { mode: "setor_todo", profileIds: [], setorId };
    return { ...emptyRespBlocksV2.respondente };
  };

  const respondente = multi?.respondente || fromLegacy(form.executor_profile_id, form.executor_setor_id);
  // Fallback Avaliado: se não houver explícito, usar executor_* (registros antigos).
  const avaliado = multi?.avaliado || (
    form.avaliado_profile_id || form.avaliado_setor_id
      ? fromLegacy(form.avaliado_profile_id, form.avaliado_setor_id)
      : fromLegacy(form.executor_profile_id, form.executor_setor_id)
  );
  const avaliador = multi?.avaliador || { ...emptyRespBlocksV2.avaliador };
  const aprovadorFinal = multi?.aprovadorFinal || fromLegacy(form.aprovador_profile_id, form.aprovador_setor_id);
  const validadorFinal = multi?.validadorFinal || fromLegacy(form.auditor_profile_id, form.auditor_setor_id);

  return { respondente, avaliado, avaliador, aprovadorFinal, validadorFinal };
}

export function TabGeral({ form, set, setores, colaboradores, sections, steps }: Props) {
  const { data: colaboradorSetores = [] } = useQuery({
    queryKey: ["operational_colaborador_setores_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("colaborador_setores").select("profile_id, setor_id");
      if (error) throw error;
      return data || [];
    },
  });

  const initialBlocks = useMemo(() => buildBlocksFromForm(form), []); // só na montagem
  const [blocks, setBlocks] = useState<RespBlocksValueV2>(initialBlocks);

  const handleBlocksChange = (next: RespBlocksValueV2) => {
    setBlocks(next);

    // 1) Atualiza colunas legacy (1º profile_id ou setor_id de cada bloco)
    set("executor_profile_id" as any, respV2LegacyProfileId(next.respondente) as any);
    set("executor_setor_id" as any, respV2LegacySetorId(next.respondente) as any);

    set("avaliado_profile_id" as any, respV2LegacyProfileId(next.avaliado) as any);
    set("avaliado_setor_id" as any, respV2LegacySetorId(next.avaliado) as any);

    // Auditor (era avaliador legado): grava nas colunas auditor_*
    const audPid = respV2LegacyProfileId(next.validadorFinal);
    const audSid = respV2LegacySetorId(next.validadorFinal);
    set("auditor_profile_id" as any, audPid as any);
    set("auditor_setor_id" as any, audSid as any);

    set("aprovador_profile_id" as any, respV2LegacyProfileId(next.aprovadorFinal) as any);
    set("aprovador_setor_id" as any, respV2LegacySetorId(next.aprovadorFinal) as any);
    const aprFilled = !!respV2LegacyProfileId(next.aprovadorFinal) || !!respV2LegacySetorId(next.aprovadorFinal);
    set("requer_aprovacao_gestor" as any, aprFilled as any);

    // 2) Persistência de responsaveis_multi (snapshot completo) — Fase 2.
    // Por ora, registros novos/edições gravam apenas as colunas legacy mapeadas acima.
    // O fallback de leitura em buildBlocksFromForm já reconstrói os 5 blocos a partir do legacy.
  };

  // Normaliza tipo_execucao legacy → "etapas".
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
          "Por etapas" significa mais de um agrupador/bloco de perguntas.
        </p>
      </div>

      {/* Setor da Rotina — campo manual, independente do Avaliado */}
      <div className="space-y-1.5">
        <Label>Setor da Rotina *</Label>
        <Select value={form.setor_id || ""} onValueChange={(v) => set("setor_id" as any, v as any)}>
          <SelectTrigger><SelectValue placeholder="Selecionar setor..." /></SelectTrigger>
          <SelectContent>
            {(setores as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Responsáveis — novo padrão V2 (5 papéis) */}
      <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <Label className="text-sm font-semibold">Responsáveis</Label>
        </div>
        <TarefasResponsaveisV2
          value={blocks}
          onChange={handleBlocksChange}
          setores={setores}
          colaboradores={colaboradores}
          colaboradorSetores={colaboradorSetores as any}
        />
      </div>

      {/* Horários da Rotina — resumo do que foi configurado em Recorrência/Etapas */}
      <HorariosRotinaPreview form={form} sections={sections} steps={steps} />
    </div>
  );
}

const DIAS_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const RECORRENCIA_LABEL: Record<string, string> = {
  unica: "Única", diaria: "Diária", semanal: "Semanal",
  mensal: "Mensal", personalizada: "Personalizada",
};

function HorariosRotinaPreview({ form, sections, steps }: { form: TemplateForm; sections?: SectionForm[]; steps?: StepForm[] }) {
  const dias = (form.dias_da_semana || []).slice().sort();
  const isEtapas = form.tipo_execucao === "etapas";
  const itens: Array<{ nome: string; ini: string; fim: string }> = [];
  if (isEtapas && sections) {
    for (const s of sections) {
      if (s.horario_inicio || s.horario_fim) itens.push({ nome: s.nome || "Etapa", ini: s.horario_inicio, fim: s.horario_fim });
    }
  }
  if (steps) {
    for (const st of steps) {
      if (st.horario_inicio || st.horario_fim) itens.push({ nome: st.nome || "Passo", ini: st.horario_inicio, fim: st.horario_fim });
    }
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-semibold">Horários da Rotina</Label>
        <span className="text-[10px] text-muted-foreground">(somente leitura — configure na aba Recorrência / Campos)</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
        <div>
          <p className="text-muted-foreground text-[10px] uppercase">Recorrência</p>
          <p className="font-medium">{RECORRENCIA_LABEL[form.recorrencia_tipo] || form.recorrencia_tipo || "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[10px] uppercase">Dias da semana</p>
          <p className="font-medium">{dias.length ? dias.map(d => DIAS_LABEL[d]).join(", ") : "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[10px] uppercase">Início previsto</p>
          <p className="font-medium">{form.horario_inicio_previsto || "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-[10px] uppercase">Limite de execução</p>
          <p className="font-medium">{form.horario_limite_execucao || "—"}</p>
        </div>
      </div>

      {itens.length > 0 && (
        <div className="border-t border-border pt-2">
          <p className="text-[10px] uppercase text-muted-foreground mb-1.5">Janelas por etapa</p>
          <ul className="space-y-1">
            {itens.map((it, i) => (
              <li key={i} className="flex items-center justify-between text-[12px] px-2 py-1 rounded bg-muted/40">
                <span className="font-medium truncate">{it.nome}</span>
                <span className="text-muted-foreground tabular-nums">{it.ini || "--:--"} → {it.fim || "--:--"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
