import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Clock, Users, Activity, AlertTriangle, TrendingDown, CalendarCheck, CalendarIcon, ChevronDown, ChevronRight, Search } from "lucide-react";
import DesempenhoOperacionalPage from "@/pages/DesempenhoOperacionalPage";

// =============================================================
// Tipos
// =============================================================
interface MetricaSetor {
  setor_id: string | null;
  ordem_servico_id: string;
  inicio: string | null;
  fim: string | null;
  tempo_total: string | null;
  tempo_medio: string | null;
  setor_nome?: string;
}
interface GargaloAgg {
  pergunta_id: string;
  pergunta_texto: string;
  tempo_medio_seg: number;
  maior_tempo_seg: number;
  ocorrencias: number;
}
interface PausaItem {
  ordem_servico_id: string;
  setor_id: string | null;
  usuario_id: string | null;
  pergunta_id: string;
  respondido_em: string;
  tempo_entre_respostas: string | null;
  // enriquecido
  numero_os?: string | number | null;
  pergunta_texto?: string;
}

interface EventoResposta {
  ordem_servico_id: string;
  usuario_id: string | null;
  setor_id: string | null;
  pergunta_id: string | null;
  respondido_em: string;
}

interface EventoSequenciaPeriodo extends EventoResposta {
  tempo_entre_respostas: string | null;
  tempo_entre_respostas_seg: number | null;
}

// =============================================================
// Helpers
// =============================================================
function intervalToSeconds(interval: string | null): number {
  if (!interval) return 0;
  let total = 0;
  const dayMatch = interval.match(/(\d+)\s*day/);
  if (dayMatch) total += parseInt(dayMatch[1]) * 86400;
  const timeMatch = interval.match(/(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (timeMatch) {
    total += parseInt(timeMatch[1]) * 3600;
    total += parseInt(timeMatch[2]) * 60;
    total += parseFloat(timeMatch[3]);
  }
  return total;
}
function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
function secondsToInterval(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86400);
  const rest = safe % 86400;
  const h = Math.floor(rest / 3600);
  const m = Math.floor((rest % 3600) / 60);
  const s = rest % 60;
  return `${days > 0 ? `${days} day ` : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function dataSelecionadaBR(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function inicioDiaSaoPauloIso(date: Date): string {
  return new Date(`${dataSelecionadaBR(date)}T00:00:00.000-03:00`).toISOString();
}
function fimDiaSaoPauloIso(date: Date): string {
  return new Date(`${dataSelecionadaBR(date)}T23:59:59.999-03:00`).toISOString();
}
const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" });
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
// Compara se duas datas ISO caem no mesmo dia em America/Sao_Paulo
const mesmaDataBR = (a: string, b: string) => {
  const fmt = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return fmt(a) === fmt(b);
};

function horaBR(iso: string): number {
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(iso));
  return parseInt(s, 10);
}

// =============================================================
// Métricas calculadas por avaliador (período)
// =============================================================
interface OSDoAvaliador {
  os_id: string;
  numero_os: string | number | null;
  inicio: string;
  fim: string;
  duracao_seg: number;
  dia: string; // YYYY-MM-DD em America/Sao_Paulo (com base no início)
  em_aberto?: boolean;
  setor_id?: string | null;
}
interface FaixaHora {
  faixa: string;
  qtd_os: number;
  tempo_total_seg: number;
}
interface DiaAvaliador {
  dia: string; // YYYY-MM-DD
  primeira_acao: string;
  ultima_acao: string;
  total_os: number;
  tempo_medio_dentro_os_seg: number;
  tempo_medio_entre_os_seg: number;
}
interface MetricaAvaliador {
  usuario_id: string;
  nome: string;
  total_os: number;
  primeira_acao: string | null;
  ultima_acao: string | null;
  tempo_medio_entre_os_seg: number;
  tempo_medio_dentro_os_seg: number;
  faixas: FaixaHora[];
  oss: OSDoAvaliador[];
  dias: DiaAvaliador[];
}

// Retorna YYYY-MM-DD em America/Sao_Paulo
function diaBR(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function calcularMetricasPorAvaliador(
  eventos: EventoResposta[],
  profMap: Record<string, string>,
  osNumeroMap: Record<string, string | number | null>,
  periodoInicioMs?: number,
  periodoFimMs?: number,
  aberturaPorSetorOs?: Map<string, boolean>, // key = `${osId}::${setorId}`
  agoraIso?: string,
): MetricaAvaliador[] {
  // 1) Agrupar eventos do PERÍODO por usuário/(OS+setor) — uma "OS" do avaliador é por setor
  const porUsuario = new Map<string, Map<string, { os_id: string; setor_id: string | null; tempos: string[] }>>();
  for (const e of eventos) {
    if (!e.usuario_id) continue;
    if (!porUsuario.has(e.usuario_id)) porUsuario.set(e.usuario_id, new Map());
    const osMap = porUsuario.get(e.usuario_id)!;
    const k = `${e.ordem_servico_id}::${e.setor_id ?? "sem_setor"}`;
    if (!osMap.has(k)) osMap.set(k, { os_id: e.ordem_servico_id, setor_id: e.setor_id, tempos: [] });
    osMap.get(k)!.tempos.push(e.respondido_em);
  }

  const result: MetricaAvaliador[] = [];
  for (const [usuario_id, osMap] of porUsuario.entries()) {
    const oss: OSDoAvaliador[] = [];
    for (const [, info] of osMap.entries()) {
      const ts = info.tempos.slice().sort();
      const inicio = ts[0];
      const ultimaResp = ts[ts.length - 1];

      // Início da avaliação (primeira resposta do setor) deve estar dentro do filtro.
      if (periodoInicioMs != null && periodoFimMs != null) {
        const inicioMs = new Date(inicio).getTime();
        if (inicioMs < periodoInicioMs || inicioMs > periodoFimMs) continue;
      }

      // Verifica se a avaliação do setor está em aberto
      const chaveAbertura = `${info.os_id}::${info.setor_id ?? "sem_setor"}`;
      const emAberto = aberturaPorSetorOs?.get(chaveAbertura) === true;
      const fim = emAberto ? (agoraIso ?? new Date().toISOString()) : ultimaResp;

      const dur = (new Date(fim).getTime() - new Date(inicio).getTime()) / 1000;
      oss.push({
        os_id: info.os_id,
        numero_os: osNumeroMap[info.os_id] ?? null,
        inicio,
        fim,
        duracao_seg: dur,
        dia: diaBR(inicio),
        em_aberto: emAberto,
        setor_id: info.setor_id,
      });
    }
    oss.sort((a, b) => a.inicio.localeCompare(b.inicio));

    // === Métricas globais do período ===
    const gaps: number[] = [];
    for (let i = 1; i < oss.length; i++) {
      const gap = (new Date(oss[i].inicio).getTime() - new Date(oss[i - 1].fim).getTime()) / 1000;
      if (gap >= 0) gaps.push(gap);
    }
    const tempo_medio_entre_os_seg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const tempo_medio_dentro_os_seg = oss.length ? oss.reduce((a, o) => a + o.duracao_seg, 0) / oss.length : 0;

    // === Faixas horárias (período) ===
    const faixaMap = new Map<number, { qtd: number; tempo: number }>();
    for (const o of oss) {
      const h = horaBR(o.inicio);
      if (!faixaMap.has(h)) faixaMap.set(h, { qtd: 0, tempo: 0 });
      const cur = faixaMap.get(h)!;
      cur.qtd += 1;
      cur.tempo += o.duracao_seg;
    }
    const faixas: FaixaHora[] = Array.from(faixaMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([h, v]) => ({
        faixa: `${String(h).padStart(2, "0")}h–${String((h + 1) % 24).padStart(2, "0")}h`,
        qtd_os: v.qtd,
        tempo_total_seg: v.tempo,
      }));

    // === Agregação por DIA (com base no dia da OS = dia do início) ===
    const porDia = new Map<string, OSDoAvaliador[]>();
    for (const o of oss) {
      if (!porDia.has(o.dia)) porDia.set(o.dia, []);
      porDia.get(o.dia)!.push(o);
    }
    const dias: DiaAvaliador[] = Array.from(porDia.entries())
      .map(([dia, ossDoDia]) => {
        const ordenadas = ossDoDia.slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
        const gapsDia: number[] = [];
        for (let i = 1; i < ordenadas.length; i++) {
          const gap = (new Date(ordenadas[i].inicio).getTime() - new Date(ordenadas[i - 1].fim).getTime()) / 1000;
          if (gap >= 0) gapsDia.push(gap);
        }
        return {
          dia,
          primeira_acao: ordenadas[0].inicio,
          ultima_acao: ordenadas[ordenadas.length - 1].fim,
          total_os: ordenadas.length,
          tempo_medio_dentro_os_seg: ordenadas.reduce((a, o) => a + o.duracao_seg, 0) / ordenadas.length,
          tempo_medio_entre_os_seg: gapsDia.length ? gapsDia.reduce((a, b) => a + b, 0) / gapsDia.length : 0,
        };
      })
      .sort((a, b) => a.dia.localeCompare(b.dia));

    result.push({
      usuario_id,
      nome: profMap[usuario_id] ?? "—",
      total_os: oss.length,
      primeira_acao: oss[0]?.inicio ?? null,
      ultima_acao: oss[oss.length - 1]?.fim ?? null,
      tempo_medio_entre_os_seg,
      tempo_medio_dentro_os_seg,
      faixas,
      oss,
      dias,
    });
  }

  // Não exibir avaliadores que ficaram zerados após filtro de período (regra D)
  return result.filter(a => a.total_os > 0).sort((a, b) => b.total_os - a.total_os);
}

// =============================================================
// Componente
// =============================================================
export default function DashboardTempoAvaliacoes() {
  const [loading, setLoading] = useState(true);
  const [setores, setSetores] = useState<MetricaSetor[]>([]);
  const [gargalos, setGargalos] = useState<GargaloAgg[]>([]);
  const [pausas, setPausas] = useState<PausaItem[]>([]);
  const [eventos, setEventos] = useState<EventoResposta[]>([]);
  const [profMap, setProfMap] = useState<Record<string, string>>({});
  const [osNumeroMap, setOsNumeroMap] = useState<Record<string, string | number | null>>({});
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  // Período: estado pendente (que o usuário está editando) e estado APLICADO (o que dispara a busca)
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const [dataInicioPend, setDataInicioPend] = useState<Date>(inicioMes);
  const [dataFimPend, setDataFimPend] = useState<Date>(hoje);
  const [dataInicio, setDataInicio] = useState<Date>(inicioMes);
  const [dataFim, setDataFim] = useState<Date>(hoje);

  const periodoSujo =
    dataInicioPend.getTime() !== dataInicio.getTime() ||
    dataFimPend.getTime() !== dataFim.getTime();

  function aplicarPeriodo() {
    if (dataFimPend < dataInicioPend) {
      // troca se invertido
      setDataInicio(dataFimPend);
      setDataFim(dataInicioPend);
      setDataInicioPend(dataFimPend);
      setDataFimPend(dataInicioPend);
      return;
    }
    setDataInicio(dataInicioPend);
    setDataFim(dataFimPend);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);

      const inicioIso = inicioDiaSaoPauloIso(dataInicio);
      const fimIso = fimDiaSaoPauloIso(dataFim);

      // Base inicial: primeiras respostas que caíram no período selecionado.
      const ev = await supabase.from("respostas_eventos")
        .select("ordem_servico_id, usuario_id, setor_id, pergunta_id, respondido_em")
        .eq("is_primeira_resposta", true)
        .gte("respondido_em", inicioIso)
        .lte("respondido_em", fimIso)
        .order("respondido_em", { ascending: true })
        .limit(50000);

      const evDataPeriodo: EventoResposta[] = ((ev.data || []) as EventoResposta[])
        .filter(e => Boolean(e.ordem_servico_id && e.respondido_em));
      const osIdsPeriodo = Array.from(new Set(evDataPeriodo.map(e => e.ordem_servico_id)));
      let evData: EventoResposta[] = [];

      if (osIdsPeriodo.length > 0) {
        const { data: evGlobal } = await supabase.from("respostas_eventos")
          .select("ordem_servico_id, usuario_id, setor_id, pergunta_id, respondido_em")
          .eq("is_primeira_resposta", true)
          .in("ordem_servico_id", osIdsPeriodo)
          .limit(100000);

        const porOsGlobal = new Map<string, string[]>();
        for (const e of ((evGlobal || []) as EventoResposta[])) {
          if (!e.ordem_servico_id || !e.respondido_em) continue;
          if (!porOsGlobal.has(e.ordem_servico_id)) porOsGlobal.set(e.ordem_servico_id, []);
          porOsGlobal.get(e.ordem_servico_id)!.push(e.respondido_em);
        }

        // Regra D global da OS: só entra se a primeira e a última resposta da OS inteira caíram no filtro.
        const osValidas = new Set<string>();
        const inicioMs = new Date(inicioIso).getTime();
        const fimMs = new Date(fimIso).getTime();
        for (const [osId, tempos] of porOsGlobal.entries()) {
          const ordenados = tempos.slice().sort();
          const primeiraMs = new Date(ordenados[0]).getTime();
          const ultimaMs = new Date(ordenados[ordenados.length - 1]).getTime();
          if (primeiraMs >= inicioMs && ultimaMs <= fimMs) osValidas.add(osId);
        }

        evData = evDataPeriodo.filter(e => osValidas.has(e.ordem_servico_id));
      }

      const seqData: EventoSequenciaPeriodo[] = [];
      const ultimoPorOsSetor = new Map<string, EventoResposta>();
      for (const e of evData.slice().sort((a, b) => a.respondido_em.localeCompare(b.respondido_em))) {
        const k = `${e.ordem_servico_id}::${e.setor_id ?? "sem_setor"}`;
        const anterior = ultimoPorOsSetor.get(k);
        const seg = anterior ? (new Date(e.respondido_em).getTime() - new Date(anterior.respondido_em).getTime()) / 1000 : null;
        seqData.push({
          ...e,
          tempo_entre_respostas_seg: seg != null && seg >= 0 ? seg : null,
          tempo_entre_respostas: seg != null && seg >= 0 ? secondsToInterval(seg) : null,
        });
        ultimoPorOsSetor.set(k, e);
      }

      const setorOsMap = new Map<string, { setor_id: string | null; ordem_servico_id: string; tempos: string[]; gaps: number[] }>();
      for (const e of seqData) {
        const k = `${e.setor_id ?? "sem_setor"}::${e.ordem_servico_id}`;
        if (!setorOsMap.has(k)) setorOsMap.set(k, { setor_id: e.setor_id, ordem_servico_id: e.ordem_servico_id, tempos: [], gaps: [] });
        const cur = setorOsMap.get(k)!;
        cur.tempos.push(e.respondido_em);
        if (e.tempo_entre_respostas_seg != null && e.tempo_entre_respostas_seg > 0) cur.gaps.push(e.tempo_entre_respostas_seg);
      }
      const sData: MetricaSetor[] = Array.from(setorOsMap.values()).map(v => {
        const ordenados = v.tempos.slice().sort();
        const inicio = ordenados[0] ?? null;
        const fim = ordenados[ordenados.length - 1] ?? null;
        const total = inicio && fim ? (new Date(fim).getTime() - new Date(inicio).getTime()) / 1000 : 0;
        const medio = v.gaps.length ? v.gaps.reduce((a, b) => a + b, 0) / v.gaps.length : 0;
        return { setor_id: v.setor_id, ordem_servico_id: v.ordem_servico_id, inicio, fim, tempo_total: secondsToInterval(total), tempo_medio: medio > 0 ? secondsToInterval(medio) : null };
      });
      const pData: PausaItem[] = seqData
        .filter(e => e.pergunta_id && e.tempo_entre_respostas_seg != null && e.tempo_entre_respostas_seg > 300)
        .sort((a, b) => b.respondido_em.localeCompare(a.respondido_em))
        .slice(0, 500)
        .map(e => ({
          ordem_servico_id: e.ordem_servico_id,
          setor_id: e.setor_id,
          usuario_id: e.usuario_id,
          pergunta_id: e.pergunta_id!,
          respondido_em: e.respondido_em,
          tempo_entre_respostas: e.tempo_entre_respostas,
        }));

      // === Hidratar nomes (profiles, setores, perguntas, OS) ===
      const userIds = Array.from(new Set([
        ...evData.map(x => x.usuario_id),
        ...pData.map(x => x.usuario_id),
      ].filter(Boolean))) as string[];
      const setorIds = Array.from(new Set([
        ...sData.map(x => x.setor_id),
        ...pData.map(x => x.setor_id),
      ].filter(Boolean))) as string[];
      const perguntaIds = Array.from(new Set([
        ...seqData.map(x => x.pergunta_id),
        ...pData.map(x => x.pergunta_id),
      ].filter(Boolean))) as string[];
      const osIds = Array.from(new Set([
        ...evData.map(x => x.ordem_servico_id),
        ...pData.map(x => x.ordem_servico_id),
      ].filter(Boolean))) as string[];

      const [profsRes, secsRes, perguntasRes, osRes] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("id, nome").in("id", userIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
        setorIds.length ? supabase.from("setores").select("id, nome").in("id", setorIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
        perguntaIds.length ? supabase.from("perguntas_avaliacao").select("id, pergunta").in("id", perguntaIds) : Promise.resolve({ data: [] as { id: string; pergunta: string }[] }),
        osIds.length ? supabase.from("ordens_servico").select("id, numero_os").in("id", osIds) : Promise.resolve({ data: [] as { id: string; numero_os: string | number | null }[] }),
      ]);
      const pMap = Object.fromEntries(((profsRes as { data: { id: string; nome: string }[] | null }).data || []).map(x => [x.id, x.nome]));
      const secMap = Object.fromEntries(((secsRes as { data: { id: string; nome: string }[] | null }).data || []).map(x => [x.id, x.nome]));
      const perguntaMap = Object.fromEntries(((perguntasRes as { data: { id: string; pergunta: string }[] | null }).data || []).map(x => [x.id, x.pergunta]));
      const osMap = Object.fromEntries(((osRes as { data: { id: string; numero_os: string | number | null }[] | null }).data || []).map(x => [x.id, x.numero_os]));

      // === Derivar GARGALOS somente a partir das OS válidas no período ===
      const aggMap = new Map<string, { soma: number; n: number; max: number; ocorrencias: number }>();
      for (const e of seqData) {
        if (!e.pergunta_id) continue;
        const seg = e.tempo_entre_respostas_seg ?? 0;
        if (!aggMap.has(e.pergunta_id)) aggMap.set(e.pergunta_id, { soma: 0, n: 0, max: 0, ocorrencias: 0 });
        const cur = aggMap.get(e.pergunta_id)!;
        cur.ocorrencias += 1;
        if (seg > 0) {
          cur.soma += seg;
          cur.n += 1;
          if (seg > cur.max) cur.max = seg;
        }
      }
      const gargalosCalc: GargaloAgg[] = Array.from(aggMap.entries()).map(([pergunta_id, v]) => ({
        pergunta_id,
        pergunta_texto: perguntaMap[pergunta_id] ?? "Pergunta não encontrada",
        tempo_medio_seg: v.n > 0 ? v.soma / v.n : 0,
        maior_tempo_seg: v.max,
        ocorrencias: v.ocorrencias,
      })).sort((a, b) => b.tempo_medio_seg - a.tempo_medio_seg);

      // === Enriquecer pausas com numero_os e pergunta_texto ===
      const pausasEnriquecidas: PausaItem[] = pData.map(x => ({
        ...x,
        numero_os: osMap[x.ordem_servico_id] ?? null,
        pergunta_texto: perguntaMap[x.pergunta_id] ?? null,
      }));

      setProfMap(pMap);
      setOsNumeroMap(osMap);
      setSetores(sData.map(x => ({ ...x, setor_nome: x.setor_id ? secMap[x.setor_id] ?? "Sem setor" : "Sem setor" })));
      setGargalos(gargalosCalc);
      setPausas(pausasEnriquecidas);
      setEventos(evData);

      setLoading(false);
    })();
  }, [dataInicio, dataFim]);

  const periodoInicioMs = useMemo(
    () => new Date(inicioDiaSaoPauloIso(dataInicio)).getTime(),
    [dataInicio]
  );
  const periodoFimMs = useMemo(
    () => new Date(fimDiaSaoPauloIso(dataFim)).getTime(),
    [dataFim]
  );

  const avaliadores = useMemo(
    () => calcularMetricasPorAvaliador(eventos, profMap, osNumeroMap, periodoInicioMs, periodoFimMs),
    [eventos, profMap, osNumeroMap, periodoInicioMs, periodoFimMs]
  );

  // OS avaliadas: aplicar a MESMA regra D — primeira E última resposta dentro do período
  const osAvaliadas = useMemo(() => {
    const ids = new Set<string>();
    for (const a of avaliadores) for (const o of a.oss) ids.add(o.os_id);
    return ids.size;
  }, [avaliadores]);

  const setoresAgregados = useMemo(() => {
    const map = new Map<string, { nome: string; tempo_total: number; tempos_medios: number[]; total_os: number }>();
    setores.forEach(s => {
      const k = s.setor_id ?? "sem_setor";
      if (!map.has(k)) map.set(k, { nome: s.setor_nome ?? "Sem setor", tempo_total: 0, tempos_medios: [], total_os: 0 });
      const cur = map.get(k)!;
      cur.tempo_total += intervalToSeconds(s.tempo_total);
      const med = intervalToSeconds(s.tempo_medio);
      if (med > 0) cur.tempos_medios.push(med);
      cur.total_os += 1;
    });
    return Array.from(map.entries())
      .map(([id, v]) => ({
        setor_id: id,
        nome: v.nome,
        total_os: v.total_os,
        tempo_total: v.tempo_total,
        tempo_medio: v.tempos_medios.length ? v.tempos_medios.reduce((a, b) => a + b, 0) / v.tempos_medios.length : 0,
      }))
      .sort((a, b) => b.total_os - a.total_os);
  }, [setores]);

  const toggleExpandir = (id: string) => {
    setExpandido(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const labelPeriodo = `${format(dataInicio, "dd/MM/yyyy")} → ${format(dataFim, "dd/MM/yyyy")}`;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6" /> Análise Operacional
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Métricas de tempo de avaliações e desempenho operacional consolidados.
        </p>
      </div>

      <Tabs defaultValue="tempo" className="space-y-6">
        <TabsList>
          <TabsTrigger value="tempo">Tempo</TabsTrigger>
          <TabsTrigger value="operacional">Operacional</TabsTrigger>
        </TabsList>

        <TabsContent value="tempo" className="space-y-6">

          {/* Seletor de período + botão Buscar */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Período:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dataInicioPend, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dataInicioPend}
                  onSelect={(d) => d && setDataInicioPend(d)}
                  locale={ptBR}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dataFimPend, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dataFimPend}
                  onSelect={(d) => d && setDataFimPend(d)}
                  locale={ptBR}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            <Button
              onClick={aplicarPeriodo}
              disabled={loading || !periodoSujo}
              className="ml-1"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Buscar
            </Button>

            {periodoSujo && (
              <Badge variant="outline" className="text-amber-600 border-amber-500/50">
                Período alterado — clique em Buscar
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">Aplicado: {labelPeriodo}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center min-h-[300px]">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Avaliadores</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{avaliadores.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" /> Setores</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{setoresAgregados.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="w-4 h-4" /> Gargalos</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{gargalos.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Pausas {'>'} 5min</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-bold">{pausas.length}</div></CardContent>
            </Card>
          </div>

          {/* Por Avaliador */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">👤 Por Avaliador</CardTitle>
              <p className="text-xs text-muted-foreground">Clique numa linha para ver as faixas horárias do avaliador no período.</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Avaliador</TableHead>
                    <TableHead className="text-right">OS</TableHead>
                    <TableHead>Primeira ação</TableHead>
                    <TableHead>Última ação</TableHead>
                    <TableHead className="text-right">Tempo médio por OS</TableHead>
                    <TableHead className="text-right">Tempo médio entre OSs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {avaliadores.map(a => {
                    const aberto = expandido.has(a.usuario_id);
                    return (
                      <>
                        <TableRow key={a.usuario_id} className="cursor-pointer hover:bg-muted/40" onClick={() => toggleExpandir(a.usuario_id)}>
                          <TableCell className="w-8">
                            {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </TableCell>
                          <TableCell className="font-medium">{a.nome}</TableCell>
                          <TableCell className="text-right">{a.total_os}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {a.dias.length > 1 ? (
                              <span className="italic">{a.dias.length} dias — ver detalhes</span>
                            ) : a.primeira_acao ? fmtDataHora(a.primeira_acao) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {a.dias.length > 1 ? (
                              <span className="italic">{a.dias.length} dias — ver detalhes</span>
                            ) : a.ultima_acao ? fmtDataHora(a.ultima_acao) : "—"}
                          </TableCell>
                          <TableCell className="text-right">{formatDuration(a.tempo_medio_dentro_os_seg)}</TableCell>
                          <TableCell className="text-right">{formatDuration(a.tempo_medio_entre_os_seg)}</TableCell>
                        </TableRow>
                        {aberto && (
                          <TableRow key={`${a.usuario_id}-detail`} className="bg-muted/20">
                            <TableCell></TableCell>
                            <TableCell colSpan={6} className="py-3">
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Indicadores por dia ({a.dias.length})</p>
                                  {a.dias.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Sem dados.</p>
                                  ) : (
                                    <div className="rounded-md border bg-background overflow-x-auto">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="text-xs">Dia</TableHead>
                                            <TableHead className="text-xs">Primeira ação</TableHead>
                                            <TableHead className="text-xs">Última ação</TableHead>
                                            <TableHead className="text-xs text-right">OS</TableHead>
                                            <TableHead className="text-xs text-right">Médio por OS</TableHead>
                                            <TableHead className="text-xs text-right">Médio entre OSs</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {a.dias.map(d => (
                                            <TableRow key={d.dia}>
                                              <TableCell className="text-xs font-medium">{fmtData(d.primeira_acao)}</TableCell>
                                              <TableCell className="text-xs">{fmtHora(d.primeira_acao)}</TableCell>
                                              <TableCell className="text-xs">{fmtHora(d.ultima_acao)}</TableCell>
                                              <TableCell className="text-xs text-right">{d.total_os}</TableCell>
                                              <TableCell className="text-xs text-right">{formatDuration(d.tempo_medio_dentro_os_seg)}</TableCell>
                                              <TableCell className="text-xs text-right">{formatDuration(d.tempo_medio_entre_os_seg)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Faixas horárias</p>
                                  {a.faixas.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">Sem dados.</p>
                                  ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                      {a.faixas.map(f => (
                                        <div key={f.faixa} className="rounded-md border bg-background px-3 py-2">
                                          <div className="text-xs font-semibold">{f.faixa}</div>
                                          <div className="text-xs text-muted-foreground">{f.qtd_os} OS · {formatDuration(f.tempo_total_seg)}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">OSs ({a.oss.length})</p>
                                  <div className="max-h-60 overflow-y-auto rounded-md border bg-background">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>OS</TableHead>
                                          <TableHead>Data Início</TableHead>
                                          <TableHead>Início</TableHead>
                                          <TableHead>Fim</TableHead>
                                          <TableHead>Data Fim</TableHead>
                                          <TableHead className="text-right">Duração</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {a.oss.map(o => {
                                          const cruzaDia = !mesmaDataBR(o.inicio, o.fim);
                                          return (
                                            <TableRow key={o.os_id} className={cruzaDia ? "bg-amber-500/10" : undefined}>
                                              <TableCell className="text-xs">
                                                {o.numero_os ? (
                                                  <a
                                                    href={`/avaliacoes/pesquisa?os=${encodeURIComponent(String(o.numero_os))}`}
                                                    className="text-primary hover:underline font-medium"
                                                  >
                                                    #{o.numero_os}
                                                  </a>
                                                ) : (
                                                  <span className="font-mono text-muted-foreground">{o.os_id.slice(0, 8)}</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-xs">{fmtData(o.inicio)}</TableCell>
                                              <TableCell className="text-xs">{fmtHora(o.inicio)}</TableCell>
                                              <TableCell className="text-xs">{fmtHora(o.fim)}</TableCell>
                                              <TableCell className={`text-xs ${cruzaDia ? "font-semibold text-amber-700 dark:text-amber-400" : ""}`}>
                                                {fmtData(o.fim)}
                                                {cruzaDia && <span className="ml-1" title="Avaliação cruzou de um dia para outro">⚠️</span>}
                                              </TableCell>
                                              <TableCell className="text-right text-xs">{formatDuration(o.duracao_seg)}</TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                  {avaliadores.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sem dados no período.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Por Setor + OS avaliadas no período */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="flex items-center gap-2">🏢 Por Setor</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {setoresAgregados.map(s => (
                    <Card key={s.setor_id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                          {s.nome}
                          <Badge variant="secondary">{s.total_os} OS</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Tempo total</span><span>{formatDuration(s.tempo_total)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Tempo médio entre cliques</span><span>{formatDuration(s.tempo_medio)}</span></div>
                      </CardContent>
                    </Card>
                  ))}
                  {setoresAgregados.length === 0 && (
                    <p className="text-sm text-muted-foreground">Sem dados no período.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarCheck className="w-4 h-4" /> OS avaliadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{osAvaliadas}</div>
                <p className="text-xs text-muted-foreground mt-1">{labelPeriodo}</p>
              </CardContent>
            </Card>
          </div>

          {/* Gargalos */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2">🔄 Gargalos (perguntas mais lentas)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pergunta</TableHead>
                    <TableHead className="text-right">Tempo médio</TableHead>
                    <TableHead className="text-right">Maior tempo</TableHead>
                    <TableHead className="text-right">Ocorrências</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gargalos.slice(0, 20).map(g => (
                    <TableRow key={g.pergunta_id}>
                      <TableCell className="max-w-md truncate" title={g.pergunta_texto}>{g.pergunta_texto}</TableCell>
                      <TableCell className="text-right">{formatDuration(g.tempo_medio_seg)}</TableCell>
                      <TableCell className="text-right">{formatDuration(g.maior_tempo_seg)}</TableCell>
                      <TableCell className="text-right">{g.ocorrencias}</TableCell>
                    </TableRow>
                  ))}
                  {gargalos.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem dados no período.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Maior tempo entre perguntas */}
          {(() => {
            const maxGargalo = gargalos.reduce<{ texto: string; segundos: number } | null>((acc, g) => {
              if (!acc || g.maior_tempo_seg > acc.segundos) return { texto: g.pergunta_texto, segundos: g.maior_tempo_seg };
              return acc;
            }, null);
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" /> Maior tempo entre perguntas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {maxGargalo && maxGargalo.segundos > 0 ? (
                    <div className="space-y-1">
                      <div className="text-2xl font-bold">{formatDuration(maxGargalo.segundos)}</div>
                      <p className="text-sm text-muted-foreground">{maxGargalo.texto}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem dados no período.</p>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Pausas grandes — agora com número real da OS (link) e texto da pergunta */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Pausas grandes ({'>'}5 min)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>OS</TableHead>
                    <TableHead>Pergunta</TableHead>
                    <TableHead className="text-right">Pausa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pausas.slice(0, 50).map((p, i) => (
                    <TableRow key={`${p.ordem_servico_id}-${p.pergunta_id}-${i}`}>
                      <TableCell className="text-xs">{fmtDataHora(p.respondido_em)}</TableCell>
                      <TableCell className="text-xs">
                        {p.numero_os ? (
                          <a
                            href={`/avaliacoes/pesquisa?os=${encodeURIComponent(String(p.numero_os))}`}
                            className="text-primary hover:underline font-medium"
                          >
                            #{p.numero_os}
                          </a>
                        ) : (
                          <span className="font-mono text-muted-foreground">{p.ordem_servico_id.slice(0, 8)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-md truncate" title={p.pergunta_texto ?? p.pergunta_id}>
                        {p.pergunta_texto ?? <span className="font-mono text-muted-foreground">{p.pergunta_id.slice(0, 8)}</span>}
                      </TableCell>
                      <TableCell className="text-right">{formatDuration(intervalToSeconds(p.tempo_entre_respostas))}</TableCell>
                    </TableRow>
                  ))}
                  {pausas.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhuma pausa grande detectada no período.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </>
          )}
        </TabsContent>

        <TabsContent value="operacional">
          <DesempenhoOperacionalPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
