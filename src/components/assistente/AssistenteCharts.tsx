import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 220 70% 50%))",
  "hsl(var(--chart-3, 150 60% 45%))",
  "hsl(var(--chart-4, 40 80% 55%))",
  "hsl(var(--chart-5, 0 70% 55%))",
  "#8884d8", "#82ca9d", "#ffc658", "#ff7c7c", "#8dd1e1",
];

interface BarChartData {
  title: string;
  labels: string[];
  datasets: { name: string; values: number[] }[];
}

interface LineChartData {
  title: string;
  labels: string[];
  datasets: { name: string; values: number[] }[];
}

interface PieChartData {
  title: string;
  labels: string[];
  values: number[];
}

export function AssistenteBarChart({ data }: { data: BarChartData }) {
  const chartData = useMemo(() => 
    data.labels.map((label, i) => {
      const point: Record<string, string | number> = { name: label };
      data.datasets.forEach(ds => { point[ds.name] = ds.values[i] || 0; });
      return point;
    }), [data]);

  return (
    <Card className="my-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{data.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis dataKey="name" className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
            <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {data.datasets.map((ds, i) => (
              <Bar key={ds.name} dataKey={ds.name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function AssistenteLineChart({ data }: { data: LineChartData }) {
  const chartData = useMemo(() => 
    data.labels.map((label, i) => {
      const point: Record<string, string | number> = { name: label };
      data.datasets.forEach(ds => { point[ds.name] = ds.values[i] || 0; });
      return point;
    }), [data]);

  return (
    <Card className="my-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{data.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            <XAxis dataKey="name" className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
            <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {data.datasets.map((ds, i) => (
              <Line key={ds.name} type="monotone" dataKey={ds.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function AssistentePieChart({ data }: { data: PieChartData }) {
  const chartData = useMemo(() => 
    data.labels.map((label, i) => ({ name: label, value: data.values[i] || 0 })), [data]);

  return (
    <Card className="my-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{data.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} outerRadius={100} dataKey="value">
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
