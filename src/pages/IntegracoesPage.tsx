import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, FolderOpen, Loader2 } from "lucide-react";
import {
  getStorageConfig,
  setStorageConfig,
  type StorageConfigState,
} from "@/modules/tarefas/services/tarefas_storage_service";

// Aceita ID puro OU URL completa do Drive (extrai o ID).
function parseFolderInput(raw: string): string {
  const v = raw.trim();
  const m = v.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return v;
}

export default function IntegracoesPage() {
  const [state, setState] = useState<StorageConfigState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [labelInput, setLabelInput] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const s = await getStorageConfig("google_drive");
      setState(s);
      if (s.configured && s.config) {
        setFolderInput(s.config.root_folder_id);
        setLabelInput(s.config.root_folder_label ?? "");
      }
    } catch (e: any) {
      if (e?.message === "forbidden_admin_only") {
        toast.error("Apenas administradores podem acessar Integrações.");
      } else {
        toast.error(e?.message ?? "Falha ao carregar configuração.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSave() {
    const folderId = parseFolderInput(folderInput);
    if (!folderId) {
      toast.error("Informe o ID (ou URL) da pasta do Drive.");
      return;
    }
    setSaving(true);
    try {
      const s = await setStorageConfig({
        root_folder_id: folderId,
        root_folder_label: labelInput || undefined,
      });
      setState(s);
      toast.success(`Pasta validada e salva: ${s.validation?.folder_name ?? folderId}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Integrações</h1>
        <p className="text-sm text-muted-foreground">
          Configurações de provedores externos usados pelo sistema.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-primary" />
                Anexos de Tarefas — Pasta-mãe no Google Drive
              </CardTitle>
              <CardDescription className="mt-1">
                O sistema cria abaixo desta pasta toda a árvore{" "}
                <code className="text-xs">tarefas/MM-YYYY/DD/tipo/codigo-slug/contexto/arquivo</code>.
                Sem essa configuração, uploads de anexos ficam bloqueados.
              </CardDescription>
            </div>
            <StatusBadge state={state} loading={loading} />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {state?.configured && state.validation && !state.validation.ok && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Pasta inacessível</AlertTitle>
              <AlertDescription>
                {state.validation.error ?? "Não foi possível acessar a pasta configurada."}
                <br />
                Verifique se a conta-serviço tem permissão na pasta no Drive.
              </AlertDescription>
            </Alert>
          )}

          {state?.configured && state.validation?.ok && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>Conectado</AlertTitle>
              <AlertDescription>
                Pasta atual: <strong>{state.validation.folder_name}</strong>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="folder-id">ID da pasta do Google Drive</Label>
            <Input
              id="folder-id"
              placeholder="Ex.: 1aBcDeFgHiJkLmNoPqRsTuVwXyZ ou cole a URL da pasta"
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              disabled={saving || loading}
            />
            <p className="text-xs text-muted-foreground">
              Abra a pasta no Drive e copie o trecho final da URL
              (<code>https://drive.google.com/drive/folders/<strong>ESTE_ID</strong></code>).
              Aceito também colar a URL inteira.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="folder-label">Rótulo (opcional)</Label>
            <Input
              id="folder-label"
              placeholder="Ex.: Navegaí — Anexos de Tarefas"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              disabled={saving || loading}
            />
            <p className="text-xs text-muted-foreground">
              Apenas para identificação no painel. Se vazio, usa o nome retornado pelo Drive.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Validar e salvar
            </Button>
            <Button variant="outline" onClick={refresh} disabled={loading || saving}>
              Recarregar
            </Button>
          </div>

          <Alert>
            <AlertTitle className="text-sm">Importante</AlertTitle>
            <AlertDescription className="text-xs space-y-1">
              <div>
                A conta-serviço (Google Drive conectado em Lovable Cloud) precisa de
                permissão de <strong>Editor</strong> nessa pasta.
              </div>
              <div>
                Trocar a pasta-mãe não move os anexos antigos — apenas novos uploads
                vão para a nova árvore.
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ state, loading }: { state: StorageConfigState | null; loading: boolean }) {
  if (loading) return <Badge variant="secondary">Carregando…</Badge>;
  if (!state?.configured) return <Badge variant="destructive">Não configurado</Badge>;
  if (state.validation?.ok) return <Badge className="bg-green-600 hover:bg-green-700">Conectado</Badge>;
  return <Badge variant="destructive">Erro de acesso</Badge>;
}
