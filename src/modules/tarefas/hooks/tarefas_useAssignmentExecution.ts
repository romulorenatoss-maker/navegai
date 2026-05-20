import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { FieldAnswer, SnapshotField, evaluateVisibility, validateField } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";

export function useAssignmentExecution(assignmentId: string | null) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { transition } = useOperationalTransition();
  const [answers, setAnswers] = useState<Record<string, FieldAnswer>>({});
  const [dirty, setDirty] = useState(false);
  const pendingFieldsRef = useRef<Set<string>>(new Set());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FIX: Use a ref to always access the latest answers in saveFieldsNow
  const answersRef = useRef<Record<string, FieldAnswer>>({});
  answersRef.current = answers;

  // Load existing answers
  const { data: savedAnswers = [] } = useQuery({
    queryKey: ["operational_field_answers", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_field_answers")
        .select("*, profiles:respondido_por(nome)").eq("assignment_id", assignmentId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Load reviews for this assignment
  const { data: reviews = [] } = useQuery({
    queryKey: ["operational_field_reviews", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_field_reviews")
        .select("*").eq("assignment_id", assignmentId).order("rodada", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Load execution logs (audit trail)
  const { data: executionLogs = [], refetch: refetchLogs } = useQuery({
    queryKey: ["operational_execution_logs", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_execution_logs")
        .select("*, profiles:executado_por(nome)")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!assignmentId,
  });

  // Reset state when assignmentId changes (anti-contaminação entre tarefas)
  useEffect(() => {
    setAnswers({});
    setDirty(false);
    pendingFieldsRef.current.clear();
    loggedFieldsRef.current.clear();
    answersRef.current = {};
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Não cancelar queries aqui — o cancelamento genérico cancela a query
    // da tarefa atual que acabou de ser montada, deixando a tela em branco.
    // O key={assignmentId} no Sheet já garante isolamento entre tarefas.
  }, [assignmentId, qc]);

  // Hydrate answers from DB
  useEffect(() => {
    if (!savedAnswers.length) {
      setAnswers({});
      return;
    }
    const map: Record<string, FieldAnswer> = {};
    for (const a of savedAnswers) {
      // Guard defensivo: nunca hidratar resposta de outra tarefa (cache stale)
      if (assignmentId && a.assignment_id && a.assignment_id !== assignmentId) continue;
      if (!map[a.field_id]) {
        map[a.field_id] = {
          field_id: a.field_id,
          valor_texto: a.valor_texto,
          valor_numero: a.valor_numero,
          valor_booleano: a.valor_booleano,
          valor_data: a.valor_data,
          valor_json: a.valor_json,
          evidencia_url: a.evidencia_url,
          evidencia_anexo_id: a.evidencia_anexo_id ?? null,
          evidencia_mime_type: a.evidencia_mime_type ?? null,
          respondido_por_nome: a.profiles?.nome || null,
          respondido_em: a.respondido_em,
          versao: a.versao || 1,
          historico_alteracoes: a.historico_alteracoes || [],
        };
        // Reidrata itens do plano de ação salvos no valor_json
        if (a.valor_json && typeof a.valor_json === "object") {
          for (const [chave, valor] of Object.entries(a.valor_json as Record<string, any>)) {
            if (chave.startsWith("__plano_acao__")) {
              const itemFieldId = `${a.field_id}${chave}`;
              map[itemFieldId] = { field_id: itemFieldId, ...valor };
            }
          }
        }
      }
    }
    setAnswers(map);
    setDirty(false);
  }, [savedAnswers, assignmentId]);

  // Helper: extract display value from an answer for logging
  const getDisplayValue = useCallback((entry: FieldAnswer): string => {
    if (entry.valor_booleano === true) return "Sim / Conforme";
    if (entry.valor_booleano === false) return "Não / Não Conforme";
    if (entry.valor_numero != null) return String(entry.valor_numero);
    if (entry.valor_data) return entry.valor_data;
    if (entry.valor_texto) return entry.valor_texto.length > 80 ? entry.valor_texto.slice(0, 80) + "…" : entry.valor_texto;
    if (entry.valor_json) return JSON.stringify(entry.valor_json).slice(0, 80);
    if (entry.evidencia_url) return "[evidência anexada]";
    return "";
  }, []);

  // Ref to track fields we've logged the first interaction for
  const loggedFieldsRef = useRef<Set<string>>(new Set());
  // Ref to store field labels for detailed logging
  const fieldLabelsRef = useRef<Record<string, string>>({});

  const setFieldLabels = useCallback((fields: SnapshotField[]) => {
    const map: Record<string, string> = {};
    for (const f of fields) map[f.id] = f.label;
    fieldLabelsRef.current = map;
  }, []);

  const updateAnswer = useCallback((fieldId: string, patch: Partial<FieldAnswer>) => {
    // Chaves compostas de itens do plano: persistir no valor_json do campo pai
    if (fieldId.includes("__plano_acao__")) {
      const campoId = fieldId.split("__plano_acao__")[0];
      const chaveItem = fieldId.substring(campoId.length); // "__plano_acao__r1__audio"
      setAnswers(prev => {
        const pai = prev[campoId] || { field_id: campoId };
        const planosJson = (pai.valor_json as any) || {};
        const novoJson = { ...planosJson, [chaveItem]: { ...(planosJson[chaveItem] || {}), ...patch } };
        return {
          ...prev,
          [fieldId]: { ...prev[fieldId], field_id: fieldId, ...patch },
          [campoId]: { ...pai, field_id: campoId, valor_json: novoJson },
        };
      });
      setDirty(true);
      pendingFieldsRef.current.add(campoId);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveFieldsNow().catch(console.error), 800);
      return;
    }
    setAnswers(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], field_id: fieldId, ...patch },
    }));
    setDirty(true);
    pendingFieldsRef.current.add(fieldId);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveFieldsNow().catch((e) => { console.error("Auto-save failed:", e); });
    }, 800);
  }, [assignmentId, profile?.id]);

  // Save only pending fields — reads from answersRef to avoid stale closure
  const saveFieldsNow = useCallback(async () => {
    if (!assignmentId || !profile?.id) return;
    const fieldsToSave = Array.from(pendingFieldsRef.current);
    if (fieldsToSave.length === 0) return;
    pendingFieldsRef.current.clear();

    const currentAnswers = answersRef.current;

    try {
      for (const fieldId of fieldsToSave) {
        // Ignorar chaves compostas de itens do plano de ação — não são UUIDs válidos
        if (fieldId.includes("__plano_acao__")) continue;
        const entry = currentAnswers[fieldId];
        if (!entry) continue;
        const now = new Date().toISOString();
        const fieldLabel = fieldLabelsRef.current[fieldId] || fieldId;
        const displayValue = getDisplayValue(entry);

        const { data: existing, error: existingError } = await (supabase as any).from("operational_field_answers")
          .select("id, versao, historico_alteracoes").eq("assignment_id", assignmentId).eq("field_id", fieldId).limit(1);
        if (existingError) throw existingError;

        if (existing && existing.length > 0) {
          const oldVersao = existing[0].versao || 1;
          const newVersao = oldVersao + 1;
          const oldHistory = existing[0].historico_alteracoes || [];
          const newHistory = [...oldHistory, {
            nome: profile.nome || "Usuário",
            data: now,
            versao: newVersao,
            campo: fieldLabel,
            resposta: displayValue,
          }];

          const { error: updateError } = await (supabase as any).from("operational_field_answers")
            .update({
              valor_texto: entry.valor_texto ?? null,
              valor_numero: entry.valor_numero ?? null,
              valor_booleano: entry.valor_booleano ?? null,
              valor_data: entry.valor_data ?? null,
              valor_json: entry.valor_json ?? null,
              evidencia_url: entry.evidencia_url ?? null,
              evidencia_anexo_id: entry.evidencia_anexo_id ?? null,
              evidencia_mime_type: entry.evidencia_mime_type ?? null,
              respondido_em: now,
              versao: newVersao,
              historico_alteracoes: newHistory,
            })
            .eq("id", existing[0].id);
          if (updateError) throw updateError;
        } else {
          const initialHistory = [{
            nome: profile.nome || "Usuário",
            data: now,
            versao: 1,
            campo: fieldLabel,
            resposta: displayValue,
          }];
          const { error: insertError } = await (supabase as any).from("operational_field_answers")
            .insert({
              assignment_id: assignmentId,
              field_id: fieldId,
              valor_texto: entry.valor_texto ?? null,
              valor_numero: entry.valor_numero ?? null,
              valor_booleano: entry.valor_booleano ?? null,
              valor_data: entry.valor_data ?? null,
              valor_json: entry.valor_json ?? null,
              evidencia_url: entry.evidencia_url ?? null,
              evidencia_anexo_id: entry.evidencia_anexo_id ?? null,
              evidencia_mime_type: entry.evidencia_mime_type ?? null,
              respondido_por: profile.id,
              historico_alteracoes: initialHistory,
            });
          if (insertError) throw insertError;
        }

        // Update local state with save metadata so UI shows immediately
        setAnswers(prev => ({
          ...prev,
          [fieldId]: {
            ...prev[fieldId],
            respondido_por_nome: profile.nome || "Usuário",
            respondido_em: now,
            versao: (prev[fieldId]?.versao || 0) + 1,
            historico_alteracoes: [
              ...(prev[fieldId]?.historico_alteracoes || []),
              {
                nome: profile.nome || "Usuário",
                data: now,
                versao: (prev[fieldId]?.versao || 0) + 1,
                campo: fieldLabel,
                resposta: displayValue,
              },
            ],
          },
        }));

        // Log every field interaction to execution logs (not just first time)
        (supabase as any).from("operational_execution_logs").insert({
          assignment_id: assignmentId,
          acao: "preencheu_campo",
          executado_por: profile.id,
          detalhes: {
            field_id: fieldId,
            field_label: fieldLabel,
            resposta: displayValue,
            respondido_em: now,
            versao: (currentAnswers[fieldId]?.versao || 0) + 1,
          },
        }).then(() => refetchLogs());
      }
      setDirty(false);
    } catch (e: any) {
      console.error("Auto-save failed:", e);
      // Re-add fields that failed so they retry
      for (const fid of fieldsToSave) pendingFieldsRef.current.add(fid);
      throw e;
    }
  }, [assignmentId, profile?.id, profile?.nome, getDisplayValue, refetchLogs]);

  // Keep saveDraft for close/submit compatibility
  const saveDraft = useCallback(async () => {
    const currentAnswers = answersRef.current;
    const allFieldIds = Object.keys(currentAnswers).filter(fid => currentAnswers[fid]?.field_id);
    for (const fid of allFieldIds) pendingFieldsRef.current.add(fid);
    await saveFieldsNow();
  }, [saveFieldsNow]);

  // Validate all visible fields
  const validateAll = useCallback((fields: SnapshotField[], assignmentStatus: string): string[] => {
    const errors: string[] = [];
    const STRUCTURAL = new Set(["secao", "divisor", "titulo"]);
    const hasAnswerValue = (a: any) =>
      !!a && (
        (a.valor_texto != null && a.valor_texto !== "") ||
        a.valor_numero != null ||
        a.valor_booleano != null ||
        a.valor_data != null ||
        a.valor_json != null ||
        (a.evidencia_url != null && a.evidencia_url !== "")
      );
    for (const f of fields) {
      if (!evaluateVisibility(f.condicao_visibilidade, answers)) continue;
      if (assignmentStatus === "devolvida") {
        const review = getLatestReview(f.id);
        if (!review?.devolvido) continue;

        // Validar itens do plano de ação
        const itens: Array<{tipo: string; titulo: string; obrigatorio: boolean}> =
          Array.isArray(review.itens_plano) && review.itens_plano.length > 0
            ? review.itens_plano
            : review.tipo_evidencia_exigida && review.tipo_evidencia_exigida !== "nenhuma"
              ? [{ tipo: review.tipo_evidencia_exigida, titulo: "", obrigatorio: true }]
              : [];

        const planRound = Number(review.rodada ?? 1);
        const planResponseFieldId = `${f.id}__plano_acao__r${planRound}`;

        for (const item of itens) {
          if (!item.obrigatorio) continue;
          const itemFieldId = `${planResponseFieldId}__${item.tipo}`;
          const itemAnswer = answers[itemFieldId];
          const nomeItem = item.titulo || item.tipo;
          if (item.tipo === "texto" || item.tipo === "descricao") {
            if (!(itemAnswer as any)?.valor_texto?.trim()) {
              errors.push(`${f.label} → Plano de ação: falta preencher "${nomeItem}"`);
            }
          } else {
            if (!(itemAnswer as any)?.evidencia_url) {
              const tipoLabel = item.tipo === "foto" ? "foto" : item.tipo === "video" ? "vídeo" : "áudio";
              errors.push(`${f.label} → Plano de ação: falta anexar ${tipoLabel} em "${nomeItem}"`);
            }
          }
        }
        continue;
      }
      const err = validateField(f, answers[f.id]);
      if (err) {
        errors.push(`${f.label}: ${err}`);
        continue;
      }
      // Reforço C: perguntas que serão revisadas (aprovador/auditor) exigem resposta
      // mesmo quando o template não marcou `obrigatorio`.
      const willBeReviewed = (f as any).aprovador_verificar === true || (f as any).auditor_verificar === true;
      if (
        willBeReviewed &&
        !STRUCTURAL.has(String((f as any).tipo)) &&
        !hasAnswerValue(answers[f.id])
      ) {
        errors.push(`${f.label}: resposta obrigatória (será revisada)`);
      }
    }
    return errors;
  }, [answers, reviews]);

  const getLatestReview = useCallback((fieldId: string) => {
    // Exclui reviews do auditor — eles têm rodada mais alta mas são para o aprovador, não o executor
    return reviews.find((r: any) => r.field_id === fieldId && r.criado_por_papel !== "auditor");
  }, [reviews]);

  const getAllReviews = useCallback((fieldId: string) => {
    // Exclui reviews do auditor para não confundir planRound do executor
    return (reviews as any[])
      .filter((r: any) => r.field_id === fieldId && r.criado_por_papel !== "auditor")
      .sort((a: any, b: any) => (a.rodada || 0) - (b.rodada || 0));
  }, [reviews]);

  // Submit
  const submit = useMutation({
    mutationFn: async ({ assignment, fields }: { assignment: any; fields: SnapshotField[] }) => {
      if (!profile?.id) throw new Error("Não autenticado");

      await saveDraft();

      const now = new Date().toISOString();
      const tempoGasto = assignment.inicio_em
        ? Math.round((Date.now() - new Date(assignment.inicio_em).getTime()) / 60000)
        : null;

      // Check if late based on last mandatory field timestamp
      const currentAnswers = answersRef.current;
      let ultimoCampoObrigatorio: string | null = null;
      let ultimoTimestamp: string | null = null;

      for (const f of fields) {
        if (!f.obrigatorio) continue;
        const ans = currentAnswers[f.id];
        if (ans?.respondido_em) {
          if (!ultimoTimestamp || ans.respondido_em > ultimoTimestamp) {
            ultimoTimestamp = ans.respondido_em;
            ultimoCampoObrigatorio = f.label;
          }
        }
      }

      const atrasado = (() => {
        if (!assignment.horario_limite || !assignment.data_prevista) return false;
        const limite = new Date(`${assignment.data_prevista}T${assignment.horario_limite}`);
        const referencia = ultimoTimestamp ? new Date(ultimoTimestamp) : new Date();
        return referencia > limite;
      })();

      // Sempre buscar regras vivas do template para refletir edições posteriores
      // do template em tarefas em andamento (snapshot pode estar desatualizado).
      let liveFieldRulesMap: Record<string, any[]> = {};
      let liveFieldByLabelSection: Record<string, any[]> = {};
      let liveFieldByLabelOnly: Record<string, any[]> = {};
      if (assignment.template_id) {
        const { data: liveFields } = await (supabase as any)
          .from("operational_template_fields")
          .select("id, label, section_id, opcoes_regras")
          .eq("template_id", assignment.template_id);
        if (liveFields) {
          const better = (a: any[] | undefined, b: any[]) =>
            (Array.isArray(a) && a.length > 0) ? a : b;
          for (const lf of liveFields) {
            if (!Array.isArray(lf.opcoes_regras) || lf.opcoes_regras.length === 0) continue;
            liveFieldRulesMap[lf.id] = better(liveFieldRulesMap[lf.id], lf.opcoes_regras);
            const sKey = `${lf.section_id || ""}|${(lf.label || "").trim().toLowerCase()}`;
            liveFieldByLabelSection[sKey] = better(liveFieldByLabelSection[sKey], lf.opcoes_regras);
            const lKey = (lf.label || "").trim().toLowerCase();
            liveFieldByLabelOnly[lKey] = better(liveFieldByLabelOnly[lKey], lf.opcoes_regras);
          }
        }
      }

      const contingencyFields: { field: SnapshotField; answer: FieldAnswer }[] = [];
      for (const f of fields) {
        if (!evaluateVisibility(f.condicao_visibilidade, currentAnswers)) continue;
        const ans = currentAnswers[f.id];
        if (!ans) continue;
        const sKey = `${(f as any).section_id || ""}|${(f.label || "").trim().toLowerCase()}`;
        const lKey = (f.label || "").trim().toLowerCase();
        const rules =
          liveFieldRulesMap[f.id] ||
          liveFieldByLabelSection[sKey] ||
          liveFieldByLabelOnly[lKey] ||
          (Array.isArray(f.opcoes_regras) ? f.opcoes_regras : []);
        let triggers = false;
        if (f.tipo === "conforme") {
          triggers = ans.valor_booleano === false && rules.some((r: any) => r?.valor === "nao_conforme" && r?.gera_contingencia);
        } else if (f.tipo === "sim_nao") {
          triggers = ans.valor_booleano === false && rules.some((r: any) => r?.valor === "nao" && r?.gera_contingencia);
        } else if (f.tipo === "select") {
          triggers = rules.some((r: any) => r?.label === ans.valor_texto && r?.gera_contingencia);
        }
        if (triggers) contingencyFields.push({ field: f, answer: ans });
      }

      // Quando devolvida: não gera contingência nova — vai direto para aprovação
      const isDevolvida = assignment.status === "devolvida";

      // Busca rodada_atual fresco do banco (state pode estar stale)
      const { data: freshAssignment } = await (supabase as any)
        .from("operational_assignments")
        .select("rodada_atual, status")
        .eq("id", assignment.id)
        .single();
      const veioDeDevolucaoFinal =
        isDevolvida ||
        (freshAssignment?.status === "devolvida") ||
        ((freshAssignment?.rodada_atual ?? 1) > 1) ||
        ((assignment.rodada_atual ?? 1) > 1);

      // SEMPRE fechar contingências abertas antes de qualquer verificação
      // quando é reenvio pós-devolução (rodada > 1 ou status devolvida)
      if (veioDeDevolucaoFinal) {
        const nowTs = new Date().toISOString();
        const { error: abrirTratamentoError } = await (supabase as any)
          .from("operational_contingencies")
          .update({ status: "em_andamento", updated_at: nowTs })
          .eq("assignment_id", assignment.id)
          .eq("status", "aberta");
        if (abrirTratamentoError) throw abrirTratamentoError;

        const { error: resolverTratamentoError } = await (supabase as any)
          .from("operational_contingencies")
          .update({ status: "resolvida", resolvida_em: nowTs, dentro_prazo: true, updated_at: nowTs })
          .eq("assignment_id", assignment.id)
          .eq("status", "em_andamento");
        if (resolverTratamentoError) throw resolverTratamentoError;

        await qc.invalidateQueries({ queryKey: ["operational_contingencies"] });
        await qc.invalidateQueries({ queryKey: ["operational_contingencies_management"] });
      }

      if (contingencyFields.length > 0 && !isDevolvida && !veioDeDevolucaoFinal) {
        // Create contingencies and set status to contingenciado
        await transition.mutateAsync({
          assignmentId: assignment.id,
          action: "enviar_contingencia",
          origem: "execucao",
          extraData: { tempoGasto, atrasado },
        });

        // Set fim_em and tempo_gasto
        await (supabase as any).from("operational_assignments")
          .update({ fim_em: now, tempo_gasto_minutos: tempoGasto })
          .eq("id", assignment.id);

        // Create contingency records
        for (const { field } of contingencyFields) {
          const prazoSla = assignment.template_snapshot?.sla_horas
            ? new Date(Date.now() + (assignment.template_snapshot.sla_horas || 24) * 3600000).toISOString()
            : new Date(Date.now() + 24 * 3600000).toISOString();

          await (supabase as any).from("operational_contingencies").insert({
            assignment_id: assignment.id,
            descricao: `Campo "${field.label}" gerou plano de ação automaticamente`,
            responsavel_id: assignment.responsavel_id,
            origin_field_id: field.id,
            prazo_sla: prazoSla,
            status: "aberta",
          });
        }
      } else {
        // Decide fluxo: tarefa designada (created_by ≠ executor e sem avaliador padrão) → aguardando_validacao
        // caso contrário → aguardando_avaliacao (fluxo tradicional)
        const isDesignada = !!assignment.created_by
          && assignment.created_by !== assignment.responsavel_id
          && !assignment.aprovador_id;
        const actionFinal = assignment.status === "devolvida"
          ? "enviar_avaliacao"
          : isDesignada ? "enviar_validacao_designante" : "enviar_avaliacao";
        await transition.mutateAsync({
          assignmentId: assignment.id,
          action: actionFinal,
          origem: "execucao",
          extraData: { tempoGasto, atrasado, rodadaAtual: freshAssignment?.rodada_atual ?? assignment.rodada_atual ?? 1, contingenciesCleanupDone: veioDeDevolucaoFinal },
        });
      }

      // Detailed submit log
      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: assignment.id,
        acao: "enviou_para_avaliacao",
        executado_por: profile.id,
        detalhes: {
          tempo_gasto_minutos: tempoGasto,
          total_campos: Object.keys(currentAnswers).length,
          atrasado,
          enviado_em: now,
          ultimo_campo_obrigatorio: ultimoCampoObrigatorio,
          ultimo_timestamp_campo: ultimoTimestamp,
        },
      });

      // Log late completion if applicable
      if (atrasado && assignment.horario_limite && assignment.data_prevista) {
        const limite = new Date(`${assignment.data_prevista}T${assignment.horario_limite}`);
        const ref = ultimoTimestamp ? new Date(ultimoTimestamp) : new Date();
        const diffMin = Math.round((ref.getTime() - limite.getTime()) / 60000);

        await (supabase as any).from("operational_execution_logs").insert({
          assignment_id: assignment.id,
          acao: "TAREFA_ATRASADA",
          executado_por: profile.id,
          detalhes: {
            prazo_esperado: limite.toISOString(),
            horario_real_conclusao: ref.toISOString(),
            atraso_minutos: diffMin,
            campo_final: ultimoCampoObrigatorio,
          },
        });
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_field_answers"] });
      qc.invalidateQueries({ queryKey: ["operational_contingencies_management"] });
      // Check if contingencies were created by looking at the fields
      toast.success("Formulário enviado!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Start task — with late-start detection
  const startTask = useMutation({
    mutationFn: async (args: string | { assignmentId: string; horarioInicioPrevisto?: string | null; dataPrevista?: string | null }) => {
      if (!profile?.id) throw new Error("Não autenticado");

      const aId = typeof args === "string" ? args : args.assignmentId;
      const horarioInicio = typeof args === "string" ? null : args.horarioInicioPrevisto;
      const dataPrevista = typeof args === "string" ? null : args.dataPrevista;

      const now = new Date().toISOString();

      // Use centralized transition
      await transition.mutateAsync({
        assignmentId: aId,
        action: "iniciar",
        origem: "execucao",
      });

      // Set inicio_em separately (transition handles status).
      // Auto-claim: se a tarefa estava aberta para o setor (responsavel_id = null),
      // o primeiro do setor a iniciar passa a ser o responsável.
      await (supabase as any).from("operational_assignments")
        .update({ inicio_em: now, responsavel_id: profile.id })
        .eq("id", aId)
        .is("responsavel_id", null);
      await (supabase as any).from("operational_assignments")
        .update({ inicio_em: now })
        .eq("id", aId)
        .not("responsavel_id", "is", null);

      await (supabase as any).from("operational_execution_logs").insert({
        assignment_id: aId,
        acao: "iniciou",
        executado_por: profile.id,
        detalhes: { iniciado_em: now },
      });

      // Check late start
      if (horarioInicio && dataPrevista) {
        const esperado = new Date(`${dataPrevista}T${horarioInicio}`);
        const agora = new Date(now);
        if (agora > esperado) {
          const diffMin = Math.round((agora.getTime() - esperado.getTime()) / 60000);
          await (supabase as any).from("operational_execution_logs").insert({
            assignment_id: aId,
            acao: "INICIO_FORA_DO_PRAZO",
            executado_por: profile.id,
            detalhes: {
              horario_esperado: esperado.toISOString(),
              horario_real_inicio: now,
              atraso_minutos: diffMin,
            },
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
      refetchLogs();
      toast.success("Tarefa iniciada!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return {
    answers,
    reviews,
    dirty,
    executionLogs,
    updateAnswer,
    saveDraft,
    validateAll,
    getLatestReview,
    getAllReviews,
    submit,
    startTask,
    isSubmitting: submit.isPending,
    refetchLogs,
    setFieldLabels,
  };
}
