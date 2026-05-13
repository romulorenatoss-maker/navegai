// ============================================================================
// storage_providers/index.ts
// ----------------------------------------------------------------------------
// Factory: ponto único de seleção do provider concreto.
// Para adicionar novo provider: implemente StorageProvider e adicione no switch.
// ============================================================================

import type { StorageProvider, ProviderName } from './types.ts';
import { googleDriveProvider } from './google_drive.ts';

export * from './types.ts';

const NOT_IMPLEMENTED = (name: ProviderName): StorageProvider => ({
  name,
  upload: () => { throw new Error(`Provider "${name}" não implementado.`); },
  download: () => { throw new Error(`Provider "${name}" não implementado.`); },
  remove: () => { throw new Error(`Provider "${name}" não implementado.`); },
  inspectFolder: () => { throw new Error(`Provider "${name}" não implementado.`); },
});

export function getStorageProvider(name?: string): StorageProvider {
  const target = (name ?? 'google_drive') as ProviderName;
  switch (target) {
    case 'google_drive': return googleDriveProvider;
    case 'onedrive':
    case 's3':
    case 'r2':
    case 'supabase':
    case 'sharepoint':
      return NOT_IMPLEMENTED(target);
    default:
      throw new Error(`Storage provider não suportado: ${target}`);
  }
}
