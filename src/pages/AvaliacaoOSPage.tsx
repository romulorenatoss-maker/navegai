import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Answer = "sim" | "nao" | "na" | null;

interface Question {
  id: number;
  text: string;
  weight: number;
  answer: Answer;
  observation: string;
}

const mockQuestions: Question[] = [
  { id: 1, text: "O atendente se identificou corretamente?", weight: 3, answer: null, observation: "" },
  { id: 2, text: "Foi realizado o diagnóstico inicial do problema?", weight: 5, answer: null, observation: "" },
  { id: 3, text: "O cliente foi informado sobre prazo de resolução?", weight: 4, answer: null, observation: "" },
  { id: 4, text: "As peças utilizadas foram registradas na OS?", weight: 5, answer: null, observation: "" },
  { id: 5, text: "O serviço foi finalizado dentro do prazo?", weight: 4, answer: null, observation: "" },
  { id: 6, text: "O cliente assinou o termo de entrega?", weight: 3, answer: null, observation: "" },
];

const SegmentedControl = ({
  value,
  onChange,
}: {
  value: Answer;
  onChange: (v: Answer) => void;
}) => {
  const options: { label: string; value: Answer; color: string; activeColor: string }[] = [
    { label: "Sim", value: "sim", color: "text-foreground", activeColor: "bg-success text-success-foreground" },
    { label: "Não", value: "nao", color: "text-foreground", activeColor: "bg-destructive text-destructive-foreground" },
    { label: "N/A", value: "na", color: "text-muted-foreground", activeColor: "bg-muted text-foreground" },
  ];

  return (
    <div className="flex bg-muted rounded-md p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded text-caption font-medium transition-all duration-150 press-effect min-w-[48px] ${
            value === opt.value ? opt.activeColor : `${opt.color} hover:bg-background/50`
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

export default function AvaliacaoOSPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [osLoaded, setOsLoaded] = useState(false);
  const [questions, setQuestions] = useState<Question[]>(mockQuestions);

  const handleSearch = () => {
    if (searchQuery.trim()) setOsLoaded(true);
  };

  const updateAnswer = (id: number, answer: Answer) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, answer } : q)));
  };

  const updateObservation = (id: number, observation: string) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, observation } : q)));
  };

  const answeredCount = questions.filter((q) => q.answer !== null).length;
  const totalScore = questions.reduce((acc, q) => {
    if (q.answer === "sim") return acc + q.weight;
    return acc;
  }, 0);
  const maxScore = questions.reduce((acc, q) => {
    if (q.answer !== "na" && q.answer !== null) return acc + q.weight;
    return acc;
  }, 0);

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
            <Label htmlFor="os-search" className="text-body font-medium mb-1.5 block">Número da OS, nome ou CPF</Label>
            <Input
              id="os-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ex: OS-12345 ou 123.456.789-00"
              className="h-10"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleSearch} className="h-10 press-effect">
              <Search className="w-4 h-4 mr-2" />
              Buscar
            </Button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {osLoaded && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
          >
            {/* OS Header */}
            <div className="bg-card border border-border rounded-lg p-4 shadow-card mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-subhead font-semibold text-foreground">
                  OS #{searchQuery || "12845"} — Em andamento
                </h2>
                <span className="badge-active inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border">
                  avaliando
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-body">
                <div>
                  <span className="text-muted-foreground text-caption block">Cliente</span>
                  <span className="font-medium text-foreground">João P. Ferreira</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-caption block">CPF</span>
                  <span className="font-medium text-foreground font-tabular">123.456.789-00</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-caption block">Serviço</span>
                  <span className="font-medium text-foreground">Manutenção Preventiva</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-caption block">Data</span>
                  <span className="font-medium text-foreground font-tabular">14/03/2026</span>
                </div>
              </div>
            </div>

            {/* Progress */}
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

            {/* Questions */}
            <div className="bg-card border border-border rounded-lg shadow-card divide-y divide-border">
              {questions.map((q, i) => (
                <motion.div
                  key={q.id}
                  layout
                  className="p-4 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3 items-start flex-1">
                      <span className="text-caption text-muted-foreground font-tabular mt-0.5 w-5 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="text-body font-medium text-foreground">{q.text}</p>
                        <p className="text-caption text-muted-foreground">Peso: {q.weight}</p>
                      </div>
                    </div>
                    <SegmentedControl value={q.answer} onChange={(v) => updateAnswer(q.id, v)} />
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
                            onChange={(e) => updateObservation(q.id, e.target.value)}
                            className="bg-card h-9"
                          />
                          <Button variant="outline" size="sm" className="text-caption press-effect">
                            📷 Anexar Evidência
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" className="press-effect">Salvar Rascunho</Button>
              <Button className="press-effect" disabled={answeredCount < questions.length}>
                Concluir Avaliação
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
