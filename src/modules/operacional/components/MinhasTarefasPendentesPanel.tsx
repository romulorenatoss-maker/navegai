import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useContingencyManagement } from "@/modules/operacional/hooks/useContingencyManagement";
import { CONTINGENCY_STATUS } from "@/modules/operacional/hooks/useOperationalScoring";
import { Camera, Video, File as FileIcon, Clock } from "lucide-react";

/**
 * Painel embutido em "Tarefas Pendentes" da página de Execução.
 *
 * Estrutura:
 *  - Aba "Minhas" (sempre): contingências onde o usuário é responsável.
 *  - Aba "Outros" (somente admin): demais contingências.
 *  Dentro de cada aba: 4 sub-abas (Abertas, Em Tratamento, Vencidas, Concluídas).
 *
 * Clique em um card navega para /operacional/contingencias preservando as
 * ações/regras existentes.
 */
export function MinhasTarefasPendentesPanel() {
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const cm = useContingencyManagement();
  const [scope, setScope] = useState<"minhas" | "outros">("minhas");

  const filterMine = (list: any[]) => list.filter((c: any) => c.responsavel_id === profile?.id);
  const filterOthers = (list: any[]) => list.filter((c: any) => c.responsavel_id !== profile?.id);

  const buckets = useMemo(() => {
    const pick = scope === "minhas" ? filterMine : filterOthers;
    return {
      abertas: pick(cm.abertas),
      emTratamento: pick(cm.emTratamento),
      vencidas: pick(cm.vencidas),
      concluidas: pick(cm.validadas),
    };
  }, [cm.abertas, cm.emTratamento, cm.vencidas, cm.validadas, scope, profile?.id]);

  const minhasTotal = filterMine(cm.abertas).length + filterMine(cm.emTratamento).length + filterMine(cm.vencidas).length + filterMine(cm.validadas).length;
  const outrosTotal = filterOthers(cm.abertas).length + filterOthers(cm.emTratamento).length + filterOthers(cm.vencidas).length + filterOthers(cm.validadas).length;

  const goToDetail = (_c: any) => navigate("/operacional/contingencias");

  const renderCard = (c: any) => {
    const statusCfg = CONTINGENCY_STATUS[c.status] || { label: c.status, class: "bg-muted text-muted-foreground border-border" };
    const sla = cm.getSlaInfo(c);
    const isResolvedCard = c.status === "resolvida";
    return (
      <div
        key={c.id}
        onClick={() => goToDetail(c)}
        className={`p-3 border rounded-lg cursor-pointer hover:shadow-sm transition-shadow ${
          isResolvedCard
            ? "border-green-300 bg-green-50/50 dark:bg-green-950/20 dark:border-green-700"
            : sla?.isExpired
            ? "border-destructive/50 bg-destructive/5"
            : "border-border bg-card"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{c.descricao}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
              <span>{c.assignment?.template?.nome || "—"}</span>
              <span>•</span>
              <span>Resp: {c.responsavel?.nome || "—"}</span>
            </div>
            {c.justificativa_rejeicao && ["aberta", "em_andamento"].includes(c.status) && (
              <p className="text-xs text-destructive mt-1 truncate">⚠ Reprovada: {c.justificativa_rejeicao}</p>
            )}
            {Array.isArray(c.tipos_evidencia_requeridos) && c.tipos_evidencia_requeridos.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-1.5">
                {c.tipos_evidencia_requeridos.map((t: string) => (
                  <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[9px] font-medium border border-border">
                    {t === "foto" && <Camera className="w-2.5 h-2.5" />}
                    {t === "video" && <Video className="w-2.5 h-2.5" />}
                    {t === "documento" && <FileIcon className="w-2.5 h-2.5" />}
                    {t === "foto" ? "Foto" : t === "video" ? "Vídeo" : "Documento"}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
              isResolvedCard ? "bg-green-100 text-green-700 border-green-300" : statusCfg.class
            }`}>
              {isResolvedCard ? "Aguardando Validação" : statusCfg.label}
            </span>
            {sla && (
              <span className={`text-[10px] font-mono ${sla.isExpired ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                {sla.label}
              </span>
            )}
            {c.status === "validada" && c.validada_em && c.created_at && (
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {(() => {
                  const ms = new Date(c.validada_em).getTime() - new Date(c.created_at).getTime();
                  const h = Math.floor(ms / 3600000);
                  const m = Math.floor((ms % 3600000) / 60000);
                  return h > 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}min`;
                })()}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const subTabs = [
    { key: "abertas", label: "Abertas", list: buckets.abertas, accent: "bg-red-500/20 text-red-700", empty: "Nenhuma plano de ação aberta." },
    { key: "em_tratamento", label: "Em Tratamento", list: buckets.emTratamento, accent: "bg-blue-500/20 text-blue-700", empty: "Nenhuma em tratamento." },
    { key: "vencidas", label: "Vencidas", list: buckets.vencidas, accent: "bg-red-600/20 text-red-800", empty: "Nenhuma plano de ação vencida." },
    { key: "concluidas", label: "Concluídas", list: buckets.concluidas, accent: "bg-green-500/20 text-green-700", empty: "Nenhuma plano de ação concluída." },
  ];

  const renderSubTabs = () => (
    <Tabs defaultValue="abertas" className="w-full">
      <TabsList className="h-8 mb-2 flex-wrap gap-1 w-full">
        {subTabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key} className="text-xs h-6 px-2 flex-1 min-w-[80px]">
            {t.label}
            {t.list.length > 0 && (
              <span className={`ml-1 px-1.5 rounded-full text-[10px] ${t.accent}`}>{t.list.length}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {subTabs.map((t) => (
        <TabsContent key={t.key} value={t.key} className="mt-0 space-y-2">
          {cm.isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>
          ) : t.list.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t.empty}</p>
          ) : (
            t.list.map(renderCard)
          )}
        </TabsContent>
      ))}
    </Tabs>
  );

  // Usuário comum: apenas "Minhas" como única aba (sem Outros)
  if (!isAdmin) {
    return (
      <Tabs value="minhas" className="w-full">
        <TabsList className="h-8 mb-2">
          <TabsTrigger value="minhas" className="text-xs h-6 px-2">Minhas ({minhasTotal})</TabsTrigger>
        </TabsList>
        <TabsContent value="minhas" className="mt-0">
          {renderSubTabs()}
        </TabsContent>
      </Tabs>
    );
  }

  // Admin: Minhas | Outros
  return (
    <Tabs value={scope} onValueChange={(v) => setScope(v as any)} className="w-full">
      <TabsList className="h-8 mb-2">
        <TabsTrigger value="minhas" className="text-xs h-6 px-2">Minhas ({minhasTotal})</TabsTrigger>
        <TabsTrigger value="outros" className="text-xs h-6 px-2">Outros ({outrosTotal})</TabsTrigger>
      </TabsList>
      <TabsContent value="minhas" className="mt-0">{renderSubTabs()}</TabsContent>
      <TabsContent value="outros" className="mt-0">{renderSubTabs()}</TabsContent>
    </Tabs>
  );
}
