import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Users, Activity } from "lucide-react";

interface EventoRow {
  id: string;
  ordem_servico_id: string;
  pergunta_id: string;
  usuario_id: string | null;
  setor_id: string | null;
  resposta: string | null;
  respondido_em: string;
  is_primeira_resposta: boolean;
}

interface UsuarioMetric {
  usuario_id: string;
  nome: string;
  total_respostas: number;
  tempo_medio_segundos: number; // entre cliques na mesma OS+setor
}

interface SetorMetric {
  setor_id: string;
  nome: string;
  total_perguntas: number;
  tempo_total_segundos: number;
  tempo_medio_segundos: number;
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
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [setoresMap, setSetoresMap] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Métricas consideram apenas a PRIMEIRA resposta de cada par (OS, pergunta)
      const { data, error } = await (supabase as any)
        .from("respostas_eventos")
        .select("*")
        .eq("is_primeira_resposta", true)
        .order("respondido_em", { ascending: true })
        .limit(5000);

      if (!error && data) {
        setEventos(data as EventoRow[]);
        const userIds = Array.from(new Set(data.map((d: EventoRow) => d.usuario_id).filter(Boolean))) as string[];
        const setorIds = Array.from(new Set(data.map((d: EventoRow) => d.setor_id).filter(Boolean))) as string[];

        if (userIds.length) {
          const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", userIds);
          setProfilesMap(Object.fromEntries((profs || []).map((p: any) => [p.id, p.nome])));
        }
        if (setorIds.length) {
          const { data: secs } = await supabase.from("setores").select("id, nome").in("id", setorIds);
          setSetoresMap(Object.fromEntries((secs || []).map((s: any) => [s.id, s.nome])));
        }
      }
      setLoading(false);
    })();
  }, []);

  // Agrupar por usuário e calcular tempo médio entre cliques (mesma OS+setor)
  const usuariosMetrics: UsuarioMetric[] = (() => {
    const map = new Map<string, { total: number; deltas: number[] }>();
    const grupos = new Map<string, EventoRow[]>();

    eventos.forEach(e => {
      const k = `${e.ordem_servico_id}|${e.setor_id ?? "null"}|${e.usuario_id ?? "null"}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(e);
    });

    grupos.forEach(arr => {
      const sorted = [...arr].sort((a, b) => +new Date(a.respondido_em) - +new Date(b.respondido_em));
      for (let i = 0; i < sorted.length; i++) {
        const ev = sorted[i];
        const uid = ev.usuario_id ?? "desconhecido";
        if (!map.has(uid)) map.set(uid, { total: 0, deltas: [] });
        const cur = map.get(uid)!;
        cur.total += 1;
        if (i > 0) {
          const delta = (+new Date(ev.respondido_em) - +new Date(sorted[i - 1].respondido_em)) / 1000;
          if (delta > 0 && delta < 3600) cur.deltas.push(delta);
        }
      }
    });

    return Array.from(map.entries()).map(([uid, v]) => ({
      usuario_id: uid,
      nome: profilesMap[uid] ?? "—",
      total_respostas: v.total,
      tempo_medio_segundos: v.deltas.length ? v.deltas.reduce((a, b) => a + b, 0) / v.deltas.length : 0,
    })).sort((a, b) => b.total_respostas - a.total_respostas);
  })();

  // Agrupar por setor
  const setoresMetrics: SetorMetric[] = (() => {
    const map = new Map<string, { total: number; tempos: number[] }>();
    const grupos = new Map<string, EventoRow[]>();

    eventos.forEach(e => {
      const k = `${e.ordem_servico_id}|${e.setor_id ?? "null"}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(e);
    });

    grupos.forEach(arr => {
      if (arr.length < 1) return;
      const sorted = [...arr].sort((a, b) => +new Date(a.respondido_em) - +new Date(b.respondido_em));
      const sid = sorted[0].setor_id ?? "sem_setor";
      const tempo = (+new Date(sorted[sorted.length - 1].respondido_em) - +new Date(sorted[0].respondido_em)) / 1000;
      if (!map.has(sid)) map.set(sid, { total: 0, tempos: [] });
      const cur = map.get(sid)!;
      cur.total += sorted.length;
      if (sorted.length > 1) cur.tempos.push(tempo);
    });

    return Array.from(map.entries()).map(([sid, v]) => ({
      setor_id: sid,
      nome: setoresMap[sid] ?? "Sem setor",
      total_perguntas: v.total,
      tempo_total_segundos: v.tempos.reduce((a, b) => a + b, 0),
      tempo_medio_segundos: v.tempos.length ? v.tempos.reduce((a, b) => a + b, 0) / v.tempos.length : 0,
    })).sort((a, b) => b.total_perguntas - a.total_perguntas);
  })();

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
          <Clock className="w-6 h-6" /> Tempo de Avaliações
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Métricas baseadas em eventos de clique (apenas primeira resposta por pergunta).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" /> Eventos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{eventos.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Avaliadores</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{usuariosMetrics.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="w-4 h-4" /> Setores</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{setoresMetrics.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Por Avaliador</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Avaliador</TableHead>
                <TableHead className="text-right">Total respostas</TableHead>
                <TableHead className="text-right">Tempo médio entre cliques</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuariosMetrics.map(u => (
                <TableRow key={u.usuario_id}>
                  <TableCell>{u.nome}</TableCell>
                  <TableCell className="text-right">{u.total_respostas}</TableCell>
                  <TableCell className="text-right">{formatDuration(u.tempo_medio_segundos)}</TableCell>
                </TableRow>
              ))}
              {usuariosMetrics.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sem dados ainda.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Por Setor</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {setoresMetrics.map(s => (
              <Card key={s.setor_id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    {s.nome}
                    <Badge variant="secondary">{s.total_perguntas}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Tempo total</span><span>{formatDuration(s.tempo_total_segundos)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tempo médio/OS</span><span>{formatDuration(s.tempo_medio_segundos)}</span></div>
                </CardContent>
              </Card>
            ))}
            {setoresMetrics.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
