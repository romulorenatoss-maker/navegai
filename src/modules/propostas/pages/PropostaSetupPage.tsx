import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Wand2, ArrowLeft, ArrowRight, Lock, Unlock, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  listarTemplates, analisarTemplateBlocos, gerarPropostaPorBlocos,
  buscarClientes, criarProposta, salvarSetupRespostas, atualizarTemplate,
  type PropostasTemplate, type PropostasBloco, type PerguntaSetup, type ClienteLite,
} from "../services/propostasService";
import { parseInputSimplificado } from "../utils/propostasInputSimplificado";

export default function PropostaSetupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  const [templates, setTemplates] = useState<PropostasTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [blocos, setBlocos] = useState<PropostasBloco[]>([]);
  const [perguntas, setPerguntas] = useState<PerguntaSetup[]>([]);
  const [respostas, setRespostas] = useState<Record<string, unknown>>({});
  const [step, setStep] = useState(0);
  const [analisando, setAnalisando] = useState(false);
  const [gerando, setGerando] = useState(false);

  // Cliente
  const [termoCliente, setTermoCliente] = useState("");
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [clienteSel, setClienteSel] = useState<ClienteLite | null>(null);

  // Unlock por bloco (apenas admin)
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    listarTemplates().then(setTemplates).catch(console.error);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data }) => {
      setIsAdmin(Boolean(data));
    });
  }, [user]);

  useEffect(() => {
    const t = setTimeout(() => buscarClientes(termoCliente).then(setClientes).catch(console.error), 300);
    return () => clearTimeout(t);
  }, [termoCliente]);

  async function carregarTemplate() {
    if (!templateId) return;
    setAnalisando(true);
    try {
      const tpl = templates.find(t => t.id === templateId);
      if (!tpl) return;

      // Se já tem estrutura, usa cache; senão analisa
      if (tpl.estrutura_blocos && Array.isArray(tpl.estrutura_blocos) && tpl.estrutura_blocos.length > 0) {
        setBlocos(tpl.estrutura_blocos);
        setPerguntas(
          tpl.estrutura_blocos
            .filter(b => (b.tipo === "variavel" || b.tipo === "tabela") && b.pergunta)
            .map(b => ({ bloco_id: b.id, tipo: b.tipo as "variavel" | "tabela", campo: b.campo, pergunta: b.pergunta!, schema: b.schema }))
        );
      } else {
        const { blocos: bl, perguntas: pg } = await analisarTemplateBlocos(tpl.conteudo_html);
        setBlocos(bl);
        setPerguntas(pg);
        // Cacheia no template
        await atualizarTemplate(tpl.id, { estrutura_blocos: bl } as Partial<PropostasTemplate>);
      }
      setStep(1);
      toast.success("Template analisado");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao analisar");
    } finally {
      setAnalisando(false);
    }
  }

  function setResposta(blocoId: string, valor: unknown) {
    setRespostas(prev => ({ ...prev, [blocoId]: valor }));
  }

  async function finalizar() {
    if (!clienteSel) { toast.error("Selecione um cliente"); return; }
    setGerando(true);
    try {
      const html = await gerarPropostaPorBlocos(blocos, respostas);

      // valor_total: se houver tabelas com "valor", soma
      let valorTotal = 0;
      for (const b of blocos) {
        if (b.tipo === "tabela") {
          const linhas = (respostas[b.id] as Array<Record<string, unknown>>) ?? [];
          for (const l of linhas) {
            const v = Number(l.valor ?? 0);
            const q = Number(l.qtd ?? 1);
            if (!isNaN(v)) valorTotal += v * (isNaN(q) ? 1 : q);
          }
        }
      }

      const proposta = await criarProposta({
        cliente_id: clienteSel.id,
        template_id: templateId,
        conteudo_original: html,
        conteudo_editado: html,
        valor_total: valorTotal,
        validade: null,
        itens: [],
      });

      await salvarSetupRespostas({
        template_id: templateId,
        cliente_id: clienteSel.id,
        respostas,
        finalizado: true,
        nome_sessao: `Setup ${new Date().toLocaleString("pt-BR")}`,
      });

      toast.success("Proposta gerada");
      navigate(`/propostas/${proposta.id}/preview`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar");
    } finally {
      setGerando(false);
    }
  }

  // -------- RENDER --------
  if (step === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="w-6 h-6" /> Modo Guiado
          </h1>
          <p className="text-sm text-muted-foreground">A IA lê o template e te conduz por perguntas em sequência.</p>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">1. Escolha o template</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Selecione um template" /></SelectTrigger>
              <SelectContent>
                {templates.filter(t => t.ativo).map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => navigate("/propostas/nova")}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao manual
              </Button>
              <Button onClick={carregarTemplate} disabled={!templateId || analisando}>
                {analisando ? "Analisando..." : <><Sparkles className="w-4 h-4 mr-2" />Analisar com IA</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalSteps = perguntas.length;
  const currentIdx = step - 1;
  const isClienteStep = currentIdx === totalSteps; // último passo: cliente
  const pergunta = perguntas[currentIdx];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Wand2 className="w-5 h-5" /> Modo Guiado
        </h1>
        <Badge variant="outline">
          {Math.min(step, totalSteps + 1)} / {totalSteps + 1}
        </Badge>
      </div>

      {/* Bloco de cliente (último passo) */}
      {isClienteStep ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Buscar por nome..." value={termoCliente} onChange={(e) => setTermoCliente(e.target.value)} />
            <div className="max-h-48 overflow-auto border rounded-md divide-y">
              {clientes.length === 0
                ? <p className="p-3 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
                : clientes.map(c => (
                  <button key={c.id}
                    className={`w-full text-left p-3 text-sm hover:bg-accent ${clienteSel?.id === c.id ? "bg-accent" : ""}`}
                    onClick={() => setClienteSel(c)}>
                    <div className="font-medium">{c.nome}</div>
                    <div className="text-xs text-muted-foreground">{c.cpf ?? "—"}{c.cidade ? ` · ${c.cidade}` : ""}</div>
                  </button>
                ))}
            </div>
            {clienteSel && <Badge>Selecionado: {clienteSel.nome}</Badge>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{pergunta.pergunta}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pergunta.tipo === "variavel" ? (
              <Input
                value={(respostas[pergunta.bloco_id] as string) ?? ""}
                onChange={(e) => setResposta(pergunta.bloco_id, e.target.value)}
                placeholder="Digite a resposta..."
              />
            ) : (
              <>
                <Label className="text-xs text-muted-foreground">
                  Use o formato <code>[item] valor</code> (uma linha por chave; bloco em branco separa linhas):
                </Label>
                <Textarea
                  rows={10}
                  className="font-mono text-sm"
                  placeholder={`[item] câmera dome\n[qtd] 4\n[descricao] 4MP IR 30m\n[valor] 320\n\n[item] gravador\n[qtd] 1\n[valor] 1200`}
                  value={(respostas[`${pergunta.bloco_id}_raw`] as string) ?? ""}
                  onChange={(e) => {
                    const txt = e.target.value;
                    setResposta(`${pergunta.bloco_id}_raw`, txt);
                    setResposta(pergunta.bloco_id, parseInputSimplificado(txt));
                  }}
                />
                <div className="text-xs text-muted-foreground">
                  {((respostas[pergunta.bloco_id] as unknown[]) ?? []).length} linha(s) detectada(s).
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Blocos locked: aviso para admin */}
      {step === 1 && blocos.some(b => b.locked) && isAdmin && (
        <Card className="border-amber-500/40">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Lock className="w-4 h-4" /> Blocos protegidos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {blocos.filter(b => b.locked).map(b => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span className="truncate max-w-md">{(b.conteudo ?? "").replace(/<[^>]+>/g, "").slice(0, 80)}…</span>
                <Button variant="ghost" size="sm"
                  onClick={() => setUnlocked(u => ({ ...u, [b.id]: !u[b.id] }))}>
                  {unlocked[b.id] ? <><Unlock className="w-3 h-3 mr-1" />Desbloqueado</> : <><Lock className="w-3 h-3 mr-1" />Bloqueado</>}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={gerando}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        {isClienteStep ? (
          <Button onClick={finalizar} disabled={gerando || !clienteSel}>
            {gerando ? "Gerando..." : <><Save className="w-4 h-4 mr-2" />Gerar proposta</>}
          </Button>
        ) : (
          <Button onClick={() => setStep(s => s + 1)}>
            Avançar <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
