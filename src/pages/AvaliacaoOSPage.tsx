import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, AlertTriangle, Loader2, Plus, ListChecks, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAvaliacaoOS, Answer } from "@/hooks/useAvaliacaoOS";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const SegmentedControl = ({
  value,
  onChange,
  disabled,
}: {
  value: Answer;
  onChange: (v: Answer) => void;
  disabled?: boolean;
}) => {
  const options: { label: string; value: Answer; activeColor: string }[] = [
    { label: "Sim", value: "sim", activeColor: "bg-success text-success-foreground" },
    { label: "Não", value: "nao", activeColor: "bg-destructive text-destructive-foreground" },
    { label: "N/A", value: "na", activeColor: "bg-muted text-foreground" },
  ];

  return (
    <div className="flex bg-muted rounded-md p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => !disabled && onChange(opt.value)}
          disabled={disabled}
          className={`px-3 py-1.5 rounded text-caption font-medium transition-all duration-150 press-effect min-w-[48px] ${
            value === opt.value ? opt.activeColor : "text-foreground hover:bg-background/50"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

const statusLabel: Record<string, { text: string; badge: string }> = {
  aberta: { text: "Aberta", badge: "badge-pending" },
  em_andamento: { text: "Em andamento", badge: "badge-active" },
  concluida: { text: "Concluída", badge: "badge-complete" },
};

const STEPS = [
  { label: "Tipo de Serviço", description: "Selecione o tipo" },
  { label: "Dados da OS", description: "Número, cliente e CPF" },
  { label: "Avaliado", description: "Colaborador a avaliar" },
];

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (parseInt(digits[9]) !== check) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return parseInt(digits[10]) === check;
}

export default function AvaliacaoOSPage() {
  const [searchParams] = useSearchParams();
  const { profile, isAdmin, hasRole } = useAuth();
  const isGestor = hasRole("gestor");
  const showAllTipos = isAdmin || isGestor;
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Wizard state
  const [step, setStep] = useState(0);
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [newOsNumero, setNewOsNumero] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteCpf, setClienteCpf] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  const [cpfClienteEncontrado, setCpfClienteEncontrado] = useState<string | null>(null);

  // Auto-fill client name when CPF is found in DB
  useEffect(() => {
    const cpfDigits = clienteCpf.replace(/\D/g, "");
    if (cpfDigits.length === 11 && isValidCpf(cpfDigits)) {
      supabase
        .from("clientes")
        .select("id, nome")
        .eq("cpf", clienteCpf.trim())
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data) {
            setClienteNome(data.nome);
            setCpfClienteEncontrado(data.nome);
          } else {
            setCpfClienteEncontrado(null);
          }
        });
    } else {
      setCpfClienteEncontrado(null);
    }
  }, [clienteCpf]);

  const {
    loading, os, avaliacao, questions,
    searchOS, updateAnswer, updateObservation,
    concludeAvaliacao, answeredCount, totalScore, maxScore,
  } = useAvaliacaoOS();

  // Fetch tipos de serviço: all for admin/gestor, only assigned for avaliador
  const { data: tiposDoAvaliador = [] } = useQuery({
    queryKey: ["tipos_servico_do_avaliador", profile?.id, showAllTipos],
    queryFn: async () => {
      if (!profile?.id) return [];

      if (showAllTipos) {
        const { data: tipos } = await supabase
          .from("tipos_servico")
          .select("*, setores:setor_id(nome)")
          .eq("ativo", true)
          .order("nome");
        return tipos || [];
      }

      // Avaliador: only assigned types
      const { data: assignments } = await supabase
        .from("avaliador_tipos_servico")
        .select("tipo_servico_id")
        .eq("avaliador_id", profile.id);

      if (!assignments || assignments.length === 0) return [];
      const tipoIds = assignments.map((a) => a.tipo_servico_id);

      const { data: tipos } = await supabase
        .from("tipos_servico")
        .select("*, setores:setor_id(nome)")
        .eq("ativo", true)
        .in("id", tipoIds)
        .order("nome");

      return tipos || [];
    },
    enabled: !!profile?.id,
  });

  // Get the selected tipo_servico to determine sector
  const selectedTipo = useMemo(
    () => tiposDoAvaliador.find((t) => t.id === tipoServicoId),
    [tiposDoAvaliador, tipoServicoId]
  );

  // Fetch colaboradores filtered by sector, excluding the evaluator themselves
  const { data: colaboradoresFiltrados = [] } = useQuery({
    queryKey: ["colaboradores_por_setor", selectedTipo?.setor_id, profile?.id],
    queryFn: async () => {
      if (!selectedTipo?.setor_id) return [];
      let query = supabase
        .from("profiles")
        .select("*")
        .eq("ativo", true)
        .eq("setor_id", selectedTipo.setor_id)
        .order("nome");

      // Exclude the current evaluator from the list
      if (profile?.id) {
        query = query.neq("id", profile.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTipo?.setor_id,
  });

  // Preview questions for summary
  const { data: previewPerguntas = [] } = useQuery({
    queryKey: ["preview_perguntas", tipoServicoId, profile?.id],
    queryFn: async () => {
      if (!profile?.id || !tipoServicoId) return [];
      const { data } = await supabase
        .from("perguntas_avaliacao")
        .select("id, pergunta, peso, ordem")
        .eq("ativo", true)
        .or(`avaliador_id.eq.${profile.id},avaliador_id.is.null`)
        .or(`tipo_servico_id.eq.${tipoServicoId},tipo_servico_id.is.null`)
        .order("ordem");
      return data || [];
    },
    enabled: !!tipoServicoId && !!profile?.id,
  });

  useEffect(() => {
    const osParam = searchParams.get("os");
    if (osParam) {
      setSearchQuery(osParam);
      searchOS(osParam, false);
    }
  }, []);

  const handleSearch = () => {
    if (searchQuery.trim()) searchOS(searchQuery.trim(), false);
  };

  const openCreateDialog = () => {
    setStep(0);
    setTipoServicoId("");
    setNewOsNumero("");
    setClienteNome("");
    setClienteCpf("");
    setColaboradorId("");
    setCreateDialogOpen(true);
  };

  const handleCreateOS = async () => {
    const num = newOsNumero.trim();
    if (!num) { toast.error("Informe o número da OS."); return; }
    if (!/^\d+$/.test(num)) { toast.error("O número da OS deve conter apenas dígitos."); return; }
    if (!tipoServicoId) { toast.error("Selecione o tipo de serviço."); return; }
    if (!colaboradorId) { toast.error("Selecione o colaborador avaliado."); return; }

    const cpfDigits = clienteCpf.replace(/\D/g, "");
    if (cpfDigits.length > 0 && !isValidCpf(cpfDigits)) {
      toast.error("CPF inválido. Verifique os dígitos.");
      return;
    }

    // Auto-link client by CPF (never create duplicate)
    let clienteId: string | null = null;
    const nomeTrimmed = clienteNome.trim() || null;
    const cpfTrimmed = cpfDigits.length === 11 ? clienteCpf.trim() : null;

    if (cpfTrimmed) {
      const { data: existing } = await supabase
        .from("clientes")
        .select("id, nome")
        .eq("cpf", cpfTrimmed)
        .limit(1)
        .single();
      if (existing) {
        clienteId = existing.id;
      } else {
        // CPF not in DB — create new client
        const { data: newCliente } = await supabase
          .from("clientes")
          .insert({ nome: nomeTrimmed || "Sem nome", cpf: cpfTrimmed })
          .select("id")
          .single();
        if (newCliente) clienteId = newCliente.id;
      }
    } else if (nomeTrimmed) {
      // No CPF, just name — create client without CPF
      const { data: newCliente } = await supabase
        .from("clientes")
        .insert({ nome: nomeTrimmed, cpf: null })
        .select("id")
        .single();
      if (newCliente) clienteId = newCliente.id;
    }

    // Check if OS already exists — if so, just open it
    const { data: existingOS } = await supabase
      .from("ordens_servico")
      .select("id, status")
      .eq("numero_os", num)
      .limit(1)
      .single();

    if (existingOS) {
      if (existingOS.status !== "concluida") {
        toast.info("OS já existe e está em andamento. Abrindo para continuar avaliação.");
      } else {
        toast.info("OS já existe e está concluída.");
      }
      setCreateDialogOpen(false);
      setSearchQuery(num);
      searchOS(num, false);
      return;
    }

    searchOS(num, true, {
      cliente_nome: nomeTrimmed,
      cliente_cpf: cpfTrimmed,
      tipo_servico_id: tipoServicoId,
      colaborador_avaliado_id: colaboradorId,
      cliente_id: clienteId,
    });
    setCreateDialogOpen(false);
    setSearchQuery(num);
  };

  const canAdvance = (s: number) => {
    if (s === 0) return !!tipoServicoId;
    if (s === 1) {
      if (!newOsNumero.trim()) return false;
      const cpfDigits = clienteCpf.replace(/\D/g, "");
      if (cpfDigits.length > 0 && cpfDigits.length < 11) return false;
      if (cpfDigits.length === 11 && !isValidCpf(cpfDigits)) return false;
      return true;
    }
    if (s === 2) return !!colaboradorId;
    return false;
  };

  const isCompleted = avaliacao?.concluida === true;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-section font-semibold text-foreground">Avaliação de OS</h1>
        <p className="text-body text-muted-foreground">Busque uma OS existente ou crie uma nova para iniciar a avaliação.</p>
      </div>

      {/* Search */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-card mb-6">
        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="os-search" className="text-body font-medium mb-1.5 block">
              Número da OS
            </Label>
            <Input
              id="os-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ex: 12345"
              className="h-10"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleSearch} variant="outline" className="h-10 press-effect" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Buscar
            </Button>
            <Button onClick={openCreateDialog} className="h-10 press-effect" disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              Criar OS
            </Button>
          </div>
        </div>
      </div>

      {/* Create OS Wizard Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar Nova Ordem de Serviço</DialogTitle>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center gap-1 mb-4">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-caption font-bold shrink-0 transition-colors ${
                  i < step ? "bg-primary text-primary-foreground"
                    : i === step ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <div className="hidden sm:block min-w-0">
                  <p className={`text-caption font-medium truncate ${i === step ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</p>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-1 ${i < step ? "bg-primary" : "bg-border"}`} />}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Step 0: Tipo de Serviço */}
              {step === 0 && (
                <div className="space-y-2">
                  <p className="text-body text-muted-foreground mb-3">Selecione o tipo de serviço para esta OS. Apenas tipos com perguntas atribuídas a você são exibidos.</p>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {tiposDoAvaliador.length === 0 ? (
                      <p className="text-body text-muted-foreground text-center py-6">Nenhum tipo de serviço com perguntas atribuídas.</p>
                    ) : tiposDoAvaliador.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTipoServicoId(t.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all press-effect ${
                          tipoServicoId === t.id
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-card border-border hover:bg-muted/50 text-foreground"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          tipoServicoId === t.id ? "border-primary bg-primary" : "border-muted-foreground/30"
                        }`}>
                          {tipoServicoId === t.id && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-body font-medium truncate">{t.nome}</p>
                          <p className="text-caption text-muted-foreground">{(t as any).setores?.nome || "Sem setor"}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 1: Dados da OS */}
              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-body text-muted-foreground mb-1">Informe os dados da ordem de serviço.</p>
                  <div className="space-y-1.5">
                    <Label>Número da OS *</Label>
                    <Input
                      value={newOsNumero}
                      onChange={(e) => setNewOsNumero(e.target.value.replace(/\D/g, ""))}
                      placeholder="Apenas números"
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Nome do Cliente</Label>
                      <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome completo" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>CPF do Cliente</Label>
                      <Input
                        value={clienteCpf}
                        onChange={(e) => setClienteCpf(formatCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                      />
                      {clienteCpf.replace(/\D/g, "").length === 11 && !isValidCpf(clienteCpf) && (
                        <p className="text-caption text-destructive">CPF inválido</p>
                      )}
                      {clienteCpf.replace(/\D/g, "").length === 11 && isValidCpf(clienteCpf) && (
                        <p className="text-caption text-success">
                          {cpfClienteEncontrado
                            ? `✓ Cliente encontrado: ${cpfClienteEncontrado}`
                            : "CPF válido ✓ (novo cliente)"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Colaborador Avaliado */}
              {step === 2 && (
                <div className="space-y-2">
                  <p className="text-body text-muted-foreground mb-3">
                    Selecione o colaborador a ser avaliado. Listando apenas colaboradores do setor <span className="font-semibold text-foreground">{(selectedTipo as any)?.setores?.nome || "—"}</span>.
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {colaboradoresFiltrados.length === 0 ? (
                      <p className="text-body text-muted-foreground text-center py-6">Nenhum colaborador encontrado neste setor.</p>
                    ) : colaboradoresFiltrados.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setColaboradorId(c.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all press-effect ${
                          colaboradorId === c.id
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-card border-border hover:bg-muted/50 text-foreground"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          colaboradorId === c.id ? "border-primary bg-primary" : "border-muted-foreground/30"
                        }`}>
                          {colaboradorId === c.id && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-body font-medium truncate">{c.nome}</p>
                          <p className="text-caption text-muted-foreground">{c.cargo || "Sem cargo"} • {c.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Summary */}
                  {colaboradorId && previewPerguntas.length > 0 && (
                    <div className="mt-3 bg-muted/30 border border-border rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <ListChecks className="w-4 h-4 text-primary" />
                        <span className="text-caption font-medium text-foreground">{previewPerguntas.length} perguntas vinculadas</span>
                        <span className="text-caption text-muted-foreground ml-auto font-tabular">{previewPerguntas.reduce((s, p) => s + p.peso, 0)} pts</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <DialogFooter className="flex justify-between sm:justify-between gap-2 mt-2">
            <div>
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
              {step < 2 ? (
                <Button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  disabled={!canAdvance(step)}
                  className="press-effect"
                >
                  Próximo <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleCreateOS}
                  disabled={!canAdvance(2)}
                  className="press-effect"
                >
                  Criar e Avaliar
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {os && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
          >
            {/* OS Header */}
            <div className="bg-card border border-border rounded-lg p-4 shadow-card mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-subhead font-semibold text-foreground">
                  OS #{os.numero_os}
                </h2>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${statusLabel[os.status]?.badge || "badge-pending"}`}>
                  {statusLabel[os.status]?.text || os.status}
                </span>
              </div>
              {(os.cliente_nome || os.cliente_cpf) && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-body">
                  {os.cliente_nome && (
                    <div>
                      <span className="text-muted-foreground text-caption block">Cliente</span>
                      <span className="font-medium text-foreground">{os.cliente_nome}</span>
                    </div>
                  )}
                  {os.cliente_cpf && (
                    <div>
                      <span className="text-muted-foreground text-caption block">CPF</span>
                      <span className="font-medium text-foreground font-tabular">{os.cliente_cpf}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {isCompleted && (
              <div className="bg-card border border-success/30 rounded-lg p-4 shadow-card mb-4">
                <p className="text-body font-medium text-success">
                  ✅ Avaliação concluída — Nota: {avaliacao?.nota_final?.toFixed(1)}%
                </p>
              </div>
            )}

            {/* Progress */}
            {!isCompleted && questions.length > 0 && (
              <div className="bg-card border border-border rounded-lg p-4 shadow-card mb-4">
                <div className="flex items-center justify-between text-body mb-2">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-medium text-foreground font-tabular">
                    {answeredCount}/{questions.length} respondidas
                    {maxScore > 0 && ` — ${((totalScore / maxScore) * 100).toFixed(1)}%`}
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${(answeredCount / questions.length) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* Questions */}
            {questions.length > 0 ? (
              <div className="bg-card border border-border rounded-lg shadow-card divide-y divide-border">
                {questions.map((q, i) => (
                  <div key={q.pergunta_id} className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3 items-start flex-1">
                        <span className="text-caption text-muted-foreground font-tabular mt-0.5 w-5 shrink-0">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <p className="text-body font-medium text-foreground">{q.texto}</p>
                          <p className="text-caption text-muted-foreground">Peso: {q.peso}</p>
                        </div>
                      </div>
                      <SegmentedControl
                        value={q.answer}
                        onChange={(v) => updateAnswer(q.pergunta_id, v)}
                        disabled={isCompleted}
                      />
                    </div>

                    <AnimatePresence>
                      {q.answer === "nao" && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-muted rounded-lg p-3 ml-8 space-y-2">
                            <div className="flex items-center gap-1.5 text-caption text-destructive font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Foto obrigatória para itens reprovados.
                            </div>
                            <Input
                              placeholder="Descreva a irregularidade..."
                              value={q.observation}
                              onChange={(e) => updateObservation(q.pergunta_id, e.target.value)}
                              className="bg-card h-9"
                              disabled={isCompleted}
                            />
                            <Button variant="outline" size="sm" className="text-caption press-effect" disabled={isCompleted}>
                              📷 Anexar Evidência
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-lg p-8 shadow-card text-center">
                <p className="text-body text-muted-foreground">
                  Nenhuma pergunta atribuída ao seu perfil de avaliador.
                </p>
              </div>
            )}

            {/* Actions */}
            {!isCompleted && questions.length > 0 && (
              <div className="flex justify-end gap-3 mt-4">
                <Button
                  className="press-effect"
                  disabled={answeredCount < questions.length}
                  onClick={concludeAvaliacao}
                >
                  Concluir Avaliação
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
