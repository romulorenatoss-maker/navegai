import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Save, Workflow, CalendarClock, CheckCircle2 } from "lucide-react";
import { TabGeral } from "@/modules/tarefas/components/tarefas_tabGeral";
import { TabFormBuilder } from "@/modules/tarefas/components/tarefas_tabFormBuilder";
import { TabWorkflow } from "@/modules/tarefas/components/tarefas_tabWorkflow";
import { TabRecorrencia } from "@/modules/tarefas/components/tarefas_tabRecorrencia";
import { TabTarefasExecutadas } from "@/modules/tarefas/components/tarefas_tabTarefasExecutadas";
import { TemplateForm, SectionForm, FieldForm, StepForm } from "@/modules/tarefas/types/tarefas_types";
import { BuilderStepper } from "./BuilderStepper";
import { StepChecklist } from "./StepChecklist";
import { StepResumo } from "./StepResumo";
import { DraftRestoreBanner } from "./DraftRestoreBanner";
import type { BuilderDraftPayload } from "./useBuilderDraft";
import { CheckItemForm, WIZARD_STEPS, WizardStepId } from "./types";

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
  checkItems: CheckItemForm[];
  setCheckItems: React.Dispatch<React.SetStateAction<CheckItemForm[]>>;
  protectedCheckIds?: Set<string>;
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
    steps, setSteps, checkItems, setCheckItems, protectedCheckIds, setores, colaboradores,
    templateId, draftToRestore, onRestoreDraft, onDiscardDraft, onCancel, onSubmit,
  } = props;

  const [current, setCurrent] = useState<WizardStepId>("geral"); // tipo é resolvido antes (TaskTypeSelector)
  const [completed, setCompleted] = useState<Set<WizardStepId>>(new Set(["tipo"]));

  const idx = WIZARD_STEPS.findIndex(s => s.id === current);
  const isLast = idx === WIZARD_STEPS.length - 1;
  const isFirst = idx <= 1;

  const canAdvance = useMemo(() => {
    if (current === "geral") return form.nome.trim().length > 0;
    return true;
  }, [current, form.nome]);

  const goNext = () => {
    if (!canAdvance) return;
    setCompleted(prev => new Set(prev).add(current));
    const next = WIZARD_STEPS[Math.min(idx + 1, WIZARD_STEPS.length - 1)];
    setCurrent(next.id);
  };

  const goPrev = () => {
    const prev = WIZARD_STEPS[Math.max(idx - 1, 1)]; // não volta pro "tipo"
    setCurrent(prev.id);
  };

  const jump = (id: WizardStepId) => {
    if (id === "tipo") return;
    setCurrent(id);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <BuilderStepper current={current} completed={completed} onJump={jump} isEditing={isEditing} />

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
          <TabGeral form={form} set={set} setores={setores} colaboradores={colaboradores} />
        )}

        {current === "campos" && (
          <TabFormBuilder
            sections={sections} setSections={setSections}
            fields={fields} setFields={setFields}
            setores={setores} tipoExecucao={form.tipo_execucao}
          />
        )}

        {current === "checklist" && (
          <StepChecklist items={checkItems} setItems={setCheckItems} protectedIds={protectedCheckIds} />
        )}

        {current === "fluxo" && (
          <div className="space-y-6">
            <SectionDivider icon={<Workflow className="w-3.5 h-3.5" />} title="Workflow, aprovação, SLA & automação" subtitle="Quem aprova, regras de SLA, contingência e plano de ação." />
            <TabWorkflow form={form} set={set} fields={fields} />

            <SectionDivider icon={<CalendarClock className="w-3.5 h-3.5" />} title="Recorrência" subtitle="Quando esta tarefa será gerada automaticamente." />
            <TabRecorrencia form={form} set={set} />
          </div>
        )}

        {current === "resumo" && (
          <div className="space-y-6">
            <StepResumo
              form={form} sections={sections} fields={fields} steps={steps}
              checkItems={checkItems} setores={setores} colaboradores={colaboradores}
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
