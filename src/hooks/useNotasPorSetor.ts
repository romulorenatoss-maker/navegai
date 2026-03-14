import { supabase } from "@/integrations/supabase/client";

interface NotaPorSetor {
  tipo: string;
  profile_id: string;
  profile_nome: string;
  setor_id: string | null;
  setor_nome: string;
  os_id: string;
  nota: number;
}

/**
 * Calls the calcular_notas_por_setor SQL function to get per-OS per-sector scores
 * assigned to the correct employee (atendente or tecnico based on sector).
 */
export async function fetchNotasPorSetor(
  dataInicio?: string,
  dataFim?: string
): Promise<NotaPorSetor[]> {
  const { data, error } = await supabase.rpc("calcular_notas_por_setor" as any, {
    p_data_inicio: dataInicio || null,
    p_data_fim: dataFim || null,
  });

  if (error) {
    console.error("Erro ao calcular notas por setor:", error);
    return [];
  }

  return (data as NotaPorSetor[]) || [];
}

/**
 * Calls the dashboard_metricas_agregadas SQL function to get aggregated averages.
 */
export async function fetchMetricasAgregadas(
  dataInicio?: string,
  dataFim?: string
): Promise<Array<{ tipo: string; profile_id: string; nome: string; setor_nome: string; total_os: number; media_nota: number }>> {
  const { data, error } = await supabase.rpc("dashboard_metricas_agregadas" as any, {
    p_data_inicio: dataInicio || null,
    p_data_fim: dataFim || null,
  });

  if (error) {
    console.error("Erro ao calcular métricas agregadas:", error);
    return [];
  }

  return (data as any[]) || [];
}

/**
 * Given raw per-OS per-sector scores, calculate the average for a specific employee.
 */
export function calcularMediaColaborador(
  notas: NotaPorSetor[],
  profileId: string
): number | null {
  const filtered = notas.filter(n => n.profile_id === profileId);
  if (filtered.length === 0) return null;
  return filtered.reduce((acc, n) => acc + Number(n.nota), 0) / filtered.length;
}

/**
 * Given raw per-OS per-sector scores, calculate avg per OS for a specific employee.
 */
export function calcularNotaPorOS(
  notas: NotaPorSetor[],
  profileId: string,
  osId: string
): number | null {
  const filtered = notas.filter(n => n.profile_id === profileId && n.os_id === osId);
  if (filtered.length === 0) return null;
  return filtered.reduce((acc, n) => acc + Number(n.nota), 0) / filtered.length;
}
