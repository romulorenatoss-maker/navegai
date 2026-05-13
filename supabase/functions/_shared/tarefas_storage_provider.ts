// ============================================================================
// tarefas_storage_provider.ts
// ----------------------------------------------------------------------------
// Provider abstrato de storage para o módulo Tarefas.
// A app NUNCA depende diretamente do Google Drive: depende dessa interface.
// Trocar provider (OneDrive/S3/R2/Supabase) = adicionar nova implementação
// e mudar `getStorageProvider()` — sem alterar edge functions ou app.
// ============================================================================

export interface UploadParams {
  pathRelativo: string;          // tarefas/{MM-YYYY}/{DD}/{tipo}/{codigo}-{slug}/{contexto}/{arquivo}
  nomeOriginal: string;
  mimeType: string;
  conteudo: Uint8Array;
  rootFolderId: string;          // ID da pasta-mãe configurada no provider (obrigatório)
}

// Verifica metadados de uma pasta no provider — usado pela tela de Configurações
// para validar o ID antes de salvar.
export interface FolderInfo {
  id: string;
  name: string;
  mimeType: string;
}

export interface UploadResult {
  providerFileId: string;
  tamanhoBytes: number;
  checksum?: string;
  metadados?: Record<string, unknown>;
}

export interface DownloadStream {
  body: ReadableStream<Uint8Array>;
  mimeType: string;
  tamanhoBytes?: number;
}

export interface StorageProvider {
  readonly name: 'google_drive' | 'onedrive' | 's3' | 'r2' | 'supabase';
  upload(params: UploadParams): Promise<UploadResult>;
  download(providerFileId: string): Promise<DownloadStream>;
  remove(providerFileId: string): Promise<void>;
  /** Valida que a pasta existe e é acessível pela conta-serviço. */
  inspectFolder(folderId: string): Promise<FolderInfo>;
}

// ============================================================================
// Google Drive provider (via Lovable connector gateway)
// ============================================================================
// Pasta-mãe configurada por admin em Configurações → Integrações
// (tabela public.tarefas_storage_config). Subpastas espelham o pathRelativo.
// ============================================================================

const GATEWAY_BASE = 'https://connector-gateway.lovable.dev/google_drive';

function gatewayHeaders(): HeadersInit {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const driveKey = Deno.env.get('GOOGLE_DRIVE_API_KEY');
  if (!lovableKey) throw new Error('LOVABLE_API_KEY is not configured');
  if (!driveKey) throw new Error('GOOGLE_DRIVE_API_KEY is not configured');
  return {
    Authorization: `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': driveKey,
  };
}

// Cache: rootFolderId → (subpath relativo → driveFolderId)
const folderCache = new Map<string, Map<string, string>>();
function cacheFor(root: string): Map<string, string> {
  let m = folderCache.get(root);
  if (!m) { m = new Map(); folderCache.set(root, m); }
  return m;
}

async function findFolder(name: string, parentId: string | null): Promise<string | null> {
  const safe = name.replace(/'/g, "\\'");
  const q = parentId
    ? `mimeType='application/vnd.google-apps.folder' and name='${safe}' and '${parentId}' in parents and trashed=false`
    : `mimeType='application/vnd.google-apps.folder' and name='${safe}' and trashed=false`;
  const res = await fetch(
    `${GATEWAY_BASE}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
    { headers: gatewayHeaders() },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Drive find folder failed [${res.status}]: ${t}`);
  }
  const j = await res.json();
  return j.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string | null): Promise<string> {
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) body.parents = [parentId];
  const res = await fetch(`${GATEWAY_BASE}/drive/v3/files?fields=id`, {
    method: 'POST',
    headers: { ...gatewayHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Drive create folder failed [${res.status}]: ${t}`);
  }
  const j = await res.json();
  return j.id;
}

async function ensureFolderPath(rootFolderId: string, segments: string[]): Promise<string> {
  const cache = cacheFor(rootFolderId);
  const cacheKey = segments.join('/');
  if (cacheKey === '') return rootFolderId;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let parent: string = rootFolderId;
  let runningKey = '';
  for (const seg of segments) {
    runningKey = runningKey ? `${runningKey}/${seg}` : seg;
    const memo = cache.get(runningKey);
    if (memo) { parent = memo; continue; }
    let id = await findFolder(seg, parent);
    if (!id) id = await createFolder(seg, parent);
    cache.set(runningKey, id);
    parent = id;
  }
  return parent;
}

const googleDriveProvider: StorageProvider = {
  name: 'google_drive',

  async upload({ pathRelativo, nomeOriginal, mimeType, conteudo, rootFolderId }) {
    if (!rootFolderId) {
      throw new Error('rootFolderId obrigatório — configure a pasta-mãe em Configurações → Integrações.');
    }
    // pathRelativo termina em /{nome_arquivo}; pasta = tudo antes.
    const parts = pathRelativo.split('/').filter(Boolean);
    const fileName = parts.pop()!;
    const folderId = await ensureFolderPath(rootFolderId, parts);

    const metadata = {
      name: fileName,
      parents: [folderId],
      description: `Lovable Tarefas anexo: ${nomeOriginal}`,
    };

    const boundary = '-------tarefas-' + crypto.randomUUID();
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    );
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + conteudo.length + tail.length);
    body.set(head, 0);
    body.set(conteudo, head.length);
    body.set(tail, head.length + conteudo.length);

    const res = await fetch(
      `${GATEWAY_BASE}/upload/drive/v3/files?uploadType=multipart&fields=id,size,md5Checksum`,
      {
        method: 'POST',
        headers: {
          ...gatewayHeaders(),
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Drive upload failed [${res.status}]: ${t}`);
    }
    const j = await res.json();
    return {
      providerFileId: j.id,
      tamanhoBytes: Number(j.size ?? conteudo.length),
      checksum: j.md5Checksum,
      metadados: { drive_folder_id: folderId },
    };
  },

  async download(providerFileId) {
    const res = await fetch(
      `${GATEWAY_BASE}/drive/v3/files/${encodeURIComponent(providerFileId)}?alt=media`,
      { headers: gatewayHeaders() },
    );
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      throw new Error(`Drive download failed [${res.status}]: ${t}`);
    }
    return {
      body: res.body,
      mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
      tamanhoBytes: Number(res.headers.get('content-length') ?? 0) || undefined,
    };
  },

  async remove(providerFileId) {
    const res = await fetch(
      `${GATEWAY_BASE}/drive/v3/files/${encodeURIComponent(providerFileId)}`,
      { method: 'DELETE', headers: gatewayHeaders() },
    );
    if (!res.ok && res.status !== 404) {
      const t = await res.text().catch(() => '');
      throw new Error(`Drive delete failed [${res.status}]: ${t}`);
    }
  },

  async inspectFolder(folderId) {
    const res = await fetch(
      `${GATEWAY_BASE}/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed&supportsAllDrives=true`,
      { headers: gatewayHeaders() },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Drive inspect folder failed [${res.status}]: ${t}`);
    }
    const j = await res.json();
    if (j.trashed) throw new Error('Pasta está na lixeira do Drive.');
    if (j.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error(`O ID informado não é uma pasta (mimeType=${j.mimeType}).`);
    }
    return { id: j.id, name: j.name, mimeType: j.mimeType };
  },
};

// ============================================================================
// Resolver — único ponto que escolhe o provider concreto.
// ============================================================================
export function getStorageProvider(name?: string): StorageProvider {
  const target = name ?? 'google_drive';
  switch (target) {
    case 'google_drive': return googleDriveProvider;
    // case 'onedrive':   return oneDriveProvider;     // futuro
    // case 's3':         return s3Provider;           // futuro
    // case 'r2':         return r2Provider;           // futuro
    // case 'supabase':   return supabaseProvider;     // futuro
    default:
      throw new Error(`Storage provider não suportado: ${target}`);
  }
}

// ============================================================================
// Helpers de path / slug — fonte única de verdade do path_relativo oficial.
// tarefas/{MM-YYYY}/{DD}/{tipo}/{codigo}-{slug}/{contexto}/{arquivo}
// ============================================================================

export function slugify(input: string): string {
  return (input || 'sem-nome')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sem-nome';
}

export function buildPathRelativo(args: {
  tipoTarefa: string;       // 'avulsa' | 'rotina' | 'template'
  codigoTarefa: string;
  nomeTarefa: string;
  contexto: string;         // instrucao_etapa | instrucao_pergunta | evidencia | ...
  nomeArquivo: string;
  data?: Date;
}): string {
  const d = args.data ?? new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const slug = slugify(args.nomeTarefa);
  const safeFile = args.nomeArquivo.replace(/[\\/]/g, '_');
  return [
    'tarefas',
    `${mm}-${yyyy}`,
    dd,
    args.tipoTarefa,
    `${args.codigoTarefa}-${slug}`,
    args.contexto,
    safeFile,
  ].join('/');
}
