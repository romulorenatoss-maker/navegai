import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePlus2 } from "lucide-react";

export default function PropostaCreatePage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FilePlus2 className="w-5 h-5" /> Nova Proposta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            🚧 Em construção — Fase 2. Nesta etapa serão liberados:
          </p>
          <ul className="list-disc pl-6 text-sm text-muted-foreground mt-2 space-y-1">
            <li>Busca dinâmica de cliente (tabela existente, sem duplicar dados)</li>
            <li>Configuração de cenário (metragem, usuários, necessidade)</li>
            <li>Sugestão automática de produtos via IA</li>
            <li>Geração e preview editável</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
