/**
 * Página Configurações — concentra subabas Tarefas (Colaboradores, Setores,
 * Pontuação/Notas, Armazenamento). As permissões individuais já são editadas
 * diretamente no cadastro do colaborador, então não há aba/modal global aqui.
 */
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Settings, Users, Building2, Calculator, HardDrive } from "lucide-react";
import { TarefasConfigColaboradores } from "@/modules/tarefas/components/configuracoes/TarefasConfigColaboradores";
import { TarefasConfigSetores } from "@/modules/tarefas/components/configuracoes/TarefasConfigSetores";
import { TarefasConfigPontuacao } from "@/modules/tarefas/components/configuracoes/TarefasConfigPontuacao";
import { TarefasConfigArmazenamento } from "@/modules/tarefas/components/configuracoes/TarefasConfigArmazenamento";

export default function ConfiguracoesPage() {
  const [params, setParams] = useSearchParams();
  const sub = params.get("sub") || "colaboradores";
  const setSub = (v: string) => setParams({ aba: "tarefas", sub: v }, { replace: true });

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4">
      <header className="flex items-center gap-3">
        <Settings className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Configurações</h1>
          <p className="text-xs text-muted-foreground">
            Centralize aqui o que é configurável do sistema.
          </p>
        </div>
      </header>

      <Card className="p-0 overflow-hidden">
        <Tabs value={sub} onValueChange={setSub}>
          <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 px-2 overflow-x-auto">
            <TabsTrigger value="colaboradores" className="gap-2">
              <Users className="w-4 h-4" /> Colaboradores
            </TabsTrigger>
            <TabsTrigger value="setores" className="gap-2">
              <Building2 className="w-4 h-4" /> Setores
            </TabsTrigger>
            <TabsTrigger value="pontuacao" className="gap-2">
              <Calculator className="w-4 h-4" /> Pontuação / Notas
            </TabsTrigger>
            <TabsTrigger value="armazenamento" className="gap-2">
              <HardDrive className="w-4 h-4" /> Armazenamento
            </TabsTrigger>
          </TabsList>

          <div className="p-3 sm:p-4">
            <TabsContent value="colaboradores" className="m-0">
              <TarefasConfigColaboradores />
            </TabsContent>
            <TabsContent value="setores" className="m-0">
              <TarefasConfigSetores />
            </TabsContent>
            <TabsContent value="pontuacao" className="m-0">
              <TarefasConfigPontuacao />
            </TabsContent>
            <TabsContent value="armazenamento" className="m-0">
              <TarefasConfigArmazenamento />
            </TabsContent>
          </div>
        </Tabs>
      </Card>
    </div>
  );
}
