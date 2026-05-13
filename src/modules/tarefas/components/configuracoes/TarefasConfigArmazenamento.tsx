/**
 * Subaba Configurações → Tarefas → Armazenamento.
 * Reaproveita IntegracoesPage (já configura provider/pasta raiz no Google Drive)
 * e adiciona o bloco informativo do caminho lógico oficial.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import IntegracoesPage from "@/pages/IntegracoesPage";

const TIPOS_PERMITIDOS = ["image/*", "video/*", "audio/*", "application/pdf", "application/zip"];
const TAMANHO_MAX_MB = 50;

export function TarefasConfigArmazenamento() {
  return (
    <div className="space-y-4">
      <IntegracoesPage />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Caminho lógico oficial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <code className="block rounded bg-muted px-3 py-2 text-xs">
            tarefas/{"{MM-YYYY}"}/{"{DD}"}/{"{tipo_tarefa}"}/{"{codigo_tarefa}"}-{"{slug_nome}"}/
            {"{contexto}"}/{"{nome_arquivo}"}
          </code>
          <p className="text-xs text-muted-foreground">
            Esta regra é aplicada por todos os providers — Google Drive é apenas o provider inicial.
            Se o provider mudar no futuro, a regra de path permanece.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Tipos permitidos
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {TIPOS_PERMITIDOS.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Tamanho máximo
              </p>
              <p className="mt-1">{TAMANHO_MAX_MB} MB por arquivo</p>
            </div>
          </div>

          <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
            <p>• URLs de download são geradas dinamicamente (signed URLs por requisição).</p>
            <p>
              • O banco salva apenas <code>provider</code>, <code>path_relativo</code> e metadados.
              Nada do conteúdo binário é gravado em <code>public.*</code>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
