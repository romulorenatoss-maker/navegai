// ============================================================================
// tarefas_storagePath.ts
// ----------------------------------------------------------------------------
// Gera o caminho lógico oficial para todos os anexos do módulo de tarefas.
//
// Padrão:
//   tarefas/{MM-YYYY}/{DD}/{rotina|ad_hoc}/#{XXXX}-{slug-nome}.{ext}
//
// Regras:
//  - Independente de provider (Drive, S3, etc.)
//  - Cada arquivo vai direto na pasta da tarefa (sem sub-pastas de contexto)
//  - slug: lowercase, sem acentos, espaços → hífen, máx 40 chars
// ============================================================================

function slugify(text: string, maxLen = 40): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove acentos
    .replace(/[^a-z0-9\s-]/g, "")      // remove caracteres especiais
    .trim()
    .replace(/\s+/g, "-")              // espaços → hífen
    .replace(/-+/g, "-")               // hífens duplos → simples
    .slice(0, maxLen);
}

export interface StoragePathParams {
  /** Número da tarefa, ex: 46 → "#0046" */
  numero_tarefa: number | string;
  /** Nome da tarefa ou rotina */
  nome_tarefa: string;
  /** Origem: 'rotina' ou 'ad_hoc' */
  origem: "rotina" | "ad_hoc";
  /** Nome original do arquivo (para extrair extensão) */
  nome_arquivo: string;
  /** Data de referência (default: hoje) */
  data?: Date;
}

export function buildStoragePath(params: StoragePathParams): string {
  const data = params.data ?? new Date();

  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const yyyy = data.getFullYear();
  const dd = String(data.getDate()).padStart(2, "0");

  const numero = String(params.numero_tarefa).padStart(4, "0");
  const slug = slugify(params.nome_tarefa);
  const ext = params.nome_arquivo.split(".").pop()?.toLowerCase() || "bin";
  const ts = Date.now(); // garante unicidade no mesmo diretório

  // tarefas/05-2026/17/rotina/#0046-checklist-diario-de-limpeza-1747500000000.jpg
  return `tarefas/${mm}-${yyyy}/${dd}/${params.origem}/#${numero}-${slug}-${ts}.${ext}`;
}
