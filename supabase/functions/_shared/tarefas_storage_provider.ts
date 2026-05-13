// ============================================================================
// tarefas_storage_provider.ts (camada de compatibilidade)
// ----------------------------------------------------------------------------
// Implementação real movida para ./storage_providers/.
// Este arquivo permanece para não quebrar imports existentes.
// ============================================================================

export {
  getStorageProvider,
  type StorageProvider,
  type UploadParams,
  type UploadResult,
  type DownloadStream,
  type FolderInfo,
  type ProviderName,
} from './storage_providers/index.ts';

// ----------------------------------------------------------------------------
// Helpers de path / slug — fonte única de verdade do path_relativo oficial.
// tarefas/{MM-YYYY}/{DD}/{tipo}/{codigo}-{slug}/{contexto}/{arquivo}
// ----------------------------------------------------------------------------

export function slugify(input: string): string {
  return (input || 'sem-nome')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sem-nome';
}

export function buildPathRelativo(args: {
  tipoTarefa: string;
  codigoTarefa: string;
  nomeTarefa: string;
  contexto: string;
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
