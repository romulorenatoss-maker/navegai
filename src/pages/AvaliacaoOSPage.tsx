import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, AlertTriangle, Loader2, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAvaliacaoOS, Answer } from "@/hooks/useAvaliacaoOS";
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

export default function AvaliacaoOSPage() {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const {
    loading, os, avaliacao, questions,
    searchOS, updateAnswer, updateObservation,
    concludeAvaliacao, answeredCount, totalScore, maxScore,
  } = useAvaliacaoOS();

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

  const handleCreate = () => {
    const val = searchQuery.trim();
    if (!val) return;
    if (!/^\d+$/.test(val)) {
      toast.error("O número da OS deve conter apenas dígitos.");
      return;
    }
    searchOS(val, true);
  };

  const isCompleted = avaliacao?.concluida === true;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-section font-semibold text-foreground">Avaliação de OS</h1>
        <p className="text-body text-muted-foreground">Busque uma OS para iniciar a avaliação.</p>
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
              placeholder="Ex: OS-12345"
              className="h-10"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleSearch} variant="outline" className="h-10 press-effect" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Buscar
            </Button>
            <Button onClick={handleCreate} className="h-10 press-effect" disabled={loading || !searchQuery.trim()}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Criar OS
            </Button>
          </div>
        </div>
      </div>

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
              {os.cliente_nome && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-body">
                  <div>
                    <span className="text-muted-foreground text-caption block">Cliente</span>
                    <span className="font-medium text-foreground">{os.cliente_nome}</span>
                  </div>
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
