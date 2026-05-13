// ============================================================================
// storage_providers/google_drive.ts
// ----------------------------------------------------------------------------
// Provider Google Drive via Lovable connector gateway.
// Migrado de _shared/tarefas_storage_provider.ts (mesmo comportamento).
// ============================================================================

import type {
  StorageProvider, UploadParams, UploadResult, DownloadStream, FolderInfo,
} from './types.ts';

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
  if (!res.ok) throw new Error(`Drive find folder failed [${res.status}]: ${await res.text()}`);
  const j = await res.json();
  return j.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string | null): Promise<string> {
  const body: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  const res = await fetch(`${GATEWAY_BASE}/drive/v3/files?fields=id`, {
    method: 'POST',
    headers: { ...gatewayHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Drive create folder failed [${res.status}]: ${await res.text()}`);
  const j = await res.json();
  return j.id;
}

async function ensureFolderPath(rootFolderId: string, segments: string[]): Promise<string> {
  const cache = cacheFor(rootFolderId);
  const cacheKey = segments.join('/');
  if (cacheKey === '') return rootFolderId;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let parent = rootFolderId;
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

export const googleDriveProvider: StorageProvider = {
  name: 'google_drive',

  async upload({ pathRelativo, nomeOriginal, mimeType, conteudo, rootFolderId }: UploadParams): Promise<UploadResult> {
    if (!rootFolderId) throw new Error('rootFolderId obrigatório — configure a pasta-mãe em Configurações → Tarefas → Armazenamento.');
    const parts = pathRelativo.split('/').filter(Boolean);
    const fileName = parts.pop()!;
    const folderId = await ensureFolderPath(rootFolderId, parts);

    const metadata = { name: fileName, parents: [folderId], description: `Lovable Tarefas anexo: ${nomeOriginal}` };
    const boundary = '-------tarefas-' + crypto.randomUUID();
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    );
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + conteudo.length + tail.length);
    body.set(head, 0); body.set(conteudo, head.length); body.set(tail, head.length + conteudo.length);

    const res = await fetch(
      `${GATEWAY_BASE}/upload/drive/v3/files?uploadType=multipart&fields=id,size,md5Checksum`,
      { method: 'POST', headers: { ...gatewayHeaders(), 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    );
    if (!res.ok) throw new Error(`Drive upload failed [${res.status}]: ${await res.text()}`);
    const j = await res.json();
    return {
      providerFileId: j.id,
      tamanhoBytes: Number(j.size ?? conteudo.length),
      checksum: j.md5Checksum,
      metadados: { drive_folder_id: folderId },
    };
  },

  async download(providerFileId: string): Promise<DownloadStream> {
    const res = await fetch(
      `${GATEWAY_BASE}/drive/v3/files/${encodeURIComponent(providerFileId)}?alt=media`,
      { headers: gatewayHeaders() },
    );
    if (!res.ok || !res.body) throw new Error(`Drive download failed [${res.status}]: ${await res.text().catch(() => '')}`);
    return {
      body: res.body,
      mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
      tamanhoBytes: Number(res.headers.get('content-length') ?? 0) || undefined,
    };
  },

  async remove(providerFileId: string): Promise<void> {
    const res = await fetch(
      `${GATEWAY_BASE}/drive/v3/files/${encodeURIComponent(providerFileId)}`,
      { method: 'DELETE', headers: gatewayHeaders() },
    );
    if (!res.ok && res.status !== 404) throw new Error(`Drive delete failed [${res.status}]: ${await res.text().catch(() => '')}`);
  },

  async inspectFolder(folderId: string): Promise<FolderInfo> {
    const res = await fetch(
      `${GATEWAY_BASE}/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed&supportsAllDrives=true`,
      { headers: gatewayHeaders() },
    );
    if (!res.ok) throw new Error(`Drive inspect folder failed [${res.status}]: ${await res.text().catch(() => '')}`);
    const j = await res.json();
    if (j.trashed) throw new Error('Pasta está na lixeira do Drive.');
    if (j.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error(`O ID informado não é uma pasta (mimeType=${j.mimeType}).`);
    }
    return { id: j.id, name: j.name, mimeType: j.mimeType };
  },
};
