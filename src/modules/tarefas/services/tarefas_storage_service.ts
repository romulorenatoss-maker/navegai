// ============================================================================
// tarefas_storage_service.ts
// ----------------------------------------------------------------------------
// FONTE ÚNICA de acesso a anexos para a UI do módulo Tarefas.
// PROIBIDO acessar bucket/provider diretamente nos componentes.
// Toda leitura/escrita/exclusão passa por aqui.
// ============================================================================

import { supabase } from '@/integrations/supabase/client';

export type ContextoAnexo =
  | 'instrucao_etapa'
  | 'instrucao_pergunta'
  | 'resposta_executor'
  | 'evidencia'
  | 'plano_acao'
  | 'devolucao'
  | 'aprovacao';

export interface TarefasAnexo {
  id: string;
  provider: string;
  path_relativo: string;
  provider_file_id: string | null;
  nome_original: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  checksum: string | null;
  contexto_tipo: ContextoAnexo;
  contexto_ref_id: string | null;
  assignment_id: string | null;
  template_id: string | null;
  uploaded_by: string | null;
  metadados: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UploadAnexoParams {
  file: File;
  contexto_tipo: ContextoAnexo;
  contexto_ref_id?: string | null;
  assignment_id?: string | null;
  template_id?: string | null;
  // Para compor o path_relativo oficial
  codigo_tarefa?: string;
  nome_tarefa?: string;
  tipo_tarefa?: 'avulsa' | 'rotina' | 'template';
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function authHeader(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('not_authenticated');
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------
export async function uploadAnexo(params: UploadAnexoParams): Promise<TarefasAnexo> {
  const headers = await authHeader();
  const fd = new FormData();
  fd.append('file', params.file);
  fd.append('contexto_tipo', params.contexto_tipo);
  if (params.contexto_ref_id) fd.append('contexto_ref_id', params.contexto_ref_id);
  if (params.assignment_id)   fd.append('assignment_id',   params.assignment_id);
  if (params.template_id)     fd.append('template_id',     params.template_id);
  if (params.codigo_tarefa)   fd.append('codigo_tarefa',   params.codigo_tarefa);
  if (params.nome_tarefa)     fd.append('nome_tarefa',     params.nome_tarefa);
  if (params.tipo_tarefa)     fd.append('tipo_tarefa',     params.tipo_tarefa);

  const res = await fetch(`${FN_BASE}/tarefas-storage-upload`, {
    method: 'POST', headers, body: fd,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.detail ?? json.error ?? 'upload_failed');
  return json.anexo as TarefasAnexo;
}

// ---------------------------------------------------------------------------
// listar (RLS controla escopo automaticamente)
// ---------------------------------------------------------------------------
export async function listAnexos(filter: {
  contexto_tipo?: ContextoAnexo;
  contexto_ref_id?: string;
  assignment_id?: string;
  template_id?: string;
}): Promise<TarefasAnexo[]> {
  let q = supabase.from('tarefas_anexos').select('*').is('deleted_at', null);
  if (filter.contexto_tipo)   q = q.eq('contexto_tipo',   filter.contexto_tipo);
  if (filter.contexto_ref_id) q = q.eq('contexto_ref_id', filter.contexto_ref_id);
  if (filter.assignment_id)   q = q.eq('assignment_id',   filter.assignment_id);
  if (filter.template_id)     q = q.eq('template_id',     filter.template_id);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TarefasAnexo[];
}

// ---------------------------------------------------------------------------
// URL temporária assinada (TTL 5 min) — única forma de exibir/baixar.
// Nunca cachear em estado persistente.
// ---------------------------------------------------------------------------
export async function getSignedUrl(anexo_id: string): Promise<{ url: string; expires_in: number }> {
  const headers = await authHeader();
  const res = await fetch(
    `${FN_BASE}/tarefas-storage-signed-url?anexo_id=${encodeURIComponent(anexo_id)}`,
    { method: 'GET', headers },
  );
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.detail ?? json.error ?? 'signed_url_failed');
  return { url: json.url, expires_in: json.expires_in };
}

// ---------------------------------------------------------------------------
// delete: soft por padrão; hard somente admin.
// ---------------------------------------------------------------------------
export async function deleteAnexo(anexo_id: string, opts: { hard?: boolean } = {}): Promise<void> {
  const headers = { ...(await authHeader()), 'Content-Type': 'application/json' };
  const res = await fetch(`${FN_BASE}/tarefas-storage-delete`, {
    method: 'POST', headers,
    body: JSON.stringify({ anexo_id, hard: !!opts.hard }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.detail ?? json.error ?? 'delete_failed');
}

// Singleton estilo objeto (para imports no padrão `tarefas_storage_service.uploadAnexo(...)`).
export const tarefas_storage_service = {
  uploadAnexo,
  listAnexos,
  getSignedUrl,
  deleteAnexo,
};
