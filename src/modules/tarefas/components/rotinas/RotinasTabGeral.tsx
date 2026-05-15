// src/modules/tarefas/components/rotinas/RotinasTabGeral.tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Save, ChevronDown, ChevronRight, User, Award, Eye, Info } from "lucide-react";
import { TemplateForm } from "@/modules/tarefas/types/tarefas_types";
import { cn } from "@/lib/utils";

interface Props {
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
  setores: any[];
  colaboradores: any[];
  colaboradorSetores: any[];
  onSave: () => Promise<void>;
  saving: boolean;
}

const EXEC_OPTIONS = [
  { value: "simples", label: "Tarefa Simples" },
  { value: "etapas", label: "Por Etapas (mais de um agrupador)" },
];

interface PapelConfig {
  key: string;
  num: number;
  title: string;
  obrigatorio: boolean;
  descricao: string;
  exemplo: string;
  Icon: React.ComponentType<{ className?: string }>;
  profileCol: keyof TemplateForm;
  setorCol: keyof TemplateForm;
  helperVariant: "info" | "warn";
  helper: string;
}

const PAPEIS: PapelConfig[] = [
  {
    key: "executor", num: 1, title: "Executor", obrigatorio: true,
    descricao: "Quem executa a tarefa: responde as perguntas, envia evidências e marca conforme/não conforme inicial.",
    exemplo: "Ex.: técnico, operador, equipe responsável pela execução.",
    Icon: User, profileCol: "executor_profile_id", setorCol: "executor_setor_id",
    helperVariant: "info",
    helper: "Primeiro selecione o setor. Depois escolha \"Setor todo\" OU selecione colaboradores individuais (não é permitido os dois).",
  },
  {
    key: "avaliado", num: 2, title: "Avaliado", obrigatorio: true,
    descricao: "Quem recebe a nota/impacto final desta tarefa (pode ser o próprio executor).",
    exemplo: "Ex.: pessoa, equipe ou setor avaliado.",
    Icon: User, profileCol: "avaliado_profile_id", setorCol: "avaliado_setor_id",
    helperVariant: "info",
    helper: "A nota final pertence a este responsável/setor configurado.",
  },
  {
    key: "aprovador", num: 3, title: "Aprovador", obrigatorio: false,
    descricao: "Quem aprova/reprova a execução, cria o plano de ação e define a nota final.",
    exemplo: "Ex.: gestor, coordenador, gerente.",
    Icon: Award, profileCol: "aprovador_profile_id", setorCol: "aprovador_setor_id",
    helperVariant: "warn",
    helper: "Somente o aprovador pode criar plano de ação, devolver e definir a nota final.",
  },
  {
    key: "auditor", num: 4, title: "Auditor", obrigatorio: false,
    descricao: "Quem realiza a auditoria posterior da atuação do aprovador. Não altera notas.",
    exemplo: "Ex.: auditor, qualidade, compliance.",
    Icon: Eye, profileCol: "auditor_profile_id", setorCol: "auditor_setor_id",
    helperVariant: "info",
    helper: "Auditoria posterior. Não altera notas nem fluxo operacional.",
  },
];

function PapelCard({
  cfg, form, set, setores, colaboradores, colaboradorSetores,
}: { cfg: PapelConfig; form: TemplateForm; set: Props["set"]; setores: any[]; colaboradores: any[]; colaboradorSetores: any[] }) {
  const [open, setOpen] = useState(cfg.obrigatorio);
  const profileId = (form[cfg.profileCol] as string) || "";
  const setorId = (form[cfg.setorCol] as string) || "";
  const isTodo = !!setorId && !profileId;
  const isIndividual = !!profileId;
  const filled = isTodo || isIndividual;
  const { Icon } = cfg;

  const colabsDoSetor = setorId
    ? colaboradorSetores
        .filter((cs: any) => cs.setor_id === setorId)
        .map((cs: any) => colaboradores.find((c: any) => c.id === cs.profile_id))
        .filter(Boolean)
    : [];

  return (
    <div className={cn("border rounded-lg overflow-hidden", filled ? "border-primary/40" : "border-border")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors text-left"
      >
        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0", filled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
          {cfg.num}
        </div>
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{cfg.title}</span>
            {cfg.obrigatorio
              ? <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">Obrigatório</Badge>
              : <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Opcional</Badge>}
            {filled && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">✓ Configurado</span>}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{cfg.descricao}</p>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/10 space-y-3">
          <p className="text-[11px] text-muted-foreground italic">{cfg.exemplo}</p>

          <div className="grid grid-cols-3 gap-3 items-end">
            {/* Setor */}
            <div className="space-y-1">
              <Label className="text-xs">Setor (selecionar)</Label>
              <Select
                value={setorId || "__none"}
                onValueChange={(v) => {
                  set(cfg.setorCol, (v === "__none" ? "" : v) as any);
                  set(cfg.profileCol, "" as any);
                }}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar setor..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Nenhum —</SelectItem>
                  {setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Setor todo */}
            <div className="space-y-1">
              <Label className="text-xs">Setor todo</Label>
              <div className={cn("flex items-center gap-2 h-8 px-3 rounded-md border text-xs", setorId ? "bg-card border-border" : "bg-muted/50 border-border opacity-50")}>
                <Checkbox
                  id={`todo-${cfg.key}`}
                  checked={isTodo}
                  disabled={!setorId}
                  onCheckedChange={(checked) => { if (checked) set(cfg.profileCol, "" as any); }}
                />
                <label htmlFor={`todo-${cfg.key}`} className="cursor-pointer select-none">Marcar todos do setor</label>
              </div>
            </div>

            {/* Individual */}
            <div className="space-y-1">
              <Label className="text-xs">Individual (colaboradores do setor)</Label>
              <Select
                value={profileId || "__none"}
                disabled={!setorId || isTodo}
                onValueChange={(v) => set(cfg.profileCol, (v === "__none" ? "" : v) as any)}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar colaborador..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Nenhum —</SelectItem>
                  {colabsDoSetor.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className={cn("flex items-start gap-2 rounded-md px-3 py-2 text-[11px]",
            cfg.helperVariant === "warn"
              ? "bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800"
              : "bg-blue-50 border border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800"
          )}>
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{cfg.helper}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function RotinasTabGeral({ form, set, setores, colaboradores, colaboradorSetores, onSave, saving }: Props) {
  const tipoDisplay = form.tipo_execucao === "simples" ? "simples" : "etapas";

  return (
    <div className="space-y-5 p-1">
      <div className="space-y-1.5">
        <Label>Nome da Rotina <span className="text-destructive">*</span></Label>
        <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex: Inspeção de equipamentos" maxLength={255} />
      </div>

      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <Textarea value={form.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Detalhes da rotina..." maxLength={1000} rows={3} />
      </div>

      <div className="space-y-1.5">
        <Label>Tipo de Execução</Label>
        <Select value={tipoDisplay} onValueChange={(v) => set("tipo_execucao", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{EXEC_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">"Por etapas" = mais de um agrupador/bloco de perguntas.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Setor da Rotina <span className="text-destructive">*</span></Label>
        <Select value={form.setor_id || "__none"} onValueChange={(v) => set("setor_id", v === "__none" ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Selecionar setor..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— Selecionar —</SelectItem>
            {setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Responsáveis</Label>
        <div className="space-y-2">
          {PAPEIS.map((cfg) => (
            <PapelCard key={cfg.key} cfg={cfg} form={form} set={set}
              setores={setores} colaboradores={colaboradores} colaboradorSetores={colaboradorSetores} />
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button onClick={onSave} disabled={saving || !form.nome.trim()}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar Geral"}
        </Button>
      </div>
    </div>
  );
}
