import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Clock, Users, Activity, AlertTriangle, TrendingDown, CalendarCheck } from "lucide-react";
import DesempenhoOperacionalPage from "@/pages/DesempenhoOperacionalPage";


interface MetricaUsuario {
  usuario_id: string | null;
  total_respostas: number;
  tempo_medio_resposta: string | null; // interval as string
  primeira_acao: string | null;
  ultima_acao: string | null;
  nome?: string;
}

interface MetricaSetor {
  setor_id: string | null;
  ordem_servico_id: string;
  inicio: string | null;
  fim: string | null;
  tempo_total: string | null;
  tempo_medio: string | null;
  setor_nome?: string;
}

interface MetricaGargalo {
  pergunta_id: string;
  pergunta?: string | null;
  tempo_medio: string | null;
  maior_tempo: string | null;
  ocorrencias: number;
  pergunta_texto?: string;
}

interface MetricaPausa {
  ordem_servico_id: string;
  setor_id: string | null;
  usuario_id: string | null;
  pergunta_id: string;
  respondido_em: string;
  tempo_entre_respostas: string | null;
}

// Converte interval Postgres ("HH:MM:SS" ou "1 day 02:03:04") em segundos
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

export default function DashboardTempoAvaliacoes() {
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<MetricaUsuario[]>([]);
  const [setores, setSetores] = useState<MetricaSetor[]>([]);
  const [gargalos, setGargalos] = useState<MetricaGargalo[]>([]);
  const [pausas, setPausas] = useState<MetricaPausa[]>([]);
  // Filtro de mês (YYYY-MM em America/Sao_Paulo). Default: mês corrente.
  const [mesSelecionado, setMesSelecionado] = useState<string>(() => {
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" });
    return fmt.format(new Date()); // ex: "2026-04"
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const sb = supabase as any;

      const [u, s, g, p] = await Promise.all([
        sb.from("vw_metricas_usuario").select("*").limit(500),
        sb.from("vw_metricas_setor").select("*").limit(1000),
        sb.from("vw_metricas_gargalos").select("*").limit(50),
        sb.from("vw_metricas_pausas").select("*").order("respondido_em", { ascending: false }).limit(100),
      ]);

      const uData: MetricaUsuario[] = u.data || [];
      const sData: MetricaSetor[] = s.data || [];
      const gData: MetricaGargalo[] = g.data || [];
      const pData: MetricaPausa[] = p.data || [];

      // Hidratar nomes
      const userIds = Array.from(new Set([
        ...uData.map(x => x.usuario_id),
        ...pData.map(x => x.usuario_id),
      ].filter(Boolean))) as string[];
      const setorIds = Array.from(new Set([
        ...sData.map(x => x.setor_id),
        ...pData.map(x => x.setor_id),
      ].filter(Boolean))) as string[];
      const perguntaIds = Array.from(new Set([
        ...gData.map(x => x.pergunta_id),
      ].filter(Boolean))) as string[];

      const [profsRes, secsRes, perguntasRes] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("id, nome").in("id", userIds) : Promise.resolve({ data: [] }),
        setorIds.length ? supabase.from("setores").select("id, nome").in("id", setorIds) : Promise.resolve({ data: [] }),
        perguntaIds.length ? supabase.from("perguntas_avaliacao").select("id, pergunta").in("id", perguntaIds) : Promise.resolve({ data: [] }),
      ]);

      const profMap = Object.fromEntries(((profsRes as any).data || []).map((x: any) => [x.id, x.nome]));
      const secMap = Object.fromEntries(((secsRes as any).data || []).map((x: any) => [x.id, x.nome]));
      const perguntaMap = Object.fromEntries(((perguntasRes as any).data || []).map((x: any) => [x.id, x.pergunta]));

      setUsuarios(uData
        .map(x => ({ ...x, nome: x.usuario_id ? profMap[x.usuario_id] ?? "—" : "—" }))
        .sort((a, b) => b.total_respostas - a.total_respostas));
      setSetores(sData.map(x => ({ ...x, setor_nome: x.setor_id ? secMap[x.setor_id] ?? "Sem setor" : "Sem setor" })));
      setGargalos(gData.map(x => ({ ...x, pergunta_texto: x.pergunta ?? perguntaMap[x.pergunta_id] ?? x.pergunta_id })));
      setPausas(pData);

      setLoading(false);
    })();
  }, []);

  // Helpers para extrair YYYY-MM e YYYY-MM-DD em America/Sao_Paulo
  const fmtMes = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }),
    []
  );
  const fmtDia = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }),
    []
  );
  const isoToMes = (iso?: string | null) => (iso ? fmtMes.format(new Date(iso)) : null);
  const isoToDia = (iso?: string | null) => (iso ? fmtDia.format(new Date(iso)) : null);
  const hojeBR = useMemo(() => fmtDia.format(new Date()), [fmtDia]);

  // Lista de meses disponíveis (com base nos dados carregados) + mês atual sempre presente
  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    setores.forEach(s => { const m = isoToMes(s.fim ?? s.inicio); if (m) set.add(m); });
    pausas.forEach(p => { const m = isoToMes(p.respondido_em); if (m) set.add(m); });
    usuarios.forEach(u => { const m = isoToMes(u.ultima_acao); if (m) set.add(m); });
    set.add(fmtMes.format(new Date()));
    return Array.from(set).sort().reverse();
  }, [setores, pausas, usuarios, fmtMes]);

  // Filtragem por mês selecionado
  const setoresFiltrados = useMemo(
    () => setores.filter(s => isoToMes(s.fim ?? s.inicio) === mesSelecionado),
    [setores, mesSelecionado]
  );
  const usuariosFiltrados = useMemo(
    () => usuarios.filter(u => !u.ultima_acao || isoToMes(u.ultima_acao) === mesSelecionado),
    [usuarios, mesSelecionado]
  );
  const pausasFiltradas = useMemo(
    () => pausas.filter(p => isoToMes(p.respondido_em) === mesSelecionado),
    [pausas, mesSelecionado]
  );

  // OS avaliadas hoje (distintas em vw_metricas_setor com fim hoje, BR)
  const osAvaliadasHoje = useMemo(() => {
    const ids = new Set<string>();
    setores.forEach(s => {
      const dia = isoToDia(s.fim ?? s.inicio);
      if (dia === hojeBR && s.ordem_servico_id) ids.add(s.ordem_servico_id);
    });
    return ids.size;
  }, [setores, hojeBR]);

  // Agregação por setor (já vem por OS+setor — agrupar por setor para cards)
  const setoresAgregados = useMemo(() => {
    const map = new Map<string, { nome: string; tempo_total: number; tempos_medios: number[]; total_os: number }>();
    setoresFiltrados.forEach(s => {
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
  }, [setoresFiltrados]);

  // Label amigável de mês (ex: "abril/2026")
  const labelMes = (m: string) => {
    const [y, mm] = m.split("-");
    const d = new Date(Number(y), Number(mm) - 1, 1);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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

      {/* Seletor de mês — afeta tudo abaixo */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Mês:</span>
        <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Selecione o mês" />
          </SelectTrigger>
          <SelectContent>
            {mesesDisponiveis.map(m => (
              <SelectItem key={m} value={m}>{labelMes(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Avaliadores</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{usuariosFiltrados.length}</div></CardContent>
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
          <CardContent><div className="text-2xl font-bold">{pausasFiltradas.length}</div></CardContent>
        </Card>
      </div>

      {/* Ranking por usuário */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2">👤 Por Avaliador</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Avaliador</TableHead>
                <TableHead className="text-right">Total respostas</TableHead>
                <TableHead className="text-right">Tempo médio entre cliques</TableHead>
                <TableHead>Última ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuariosFiltrados.map(u => (
                <TableRow key={u.usuario_id ?? "null"}>
                  <TableCell>{u.nome}</TableCell>
                  <TableCell className="text-right">{u.total_respostas}</TableCell>
                  <TableCell className="text-right">{formatDuration(intervalToSeconds(u.tempo_medio_resposta))}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.ultima_acao ? new Date(u.ultima_acao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {usuariosFiltrados.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem dados ainda.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Por Setor + OS avaliadas hoje (lado a lado) */}
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
                <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="w-4 h-4" /> OS avaliadas hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{osAvaliadasHoje}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" })}
            </p>
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
                  <TableCell className="max-w-md truncate">{g.pergunta_texto}</TableCell>
                  <TableCell className="text-right">{formatDuration(intervalToSeconds(g.tempo_medio))}</TableCell>
                  <TableCell className="text-right">{formatDuration(intervalToSeconds(g.maior_tempo))}</TableCell>
                  <TableCell className="text-right">{g.ocorrencias}</TableCell>
                </TableRow>
              ))}
              {gargalos.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Sem dados ainda.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Maior tempo entre perguntas */}
      {(() => {
        const maxGargalo = gargalos.reduce<{ texto: string; segundos: number } | null>((acc, g) => {
          const seg = intervalToSeconds(g.maior_tempo);
          if (!acc || seg > acc.segundos) return { texto: g.pergunta_texto ?? g.pergunta_id, segundos: seg };
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
                <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Alertas de pausas */}
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
              {pausasFiltradas.slice(0, 50).map((p, i) => (
                <TableRow key={`${p.ordem_servico_id}-${p.pergunta_id}-${i}`}>
                  <TableCell className="text-xs">{new Date(p.respondido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</TableCell>
                  <TableCell className="font-mono text-xs">{p.ordem_servico_id.slice(0, 8)}</TableCell>
                  <TableCell className="font-mono text-xs">{p.pergunta_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-right">{formatDuration(intervalToSeconds(p.tempo_entre_respostas))}</TableCell>
                </TableRow>
              ))}
              {pausasFiltradas.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhuma pausa grande detectada.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="operacional">
          <DesempenhoOperacionalPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
