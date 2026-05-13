// ============================================================================
// storage_providers/types.ts
// ----------------------------------------------------------------------------
// Tipos compartilhados por todos os providers de storage do módulo Tarefas.
// ============================================================================

export interface UploadParams {
  pathRelativo: string;
  nomeOriginal: string;
  mimeType: string;
  conteudo: Uint8Array;
  rootFolderId: string;
}

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

export type ProviderName = 'google_drive' | 'onedrive' | 's3' | 'r2' | 'supabase' | 'sharepoint';

export interface StorageProvider {
  readonly name: ProviderName;
  upload(params: UploadParams): Promise<UploadResult>;
  download(providerFileId: string): Promise<DownloadStream>;
  remove(providerFileId: string): Promise<void>;
  inspectFolder(folderId: string): Promise<FolderInfo>;
}
