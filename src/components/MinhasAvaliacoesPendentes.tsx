import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface PendingOS {
  os_id: string;
  numero_os: string;
  cliente_nome: string | null;
  tipo_servico_nome: string | null;
  colaborador_avaliado_nome: string | null;
  pending_count: number;
  progress: number;
}

export default function MinhasAvaliacoesPendentes() {
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const [pendingList, setPendingList] = useState<PendingOS[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const fetchPending = async () => {
      setLoading(true);
      try {
        const { data: sectorLinks } = await supabase
          .from("colaborador_setores").select("setor_id").eq("profile_id", profile.id);
        let mySetorIds = sectorLinks?.map(l => l.setor_id) || [];
        if (mySetorIds.length === 0 && profile.setor_id) mySetorIds = [profile.setor_id];
        if (mySetorIds.length === 0 && !isAdmin) { setPendingList([]); setLoading(false); return; }

        let pendingQuery = supabase
          .from("ordens_servico")
          .select("id, numero_os, cliente_nome, tipo_servico_id, status, colaborador_avaliado_id, atendente_id, tecnico_id")
          .in("status", ["aberta", "em_andamento"])
          .order("data_abertura", { ascending: false });

        const { data: openOS } = await pendingQuery;
        if (!openOS?.length) { setPendingList([]); setLoading(false); return; }

        const osIds = openOS.map(o => o.id);
        const tipoIds = [...new Set(openOS.map(o => o.tipo_servico_id).filter(Boolean))] as string[];

        const profileIdsToResolve = new Set<string>();
        openOS.forEach(o => {
          if (o.colaborador_avaliado_id) profileIdsToResolve.add(o.colaborador_avaliado_id);
          if (o.atendente_id) profileIdsToResolve.add(o.atendente_id);
          if (o.tecnico_id) profileIdsToResolve.add(o.tecnico_id);
        });

        const [tiposRes, osPerguntasRes, avalsRes, profilesRes, respostasRes] = await Promise.all([
          tipoIds.length > 0 ? supabase.from("tipos_servico").select("id, nome").in("id", tipoIds) : { data: [] },
          (supabase as any).from("os_perguntas").select("os_id, pergunta_id").in("os_id", osIds),
          supabase.from("avaliacoes").select("id, ordem_servico_id, avaliador_id, concluida").in("ordem_servico_id", osIds),
          profileIdsToResolve.size > 0 ? supabase.from("profiles").select("id, nome").in("id", [...profileIdsToResolve]) : { data: [] },
          supabase.from("respostas_avaliacao").select("ordem_servico_id, pergunta_id").in("ordem_servico_id", osIds).not("resposta", "is", null),
        ]);

        const tipoNames: Record<string, string> = {};
        (tiposRes.data as any[])?.forEach((t: any) => { tipoNames[t.id] = t.nome; });
        const profileNames: Record<string, string> = {};
        (profilesRes.data as any[])?.forEach((p: any) => { profileNames[p.id] = p.nome; });

        const perguntasByOS: Record<string, string[]> = {};
        ((osPerguntasRes as any).data || []).forEach((op: any) => {
          if (!perguntasByOS[op.os_id]) perguntasByOS[op.os_id] = [];
          perguntasByOS[op.os_id].push(op.pergunta_id);
        });

        const allPerguntaIds = [...new Set(Object.values(perguntasByOS).flat())];
        let perguntaSetorMap: Record<string, string | null> = {};
        if (allPerguntaIds.length > 0) {
          const { data: perguntasData } = await supabase
            .from("perguntas_avaliacao")
            .select("id, setor_avaliado_id")
            .in("id", allPerguntaIds);
          (perguntasData || []).forEach(p => { perguntaSetorMap[p.id] = p.setor_avaliado_id; });
        }

        const allAvals = avalsRes.data || [];
        const answeredSet = new Set(((respostasRes as any).data || []).map((r: any) => `${r.ordem_servico_id}:${r.pergunta_id}`));

        const myPending: PendingOS[] = [];

        for (const os of openOS) {
          const osPerguntaIds = perguntasByOS[os.id] || [];
          if (osPerguntaIds.length === 0) continue;

          const myQuestions = isAdmin ? osPerguntaIds : osPerguntaIds.filter(pid => {
            const setorId = perguntaSetorMap[pid];
            return !setorId || mySetorIds.includes(setorId);
          });

          const myAval = allAvals.find(a => a.ordem_servico_id === os.id && a.avaliador_id === profile.id);
          const myUnanswered = myQuestions.filter(pid => !answeredSet.has(`${os.id}:${pid}`));
          const uniqueAnswered = osPerguntaIds.filter(pid => answeredSet.has(`${os.id}:${pid}`)).length;
          const progress = osPerguntaIds.length > 0 ? Math.round((uniqueAnswered / osPerguntaIds.length) * 100) : 0;

          const colabId = os.colaborador_avaliado_id || os.atendente_id || os.tecnico_id;
          const colabNome = colabId ? profileNames[colabId] || null : null;

          const myPartDone = myAval?.concluida === true || myUnanswered.length === 0;

          if (!myPartDone) {
            myPending.push({
              os_id: os.id, numero_os: os.numero_os, cliente_nome: os.cliente_nome,
              tipo_servico_nome: os.tipo_servico_id ? tipoNames[os.tipo_servico_id] || null : null,
              colaborador_avaliado_nome: colabNome, pending_count: myUnanswered.length, progress,
            });
          }
        }

        setPendingList(myPending);
      } catch (err) {
        console.error("Error fetching pending evaluations:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchPending();
  }, [profile, isAdmin]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-card mb-6">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-warning" />
          <h2 className="text-body font-semibold text-foreground">Minhas Avaliações Pendentes</h2>
        </div>
        <div className="p-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg shadow-card mb-6">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-warning" />
        <h2 className="text-body font-semibold text-foreground">Minhas Avaliações Pendentes</h2>
        <span className="text-caption text-muted-foreground">({pendingList.length})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo de Serviço</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Colaborador Avaliado</th>
              <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Pendentes</th>
              <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-36">Progresso</th>
              <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pendingList.length > 0 ? pendingList.map(item => (
              <tr key={item.os_id} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 text-body font-medium text-primary font-tabular">#{item.numero_os}</td>
                <td className="px-4 py-3 text-body text-muted-foreground">{item.cliente_nome || "—"}</td>
                <td className="px-4 py-3 text-body text-muted-foreground">{item.tipo_servico_nome || "—"}</td>
                <td className="px-4 py-3 text-body text-foreground">{item.colaborador_avaliado_nome || "—"}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant="destructive" className="font-tabular">{item.pending_count}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Progress value={item.progress} className="h-2 flex-1" />
                    <span className="text-caption font-medium font-tabular text-muted-foreground w-10 text-right">{item.progress}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    onClick={() => navigate(`/avaliacoes/pesquisa?os=${item.numero_os}&mode=eval`)}
                    className="press-effect"
                  >
                    Responder <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">
                  <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-success" />
                  Nenhuma avaliação pendente no seu setor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
