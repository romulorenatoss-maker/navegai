/**
 * Subaba Configurações → Tarefas → Armazenamento.
 * Gerencia provider, pasta-mãe e regras de upload/visualização.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, AlertCircle, FolderOpen } from "lucide-react";
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
    usar_proxy_visualizacao: boolean;
    bloquear_link_direto: boolean;
    permitir_download: boolean;
    permitir_preview: boolean;
    observacoes: string | null;
    status_conexao: string | null;
    ultima_validacao_em: string | null;
  };
  validation?: { ok: boolean; folder_name?: string; error?: string };
}

export function TarefasConfigArmazenamento() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<ConfigState>({ configured: false });

  // form state
  const [folderId, setFolderId] = useState("");
  const [folderLink, setFolderLink] = useState("");
  const [limiteMb, setLimiteMb] = useState(25);
  const [tiposCsv, setTiposCsv] = useState("image/*, video/*, application/pdf");
  const [usarProxy, setUsarProxy] = useState(true);
  const [bloquearDireto, setBloquearDireto] = useState(true);
  const [permitirDownload, setPermitirDownload] = useState(true);
  const [permitirPreview, setPermitirPreview] = useState(true);
  const [observacoes, setObservacoes] = useState("");

  async function loadConfig() {
    setLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(`${FN_BASE}/tarefas-storage-config?provider=google_drive`, {
        headers: { Authorization: `Bearer ${sess.session?.access_token}` },
      });
      const json: ConfigState = await res.json();
      setState(json);
      if (json.config) {
        setFolderId(json.config.root_folder_id || "");
        setFolderLink(json.config.root_folder_link || "");
        setLimiteMb(json.config.limite_upload_mb ?? 25);
        setTiposCsv((json.config.tipos_permitidos ?? []).join(", "));
        setUsarProxy(json.config.usar_proxy_visualizacao ?? true);
        setBloquearDireto(json.config.bloquear_link_direto ?? true);
        setPermitirDownload(json.config.permitir_download ?? true);
        setPermitirPreview(json.config.permitir_preview ?? true);
        setObservacoes(json.config.observacoes ?? "");
      }
    } catch (e) {
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
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch(`${FN_BASE}/tarefas-storage-config`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sess.session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "google_drive",
          root_folder_id: folderId.trim(),
          root_folder_link: folderLink.trim() || undefined,
          limite_upload_mb: limiteMb,
          tipos_permitidos: tiposCsv.split(",").map((s) => s.trim()).filter(Boolean),
          usar_proxy_visualizacao: usarProxy,
          bloquear_link_direto: bloquearDireto,
          permitir_download: permitirDownload,
          permitir_preview: permitirPreview,
          observacoes,
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

              <div className="grid sm:grid-cols-2 gap-3">
                <SwitchRow label="Visualização via proxy interno" desc="Streams binários sem expor URL do provider" checked={usarProxy} onChange={setUsarProxy} />
                <SwitchRow label="Bloquear link direto do provider" desc="UI nunca renderiza links do Drive/etc." checked={bloquearDireto} onChange={setBloquearDireto} />
                <SwitchRow label="Permitir download" desc="Usuários podem baixar anexos" checked={permitirDownload} onChange={setPermitirDownload} />
                <SwitchRow label="Permitir preview inline" desc="Imagens/vídeos/PDF abertos no viewer" checked={permitirPreview} onChange={setPermitirPreview} />
              </div>

              <div>
                <Label htmlFor="obs">Observações</Label>
                <Textarea id="obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
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
            tarefas/{"{MM-YYYY}"}/{"{DD}"}/{"{tipo_tarefa}"}/{"{codigo_tarefa}"}-{"{slug_nome}"}/{"{contexto}"}/{"{nome_arquivo}"}
          </code>
          <p className="text-xs text-muted-foreground">
            A regra de path é independente do provider. Trocar provider futuramente não altera o path lógico nem o banco.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SwitchRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded border bg-card">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
