import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TarefasConfigArmazenamento } from "@/modules/tarefas/components/configuracoes/TarefasConfigArmazenamento";
import { TarefasConfigSetores } from "@/modules/tarefas/components/configuracoes/TarefasConfigSetores";
import { TarefasConfigColaboradores } from "@/modules/tarefas/components/configuracoes/TarefasConfigColaboradores";

export default function TarefasConfiguracoesPage() {
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Configuracoes de Tarefas</h1>
        <p className="text-sm text-muted-foreground">Parametros operacionais do modulo Tarefas.</p>
      </div>

      <Tabs defaultValue="armazenamento" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="armazenamento">Armazenamento</TabsTrigger>
          <TabsTrigger value="setores">Setores</TabsTrigger>
          <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>
        </TabsList>
        <TabsContent value="armazenamento">
          <TarefasConfigArmazenamento />
        </TabsContent>
        <TabsContent value="setores">
          <TarefasConfigSetores />
        </TabsContent>
        <TabsContent value="colaboradores">
          <TarefasConfigColaboradores />
        </TabsContent>
      </Tabs>
    </div>
  );
}
