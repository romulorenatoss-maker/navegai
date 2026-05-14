/**
 * Aba Aprovador — lista ÚNICA de perguntas (replicadas + automáticas + manuais).
 *
 * Ordem de exibição:
 *   1. Perguntas replicadas do Avaliado (uma por field operacional).
 *   2. Perguntas automáticas do pacote padrão da config global.
 *   3. Perguntas manuais adicionadas pelo construtor da rotina.
 *
 * Badge discreto (REPLICADA / AUTO / MANUAL) por item.
 * Cada card abre o mesmo FieldConfigSheet usado para configurar perguntas.
 */
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Plus, Settings2, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { FieldForm } from "@/modules/tarefas/types/tarefas_types";
import {
  AprovadorCheckItemForm,
  AprovadorOrigem,
  defaultAprovadorCheckItem,
  defaultAprovadorManualItem,
  buildAprovadorAutomatico,
} from "./types";
import { FieldConfigSheet } from "./FieldConfigSheet";
import { getPontuacaoConfig } from "@/modules/tarefas/services/tarefas_pontuacao_config_service";

interface Props {
  fields: FieldForm[];
  items: AprovadorCheckItemForm[];
  setItems: React.Dispatch<React.SetStateAction<AprovadorCheckItemForm[]>>;
}

const ORIGEM_BADGE: Record<AprovadorOrigem, { label: string; cls: string }> = {
  replicada_avaliado:       { label: "REPLICADA",        cls: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900" },
  automatica_configuracao:  { label: "AUTO",             cls: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900" },
  replicada_padrao_manual:  { label: "MANUAL PADRÃO",    cls: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900" },
  manual:                   { label: "MANUAL",           cls: "bg-muted text-muted-foreground border-border" },
};

const TIPO_LABEL: Record<string, string> = {
  conforme_nao_conforme: "Conforme / Não conforme",
  sim_nao: "Sim / Não",
  nota: "Nota (0–100)",
};

export function StepChecklistAprovador({ fields, items, setItems }: Props) {
  const { profile } = useAuth();
  const [editingTempId, setEditingTempId] = useState<string | null>(null);

  // Sincroniza apenas as perguntas REPLICADAS com os fields do Avaliado.
  // Itens AUTO/MANUAL não são tocados.
  useEffect(() => {
    setItems(prev => {
      const replicadasPrev = prev.filter(i => i.origem_pergunta === "replicada_avaliado" || (!i.origem_pergunta && i.field_id));
      const naoReplicadas = prev.filter(i => !replicadasPrev.includes(i));
      const byField = new Map(replicadasPrev.map(i => [i.field_id, i]));
      const fieldIds = new Set(fields.map(f => f.tempId));

      const replicadasNext: AprovadorCheckItemForm[] = fields.map(f => {
        const existing = byField.get(f.tempId);
        if (existing) {
          const oldLabel = existing.field_label || "";
          const labelChanged = oldLabel !== f.label;
          const wasDefaultPergunta =
            !existing.pergunta_padrao ||
            existing.pergunta_padrao === `Aprovador confirma: ${oldLabel}?`;
          return {
            ...existing,
            field_label: f.label,
            pergunta_padrao:
              labelChanged && wasDefaultPergunta
                ? `Aprovador confirma: ${f.label}?`
                : existing.pergunta_padrao,
            origem_pergunta: "replicada_avaliado",
            pergunta_origem_id: f.tempId,
          };
        }
        return defaultAprovadorCheckItem(f.tempId, f.label || "Pergunta sem nome");
      });

      const orphans = replicadasPrev.filter(i => !fieldIds.has(i.field_id));
      const next = [...replicadasNext, ...naoReplicadas];

      // No-op detection
      if (
        replicadasNext.length === replicadasPrev.length &&
        orphans.length === 0 &&
        replicadasNext.every((n, idx) => {
          const p = replicadasPrev[idx];
          return p && p.field_id === n.field_id && p.field_label === n.field_label && p.pergunta_padrao === n.pergunta_padrao;
        })
      ) {
        return prev;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  // Carrega o pacote padrão global e injeta na lista, preservando edições locais.
  // Idempotente: só adiciona itens automáticos que ainda não existem (por config_global_origem_id).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getPontuacaoConfig();
        if (cancelled) return;
        const pacote = (cfg.aprovador_pacote_padrao ?? []).filter(p => p.ativo !== false);
        if (pacote.length === 0) return;
        setItems(prev => {
          const existentes = new Set(
            prev
              .filter(i => i.origem_pergunta === "automatica_configuracao")
              .map(i => i.config_global_origem_id)
              .filter(Boolean)
          );
          const novos = pacote
            .filter(p => !existentes.has(p.id))
            .map(p => buildAprovadorAutomatico(p));
          if (novos.length === 0) return prev;
          return [...prev, ...novos];
        });
      } catch {
        /* silencioso — usuário pode editar manualmente */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lista ordenada para exibição
  const ordered = useMemo(() => {
    const ord = (i: AprovadorCheckItemForm) => {
      switch (i.origem_pergunta) {
        case "replicada_avaliado": return 0;
        case "automatica_configuracao": return 1;
        case "manual":
        default: return 2;
      }
    };
    return [...items].sort((a, b) => ord(a) - ord(b));
  }, [items]);

  const totalPeso = useMemo(
    () => items.filter(i => i.ativo !== false).reduce((s, i) => s + (Number(i.peso) || 0), 0),
    [items],
  );

  const editing = items.find(i => i.tempId === editingTempId) ?? null;

  const updateItem = (tempId: string, patch: Partial<AprovadorCheckItemForm>) => {
    setItems(prev => prev.map(i => {
      if (i.tempId !== tempId) return i;
      const next = { ...i, ...patch };
      // Auditoria: marca edição manual em itens automáticos
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
        <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Avaliação do Aprovador</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lista única em sequência: perguntas replicadas do Avaliado, perguntas automáticas
            do pacote padrão (Configurações &gt; Pontuação/SLA) e perguntas manuais adicionadas
            por você. Cada item pode ter regras próprias (devolução, plano de ação, evidência…).
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Nota total</div>
          <div className="text-sm font-bold text-primary">{totalPeso}</div>
        </div>
      </div>

      {ordered.length === 0 && (
        <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
          Nenhuma pergunta ainda. Adicione perguntas no Avaliado, configure o pacote padrão em
          Configurações ou clique em <strong>+ Pergunta manual</strong>.
        </div>
      )}

      <div className="space-y-2">
        {ordered.map((it, idx) => {
          const origem = it.origem_pergunta ?? (it.field_id ? "replicada_avaliado" : "manual");
          const badge = ORIGEM_BADGE[origem];
          const isReplicada = origem === "replicada_avaliado";
          const isDoPacote = origem === "automatica_configuracao" || origem === "replicada_padrao_manual";
          const inativa = it.ativo === false;
          return (
            <div key={it.tempId} className={`border rounded-lg bg-card p-3 ${inativa ? "border-dashed border-border opacity-60" : "border-border"}`}>
              <div className="flex items-start gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 font-semibold ${badge.cls}`}>
                      {badge.label}
                    </Badge>
                    {inativa && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-muted text-muted-foreground">
                        DESATIVADA · não conta na nota
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
                  {isDoPacote && (
                    <Switch
                      checked={it.ativo !== false}
                      onCheckedChange={(v) => updateItem(it.tempId, { ativo: v })}
                      title={it.ativo !== false ? "Desativar (não contabilizar na nota)" : "Reativar"}
                    />
                  )}
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingTempId(it.tempId)}>
                    <Settings2 className="w-3.5 h-3.5" />
                  </Button>
                  {!isReplicada && !isDoPacote && (
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeItem(it.tempId)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
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
            editing.origem_pergunta === "replicada_avaliado" ? "Configurar pergunta replicada" :
            editing.origem_pergunta === "automatica_configuracao" ? "Configurar pergunta automática" :
            "Configurar pergunta manual"
          }
          perguntaBloqueada={editing.origem_pergunta === "replicada_avaliado"}
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
