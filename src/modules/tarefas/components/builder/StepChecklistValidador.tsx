/**
 * Aba Validador/Auditor — lista ÚNICA (automáticas do pacote padrão + manuais).
 *
 * Reusa o mesmo modelo visual e funcional da aba Aprovador:
 *   - Lista única, badges AUTO/MANUAL.
 *   - Mesmo FieldConfigSheet para configurar pergunta/regras/peso/SLA.
 *   - Pacote padrão carregado de Configurações > Pontuação / Notas.
 *
 * Importante: O Validador audita a ATUAÇÃO DO APROVADOR; nunca avalia o
 * Executor diretamente. As perguntas automáticas refletem isso.
 */
import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Plus, Settings2, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import {
  AprovadorCheckItemForm,
  AprovadorOrigem,
  defaultAprovadorManualItem,
  buildAprovadorAutomatico,
} from "./types";
import { FieldConfigSheet } from "./FieldConfigSheet";
import { getPontuacaoConfig } from "@/modules/tarefas/services/tarefas_pontuacao_config_service";

interface Props {
  items: AprovadorCheckItemForm[];
  setItems: React.Dispatch<React.SetStateAction<AprovadorCheckItemForm[]>>;
}

const ORIGEM_BADGE: Record<AprovadorOrigem, { label: string; cls: string }> = {
  replicada_avaliado:       { label: "REPLICADA",        cls: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900" },
  automatica_configuracao:  { label: "REPLICADA AUTO",   cls: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900" },
  replicada_padrao_manual:  { label: "REPLICADA MANUAL", cls: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900" },
  manual:                   { label: "MANUAL",           cls: "bg-muted text-muted-foreground border-border" },
};

const TIPO_LABEL: Record<string, string> = {
  conforme_nao_conforme: "Conforme / Não conforme",
  sim_nao: "Sim / Não",
  nota: "Nota (0–100)",
};

export function StepChecklistValidador({ items, setItems }: Props) {
  const { profile } = useAuth();
  const [editingTempId, setEditingTempId] = useState<string | null>(null);

  // Carrega o pacote padrão do Validador uma vez; idempotente.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getPontuacaoConfig();
        if (cancelled) return;
        const pacote = (cfg.validador_pacote_padrao ?? []).filter(p => p.ativo !== false);
        if (pacote.length === 0) return;
        setItems(prev => {
          const existentes = new Set(
            prev
              .filter(i => i.origem_pergunta === "automatica_configuracao")
              .map(i => i.config_global_origem_id)
              .filter(Boolean),
          );
          const novos = pacote
            .filter(p => !existentes.has(p.id))
            .map(p => buildAprovadorAutomatico(p));
          if (novos.length === 0) return prev;
          return [...prev, ...novos];
        });
      } catch {
        /* silencioso — usuário pode adicionar manualmente */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ordered = useMemo(() => {
    const ord = (i: AprovadorCheckItemForm) => i.origem_pergunta === "automatica_configuracao" ? 0 : 1;
    return [...items].sort((a, b) => ord(a) - ord(b));
  }, [items]);

  const totalPeso = useMemo(() => items.reduce((s, i) => s + (Number(i.peso) || 0), 0), [items]);
  const editing = items.find(i => i.tempId === editingTempId) ?? null;

  const updateItem = (tempId: string, patch: Partial<AprovadorCheckItemForm>) => {
    setItems(prev => prev.map(i => {
      if (i.tempId !== tempId) return i;
      const next = { ...i, ...patch };
      if (i.origem_pergunta === "automatica_configuracao") {
        next.editado_manual = true;
        next.editado_por = profile?.id;
        next.editado_em = new Date().toISOString();
        next.config_atual_snapshot = { ...next };
      }
      return next;
    }));
  };

  const addManual = () => {
    const novo = defaultAprovadorManualItem();
    setItems(prev => [...prev, novo]);
    setEditingTempId(novo.tempId);
  };

  const removeItem = (tempId: string) => {
    setItems(prev => prev.filter(i => i.tempId !== tempId));
  };

  return (
    <div className="space-y-3">
      <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 flex items-start gap-2.5">
        <ClipboardCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Auditoria do Validador</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lista única em sequência: perguntas automáticas do pacote padrão (Configurações &gt;
            Pontuação / Notas) e perguntas manuais adicionadas por você. O Validador audita a
            atuação do <strong>Aprovador</strong> — nunca avalia o Executor diretamente.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Nota total</div>
          <div className="text-sm font-bold text-primary">{totalPeso}</div>
        </div>
      </div>

      {ordered.length === 0 && (
        <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
          Nenhuma pergunta ainda. Configure o pacote padrão do Validador em
          Configurações &gt; Pontuação / Notas ou clique em <strong>+ Pergunta manual</strong>.
        </div>
      )}

      <div className="space-y-2">
        {ordered.map((it, idx) => {
          const origem: AprovadorOrigem = it.origem_pergunta ?? "manual";
          const badge = ORIGEM_BADGE[origem];
          return (
            <div key={it.tempId} className="border border-border rounded-lg bg-card p-3">
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 font-semibold ${badge.cls}`}>
                      {badge.label}
                    </Badge>
                    {it.metrica_pendente && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-muted text-muted-foreground" title={it.regra_calculo || "Métrica ainda não cabeada"}>
                        métrica pendente
                      </Badge>
                    )}
                    {it.editado_manual && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">EDITADA</Badge>
                    )}
                    {it.instrucao_url && (
                      <Paperclip className="w-3 h-3 text-primary" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground leading-snug">{it.pergunta_padrao || "—"}</p>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                    <span>Tipo: <span className="text-foreground">{TIPO_LABEL[it.tipo_resposta] ?? it.tipo_resposta}</span></span>
                    <span>Nota: <span className="text-foreground font-semibold">{it.peso}</span></span>
                    {it.gera_plano_acao && <span className="text-amber-600 dark:text-amber-400">• Plano de ação</span>}
                    {it.exige_evidencia && <span className="text-blue-600 dark:text-blue-400">• Evidência</span>}
                    {it.permite_devolucao && <span>• Devolução</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingTempId(it.tempId)}>
                    <Settings2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeItem(it.tempId)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button type="button" size="sm" variant="outline" onClick={addManual} className="w-full">
        <Plus className="w-3.5 h-3.5 mr-1" /> Pergunta manual
      </Button>

      {editing && (
        <FieldConfigSheet
          open={!!editingTempId}
          onOpenChange={(o) => { if (!o) setEditingTempId(null); }}
          title={
            editing.origem_pergunta === "automatica_configuracao"
              ? "Configurar pergunta automática"
              : "Configurar pergunta manual"
          }
          value={{
            pergunta_padrao: editing.pergunta_padrao,
            tipo_resposta: editing.tipo_resposta,
            tipo: editing.tipo,
            opcoes: editing.opcoes,
            regras_por_opcao: editing.regras_por_opcao,
            peso: editing.peso,
            permite_ponderacao_auditor: editing.permite_ponderacao_auditor,
            exige_justificativa_ponderacao: editing.exige_justificativa_ponderacao,
            sla_horas: editing.sla_horas,
            instrucao_url: editing.instrucao_url,
            instrucao_tipo: editing.instrucao_tipo,
          }}
          onSave={(next) => {
            const regs = next.regras_por_opcao ?? [];
            updateItem(editing.tempId, {
              ...next,
              gera_plano_acao: regs.some(r => r.gera_plano_acao),
              exige_evidencia: regs.some(r => r.exige_evidencia),
              exige_observacao: regs.some(r => r.exige_observacao),
              permite_devolucao: regs.some(r => r.permite_devolucao),
            });
          }}
        />
      )}
    </div>
  );
}
