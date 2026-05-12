import { CheckCircle2, ListChecks, ClipboardList, Settings2, CalendarClock, FileText } from "lucide-react";
import { TemplateForm, SectionForm, FieldForm, StepForm } from "@/modules/tarefas/types/tarefas_types";
import { CheckItemForm } from "./types";
import { TIPO_EXECUCAO_LABELS, RECORRENCIA_LABELS } from "@/modules/tarefas/hooks/tarefas_useScoring";

interface Props {
  form: TemplateForm;
  sections: SectionForm[];
  fields: FieldForm[];
  steps: StepForm[];
  checkItems: CheckItemForm[];
  setores: any[];
  colaboradores: any[];
  isEditing: boolean;
}

function nameOf(list: any[], id: string | undefined) {
  if (!id) return "—";
  return list.find(i => i.id === id)?.nome || "—";
}

export function StepResumo({ form, sections, fields, steps, checkItems, setores, colaboradores, isEditing }: Props) {
  const cardCls = "border border-border rounded-lg bg-card p-3";
  const titleCls = "text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2";

  return (
    <div className="space-y-3">
      <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 flex items-start gap-2.5">
        <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">Pronto para {isEditing ? "atualizar" : "publicar"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Revise as informações abaixo. Ao confirmar, o template será {isEditing ? "atualizado" : "criado"} e ficará disponível na fila de tarefas conforme a recorrência configurada.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={cardCls}>
          <h4 className={titleCls}><FileText className="w-3.5 h-3.5" /> Informações gerais</h4>
          <dl className="text-xs space-y-1">
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Nome:</dt><dd className="font-medium">{form.nome || "—"}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Tipo:</dt><dd>{TIPO_EXECUCAO_LABELS[form.tipo_execucao] || form.tipo_execucao}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Setor:</dt><dd>{nameOf(setores, form.setor_id)}</dd></div>
            {form.descricao && <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Descrição:</dt><dd className="line-clamp-2">{form.descricao}</dd></div>}
          </dl>
        </div>

        <div className={cardCls}>
          <h4 className={titleCls}><Settings2 className="w-3.5 h-3.5" /> Fluxo</h4>
          <dl className="text-xs space-y-1">
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Executor:</dt><dd>{colaboradores.find(c => c.id === form.executor_profile_id)?.nome || nameOf(setores, form.executor_setor_id) || "—"}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Avaliador:</dt><dd>{colaboradores.find(c => c.id === form.avaliador_profile_id)?.nome || nameOf(setores, form.avaliador_setor_id) || "—"}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Aprovador:</dt><dd>{colaboradores.find(c => c.id === form.aprovador_profile_id)?.nome || nameOf(setores, form.aprovador_setor_id) || "—"}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">SLA:</dt><dd>{form.sla_horas}h</dd></div>
          </dl>
        </div>

        <div className={cardCls}>
          <h4 className={titleCls}><CalendarClock className="w-3.5 h-3.5" /> Recorrência</h4>
          <dl className="text-xs space-y-1">
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Tipo:</dt><dd>{RECORRENCIA_LABELS[form.recorrencia_tipo] || form.recorrencia_tipo}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Início:</dt><dd>{form.horario_inicio_previsto || "—"}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Limite:</dt><dd>{form.horario_limite_execucao || "—"}</dd></div>
          </dl>
        </div>

        <div className={cardCls}>
          <h4 className={titleCls}><ClipboardList className="w-3.5 h-3.5" /> Conteúdo</h4>
          <dl className="text-xs space-y-1">
            <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">Seções:</dt><dd>{sections.length}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">Campos avaliativos:</dt><dd>{fields.length}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">Itens de checklist:</dt><dd className="flex items-center gap-1">{checkItems.length} <ListChecks className="w-3.5 h-3.5 text-muted-foreground" /></dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">Etapas:</dt><dd>{steps.length}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}
