/**
 * Subaba Configuracoes -> Tarefas -> Armazenamento.
 * Gerencia provider, pasta-mae e pastas raiz por modulo.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
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

type StorageModuleFolder = {
  id: string;
  nome: string;
  pasta: string;
  descricao: string;
  ativo: boolean;
  permitir_upload: boolean;
  permitir_download: boolean;
  folder_id?: string | null;
  ultima_validacao_em?: string | null;
};

const TAREFAS_MODULE: StorageModuleFolder = {
  id: "tarefas",
  nome: "Tarefas",
  pasta: "tarefas",
  descricao: "Evidencias, respostas, planos de acao, aprovacao e auditoria do modulo Tarefas.",
  ativo: true,
  permitir_upload: true,
  permitir_download: true,
};

const OS_MODULE: StorageModuleFolder = {
  id: "os",
  nome: "OS",
  pasta: "os",
  descricao: "Pasta reservada para anexos do modulo OS quando ele usar este provider.",
  ativo: true,
  permitir_upload: true,
  permitir_download: true,
};

function slugFolderName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeModuleFolder(raw: Partial<StorageModuleFolder>, fallback: StorageModuleFolder): StorageModuleFolder {
  const nome = String(raw.nome ?? fallback.nome).trim() || fallback.nome;
  const pasta = slugFolderName(String(raw.pasta ?? fallback.pasta).trim() || fallback.pasta);

  return {
    id: String(raw.id ?? fallback.id).trim() || fallback.id,
    nome,
    pasta: pasta || fallback.pasta,
    descricao: String(raw.descricao ?? fallback.descricao ?? "").trim(),
    ativo: raw.ativo ?? fallback.ativo,
    permitir_upload: raw.permitir_upload ?? fallback.permitir_upload,
    permitir_download: raw.permitir_download ?? fallback.permitir_download,
    folder_id: raw.folder_id ?? null,
    ultima_validacao_em: raw.ultima_validacao_em ?? null,
  };
}

function parseModuleFolders(observacoes?: string | null): StorageModuleFolder[] {
  if (!observacoes) return [TAREFAS_MODULE];

  try {
    const parsed = JSON.parse(observacoes);
    if (Array.isArray(parsed?.module_folders)) {
      const modules = parsed.module_folders.map((item: Partial<StorageModuleFolder>, index: number) =>
        normalizeModuleFolder(item, {
          ...TAREFAS_MODULE,
          id: `modulo-${index + 1}`,
          nome: `Modulo ${index + 1}`,
          pasta: `modulo-${index + 1}`,
          ativo: true,
        }),
      );

      if (!modules.some((module) => module.id === "tarefas")) {
        modules.unshift(TAREFAS_MODULE);
      }

      return modules;
    }
  } catch {
    // Observacoes antigas em texto livre permanecem ignoradas pela UI nova.
  }

  return [TAREFAS_MODULE];
}

function buildObservacoesPayload(modules: StorageModuleFolder[]): string {
  return JSON.stringify({
    module_folders: modules.map((module) => ({
      id: module.id,
      nome: module.nome,
      pasta: module.pasta,
      descricao: module.descricao,
      ativo: module.ativo,
      permitir_upload: module.permitir_upload,
      permitir_download: module.permitir_download,
      folder_id: module.folder_id ?? null,
      ultima_validacao_em: module.ultima_validacao_em ?? null,
    })),
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

export function TarefasConfigArmazenamento() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [criandoModuloId, setCriandoModuloId] = useState<string | null>(null);
  const [state, setState] = useState<ConfigState>({ configured: false });

  const [folderId, setFolderId] = useState("");
  const [folderLink, setFolderLink] = useState("");
  const [limiteMb, setLimiteMb] = useState(25);
  const [tiposCsv, setTiposCsv] = useState("image/*, video/*, audio/*, application/pdf");
  const [permitirDownload, setPermitirDownload] = useState(true);
  const [modules, setModules] = useState<StorageModuleFolder[]>([TAREFAS_MODULE]);

  const hasOsModule = useMemo(() => modules.some((module) => module.id === "os"), [modules]);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }, []);

  const loadConfig = useCallback(async () => {
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
        setModules(parseModuleFolders(json.config.observacoes));
      } else {
        setModules([TAREFAS_MODULE]);
      }
    } catch {
      toast.error("Falha ao carregar configuracao");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  async function saveConfig(modulesToSave = modules, showToast = true) {
    if (!folderId.trim()) {
      toast.error("Informe o ID da pasta-mae");
      return false;
    }

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
          observacoes: buildObservacoesPayload(modulesToSave),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.detail ?? json.error ?? "save_failed");
      if (showToast) toast.success("Configuracao salva e validada");
      await loadConfig();
      return true;
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, "Falha ao salvar"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    await saveConfig(modules, true);
  }

  function updateModule(id: string, patch: Partial<StorageModuleFolder>) {
    setModules((current) =>
      current.map((module) => {
        if (module.id !== id) return module;
        const next = { ...module, ...patch };
        if (patch.nome !== undefined && id !== "tarefas" && !patch.pasta) {
          next.pasta = slugFolderName(patch.nome) || module.pasta;
        }
        if (patch.pasta !== undefined) {
          next.pasta = slugFolderName(patch.pasta) || module.pasta;
        }
        return next;
      }),
    );
  }

  function addModule(preset?: StorageModuleFolder) {
    const base = preset ?? {
      id: `modulo-${Date.now()}`,
      nome: "Novo modulo",
      pasta: "novo-modulo",
      descricao: "Descreva o uso desta pasta.",
      ativo: true,
      permitir_upload: true,
      permitir_download: true,
    };

    if (modules.some((module) => module.id === base.id || module.pasta === base.pasta)) {
      toast.info("Este modulo ja esta listado.");
      return;
    }

    setModules((current) => [...current, base]);
  }

  function removeModule(id: string) {
    if (id === "tarefas") {
      toast.error("A pasta oficial de Tarefas nao pode ser removida.");
      return;
    }
    setModules((current) => current.filter((module) => module.id !== id));
  }

  async function handleCriarPastaModulo(module: StorageModuleFolder) {
    if (!folderId.trim()) {
      toast.error("Informe o ID da pasta-mae antes de criar pastas por modulo");
      return;
    }
    if (!module.pasta.trim()) {
      toast.error("Informe o nome da pasta do modulo");
      return;
    }

    setCriandoModuloId(module.id);
    try {
      const token = await getToken();
      const res = await fetch(`${FN_BASE}/tarefas-storage-create-folder`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "google_drive",
          root_folder_id: folderId.trim(),
          folder_name: module.pasta.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.detail ?? json.error ?? "create_folder_failed");

      const updatedModules = modules.map((item) =>
        item.id === module.id
          ? { ...item, folder_id: json.folder_id, ultima_validacao_em: new Date().toISOString() }
          : item,
      );
      setModules(updatedModules);
      await saveConfig(updatedModules, false);
      toast.success(`Pasta "${module.pasta}" criada/validada no Drive.`);
    } catch (e: unknown) {
      toast.error(`Falha ao criar pasta: ${getErrorMessage(e, "erro desconhecido")}`);
    } finally {
      setCriandoModuloId(null);
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
              (OneDrive, S3, R2 e SharePoint disponiveis em codigo - nao habilitados)
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
                    ? `Pasta-mae validada: ${state.validation.folder_name}`
                    : `Erro: ${state.validation.error}`}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="folderId">ID da pasta-mae (Drive)</Label>
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
                  <Input id="tipos" value={tiposCsv} onChange={(e) => setTiposCsv(e.target.value)} placeholder="image/*, video/*, audio/*, application/pdf" />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-3 p-3 rounded border bg-card">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Permitir download global</p>
                  <p className="text-xs text-muted-foreground">Regra padrao para anexos do provider configurado.</p>
                </div>
                <Switch checked={permitirDownload} onCheckedChange={setPermitirDownload} />
              </div>

              <Separator />

              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <FolderTree className="w-4 h-4" /> Pastas por modulo
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Usa o mesmo provider e a mesma pasta-mae, mas cria uma pasta raiz separada para cada modulo.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {!hasOsModule && (
                      <Button type="button" variant="outline" size="sm" onClick={() => addModule(OS_MODULE)}>
                        <Plus className="w-4 h-4 mr-2" /> Adicionar OS
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={() => addModule()}>
                      <Plus className="w-4 h-4 mr-2" /> Adicionar modulo
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {modules.map((module) => (
                    <div key={module.id} className="rounded-md border bg-background p-3 space-y-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="grid gap-3 sm:grid-cols-2 lg:flex-1">
                          <div>
                            <Label htmlFor={`module-name-${module.id}`}>Modulo</Label>
                            <Input
                              id={`module-name-${module.id}`}
                              value={module.nome}
                              disabled={module.id === "tarefas"}
                              onChange={(e) => updateModule(module.id, { nome: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`module-folder-${module.id}`}>Pasta raiz</Label>
                            <Input
                              id={`module-folder-${module.id}`}
                              value={module.pasta}
                              disabled={module.id === "tarefas"}
                              onChange={(e) => updateModule(module.id, { pasta: e.target.value })}
                              placeholder="tarefas, os, propostas"
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCriarPastaModulo(module)}
                            disabled={criandoModuloId === module.id || !module.ativo || !folderId.trim()}
                          >
                            {criandoModuloId === module.id ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <FolderPlus className="w-4 h-4 mr-2" />
                            )}
                            Criar pasta {module.nome}
                          </Button>
                          {module.id !== "tarefas" && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeModule(module.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div>
                        <Label htmlFor={`module-description-${module.id}`}>O que este modulo pode usar nesta pasta</Label>
                        <Textarea
                          id={`module-description-${module.id}`}
                          value={module.descricao}
                          onChange={(e) => updateModule(module.id, { descricao: e.target.value })}
                          className="min-h-[64px]"
                        />
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3">
                        <label className="flex items-center justify-between gap-3 rounded border p-2 text-sm">
                          <span>Modulo ativo</span>
                          <Switch checked={module.ativo} onCheckedChange={(checked) => updateModule(module.id, { ativo: checked })} />
                        </label>
                        <label className="flex items-center justify-between gap-3 rounded border p-2 text-sm">
                          <span>Permite upload</span>
                          <Switch checked={module.permitir_upload} onCheckedChange={(checked) => updateModule(module.id, { permitir_upload: checked })} />
                        </label>
                        <label className="flex items-center justify-between gap-3 rounded border p-2 text-sm">
                          <span>Permite download</span>
                          <Switch checked={module.permitir_download} onCheckedChange={(checked) => updateModule(module.id, { permitir_download: checked })} />
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">Path: {module.pasta}/...</Badge>
                        {module.folder_id && <Badge variant="secondary">Drive ID validado</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Salvar configuracao
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Caminho logico oficial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <code className="block rounded bg-muted px-3 py-2 text-xs overflow-x-auto">
            {"{modulo}"}/{"{MM-YYYY}"}/{"{DD}"}/{"{origem}"}/#{"{XXXX}"}-{"{slug-nome}"}/{"{contexto}"}/{"{nome-arquivo.ext}"}
          </code>
          <div className="text-xs text-muted-foreground space-y-1.5">
            <p>
              Cada modulo tem uma pasta raiz propria. O modulo Tarefas continua usando <code className="text-[10px]">tarefas/</code>.
            </p>
            <p>
              <strong>Exemplo Tarefas:</strong>{" "}
              <code className="text-[10px]">tarefas/05-2026/20/rotina/#0025-checklist-diario-de-limpeza/plano_acao/video.mp4</code>
            </p>
            <p>
              <strong>Exemplo OS:</strong>{" "}
              <code className="text-[10px]">os/05-2026/20/os/#0188-vistoria-tecnica/evidencia/foto.jpg</code>
            </p>
            <p>
              Trocar provider futuramente (S3, R2, OneDrive) nao altera o path logico nem o banco. A tela apenas controla provider global e pastas raiz por modulo.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
