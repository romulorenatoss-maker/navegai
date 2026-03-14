import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ClipboardCheck, Clock, CheckCircle2, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface OSStats {
  abertas: number;
  em_andamento: number;
  concluidas: number;
  total: number;
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<OSStats>({ abertas: 0, em_andamento: 0, concluidas: 0, total: 0 });
  const [recentOS, setRecentOS] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await supabase.from("ordens_servico").select("id, numero_os, status, created_at, cliente_nome").order("created_at", { ascending: false }).limit(50);
      if (!data) return;

      setStats({
        abertas: data.filter((o) => o.status === "aberta").length,
        em_andamento: data.filter((o) => o.status === "em_andamento").length,
        concluidas: data.filter((o) => o.status === "concluida").length,
        total: data.length,
      });
      setRecentOS(data.slice(0, 10));
    };
    fetchStats();
  }, []);

  const cards = [
    { label: "Total de OS", value: stats.total, icon: ClipboardCheck, color: "text-primary" },
    { label: "Abertas", value: stats.abertas, icon: FolderOpen, color: "text-warning" },
    { label: "Em Andamento", value: stats.em_andamento, icon: Clock, color: "text-primary" },
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
                <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-body font-medium text-foreground font-tabular">{item.numero_os}</td>
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
    </div>
  );
}
