import { useMemo, useState } from "react";
import { Check, ChevronDown, User, Users, ShieldCheck, Award, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type RespMode = "individual" | "setorial";

export interface RespValue {
  mode: RespMode;
  /** lista de profile_ids quando mode = individual (multi-select). Para legacy, usa o primeiro. */
  profileIds: string[];
  setorId: string;
}

export const emptyResp: RespValue = { mode: "individual", profileIds: [], setorId: "" };

export interface RespBlocksValue {
  avaliado: RespValue;
  avaliador: RespValue;
  aprovador: RespValue;
  validadorFinal: RespValue;
}

export const emptyRespBlocks: RespBlocksValue = {
  avaliado: { ...emptyResp },
  avaliador: { ...emptyResp },
  aprovador: { ...emptyResp },
  validadorFinal: { ...emptyResp },
};

interface Profile { id: string; nome: string }
interface Setor { id: string; nome: string }

interface BlockSpec {
  key: keyof RespBlocksValue;
  num: number;
  title: string;
  hint: string;
  required: boolean;
  Icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const BLOCKS: BlockSpec[] = [
  { key: "avaliado", num: 1, title: "Avaliado", hint: "Pessoa que executa a tarefa e recebe a nota.", required: true, Icon: User },
  { key: "avaliador", num: 2, title: "Avaliador (Plano de Ação)", hint: "Quem confere a execução e responde os planos de ação.", required: false, Icon: ShieldCheck, badge: "Avaliação + PA" },
  { key: "aprovador", num: 3, title: "Aprovador", hint: "Aprovação final e pontuação. Vazio = sem aprovação final.", required: false, Icon: Award },
  { key: "validadorFinal", num: 4, title: "Validador Final", hint: "Avalia o avaliador (AdA). Vazio = não gera AdA.", required: false, Icon: UserCheck },
];

interface Props {
  value: RespBlocksValue;
  onChange: (next: RespBlocksValue) => void;
  setores: Setor[];
  colaboradores: Profile[];
  /** Mapa setor_id → profile_ids para filtrar "individual" pelo setor da tarefa/rotina. */
  colaboradorSetores: { profile_id: string; setor_id: string }[];
  /** Setor da tarefa/rotina (filtra avaliado). */
  setorTarefaId?: string;
  /** Aviso de persistência multi (rotina sem migration). */
  multiPersistWarning?: string;
  /** Esconder bloco 4 (caso AdA seja gerenciado em outro lugar). */
  hideValidadorFinal?: boolean;
  className?: string;
}

export function TarefasResponsaveisBlocks({
  value, onChange, setores, colaboradores, colaboradorSetores,
  setorTarefaId, multiPersistWarning, hideValidadorFinal, className,
}: Props) {
  const setorMembros = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const cs of colaboradorSetores) {
      if (!m.has(cs.setor_id)) m.set(cs.setor_id, new Set());
      m.get(cs.setor_id)!.add(cs.profile_id);
    }
    return m;
  }, [colaboradorSetores]);

  const update = (key: keyof RespBlocksValue, patch: Partial<RespValue>) => {
    onChange({ ...value, [key]: { ...value[key], ...patch } });
  };

  const visibleBlocks = hideValidadorFinal ? BLOCKS.filter(b => b.key !== "validadorFinal") : BLOCKS;

  return (
    <div className={cn("space-y-3", className)}>
      {visibleBlocks.map((b) => {
        const v = value[b.key];
        // Avaliado: filtra colaboradores pelo setor da tarefa.
        // Outros papéis: todos os colaboradores ativos.
        const avalIds = b.key === "avaliado" && setorTarefaId
          ? (setorMembros.get(setorTarefaId) || new Set<string>())
          : null;
        const colabOptions = avalIds
          ? colaboradores.filter(c => avalIds.has(c.id))
          : colaboradores;

        return (
          <div key={b.key} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                  {b.num}
                </div>
                <b.Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{b.title}</p>
                    {b.required && <Badge variant="destructive" className="text-[10px] h-4 px-1.5">Obrigatório</Badge>}
                    {!b.required && <Badge variant="outline" className="text-[10px] h-4 px-1.5">Opcional</Badge>}
                    {b.badge && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{b.badge}</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{b.hint}</p>
                </div>
              </div>

              {/* Toggle de modo segmentado */}
              <div className="inline-flex rounded-md border border-border bg-background p-0.5 shrink-0">
                {(["individual", "setorial"] as RespMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => update(b.key, { mode: m })}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-medium rounded transition-colors",
                      v.mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "individual" ? "Individual" : "Setorial"}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 space-y-2">
              {v.mode === "individual" ? (
                <MultiProfileSelect
                  options={colabOptions}
                  selected={v.profileIds}
                  onChange={(ids) => update(b.key, { profileIds: ids })}
                  placeholder={
                    b.key === "avaliado" && !setorTarefaId
                      ? "Selecione o setor da tarefa primeiro"
                      : (colabOptions.length === 0 ? "Nenhum colaborador disponível" : "Selecionar colaboradores...")
                  }
                  disabled={b.key === "avaliado" && !setorTarefaId}
                  singleOnly={b.key === "avaliado"}
                />
              ) : (
                <Select value={v.setorId} onValueChange={(s) => update(b.key, { setorId: s })}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecionar setor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {setores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Aviso multi-persist apenas em modo individual com mais de 1 selecionado */}
              {v.mode === "individual" && v.profileIds.length > 1 && multiPersistWarning && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">{multiPersistWarning}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface MultiProps {
  options: Profile[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  disabled?: boolean;
  /** Se true, aceita apenas 1 (caso Avaliado). */
  singleOnly?: boolean;
}

function MultiProfileSelect({ options, selected, onChange, placeholder, disabled, singleOnly }: MultiProps) {
  const [open, setOpen] = useState(false);
  const labelMap = useMemo(() => new Map(options.map(o => [o.id, o.nome])), [options]);
  const labels = selected.map((id) => labelMap.get(id)).filter(Boolean) as string[];

  const toggle = (id: string) => {
    if (singleOnly) {
      onChange([id]);
      setOpen(false);
      return;
    }
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("w-full justify-between h-9 font-normal", labels.length === 0 && "text-muted-foreground")}
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

/** Helpers para mapear RespValue ↔ colunas legacy */
export const respLegacyProfileId = (v: RespValue): string =>
  v.mode === "individual" ? (v.profileIds[0] || "") : "";
export const respLegacySetorId = (v: RespValue): string =>
  v.mode === "setorial" ? (v.setorId || "") : "";

export const isRespFilled = (v: RespValue): boolean =>
  v.mode === "individual" ? v.profileIds.length > 0 : !!v.setorId;
