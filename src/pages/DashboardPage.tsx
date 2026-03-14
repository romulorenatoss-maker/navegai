import { motion } from "framer-motion";
import {
  ClipboardCheck,
  ListChecks,
  AlertTriangle,
  TrendingUp,
  Clock,
  Users,
} from "lucide-react";

const stats = [
  { label: "OS Avaliadas", value: "284", change: "+12%", icon: ClipboardCheck, trend: "up" },
  { label: "Checklists Concluídos", value: "1.042", change: "+8%", icon: ListChecks, trend: "up" },
  { label: "Inconsistências", value: "23", change: "-5%", icon: AlertTriangle, trend: "down" },
  { label: "Tarefas Atrasadas", value: "7", change: "+2", icon: Clock, trend: "warning" },
];

const rankingAtendentes = [
  { name: "Carlos Silva", score: 96.4, total: 42 },
  { name: "Ana Rodrigues", score: 94.1, total: 38 },
  { name: "Pedro Costa", score: 91.8, total: 35 },
  { name: "Maria Souza", score: 89.2, total: 40 },
  { name: "João Lima", score: 87.5, total: 33 },
];

const recentTasks = [
  { id: "CHK-042", name: "Limpeza Galpão A", assignee: "Roberto Dias", status: "concluído", time: "32min" },
  { id: "CHK-041", name: "Inspeção Veículos", assignee: "Fernanda Alves", status: "em execução", time: "15min" },
  { id: "CHK-040", name: "Checklist Ferramentas", assignee: "Lucas Mendes", status: "atrasado", time: "1h 22min" },
  { id: "CHK-039", name: "Verificação EPI", assignee: "Mariana Torres", status: "pendente", time: "—" },
  { id: "CHK-038", name: "Limpeza Escritório", assignee: "Thiago Ramos", status: "concluído", time: "28min" },
];

const statusBadge: Record<string, string> = {
  "concluído": "badge-complete",
  "em execução": "badge-active",
  "atrasado": "badge-expired",
  "pendente": "badge-pending",
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.2, 0, 0, 1] } },
};

export default function DashboardPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-section font-semibold text-foreground">Dashboard</h1>
        <p className="text-body text-muted-foreground">Visão geral das operações — Março 2026</p>
      </div>

      {/* Stats Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        {stats.map((stat) => (
          <motion.div
            key={stat.label}
            variants={itemVariants}
            className="bg-card border border-border rounded-lg p-4 shadow-card"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-caption text-muted-foreground font-medium uppercase tracking-wider">
                {stat.label}
              </span>
              <stat.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-section font-semibold text-foreground font-tabular">{stat.value}</span>
              <span
                className={`text-caption font-medium ${
                  stat.trend === "up" ? "text-success" : stat.trend === "down" ? "text-success" : "text-warning"
                }`}
              >
                {stat.change}
              </span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ranking */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="show"
          className="lg:col-span-1 bg-card border border-border rounded-lg shadow-card"
        >
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-body font-semibold text-foreground">Ranking Atendentes</h2>
            </div>
          </div>
          <div className="divide-y divide-border">
            {rankingAtendentes.map((person, i) => (
              <div key={person.name} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-caption font-semibold ${
                    i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-body font-medium text-foreground truncate">{person.name}</p>
                  <p className="text-caption text-muted-foreground">{person.total} avaliações</p>
                </div>
                <span className="text-body font-semibold text-foreground font-tabular">
                  {person.score}%
                </span>
                {/* Mini bar */}
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${person.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Tasks */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate="show"
          className="lg:col-span-2 bg-card border border-border rounded-lg shadow-card"
        >
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-body font-semibold text-foreground">Tarefas Recentes</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">ID</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Checklist</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Responsável</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                  <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <td className="px-4 py-3 text-body font-medium text-foreground font-tabular">{task.id}</td>
                    <td className="px-4 py-3 text-body text-foreground">{task.name}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{task.assignee}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${statusBadge[task.status]}`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-body text-muted-foreground text-right font-tabular">{task.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
