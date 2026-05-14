import { useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { CamadaSlaConfig, TarefasPontuacaoConfig } from "@/modules/tarefas/services/tarefas_pontuacao_config_service";

export type CamadaKey = "sla_executor" | "sla_aprovador" | "sla_validador";

export type PenalidadesOverrideItem = Partial<
  Pick<CamadaSlaConfig, "sla_horas" | "penalidade_atraso" | "penalidade_nao_resposta" | "penalidade_nao_conformidade">
>;

export type PenalidadesOverrideMap = Partial<Record<CamadaKey, PenalidadesOverrideItem>>;

interface Props {
  camadaKey: CamadaKey;
  titulo: string;
  /** Texto curto explicando o papel do bloco na camada. */
  descricao?: string;
  /** Aviso especial (ex: validador não é avaliado). */
  nota?: string;
  /** Config global (lida da tela de Configurações > Pontuação/SLA). */
  globalConfig: TarefasPontuacaoConfig | null | undefined;
  /** Overrides locais desta rotina. */
  overrides: PenalidadesOverrideMap;
  onOverridesChange: (next: PenalidadesOverrideMap) => void;
  /** Compõe no peso total: ao informar, soma as penalidades desta camada. */
  onTotalChange?: (total: number) => void;
}

const PERGUNTAS: Array<{ key: keyof CamadaSlaConfig; label: string }> = [
  { key: "penalidade_atraso", label: "Atrasou a entrega da resposta?" },
  { key: "penalidade_nao_resposta", label: "Deixou de responder?" },
  { key: "penalidade_nao_conformidade", label: "Resposta marcada como não conformidade?" },
];

export function PenalidadesAutomaticasBlock({
  camadaKey, titulo, descricao, nota, globalConfig, overrides, onOverridesChange,
}: Props) {
  const base: CamadaSlaConfig | null = globalConfig?.[camadaKey] ?? null;
  const ov: PenalidadesOverrideItem = overrides[camadaKey] ?? {};

  const merged = useMemo(() => ({
    sla_horas: ov.sla_horas ?? base?.sla_horas ?? 0,
    penalidade_atraso: ov.penalidade_atraso ?? base?.penalidade_atraso ?? 0,
    penalidade_nao_resposta: ov.penalidade_nao_resposta ?? base?.penalidade_nao_resposta ?? 0,
    penalidade_nao_conformidade: ov.penalidade_nao_conformidade ?? base?.penalidade_nao_conformidade ?? 0,
  }), [ov, base]);

  const totalPenal = merged.penalidade_atraso + merged.penalidade_nao_resposta + merged.penalidade_nao_conformidade;

  const update = (k: keyof PenalidadesOverrideItem, v: number) => {
    const next: PenalidadesOverrideMap = {
      ...overrides,
      [camadaKey]: { ...ov, [k]: v },
    };
    onOverridesChange(next);
  };

  const reset = () => {
    const next = { ...overrides };
    delete next[camadaKey];
    onOverridesChange(next);
  };

  const hasOverride = Object.keys(ov).length > 0;

  if (!base) {
    return (
      <div className="border border-dashed border-border rounded-lg p-3 text-xs text-muted-foreground">
        Carregando configuração global de Pontuação/SLA…
      </div>
    );
  }

  return (
    <div className="border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 rounded-lg p-3 space-y-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{titulo}</p>
          {descricao && <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>}
          {nota && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1 flex items-center gap-1">
              <Info className="w-3 h-3" /> {nota}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Penalidade total</div>
          <div className="text-sm font-bold text-amber-700 dark:text-amber-300">−{totalPenal}</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {PERGUNTAS.map((p) => {
          const baseVal = base[p.key] as number;
          const curVal = (ov[p.key as keyof PenalidadesOverrideItem] as number | undefined) ?? baseVal;
          const isOverridden = ov[p.key as keyof PenalidadesOverrideItem] !== undefined;
          return (
            <div key={p.key as string} className="flex items-center gap-2 px-2 py-1.5 rounded bg-card border border-border/60">
              <span className="text-[11px] font-medium text-foreground flex-1 truncate">{p.label}</span>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">−</Label>
              <Input
                type="number" min={0} max={100}
                className="h-7 w-20 text-xs"
                value={curVal}
                onChange={(e) => update(p.key as keyof PenalidadesOverrideItem, Math.max(0, Number(e.target.value) || 0))}
              />
              <span className="text-[10px] text-muted-foreground w-14 text-right">
                {isOverridden ? `padrão: ${baseVal}` : "padrão"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <span className="text-[11px] text-muted-foreground">
          SLA da camada: <strong className="text-foreground">{merged.sla_horas}h</strong>
        </span>
        {hasOverride && (
          <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px]" onClick={reset}>
            Restaurar padrões
          </Button>
        )}
      </div>
    </div>
  );
}
