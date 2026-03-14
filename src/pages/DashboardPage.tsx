import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ClipboardCheck, Clock, CheckCircle2, FolderOpen, Trophy, Users, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OSStats {
  abertas: number;
  em_andamento: number;
  concluidas: number;
  total: number;
}

interface ClienteRanking {
  cliente_id: string;
  cliente_nome: string;
  os_count: number;
}

interface TecnicoMedia {
  profile_id: string;
  nome: string;
  media: number;
  total_avaliacoes: number;
}

interface SetorMedia {
  setor_id: string;
  setor_nome: string;
  media: number;
  total_avaliacoes: number;
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

function getScoreColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "bg-success/10";
  if (score >= 60) return "bg-warning/10";
  return "bg-destructive/10";
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<OSStats>({ abertas: 0, em_andamento: 0, concluidas: 0, total: 0 });
  const [recentOS, setRecentOS] = useState<any[]>([]);
  const [ranking, setRanking] = useState<ClienteRanking[]>([]);
  const [tecnicoMedias, setTecnicoMedias] = useState<TecnicoMedia[]>([]);
  const [setorMedias, setSetorMedias] = useState<SetorMedia[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await supabase.from("ordens_servico").select("id, numero_os, status, created_at, cliente_nome, cliente_id").order("created_at", { ascending: false }).limit(50);
      if (!data) return;

      setStats({
        abertas: data.filter((o) => o.status === "aberta").length,
        em_andamento: data.filter((o) => o.status === "em_andamento").length,
        concluidas: data.filter((o) => o.status === "concluida").length,
        total: data.length,
      });
      setRecentOS(data.slice(0, 10));
    };

    const fetchRanking = async () => {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      const { data } = await supabase
        .from("ordens_servico")
        .select("cliente_id, cliente_nome")
        .gte("created_at", sixtyDaysAgo.toISOString())
        .not("cliente_id", "is", null);

      if (!data) return;

      const countMap: Record<string, { nome: string; count: number }> = {};
      data.forEach((os: any) => {
        if (!os.cliente_id) return;
        if (!countMap[os.cliente_id]) {
          countMap[os.cliente_id] = { nome: os.cliente_nome || "Sem nome", count: 0 };
        }
        countMap[os.cliente_id].count++;
      });

      const sorted = Object.entries(countMap)
        .map(([id, v]) => ({ cliente_id: id, cliente_nome: v.nome, os_count: v.count }))
        .filter((c) => c.os_count > 2)
        .sort((a, b) => b.os_count - a.os_count)
        .slice(0, 10);

      setRanking(sorted);
    };

    const fetchScores = async () => {
      // Get concluded avaliacoes with OS info
      const { data: avaliacoes } = await supabase
        .from("avaliacoes")
        .select("nota_final, ordens_servico:ordem_servico_id(colaborador_avaliado_id, tipo_servico_id)")
        .eq("concluida", true)
        .not("nota_final", "is", null);

      if (!avaliacoes || avaliacoes.length === 0) return;

      // Group by colaborador_avaliado_id
      const tecMap: Record<string, { notas: number[] }> = {};
      const tipoServicoIds = new Set<string>();

      avaliacoes.forEach((a: any) => {
        const colabId = a.ordens_servico?.colaborador_avaliado_id;
        const tipoId = a.ordens_servico?.tipo_servico_id;
        if (!colabId || a.nota_final == null) return;
        if (!tecMap[colabId]) tecMap[colabId] = { notas: [] };
        tecMap[colabId].notas.push(a.nota_final);
        if (tipoId) tipoServicoIds.add(tipoId);
      });

      // Get profile names
      const colabIds = Object.keys(tecMap);
      if (colabIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nome, setor_id")
          .in("id", colabIds);

        // Also get setores from colaborador_setores junction table
        const { data: setorLinks } = await supabase
          .from("colaborador_setores")
          .select("profile_id, setor_id")
          .in("profile_id", colabIds);

        // Get setor names
        const allSetorIds = new Set<string>();
        profiles?.forEach((p) => { if (p.setor_id) allSetorIds.add(p.setor_id); });
        setorLinks?.forEach((l) => allSetorIds.add(l.setor_id));

        let setorNames: Record<string, string> = {};
        if (allSetorIds.size > 0) {
          const { data: setores } = await supabase
            .from("setores")
            .select("id, nome")
            .in("id", [...allSetorIds]);
          setores?.forEach((s) => { setorNames[s.id] = s.nome; });
        }

        // Build technician medias
        const tecMedias: TecnicoMedia[] = [];
        profiles?.forEach((p) => {
          const entry = tecMap[p.id];
          if (entry) {
            const avg = entry.notas.reduce((a, b) => a + b, 0) / entry.notas.length;
            tecMedias.push({
              profile_id: p.id,
              nome: p.nome,
              media: avg,
              total_avaliacoes: entry.notas.length,
            });
          }
        });
        tecMedias.sort((a, b) => b.media - a.media);
        setTecnicoMedias(tecMedias);

        // Build setor medias using junction table
        const setorScoreMap: Record<string, { nome: string; notas: number[] }> = {};
        
        // Map each profile to their setores
        const profileSetores: Record<string, string[]> = {};
        setorLinks?.forEach((l) => {
          if (!profileSetores[l.profile_id]) profileSetores[l.profile_id] = [];
          profileSetores[l.profile_id].push(l.setor_id);
        });
        // Fallback to legacy setor_id
        profiles?.forEach((p) => {
          if (!profileSetores[p.id] && p.setor_id) {
            profileSetores[p.id] = [p.setor_id];
          }
        });

        Object.entries(tecMap).forEach(([profileId, entry]) => {
          const setores = profileSetores[profileId] || [];
          setores.forEach((setorId) => {
            if (!setorScoreMap[setorId]) {
              setorScoreMap[setorId] = { nome: setorNames[setorId] || "Sem setor", notas: [] };
            }
            setorScoreMap[setorId].notas.push(...entry.notas);
          });
        });

        const sMedias: SetorMedia[] = Object.entries(setorScoreMap).map(([id, v]) => ({
          setor_id: id,
          setor_nome: v.nome,
          media: v.notas.reduce((a, b) => a + b, 0) / v.notas.length,
          total_avaliacoes: v.notas.length,
        }));
        sMedias.sort((a, b) => b.media - a.media);
        setSetorMedias(sMedias);
      }
    };

    fetchStats();
    fetchRanking();
    fetchScores();
  }, []);

  const cards = [
    { label: "Total de OS", value: stats.total, icon: ClipboardCheck, color: "text-primary" },
    { label: "Em Andamento", value: stats.em_andamento, icon: Clock, color: "text-warning" },
    { label: "Concluídas", value: stats.concluidas, icon: CheckCircle2, color: "text-success" },
  ];

  const statusBadge: Record<string, string> = {
    aberta: "badge-pending",
    em_andamento: "badge-active",
    concluida: "badge-complete",
  };

  const statusText: Record<string, string> = {
    aberta: "Aberta",
    em_andamento: "Em andamento",
    concluida: "Concluída",
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-section font-semibold text-foreground">Dashboard</h1>
        <p className="text-body text-muted-foreground">Visão geral das Ordens de Serviço</p>
      </div>

      <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((card) => (
          <motion.div key={card.label} variants={itemVariants} className="bg-card border border-border rounded-lg p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-caption text-muted-foreground font-medium uppercase tracking-wider">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <span className="text-section font-semibold text-foreground font-tabular">{card.value}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* Score averages row */}
      {(tecnicoMedias.length > 0 || setorMedias.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Per-technician averages */}
          {tecnicoMedias.length > 0 && (
            <motion.div variants={itemVariants} initial="hidden" animate="show" className="bg-card border border-border rounded-lg shadow-card">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <h2 className="text-body font-semibold text-foreground">Média por Colaborador</h2>
              </div>
              <div className="divide-y divide-border">
                {tecnicoMedias.map((t) => (
                  <div key={t.profile_id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-medium text-foreground truncate">{t.nome}</p>
                      <p className="text-caption text-muted-foreground">{t.total_avaliacoes} avaliação(ões)</p>
                    </div>
                    <div className={`px-3 py-1 rounded-lg ${getScoreBg(t.media)}`}>
                      <span className={`text-body font-bold font-tabular ${getScoreColor(t.media)}`}>
                        {t.media.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Per-sector averages */}
          {setorMedias.length > 0 && (
            <motion.div variants={itemVariants} initial="hidden" animate="show" className="bg-card border border-border rounded-lg shadow-card">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h2 className="text-body font-semibold text-foreground">Média por Setor</h2>
              </div>
              <div className="divide-y divide-border">
                {setorMedias.map((s) => (
                  <div key={s.setor_id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-medium text-foreground truncate">{s.setor_nome}</p>
                      <p className="text-caption text-muted-foreground">{s.total_avaliacoes} avaliação(ões)</p>
                    </div>
                    <div className={`px-3 py-1 rounded-lg ${getScoreBg(s.media)}`}>
                      <span className={`text-body font-bold font-tabular ${getScoreColor(s.media)}`}>
                        {s.media.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}

      <motion.div variants={itemVariants} initial="hidden" animate="show" className="bg-card border border-border rounded-lg shadow-card">
        <div className="p-4 border-b border-border">
          <h2 className="text-body font-semibold text-foreground">Ordens de Serviço Recentes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentOS.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/avaliacoes/pesquisa?os=${item.numero_os}`)}
                >
                  <td className="px-4 py-3 text-body font-medium text-primary underline underline-offset-2 font-tabular">{item.numero_os}</td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{item.cliente_nome || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${statusBadge[item.status]}`}>
                      {statusText[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-body text-muted-foreground font-tabular">
                    {new Date(item.created_at).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
              {recentOS.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-body text-muted-foreground">
                    Nenhuma OS encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Ranking de clientes */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" className="bg-card border border-border rounded-lg shadow-card mt-6">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Trophy className="w-4 h-4 text-warning" />
          <h2 className="text-body font-semibold text-foreground">Clientes com mais OS nos últimos 60 dias</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-12">#</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
                <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Qtd. OS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ranking.map((r, i) => (
                <tr
                  key={r.cliente_id}
                  className="hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/cadastros/clientes?id=${r.cliente_id}`)}
                >
                  <td className="px-4 py-3 text-body font-tabular text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 text-body font-medium text-primary underline underline-offset-2">{r.cliente_nome}</td>
                  <td className="px-4 py-3 text-body font-semibold font-tabular text-right">{r.os_count}</td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-body text-muted-foreground">
                    Nenhum dado nos últimos 60 dias.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}