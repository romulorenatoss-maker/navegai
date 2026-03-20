import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export interface ColumnMapping {
  nome: string;
  telefone: string;
  email: string;
  cidade: string;
  bairro: string;
  rua: string;
  numero: string;
  plano: string;
  repetidor: string;
  descricao: string;
}

interface Props {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}

const KNOWN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  nome: ["nome", "name", "cliente", "razao_social", "razão social"],
  telefone: ["telefone", "phone", "celular", "fone", "tel", "whatsapp"],
  email: ["email", "e-mail", "e_mail", "mail"],
  cidade: ["cidade", "city", "municipio"],
  bairro: ["bairro", "neighborhood", "setor"],
  rua: ["rua", "logradouro", "endereco", "endereço", "address", "street"],
  numero: ["numero", "número", "num", "nº", "number"],
  plano: ["plano", "plan", "produto", "servico", "serviço"],
  repetidor: ["repetidor", "repeater", "pop"],
  descricao: ["descricao", "descrição", "description", "observacao", "observação", "obs", "detalhe", "detalhes", "nota", "notas"],
};

export const EMPTY_MAPPING: ColumnMapping = {
  nome: "", telefone: "", email: "", cidade: "", bairro: "", rua: "", numero: "", plano: "", repetidor: "",
};

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { ...EMPTY_MAPPING };
  const lower = headers.map(h => h.toLowerCase().trim().replace(/[^a-zà-ú0-9_]/g, ""));

  for (const [field, aliases] of Object.entries(KNOWN_ALIASES) as [keyof ColumnMapping, string[]][]) {
    const idx = lower.findIndex(h => aliases.some(a => h.includes(a)));
    if (idx >= 0 && !Object.values(mapping).includes(headers[idx])) {
      mapping[field] = headers[idx];
    }
  }
  return mapping;
}

const FIELD_LABELS: Record<keyof ColumnMapping, { label: string; required: boolean }> = {
  nome: { label: "Nome", required: true },
  telefone: { label: "Telefone", required: true },
  email: { label: "Email", required: false },
  cidade: { label: "Cidade", required: false },
  bairro: { label: "Bairro", required: false },
  rua: { label: "Rua", required: false },
  numero: { label: "Número", required: false },
  plano: { label: "Plano", required: false },
  repetidor: { label: "Repetidor", required: false },
};

export default function ColumnMapper({ headers, mapping, onChange }: Props) {
  const allMapped = mapping.nome && mapping.telefone;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Label className="text-sm font-semibold">Mapeamento de Colunas</Label>
        {allMapped ? (
          <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-[10px]">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Campos obrigatórios mapeados
          </Badge>
        ) : (
          <Badge variant="default" className="bg-amber-500/10 text-amber-600 border-amber-200 text-[10px]">
            <AlertTriangle className="w-3 h-3 mr-1" /> Mapeie Nome e Telefone
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map(field => (
          <div key={field} className="space-y-1">
            <Label className="text-xs">
              {FIELD_LABELS[field].label}
              {FIELD_LABELS[field].required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            <Select
              value={mapping[field] || "__none"}
              onValueChange={val => onChange({ ...mapping, [field]: val === "__none" ? "" : val })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Ignorar —</SelectItem>
                {headers.map(h => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}
