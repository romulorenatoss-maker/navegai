import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";

/**
 * Etapa 1 — Seletor estruturado de placeholders (sem banco).
 * Substitui o prompt() do editor por uma UI com tipos + lista mock.
 *
 * Modo compatível: o usuário ainda pode digitar manualmente {chave} no editor
 * — esta modal apenas oferece atalhos tipados.
 */

export type PlaceholderTipo = "cliente" | "pergunta" | "produto" | "boolean";

interface OpcaoMock {
  label: string;
  value: string;
}

// === Lista MOCK (etapa 1 — não consultar banco) ===
export const PLACEHOLDER_MOCK: Record<PlaceholderTipo, OpcaoMock[]> = {
  cliente: [
    { label: "Nome do cliente", value: "cliente_nome" },
    { label: "CNPJ", value: "cliente_cnpj" },
    { label: "Endereço", value: "cliente_endereco" },
    { label: "Responsável", value: "cliente_responsavel" },
    { label: "E-mail", value: "cliente_email" },
  ],
  pergunta: [
    { label: "Contexto da proposta", value: "contexto" },
    { label: "Objetivo do projeto", value: "objetivo" },
  ],
  produto: [
    { label: "Infraestrutura (loop)", value: "#infraestrutura" },
  ],
  boolean: [
    { label: "Internet dedicada", value: "internet_dedicado" },
    { label: "IP fixo /32", value: "ip_32" },
  ],
};

const TIPOS: Array<{ value: PlaceholderTipo; label: string; descricao: string }> = [
  { value: "cliente", label: "Campo do cliente", descricao: "Dados do cliente (nome, CNPJ, endereço…)" },
  { value: "pergunta", label: "Pergunta (IA)", descricao: "Resposta capturada na conversa" },
  { value: "produto", label: "Produto", descricao: "Loops e blocos de produtos" },
  { value: "boolean", label: "Boolean (checkbox)", descricao: "Itens condicionais (ligado/desligado)" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recebe a chave selecionada (sem chaves). Ex: "cliente_nome". */
  onSelect: (chave: string, tipo: PlaceholderTipo) => void;
}

export function PropostaPlaceholderModal({ open, onOpenChange, onSelect }: Props) {
  const [tipo, setTipo] = useState<PlaceholderTipo>("cliente");
  const [chaveCustom, setChaveCustom] = useState("");

  function handleSelect(value: string) {
    onSelect(value, tipo);
    onOpenChange(false);
    setChaveCustom("");
  }

  function handleCustom() {
    const v = chaveCustom.trim().replace(/^\{+|\}+$/g, "");
    if (!v) return;
    handleSelect(v);
  }

  const opcoes = PLACEHOLDER_MOCK[tipo];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar placeholder</DialogTitle>
          <DialogDescription>
            Selecione um tipo e escolha um campo. O valor é inserido como{" "}
            <code className="text-xs">{"{chave}"}</code> no template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase text-muted-foreground">Tipo de placeholder</Label>
            <RadioGroup
              value={tipo}
              onValueChange={(v) => setTipo(v as PlaceholderTipo)}
              className="grid grid-cols-2 gap-2 mt-2"
            >
              {TIPOS.map((t) => (
                <Label
                  key={t.value}
                  htmlFor={`tipo-${t.value}`}
                  className="flex items-start gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/50"
                >
                  <RadioGroupItem value={t.value} id={`tipo-${t.value}`} className="mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.descricao}</div>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label className="text-xs uppercase text-muted-foreground">Opções</Label>
            <div className="mt-2 max-h-60 overflow-auto border rounded-md divide-y">
              {opcoes.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => handleSelect(o.value)}
                  className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between gap-3"
                >
                  <span className="text-sm">{o.label}</span>
                  <code className="text-xs text-muted-foreground">{`{${o.value}}`}</code>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="chave-custom" className="text-xs uppercase text-muted-foreground">
              Ou digite uma chave manual (modo compatível)
            </Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="chave-custom"
                placeholder="ex: cliente_nome"
                value={chaveCustom}
                onChange={(e) => setChaveCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCustom();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={handleCustom} disabled={!chaveCustom.trim()}>
                Inserir
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
