import { CheckCircle2, ClipboardList, Settings2, CalendarClock, FileText, ShieldCheck, Award } from "lucide-react";
import { TemplateForm, SectionForm, FieldForm, StepForm } from "@/modules/tarefas/types/tarefas_types";
import { AprovadorCheckItemForm } from "./types";
import { TIPO_EXECUCAO_LABELS, RECORRENCIA_LABELS } from "@/modules/tarefas/hooks/tarefas_useScoring";

interface Props {
  form: TemplateForm;
  sections: SectionForm[];
  fields: FieldForm[];
  steps: StepForm[];
  aprovadorChecks?: AprovadorCheckItemForm[];
  hasAprovador?: boolean;
  setores: any[];
  colaboradores: any[];
  isEditing: boolean;
}

function nameOf(list: any[], id: string | undefined) {
  if (!id) return "—";
  return list.find(i => i.id === id)?.nome || "—";
}

export function StepResumo({
  form, sections, fields, steps,
  aprovadorChecks = [],
  hasAprovador = false,
  setores, colaboradores, isEditing,
}: Props) {
  const cardCls = "border border-border rounded-lg bg-card p-3";
  const titleCls = "text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2";

  const pesoOperacional = fields.reduce((s, f) => s + (f.peso || 0), 0);
  const pesoAprovador = aprovadorChecks.reduce((s, i) => s + (i.peso || 0), 0);

  const hasAuditor = !!(form.auditor_profile_id || form.auditor_setor_id);

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
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Avaliado:</dt><dd>{colaboradores.find(c => c.id === form.avaliado_profile_id)?.nome || nameOf(setores, form.avaliado_setor_id) || "—"}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Aprovador:</dt><dd>{colaboradores.find(c => c.id === form.aprovador_profile_id)?.nome || nameOf(setores, form.aprovador_setor_id) || "—"}</dd></div>
            <div className="flex gap-2"><dt className="text-muted-foreground w-24 shrink-0">Auditor:</dt><dd>{colaboradores.find(c => c.id === form.auditor_profile_id)?.nome || nameOf(setores, form.auditor_setor_id) || "—"}</dd></div>
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
            <div className="flex gap-2"><dt className="text-muted-foreground w-32 shrink-0">Etapas:</dt><dd>{steps.length}</dd></div>
          </dl>
        </div>

        {hasAprovador && (
          <div className={cardCls}>
            <h4 className={titleCls}><ShieldCheck className="w-3.5 h-3.5" /> Checklist Aprovador</h4>
            <dl className="text-xs space-y-1">
              <div className="flex gap-2"><dt className="text-muted-foreground w-28 shrink-0">Itens:</dt><dd>{aprovadorChecks.length}</dd></div>
              <div className="flex gap-2"><dt className="text-muted-foreground w-28 shrink-0">Nota total:</dt><dd className="font-medium">{pesoAprovador}</dd></div>
            </dl>
          </div>
        )}
      </div>

      {/* Separação de notas por camada/papel */}
      <div className="border border-border rounded-lg bg-card p-3">
        <h4 className={titleCls}><Award className="w-3.5 h-3.5" /> Separação de notas (estrutura preparada)</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="rounded border border-emerald-200 bg-emerald-50/50 p-2">
            <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Nota Operacional</div>
            <div className="text-foreground">Pertence ao <strong>Avaliado</strong></div>
            <div className="text-muted-foreground mt-1">Base: {fields.length} pergunta(s) operacional(is) · nota total {pesoOperacional}</div>
          </div>
          <div className={`rounded border ${hasAprovador ? "border-blue-200 bg-blue-50/50" : "border-border bg-muted/30 opacity-60"} p-2`}>
            <div className="text-[10px] uppercase tracking-wider text-blue-700 font-bold">Nota de Governança</div>
            <div className="text-foreground">Pertence ao <strong>Aprovador</strong></div>
            <div className="text-muted-foreground mt-1">
              Base: SLA + aprovação + devolução + plano de ação + encerramento + conformidade
              {hasAprovador && ` · checklist aprovador peso ${pesoAprovador}`}
            </div>
          </div>
          <div className={`rounded border ${hasAuditor ? "border-purple-200 bg-purple-50/50" : "border-border bg-muted/30 opacity-60"} p-2`}>
            <div className="text-[10px] uppercase tracking-wider text-purple-700 font-bold">Nota de Auditoria</div>
            <div className="text-foreground">Pertence ao <strong>Auditor</strong></div>
            <div className="text-muted-foreground mt-1">
              {hasAuditor ? "Base: prazo de auditoria + completude da revisão" : "Auditor não definido"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
