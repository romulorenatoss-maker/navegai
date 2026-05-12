export interface CheckItemForm {
  id?: string;
  tempId: string;
  pergunta: string;
  ordem: number;
  tipo_resposta: "conforme_nao_conforme" | "sim_nao" | "texto" | "numero";
  exige_foto: boolean;
  exige_observacao: boolean;
  gera_contingencia_se_reprovado: boolean;
  peso: number;
  nota_maxima: number;
  penalidade_reprovacao: number;
}

export const defaultCheckItem = (ordem: number): CheckItemForm => ({
  tempId: crypto.randomUUID(),
  pergunta: "",
  ordem,
  tipo_resposta: "conforme_nao_conforme",
  exige_foto: false,
  exige_observacao: false,
  gera_contingencia_se_reprovado: false,
  peso: 1,
  nota_maxima: 100,
  penalidade_reprovacao: 100,
});

export type WizardStepId = "tipo" | "geral" | "campos" | "checklist" | "fluxo" | "resumo";

export interface WizardStepDef {
  id: WizardStepId;
  label: string;
  short: string;
}

export const WIZARD_STEPS: WizardStepDef[] = [
  { id: "tipo", label: "Tipo / Modelo", short: "Tipo" },
  { id: "geral", label: "Informações gerais", short: "Geral" },
  { id: "campos", label: "Campos dinâmicos", short: "Campos" },
  { id: "checklist", label: "Checklist operacional", short: "Checklist" },
  { id: "fluxo", label: "Fluxo operacional", short: "Fluxo" },
  { id: "resumo", label: "Resumo / Publicação", short: "Resumo" },
];
