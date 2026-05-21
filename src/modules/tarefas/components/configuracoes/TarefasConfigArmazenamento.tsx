/**
 * Subaba Configurações → Tarefas → Armazenamento.
 * Gerencia provider, pasta-mãe e validação da conexão com Google Drive.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, AlertCircle, FolderOpen, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

interface ConfigState {
  configured: boolean;
  config?: {
    provider: string;
    root_folder_id: string;
    root_folder_label: string | null;
    root_folder_link: string | null;
    limite_upload_mb: number;
    tipos_permitidos: string[];
    permitir_download: boolean;
    observacoes: string | null;
    status_conexao: string | null;
    ultima_validacao_em: string | null;
  };
  validation?: { ok: boolean; folder_name?: string; error?: string };
}

export function TarefasConfigArmazenamento() {
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [criandoPasta, setCriandoPasta]     = useState(false);
  const [state, setState]                   = useState<ConfigState>({ configured: false });

  const [folderId, setFolderId]             = useState("");
  const [folderLink, setFolderLink]         = useState("");
  const [limiteMb, setLimiteMb]             = useState(25);
  const [tiposCsv, setTiposCsv]             = useState("image/*, video/*, application/pdf");
  const [permitirDownload, setPermitirDownload] = useState(true);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function loadConfig() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${FN_BASE}/tarefas-storage-config?provider=google_drive`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: ConfigState = await res.json();
      setState(json);
      if (json.config) {
        setFolderId(json.config.root_folder_id || "");
        setFolderLink(json.config.root_folder_link || "");
        setLimiteMb(json.config.limite_upload_mb ?? 25);
        setTiposCsv((json.config.tipos_permitidos ?? []).join(", "));
        setPermitirDownload(json.config.permitir_download ?? true);
      }
    } catch {
      toast.error("Falha ao carregar configuração");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadConfig(); }, []);

  async function handleSave() {
    if (!folderId.trim()) { toast.error("Informe o ID da pasta-mãe"); return; }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${FN_BASE}/tarefas-storage-config`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google_drive",
          root_folder_id: folderId.trim(),
          root_folder_link: folderLink.trim() || undefined,
          limite_upload_mb: limiteMb,
          tipos_permitidos: tiposCsv.split(",").map((s) => s.trim()).filter(Boolean),
          usar_proxy_visualizacao: true,
          bloquear_link_direto: true,
          permitir_download: permitirDownload,
          permitir_preview: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.detail ?? json.error ?? "save_failed");
      toast.success("Configuração salva e validada");
      await loadConfig();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleCriarPasta() {
    if (!folderId.trim()) {
      toast.error("Informe o ID da pasta-mãe antes de criar a pasta Tarefas");
      return;
    }
    setCriandoPasta(true);
    try {
      const token = await getToken();
      const res = await fetch(`${FN_BASE}/tarefas-storage-create-folder`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google_drive",
          root_folder_id: folderId.trim(),
          folder_name: "tarefas",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.detail ?? json.error ?? "create_folder_failed");
      toast.success(`✅ Pasta "tarefas" criada com sucesso! Conexão com o Drive OK.`);
    } catch (e: any) {
      toast.error(`Falha ao criar pasta: ${e.message}`);
    } finally {
      setCriandoPasta(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="w-4 h-4" /> Provider de armazenamento
          </CardTitle>
          <CardDescription>
            Provider atual: <Badge variant="outline">Google Drive</Badge>{" "}
            <span className="text-xs text-muted-foreground ml-2">
              (OneDrive, S3, R2 e SharePoint disponíveis em código — não habilitados)
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              {state.validation && (
                <div className={`text-xs flex items-center gap-2 ${state.validation.ok ? "text-green-600" : "text-destructive"}`}>
                  {state.validation.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {state.validation.ok
                    ? `Pasta validada: ${state.validation.folder_name}`
                    : `Erro: ${state.validation.error}`}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="folderId">ID da pasta-mãe (Drive)</Label>
                  <Input id="folderId" value={folderId} onChange={(e) => setFolderId(e.target.value)} placeholder="1AbCdEfGh..." />
                </div>
                <div>
                  <Label htmlFor="folderLink">Link visual (opcional)</Label>
                  <Input id="folderLink" value={folderLink} onChange={(e) => setFolderLink(e.target.value)} placeholder="https://drive.google.com/..." />
                </div>
              </div>

              <Separator />

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="limiteMb">Limite de upload (MB)</Label>
                  <Input id="limiteMb" type="number" min={1} max={500} value={limiteMb} onChange={(e) => setLimiteMb(Number(e.target.value))} />
                </div>
                <div>
                  <Label htmlFor="tipos">Tipos permitidos (CSV)</Label>
                  <Input id="tipos" value={tiposCsv} onChange={(e) => setTiposCsv(e.target.value)} placeholder="image/*, video/*, application/pdf" />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between p-3 rounded border bg-card">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Permitir download</p>
                  <p className="text-xs text-muted-foreground">Usuários podem baixar anexos</p>
                </div>
                <Switch checked={permitirDownload} onCheckedChange={setPermitirDownload} />
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Testa a conexão criando a pasta <strong>tarefas</strong> dentro da pasta-mãe configurada no Drive.
                </p>
                <Button
                  variant="outline"
                  onClick={handleCriarPasta}
                  disabled={criandoPasta || !folderId.trim()}
                  className="w-full sm:w-auto"
                >
                  {criandoPasta
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando pasta...</>
                    : <><FolderPlus className="w-4 h-4 mr-2" /> Criar pasta Tarefas no Drive</>}
                </Button>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar e testar conexão
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Caminho lógico oficial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <code className="block rounded bg-muted px-3 py-2 text-xs overflow-x-auto">
            tarefas/{"{MM-YYYY}"}/{"{DD}"}/{"{rotina|ad_hoc}"}/#{"{XXXX}"}-{"{slug-nome}"}/{"{contexto}"}/{"{nome-arquivo.ext}"}
          </code>
          <div className="text-xs text-muted-foreground space-y-1.5">
            <p>
              Pasta única por tarefa (#{`{XXXX}-{slug-nome}/`}) com subpastas
              por contexto. Todos os anexos da tarefa vivem juntos até a conclusão.
            </p>
            <p>
              <strong>Contextos válidos:</strong> <code className="text-[10px]">plano_acao</code>,{" "}
              <code className="text-[10px]">evidencia</code>,{" "}
              <code className="text-[10px]">resposta_executor</code>,{" "}
              <code className="text-[10px]">aprovacao</code>,{" "}
              <code className="text-[10px]">devolucao</code>,{" "}
              <code className="text-[10px]">instrucao_etapa</code>,{" "}
              <code className="text-[10px]">instrucao_pergunta</code>.
            </p>
            <p>
              <strong>Exemplo real:</strong>{" "}
              <code className="text-[10px]">tarefas/05-2026/20/rotina/#0025-checklist-diario-de-limpeza/plano_acao/video.mp4</code>
            </p>
            <p>
              Trocar provider futuramente (S3, R2, OneDrive) não altera o path
              lógico nem o banco — os IDs de anexo continuam estáveis.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
