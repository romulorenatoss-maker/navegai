/**
 * Tarefas — Responsáveis V2 (Fase 1 / Maio 2026)
 *
 * Reescrita visual do bloco "Responsáveis" seguindo o layout aprovado
 * (5 papéis: Respondente / Avaliado / Avaliador / Aprovador Final / Validador Final).
 *
 * Esta entrega cobre apenas UI + estado local + mapeamento legacy.
 * As regras de quem pode criar plano de ação / encerrar / definir nota final
 * NÃO mudam nesta fase (Fase 3 separada).
 *
 * Mapeamento legacy (sem migration):
 *   respondente   → executor_*       (quem responde o checklist)
 *   avaliado      → avaliado_*       (quem recebe a nota; fallback = executor_* em registros antigos)
 *   avaliador     → avaliador_*  +  validador_contingencia_*  (mantém compat)
 *   aprovadorFinal → aprovador_*
 *   validadorFinal → ada_*
 *
 * Persistência multi: array completo gravado em template_snapshot.responsaveis_multi[papel].
 */
import { useMemo, useState } from "react";
import {
  Check, ChevronDown, ChevronRight, Info, HelpCircle,
  User, ShieldCheck, Award, Eye, ClipboardList, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";

/* ---------------- Tipos ---------------- */

export type RespModeV2 = "setor_todo" | "individual" | null;

export interface RespValueV2 {
  setorId: string;
  mode: RespModeV2;
  /** Quando mode = "individual". Quando "setor_todo" deve ficar vazio. */
  profileIds: string[];
}

export type RespRoleKey =
  | "respondente"
  | "avaliado"
  | "avaliador"
  | "aprovadorFinal"
  | "validadorFinal";

export type RespBlocksValueV2 = Record<RespRoleKey, RespValueV2>;

export const emptyRespV2: RespValueV2 = { setorId: "", mode: null, profileIds: [] };

export const emptyRespBlocksV2: RespBlocksValueV2 = {
  respondente: { ...emptyRespV2 },
  avaliado: { ...emptyRespV2 },
  avaliador: { ...emptyRespV2 },
  aprovadorFinal: { ...emptyRespV2 },
  validadorFinal: { ...emptyRespV2 },
};

export const isRespV2Filled = (v: RespValueV2): boolean =>
  !!v.setorId && (v.mode === "setor_todo" || (v.mode === "individual" && v.profileIds.length > 0));

/** Helpers para colunas legacy: retorna primeiro profile_id quando individual; setor_id quando setor_todo. */
export const respV2LegacyProfileId = (v: RespValueV2): string =>
  v.mode === "individual" ? (v.profileIds[0] || "") : "";
export const respV2LegacySetorId = (v: RespValueV2): string =>
  v.mode === "setor_todo" ? (v.setorId || "") : "";

interface Profile { id: string; nome: string }
interface Setor { id: string; nome: string }
interface ColabSetor { profile_id: string; setor_id: string }

interface BlockSpec {
  key: RespRoleKey;
  num: number;
  title: string;
  required: boolean;
  description: string;
  example: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Mensagem de apoio (caixa azul/cinza). */
  helper: string;
  helperVariant: "info" | "warn";
}

const BLOCKS: BlockSpec[] = [
  {
    key: "respondente", num: 1, title: "Executor", required: true,
    description: "Quem executa a tarefa: responde as perguntas, envia evidências e marca conforme/não conforme inicial.",
    example: "Ex.: técnico, operador, equipe responsável pela execução.", Icon: User,
    helper: "Primeiro selecione o setor. Depois escolha \"Setor todo\" OU selecione colaboradores individuais (não é permitido os dois).",
    helperVariant: "info",
  },
  {
    key: "avaliado", num: 2, title: "Avaliado", required: true,
    description: "Quem recebe a nota/impacto final desta tarefa (pode ser o próprio executor).",
    example: "Ex.: pessoa, equipe ou setor avaliado.", Icon: User,
    helper: "A nota final pertence a este responsável/setor configurado.",
    helperVariant: "info",
  },
  {
    key: "aprovadorFinal", num: 3, title: "Aprovador", required: false,
    description: "Quem aprova/reprova a execução, cria o plano de ação, define impacto operacional e encerra pendências.",
    example: "Ex.: gestor, coordenador, gerente.", Icon: Award,
    helper: "Somente o aprovador pode criar o plano de ação, devolver, aumentar prazo e definir a nota final.",
    helperVariant: "warn",
  },
  {
    key: "validadorFinal", num: 4, title: "Auditor", required: false,
    description: "Quem realiza a auditoria posterior do processo (executor + aprovador). Não altera notas.",
    example: "Ex.: auditor, qualidade, compliance.", Icon: Eye,
    helper: "Auditoria posterior. Não altera notas nem fluxo operacional.",
    helperVariant: "info",
  },
];

/* ---------------- Componente ---------------- */

interface Props {
  value: RespBlocksValueV2;
  onChange: (next: RespBlocksValueV2) => void;
  setores: Setor[];
  colaboradores: Profile[];
  colaboradorSetores: ColabSetor[];
  /** Mostrar título "Definir Responsáveis" + banner topo. Default true. */
  showHeader?: boolean;
  /** Esconder bloco 5 (auditoria) — caso tela do AdA seja em outro local. */
  hideValidadorFinal?: boolean;
  className?: string;
}

export function TarefasResponsaveisV2({
  value, onChange, setores, colaboradores, colaboradorSetores,
  showHeader = true, hideValidadorFinal = false, className,
}: Props) {
  const isMobile = useIsMobile();

  const setorMembros = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const cs of colaboradorSetores) {
      if (!m.has(cs.setor_id)) m.set(cs.setor_id, new Set());
      m.get(cs.setor_id)!.add(cs.profile_id);
    }
    return m;
  }, [colaboradorSetores]);

  const visibleBlocks = useMemo(
    () => hideValidadorFinal ? BLOCKS.filter(b => b.key !== "validadorFinal") : BLOCKS,
    [hideValidadorFinal]
  );

  const update = (key: RespRoleKey, patch: Partial<RespValueV2>) => {
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  };

  return (
    <div className={cn("space-y-4", className)}>
      {showHeader && (
        <div className="rounded-lg border border-blue-200/60 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/30 px-3 py-2.5 flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-blue-900 dark:text-blue-200 flex-1 leading-relaxed">
            Defina quem executa, quem recebe a nota, quem aprova e (opcional) quem audita. O plano de ação é criado pelo aprovador.
          </p>
          <button
            type="button"
            className="text-[12px] font-medium text-blue-700 dark:text-blue-300 hover:underline shrink-0 inline-flex items-center gap-1"
            onClick={(e) => e.preventDefault()}
            title="Entenda os papéis"
          >
            Entenda os papéis <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {visibleBlocks.map((b) => (
        <RoleBlock
          key={b.key}
          spec={b}
          value={value[b.key]}
          onChange={(patch) => update(b.key, patch)}
          setores={setores}
          colaboradores={colaboradores}
          setorMembros={setorMembros}
          isMobile={isMobile}
        />
      ))}

      {/* Legenda */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-[11px] text-muted-foreground">Legenda:</span>
        <Badge className="text-[10px] h-5 px-2 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 hover:bg-blue-100 border-0">Obrigatório</Badge>
        <Badge variant="outline" className="text-[10px] h-5 px-2">Opcional</Badge>
      </div>
    </div>
  );
}

/* ---------------- Bloco individual ---------------- */

interface RoleBlockProps {
  spec: BlockSpec;
  value: RespValueV2;
  onChange: (patch: Partial<RespValueV2>) => void;
  setores: Setor[];
  colaboradores: Profile[];
  setorMembros: Map<string, Set<string>>;
  isMobile: boolean;
}

function RoleBlock({ spec, value, onChange, setores, colaboradores, setorMembros, isMobile }: RoleBlockProps) {
  const [open, setOpen] = useState(spec.required); // mobile: obrigatórios já abertos

  const setorSelected = !!value.setorId;
  const memberIds = value.setorId ? (setorMembros.get(value.setorId) || new Set<string>()) : new Set<string>();
  const colabOptions = useMemo(
    () => colaboradores.filter((c) => memberIds.has(c.id)),
    [colaboradores, memberIds]
  );

  /* Regras: setor_todo XOR individual; trocar setor limpa seleção. */
  const handleSetor = (sid: string) => {
    if (sid === value.setorId) return;
    onChange({ setorId: sid, mode: null, profileIds: [] });
  };
  const toggleSetorTodo = (checked: boolean) => {
    if (!value.setorId) return;
    onChange(checked
      ? { mode: "setor_todo", profileIds: [] }
      : { mode: null });
  };
  const handleIndividual = (ids: string[]) => {
    if (!value.setorId) return;
    onChange(ids.length === 0
      ? { mode: null, profileIds: [] }
      : { mode: "individual", profileIds: ids });
  };

  const Helper = (
    <div className={cn(
      "flex items-start gap-2 rounded-md px-2.5 py-2 text-[11.5px] leading-relaxed",
      spec.helperVariant === "warn"
        ? "bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border border-amber-200/60 dark:border-amber-900/40"
        : "bg-muted/50 text-muted-foreground border border-border/50"
    )}>
      {spec.helperVariant === "warn"
        ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
        : <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />}
      <span>{spec.helper}</span>
    </div>
  );

  const Header = (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold shrink-0">
        {spec.num}
      </div>
      <spec.Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground truncate">{spec.title}</p>
          {spec.required
            ? <Badge className="text-[10px] h-4 px-1.5 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 hover:bg-blue-100 border-0">Obrigatório</Badge>
            : <Badge variant="outline" className="text-[10px] h-4 px-1.5">Opcional</Badge>}
        </div>
        {!isMobile && (
          <>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">{spec.description}</p>
            <p className="text-[10.5px] text-muted-foreground/80 italic mt-0.5">{spec.example}</p>
          </>
        )}
      </div>
    </div>
  );

  /* --------- DESKTOP --------- */
  if (!isMobile) {
    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-12 gap-4 p-4">
          {/* Esquerda: header */}
          <div className="col-span-4 border-r border-border pr-4">
            {Header}
          </div>

          {/* Direita: 3 campos */}
          <div className="col-span-8 grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">Setor (selecionar)</Label>
              <Select value={value.setorId || ""} onValueChange={handleSetor}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecionar setor..." /></SelectTrigger>
                <SelectContent>
                  {setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">Setor todo</Label>
              <div className={cn(
                "h-9 flex items-center gap-2 rounded-md border border-input bg-background px-3",
                !setorSelected && "opacity-50 pointer-events-none",
                value.mode === "setor_todo" && "border-primary"
              )}>
                <Checkbox
                  id={`${spec.key}-setor-todo`}
                  checked={value.mode === "setor_todo"}
                  onCheckedChange={(c) => toggleSetorTodo(!!c)}
                  disabled={!setorSelected}
                />
                <label htmlFor={`${spec.key}-setor-todo`} className="text-[12px] cursor-pointer select-none">
                  Marcar todos do setor
                </label>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-medium text-muted-foreground">Individual (colaboradores do setor)</Label>
              <MultiProfile
                options={colabOptions}
                selected={value.mode === "individual" ? value.profileIds : []}
                onChange={handleIndividual}
                placeholder={!setorSelected ? "Selecione o setor primeiro" : (colabOptions.length === 0 ? "Nenhum colaborador no setor" : "Selecionar colaboradores...")}
                disabled={!setorSelected || value.mode === "setor_todo"}
              />
            </div>
          </div>

          {/* Helper full width */}
          <div className="col-span-12">
            {Helper}
          </div>
        </div>
      </div>
    );
  }

  /* --------- MOBILE: card recolhível --------- */
  const summary = !setorSelected
    ? "Não definido"
    : value.mode === "setor_todo"
    ? `Setor todo • ${setores.find((s) => s.id === value.setorId)?.nome || ""}`
    : value.mode === "individual"
    ? `${value.profileIds.length} pessoa${value.profileIds.length > 1 ? "s" : ""}`
    : `Setor: ${setores.find((s) => s.id === value.setorId)?.nome || ""}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-card overflow-hidden">
      <CollapsibleTrigger asChild>
        <button type="button" className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/30 transition-colors">
          {Header}
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span className="text-[10px] text-muted-foreground">{summary}</span>
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-90")} />
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          <div>
            <p className="text-[12px] text-muted-foreground">{spec.description}</p>
            <p className="text-[11px] text-muted-foreground/80 italic mt-0.5">{spec.example}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">Setor</Label>
            <Select value={value.setorId || ""} onValueChange={handleSetor}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Selecionar setor..." /></SelectTrigger>
              <SelectContent>
                {setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className={cn(
            "flex items-center gap-2 rounded-md border border-input bg-background px-3 h-12",
            !setorSelected && "opacity-50 pointer-events-none"
          )}>
            <Checkbox
              id={`${spec.key}-m-setor-todo`}
              checked={value.mode === "setor_todo"}
              onCheckedChange={(c) => toggleSetorTodo(!!c)}
              disabled={!setorSelected}
            />
            <label htmlFor={`${spec.key}-m-setor-todo`} className="text-[13px] cursor-pointer select-none flex-1">
              Marcar todos do setor
            </label>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium text-muted-foreground">Individual (colaboradores do setor)</Label>
            <MultiProfile
              options={colabOptions}
              selected={value.mode === "individual" ? value.profileIds : []}
              onChange={handleIndividual}
              placeholder={!setorSelected ? "Selecione o setor primeiro" : (colabOptions.length === 0 ? "Nenhum colaborador no setor" : "Selecionar colaboradores...")}
              disabled={!setorSelected || value.mode === "setor_todo"}
            />
          </div>

          {Helper}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ---------------- MultiProfile ---------------- */

interface MultiProps {
  options: Profile[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}

function MultiProfile({ options, selected, onChange, placeholder, disabled }: MultiProps) {
  const [open, setOpen] = useState(false);
  const labelMap = useMemo(() => new Map(options.map((o) => [o.id, o.nome])), [options]);
  const labels = selected.map((id) => labelMap.get(id)).filter(Boolean) as string[];

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-between h-9 font-normal text-sm", labels.length === 0 && "text-muted-foreground")}
        >
          <span className="truncate text-left">
            {labels.length === 0 ? placeholder
              : labels.length <= 2 ? labels.join(", ")
              : `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`}
          </span>
          <ChevronDown className="w-4 h-4 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Buscar colaborador..." />
          <CommandList>
            <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
            <CommandGroup>
              {options.map((c) => {
                const isSelected = selected.includes(c.id);
                return (
                  <CommandItem key={c.id} value={c.nome} onSelect={() => toggle(c.id)}>
                    <div className={cn(
                      "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                      isSelected ? "bg-primary text-primary-foreground" : "opacity-50"
                    )}>
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span>{c.nome}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
