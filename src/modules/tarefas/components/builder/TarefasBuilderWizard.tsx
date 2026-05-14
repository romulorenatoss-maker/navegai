import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Save, CheckCircle2 } from "lucide-react";
import { TabGeral } from "@/modules/tarefas/components/tarefas_tabGeral";
import { TabFormBuilder } from "@/modules/tarefas/components/tarefas_tabFormBuilder";
import { TabRecorrencia } from "@/modules/tarefas/components/tarefas_tabRecorrencia";
import { TabTarefasExecutadas } from "@/modules/tarefas/components/tarefas_tabTarefasExecutadas";
import { TemplateForm, SectionForm, FieldForm, StepForm } from "@/modules/tarefas/types/tarefas_types";
import { BuilderStepper } from "./BuilderStepper";
import { StepChecklistAprovador } from "./StepChecklistAprovador";
import { StepChecklistValidador } from "./StepChecklistValidador";
import { StepResumo } from "./StepResumo";
import { DraftRestoreBanner } from "./DraftRestoreBanner";
import type { BuilderDraftPayload } from "./useBuilderDraft";
import {
  AprovadorCheckItemForm,
  WIZARD_STEPS,
  WizardStepId,
} from "./types";

interface Props {
  isEditing: boolean;
  saving: boolean;
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
  sections: SectionForm[];
  setSections: React.Dispatch<React.SetStateAction<SectionForm[]>>;
  fields: FieldForm[];
  setFields: React.Dispatch<React.SetStateAction<FieldForm[]>>;
  steps: StepForm[];
  setSteps: React.Dispatch<React.SetStateAction<StepForm[]>>;
  /** Checklists do Aprovador Final / Validador Final (Fase 2). */
  aprovadorChecks: AprovadorCheckItemForm[];
  setAprovadorChecks: React.Dispatch<React.SetStateAction<AprovadorCheckItemForm[]>>;
  validadorChecks: AprovadorCheckItemForm[];
  setValidadorChecks: React.Dispatch<React.SetStateAction<AprovadorCheckItemForm[]>>;
  /** Config global de Pontuação/SLA — usada para popular as penalidades automáticas. */
  pontuacaoConfig: TarefasPontuacaoConfig | null;
  /** Overrides locais por rotina das penalidades automáticas. */
  penalidadesOverride: PenalidadesOverrideMap;
  setPenalidadesOverride: React.Dispatch<React.SetStateAction<PenalidadesOverrideMap>>;
  setores: any[];
  colaboradores: any[];
  templateId: string | null;
  draftToRestore?: BuilderDraftPayload | null;
  onRestoreDraft?: () => void;
  onDiscardDraft?: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function TarefasBuilderWizard(props: Props) {
  const {
    isEditing, saving, form, set, sections, setSections, fields, setFields,
    steps, setSteps,
    aprovadorChecks, setAprovadorChecks, validadorChecks, setValidadorChecks,
    pontuacaoConfig, penalidadesOverride, setPenalidadesOverride,
    setores, colaboradores,
    templateId, draftToRestore, onRestoreDraft, onDiscardDraft, onCancel, onSubmit,
  } = props;

  // Aprovador Final / Validador Final detectados pelos campos do form.
  const hasAprovador = !!(form.aprovador_profile_id || form.aprovador_setor_id || form.requer_aprovacao_gestor);
  const hasValidador = !!(form.ada_enabled || form.ada_quem_avalia_profile_id || form.ada_quem_avalia_setor_id);

  // Steps visíveis (filtrando os condicionais).
  const visibleSteps = useMemo(
    () => WIZARD_STEPS.filter(s => {
      if (s.id === "checklist_aprovador") return hasAprovador;
      if (s.id === "checklist_validador") return hasValidador;
      return true;
    }),
    [hasAprovador, hasValidador],
  );

  const [current, setCurrent] = useState<WizardStepId>("geral");
  const [completed, setCompleted] = useState<Set<WizardStepId>>(new Set(["tipo"]));

  if (!visibleSteps.find(s => s.id === current)) {
    setTimeout(() => setCurrent("geral"), 0);
  }

  const idx = visibleSteps.findIndex(s => s.id === current);
  const isLast = idx === visibleSteps.length - 1;
  const isFirst = idx <= 1;

  const canAdvance = useMemo(() => {
    if (current === "geral") return form.nome.trim().length > 0;
    return true;
  }, [current, form.nome]);

  const goNext = () => {
    if (!canAdvance) return;
    setCompleted(prev => new Set(prev).add(current));
    const next = visibleSteps[Math.min(idx + 1, visibleSteps.length - 1)];
    setCurrent(next.id);
  };

  const goPrev = () => {
    const prev = visibleSteps[Math.max(idx - 1, 1)];
    setCurrent(prev.id);
  };

  const jump = (id: WizardStepId) => {
    if (id === "tipo") return;
    setCurrent(id);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <BuilderStepper current={current} completed={completed} onJump={jump} isEditing={isEditing} steps={visibleSteps} />

      {draftToRestore && onRestoreDraft && onDiscardDraft && (
        <DraftRestoreBanner
          savedAt={draftToRestore.savedAt}
          onRestore={onRestoreDraft}
          onDiscard={onDiscardDraft}
        />
      )}

      <div className="flex-1 overflow-y-auto px-1 py-4 md:px-2">
        {current === "tipo" && (
          <div className="text-center py-8">
            <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-2" />
            <p className="text-sm text-foreground font-medium">Tipo já selecionado</p>
            <p className="text-xs text-muted-foreground mt-1">Avance para preencher as informações.</p>
          </div>
        )}

        {current === "geral" && (
          <TabGeral form={form} set={set} setores={setores} colaboradores={colaboradores} sections={sections} steps={steps} />
        )}

        {current === "campos" && (
          <TabFormBuilder
            sections={sections} setSections={setSections}
            fields={fields} setFields={setFields}
            setores={setores} tipoExecucao={form.tipo_execucao}
            aprovacaoFinalEnabled={!!form.requer_aprovacao_gestor}
          />
        )}

        {current === "checklist_aprovador" && hasAprovador && (
          <StepChecklistAprovador fields={fields} items={aprovadorChecks} setItems={setAprovadorChecks} />
        )}

        {current === "checklist_validador" && hasValidador && (
          <StepChecklistValidador items={validadorChecks} setItems={setValidadorChecks} />
        )}

        {current === "fluxo" && (
          <div className="space-y-6">
            <TabRecorrencia form={form} set={set} />
          </div>
        )}

        {current === "resumo" && (
          <div className="space-y-6">
            <StepResumo
              form={form} sections={sections} fields={fields} steps={steps}
              aprovadorChecks={aprovadorChecks}
              validadorChecks={validadorChecks}
              hasAprovador={hasAprovador}
              hasValidador={hasValidador}
              setores={setores} colaboradores={colaboradores}
              isEditing={isEditing}
            />
            {isEditing && templateId && (
              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Tarefas executadas</h4>
                <TabTarefasExecutadas templateId={templateId} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background sticky bottom-0 px-3 py-2.5 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="text-muted-foreground">
          Cancelar
        </Button>
        <div className="flex items-center gap-2">
          {!isFirst && (
            <Button type="button" variant="outline" onClick={goPrev}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
          )}
          {!isLast ? (
            <Button type="button" onClick={goNext} disabled={!canAdvance}>
              Avançar <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" onClick={onSubmit} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />
              {saving ? "Salvando..." : isEditing ? "Atualizar" : "Publicar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
