/**
 * tarefas_fluxoBotaoConformeNaoConforme.tsx
 *
 * Par de botões Conforme / Não Conforme usados pelos painéis aprovador e
 * auditor para marcar avaliação por pergunta.
 */
import { CheckCircle2, XCircle } from "lucide-react";

interface Props {
  valor: "conforme" | "nao_conforme" | null;
  onConforme: () => void;
  onNaoConforme: () => void;
  disabled?: boolean;
  /** Texto extra no botão "Não Conforme" — ex: "Criar plano R2". */
  labelNaoConforme?: string;
}

export function FluxoBotaoConformeNaoConforme({
  valor,
  onConforme,
  onNaoConforme,
  disabled,
  labelNaoConforme = "Não Conforme",
}: Props) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onConforme}
        disabled={disabled}
        className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          valor === "conforme"
            ? "bg-emerald-100 border-emerald-500 text-emerald-800"
            : "border-border text-muted-foreground hover:bg-muted"
        }`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Conforme
      </button>
      <button
        type="button"
        onClick={onNaoConforme}
        disabled={disabled}
        className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          valor === "nao_conforme"
            ? "bg-rose-100 border-rose-500 text-rose-800"
            : "border-border text-muted-foreground hover:bg-muted"
        }`}
      >
        <XCircle className="h-3.5 w-3.5" />
        {labelNaoConforme}
      </button>
    </div>
  );
}

export default FluxoBotaoConformeNaoConforme;
