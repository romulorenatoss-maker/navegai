/**
 * tarefas_resumoConclusaoPanel.tsx
 *
 * Painel de RESUMO exibido quando o assignment está em status FINAL.
 * Mostra, um abaixo do outro, agrupado por papel/responsabilidade:
 *
 *   1. Cabeçalho com notas finais (executor / aprovador / auditor)
 *   2. Respostas do EXECUTOR — cada campo + resposta + evidência + observação
 *   3. Avaliação do APROVADOR — Conforme/NC por campo, devoluções, planos de ação
 *   4. Avaliação do AUDITOR — planos criados, respostas auto, notas dadas ao aprovador
 *
 * NÃO altera dados. NÃO aciona mutations. Read-only.
 * Reaproveita: useApprovalFlow + useAuditFlow (já consultam tudo necessário).
 *
 * Regras seguidas:
 *  • Regra 1 — UI só renderiza, sem regra crítica.
 *  • Regra 11 — separação de responsabilidades (sem regra de negócio aqui).
 *  • Regra 21 — não há useEffect com query direto neste componente
 *    (todas queries vivem em hooks com try/catch já implementado).
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, MinusCircle, FileText, Paperclip, AlertTriangle, ShieldCheck, ClipboardList, User, Award } from "lucide-react";
import { useApprovalFlow } from "@/modules/tarefas/hooks/tarefas_useApprovalFlow";
import { useAuditFlow } from "@/modules/tarefas/hooks/tarefas_useAuditFlow";
import { SnapshotField } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";

interface Props {
  assignment: any;
  fields: SnapshotField[];
}

/* ─────────────────────────────────────────────────────────────────────────
 * Helpers de leitura defensiva — tolerantes a variações de schema.
 * ──────────────────────────────────────────────────────────────────────── */
const fmtData = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
};

const fmtNota = (n?: number | null) => {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return "—";
  return num.toFixed(2);
};

const respostaExecutorTexto = (ans: any): string => {
  if (!ans) return "(sem resposta)";
  if (ans.valor_booleano === true) return "Conforme / Sim";
  if (ans.valor_booleano === false) return "Não conforme / Não";
  if (ans.valor_texto === "na") return "N/A";
  if (ans.valor_numero !== null && ans.valor_numero !== undefined) return String(ans.valor_numero);
  if (ans.valor_texto && String(ans.valor_texto).trim() !== "") return String(ans.valor_texto);
  if (ans.valor_json && typeof ans.valor_json === "object") {
    const j: any = ans.valor_json;
    const opt = j.resposta ?? j.valor ?? j.label ?? j.opcao;
    if (opt) return String(opt);
  }
  return "(sem resposta)";
};

const respostaAprovadorTexto = (apr: any): { texto: string; cor: "verde" | "vermelho" | "neutro" } => {
  if (!apr) return { texto: "(não avaliado)", cor: "neutro" };
  const raw = String(apr.resposta ?? "").toLowerCase().trim();
  if (raw === "conforme" || raw === "ok" || raw === "sim") return { texto: "Conforme", cor: "verde" };
  if (raw === "nao_conforme" || raw === "não conforme" || raw === "nc") return { texto: "Não conforme", cor: "vermelho" };
  if (raw === "na" || raw === "n/a") return { texto: "N/A", cor: "neutro" };
  return { texto: apr.resposta || "(sem decisão)", cor: "neutro" };
};

/* ─────────────────────────────────────────────────────────────────────────
 * Componente principal
 * ──────────────────────────────────────────────────────────────────────── */
export function ResumoConclusaoPanel({ assignment, fields }: Props) {
  const approvalFlow = useApprovalFlow(assignment?.id || null);
  const auditFlow = useAuditFlow(assignment?.id || null);

  // Campos visíveis (sem divisores/títulos)
  const camposReais = useMemo(
    () => fields.filter((f) => !["secao", "divisor", "titulo"].includes(String(f.tipo))),
    [fields]
  );

  // Perguntas auto do aprovador (do snapshot)
  const perguntasAutoAprovador = useMemo<any[]>(() => {
    const snap = assignment?.operational_templates?.ada_config_snapshot
      ?? assignment?.template_snapshot?.ada_config_snapshot;
    const lista = snap?.checklists?.aprovador;
    return Array.isArray(lista) ? lista.filter((p: any) => p.ativo !== false) : [];
  }, [assignment]);

  // Perguntas auto do auditor (do snapshot)
  const perguntasAutoAuditor = useMemo<any[]>(() => {
    const snap = assignment?.operational_templates?.ada_config_snapshot
      ?? assignment?.template_snapshot?.ada_config_snapshot;
    const lista = snap?.checklists?.validador;
    return Array.isArray(lista) ? lista.filter((p: any) => p.ativo !== false) : [];
  }, [assignment]);

  // Indexadores por field_id
  const ansByField = useMemo<Record<string, any>>(() => {
    const map: Record<string, any> = {};
    (approvalFlow.fieldAnswers as any[]).forEach((a) => { map[a.field_id] = a; });
    return map;
  }, [approvalFlow.fieldAnswers]);

  const aprByField = useMemo<Record<string, any>>(() => {
    const map: Record<string, any> = {};
    (approvalFlow.existingApprovalAnswers as any[]).forEach((a) => { map[a.field_id] = a; });
    return map;
  }, [approvalFlow.existingApprovalAnswers]);

  const reviewsAprovadorByField = useMemo<Record<string, any[]>>(() => {
    const map: Record<string, any[]> = {};
    (approvalFlow.fieldReviews as any[])
      .filter((r) => r.criado_por_papel !== "auditor")
      .forEach((r) => {
        if (!map[r.field_id]) map[r.field_id] = [];
        map[r.field_id].push(r);
      });
    return map;
  }, [approvalFlow.fieldReviews]);

  const planosAuditorByField = useMemo<Record<string, any[]>>(() => {
    const map: Record<string, any[]> = {};
    (auditFlow.fieldReviewsAuditor as any[]).forEach((r) => {
      if (!map[r.field_id]) map[r.field_id] = [];
      map[r.field_id].push(r);
    });
    return map;
  }, [auditFlow.fieldReviewsAuditor]);

  const auditorAnsByField = useMemo<Record<string, any>>(() => {
    const map: Record<string, any> = {};
    (auditFlow.existingAuditAnswers as any[]).forEach((a) => { map[a.field_id] = a; });
    return map;
  }, [auditFlow.existingAuditAnswers]);

  const finalizadoEm = assignment?.finalizado_em ?? assignment?.concluida_em ?? assignment?.updated_at;

  /* ───────────────────────────────────────────────────────────────────────
   * Render
   * ────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {/* ───── CABEÇALHO ───── */}
      <Card className="border-emerald-200 bg-emerald-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Award className="h-5 w-5 text-emerald-700" />
            Resumo da conclusão
            <Badge variant="outline" className="ml-auto text-xs">
              {assignment?.status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Finalizado em</div>
              <div className="font-medium">{fmtData(finalizadoEm)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Nota executor</div>
              <div className="font-medium">{fmtNota(assignment?.score_executor ?? assignment?.score_avaliado)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Nota aprovador</div>
              <div className="font-medium">{fmtNota(assignment?.score_aprovador ?? assignment?.score_aprovacao)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Nota auditor</div>
              <div className="font-medium">{fmtNota(assignment?.score_auditor)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ───── 1. EXECUTOR ───── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-blue-700" />
            <span>Respostas do Executor</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {camposReais.length} pergunta(s)
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {camposReais.length === 0 && (
            <div className="text-xs text-muted-foreground italic">Sem perguntas no checklist.</div>
          )}
          {camposReais.map((f) => {
            const ans = ansByField[f.id];
            const evid = ans?.evidencia_url || ans?.evidencia_anexo_id;
            return (
              <div key={f.id} className="rounded-md border bg-white p-3 text-sm">
                <div className="font-medium text-foreground">{f.label}</div>
                <div className="mt-1 grid grid-cols-1 gap-1 md:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground text-xs">Resposta: </span>
                    <span className="font-medium">{respostaExecutorTexto(ans)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Evidência: </span>
                    {evid ? (
                      <a
                        href={ans?.evidencia_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline inline-flex items-center gap-1"
                      >
                        <Paperclip className="h-3 w-3" /> ver
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Observação: </span>
                    <span>{ans?.observacao || "—"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ───── 2. APROVADOR ───── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-amber-700" />
            <span>Avaliação do Aprovador</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 2a — checklist Conforme/NC do aprovador */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Decisão por pergunta
            </div>
            {camposReais.map((f) => {
              const apr = aprByField[f.id];
              const reviews = reviewsAprovadorByField[f.id] || [];
              const decisao = respostaAprovadorTexto(apr);
              const corClasse =
                decisao.cor === "verde" ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : decisao.cor === "vermelho" ? "bg-rose-100 text-rose-800 border-rose-200"
                : "bg-slate-100 text-slate-700 border-slate-200";
              return (
                <div key={f.id} className="rounded-md border bg-white p-2.5 text-sm mb-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium flex-1">{f.label}</div>
                    <Badge variant="outline" className={`text-xs ${corClasse}`}>
                      {decisao.texto}
                    </Badge>
                  </div>
                  {apr?.observacao && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      <FileText className="inline h-3 w-3 mr-1" />
                      {apr.observacao}
                    </div>
                  )}
                  {reviews.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {reviews.map((r) => (
                        <div key={r.id} className="rounded border-l-2 border-amber-400 bg-amber-50 pl-2 py-1 text-xs">
                          <span className="font-semibold">R{r.rodada}</span>
                          {r.devolvido && (
                            <span className="ml-1">
                              <AlertTriangle className="inline h-3 w-3 text-amber-700" />
                              Devolveu — {r.motivo_devolucao || "(sem motivo)"}
                            </span>
                          )}
                          {Array.isArray(r.itens_plano) && r.itens_plano.length > 0 && (
                            <div className="mt-0.5">
                              <ClipboardList className="inline h-3 w-3 mr-1 text-amber-700" />
                              Plano de ação ({r.itens_plano.length} item(s))
                            </div>
                          )}
                          {r.prazo_resolucao && (
                            <div className="mt-0.5 text-muted-foreground">
                              Prazo: {fmtData(r.prazo_resolucao)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Separator />

          {/* 2b — perguntas auto do aprovador */}
          {perguntasAutoAprovador.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Notas automáticas (do executor)
              </div>
              <div className="space-y-1">
                {perguntasAutoAprovador.map((p: any) => (
                  <div key={p.id || p.metrica} className="flex items-start justify-between gap-2 rounded border bg-white p-2 text-xs">
                    <div className="flex-1">{p.pergunta || p.label || p.metrica}</div>
                    <Badge variant="outline" className="text-[10px]">
                      {p.metrica}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground italic">
                Cálculo automático — ver detalhe no painel de aprovação.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ───── 3. AUDITOR ───── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-purple-700" />
            <span>Avaliação do Auditor</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 3a — planos do auditor para o aprovador */}
          {Object.keys(planosAuditorByField).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Planos do auditor (para o aprovador)
              </div>
              {Object.entries(planosAuditorByField).map(([fieldId, lista]) => {
                const f = camposReais.find((x) => x.id === fieldId);
                return (
                  <div key={fieldId} className="rounded-md border bg-white p-2.5 text-sm mb-1.5">
                    <div className="font-medium">{f?.label ?? `Campo ${fieldId}`}</div>
                    {lista.map((p: any) => (
                      <div key={p.id} className="mt-1 rounded border-l-2 border-purple-400 bg-purple-50 pl-2 py-1 text-xs">
                        <div className="font-semibold">R{p.rodada}</div>
                        {p.motivo_devolucao && <div>Motivo: {p.motivo_devolucao}</div>}
                        {p.respondido ? (
                          <div className="text-emerald-700">
                            <CheckCircle2 className="inline h-3 w-3 mr-1" />
                            Respondido pelo aprovador
                          </div>
                        ) : (
                          <div className="text-amber-700">
                            <MinusCircle className="inline h-3 w-3 mr-1" />
                            Sem resposta do aprovador
                          </div>
                        )}
                        {p.prazo_resolucao && (
                          <div className="text-muted-foreground">Prazo: {fmtData(p.prazo_resolucao)}</div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* 3b — respostas do auditor */}
          {auditFlow.existingAuditAnswers.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Respostas do auditor
              </div>
              <div className="space-y-1">
                {(auditFlow.existingAuditAnswers as any[]).map((a) => {
                  const f = camposReais.find((x) => x.id === a.field_id);
                  return (
                    <div key={a.id} className="rounded border bg-white p-2 text-xs">
                      <div className="font-medium">{f?.label ?? a.field_id}</div>
                      <div className="text-muted-foreground">
                        Resposta: <span className="text-foreground">{a.resposta || "—"}</span>
                      </div>
                      {a.observacao && (
                        <div className="text-muted-foreground">Obs: {a.observacao}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3c — perguntas auto do auditor */}
          {perguntasAutoAuditor.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Notas automáticas (do aprovador)
              </div>
              <div className="space-y-1">
                {perguntasAutoAuditor.map((p: any) => (
                  <div key={p.id || p.metrica} className="flex items-start justify-between gap-2 rounded border bg-white p-2 text-xs">
                    <div className="flex-1">{p.pergunta || p.label || p.metrica}</div>
                    <Badge variant="outline" className="text-[10px]">
                      {p.metrica}
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground italic">
                Cálculo automático — ver detalhe no painel de auditoria.
              </div>
            </div>
          )}

          {Object.keys(planosAuditorByField).length === 0
            && auditFlow.existingAuditAnswers.length === 0
            && perguntasAutoAuditor.length === 0 && (
            <div className="text-xs text-muted-foreground italic">
              Sem registros de auditoria.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ResumoConclusaoPanel;
