import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, Wand2, ArrowLeft, ArrowRight, Lock, Unlock, Save, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  listarTemplates, analisarTemplateBlocos, buscarClientes, criarProposta,
  salvarSetupRespostas, atualizarTemplate, gerarTextoContexto,
  detectarProdutosDeTexto, criarProdutoSugerido,
  type PropostasTemplate, type PropostasBloco, type PerguntaSetup, type ClienteLite, type ProdutoDetectado,
} from "../services/propostasService";
import { parseInputSimplificado } from "../utils/propostasInputSimplificado";
import { propostasRenderizarTemplate, detectarTokens } from "../utils/propostasRender";

const CHAVE_PRODUTOS_RAW = "__produtos_raw__";

export default function PropostaSetupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  // Cliente — modal obrigatório no início
  const [modalClienteAberto, setModalClienteAberto] = useState(true);
  const [termoCliente, setTermoCliente] = useState("");
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [clienteSel, setClienteSel] = useState<ClienteLite | null>(null);

  // Template + análise
  const [templates, setTemplates] = useState<PropostasTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [blocos, setBlocos] = useState<PropostasBloco[]>([]);
  const [perguntas, setPerguntas] = useState<PerguntaSetup[]>([]);
  const [tokens, setTokens] = useState<string[]>([]);
  const [respostas, setRespostas] = useState<Record<string, unknown>>({});
  const [step, setStep] = useState(0);
  const [analisando, setAnalisando] = useState(false);
  const [gerando, setGerando] = useState(false);

  // Token {contexto} editável
  const [contextoTexto, setContextoTexto] = useState<string>("");
  const [gerandoContexto, setGerandoContexto] = useState(false);

  // Produtos detectados
  const [produtosDetectados, setProdutosDetectados] = useState<ProdutoDetectado[]>([]);
  const [detectandoProd, setDetectandoProd] = useState(false);

  // Unlock por bloco (apenas admin)
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});

  useEffect(() => { listarTemplates().then(setTemplates).catch(console.error); }, []);

  useEffect(() => {
    if (!user) return;
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data }) => setIsAdmin(Boolean(data)));
  }, [user]);

  useEffect(() => {
    const t = setTimeout(() => buscarClientes(termoCliente).then(setClientes).catch(console.error), 300);
    return () => clearTimeout(t);
  }, [termoCliente]);

  function confirmarCliente() {
    if (!clienteSel) { toast.error("Selecione um cliente para continuar"); return; }
    setModalClienteAberto(false);
  }

  async function carregarTemplate() {
    if (!templateId) return;
    setAnalisando(true);
    try {
      const tpl = templates.find(t => t.id === templateId);
      if (!tpl) return;
      const tks = detectarTokens(tpl.conteudo_html);
      setTokens(tks);

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

  async function gerarContexto() {
    setGerandoContexto(true);
    try {
      const txt = await gerarTextoContexto(respostas, clienteSel?.nome);
      setContextoTexto(txt);
      toast.success("Contexto gerado — edite se necessário antes de aplicar");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar contexto");
    } finally {
      setGerandoContexto(false);
    }
  }

  async function detectarProdutos() {
    const raw = (respostas[CHAVE_PRODUTOS_RAW] as string) ?? "";
    if (!raw.trim()) { toast.error("Liste os produtos no campo acima"); return; }
    setDetectandoProd(true);
    try {
      const lista = await detectarProdutosDeTexto(raw);
      setProdutosDetectados(lista);
      toast.success(`${lista.length} produto(s) detectado(s)`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao detectar");
    } finally {
      setDetectandoProd(false);
    }
  }

  async function salvarProdutosNoCatalogo() {
    let ok = 0;
    for (const p of produtosDetectados) {
      try { await criarProdutoSugerido(p); ok++; } catch (e) { console.error(e); }
    }
    toast.success(`${ok} produto(s) salvo(s) como sugeridos (revisão pendente)`);
  }

  async function finalizar() {
    if (!clienteSel) { toast.error("Selecione um cliente"); return; }
    if (!templateId) { toast.error("Sem template"); return; }
    setGerando(true);
    try {
      const tpl = templates.find(t => t.id === templateId);
      if (!tpl) throw new Error("Template não encontrado");

      // Monta dados para o renderer determinístico (NÃO usa IA aqui)
      const dados: Record<string, unknown> = {
        cliente_nome: clienteSel.nome,
        cliente_cpf: clienteSel.cpf ?? "",
        cliente_cidade: clienteSel.cidade ?? "",
        data_emissao: new Date().toLocaleDateString("pt-BR"),
      };

      // Mapeia respostas variáveis (campo) → token
      for (const b of blocos) {
        if (b.tipo === "variavel" && b.campo) {
          const v = respostas[b.id] ?? respostas[b.campo];
          if (v !== undefined) dados[b.campo] = v;
        }
      }

      // Token {contexto} editado pelo usuário
      if (contextoTexto.trim()) dados["contexto"] = contextoTexto;

      // valor_total: soma tabelas com qtd*valor
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

      // RENDER DETERMINÍSTICO — preserva layout 100%
      const html = propostasRenderizarTemplate(tpl.conteudo_html, dados);

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
        respostas: { ...respostas, __contexto__: contextoTexto },
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

  // Modal de cliente obrigatório
  const dialogoCliente = (
    <Dialog open={modalClienteAberto} onOpenChange={(o) => { if (!o && !clienteSel) { navigate("/propostas/nova"); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Selecione o cliente</DialogTitle>
          <DialogDescription>O modo guiado começa pela escolha do cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Buscar por nome..." value={termoCliente} onChange={(e) => setTermoCliente(e.target.value)} autoFocus />
          <div className="max-h-64 overflow-auto border rounded-md divide-y">
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
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate("/propostas/nova")}>Cancelar</Button>
            <Button onClick={confirmarCliente} disabled={!clienteSel}>Continuar <ArrowRight className="w-4 h-4 ml-2" /></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ---------------- RENDER ----------------
  if (modalClienteAberto) return <div className="p-6">{dialogoCliente}</div>;

  if (step === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="w-6 h-6" /> Modo Guiado
          </h1>
          <Badge>Cliente: {clienteSel?.nome}</Badge>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Escolha o template</CardTitle></CardHeader>
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
                <ArrowLeft className="w-4 h-4 mr-2" /> Modo manual
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

  // Steps adicionais: perguntas + (se token contexto existe) + (se token itens) + cliente já feito
  const temContexto = tokens.includes("contexto");
  const temProdutos = tokens.some(t => /item|produto/i.test(t));
  const extraSteps: Array<"contexto" | "produtos"> = [];
  if (temContexto) extraSteps.push("contexto");
  if (temProdutos) extraSteps.push("produtos");

  const totalSteps = perguntas.length + extraSteps.length;
  const currentIdx = step - 1;
  const pergunta = perguntas[currentIdx];
  const extraIdx = currentIdx - perguntas.length;
  const extraAtual = extraSteps[extraIdx];

  const isUltimoStep = currentIdx >= totalSteps - 1;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Wand2 className="w-5 h-5" /> Modo Guiado
        </h1>
        <div className="flex gap-2 items-center">
          <Badge variant="outline">Cliente: {clienteSel?.nome}</Badge>
          <Badge variant="outline">{Math.min(step, totalSteps)} / {totalSteps}</Badge>
        </div>
      </div>

      {pergunta ? (
        <Card>
          <CardHeader><CardTitle className="text-base">{pergunta.pergunta}</CardTitle></CardHeader>
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
                <Textarea rows={10} className="font-mono text-sm"
                  placeholder={`[item] câmera dome\n[qtd] 4\n[descricao] 4MP IR 30m\n[valor] 320`}
                  value={(respostas[`${pergunta.bloco_id}_raw`] as string) ?? ""}
                  onChange={(e) => {
                    const txt = e.target.value;
                    setResposta(`${pergunta.bloco_id}_raw`, txt);
                    setResposta(pergunta.bloco_id, parseInputSimplificado(txt));
                  }}
                />
                <div className="text-xs text-muted-foreground">
                  {((respostas[pergunta.bloco_id] as unknown[]) ?? []).length} linha(s).
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : extraAtual === "contexto" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bloco {"{contexto}"} — gerar e revisar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A IA gera o texto com base nas suas respostas. Você pode editar livremente antes de aplicar no template.
            </p>
            <Button variant="outline" size="sm" onClick={gerarContexto} disabled={gerandoContexto}>
              {gerandoContexto ? "Gerando..." : <><RefreshCw className="w-4 h-4 mr-2" />{contextoTexto ? "Regenerar" : "Gerar com IA"}</>}
            </Button>
            <Textarea rows={10} value={contextoTexto} onChange={(e) => setContextoTexto(e.target.value)}
              placeholder="<p>O texto gerado aparece aqui. Edite à vontade.</p>" />
            <p className="text-xs text-muted-foreground">Aceita HTML simples: &lt;p&gt;, &lt;strong&gt;.</p>
          </CardContent>
        </Card>
      ) : extraAtual === "produtos" ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Itens / produtos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Label className="text-xs text-muted-foreground">
              Liste no formato <code>Nome - valor</code> (um por linha). Itens novos serão salvos como sugestões para revisão.
            </Label>
            <Textarea rows={8} className="font-mono text-sm"
              placeholder={`Switch TP-Link 24p - 1300\nAccess Point Wi-Fi 6 - 900\nStorage por GB - 0,50`}
              value={(respostas[CHAVE_PRODUTOS_RAW] as string) ?? ""}
              onChange={(e) => setResposta(CHAVE_PRODUTOS_RAW, e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={detectarProdutos} disabled={detectandoProd}>
                {detectandoProd ? "Detectando..." : <><Sparkles className="w-4 h-4 mr-2" />Detectar com IA</>}
              </Button>
              {produtosDetectados.length > 0 && (
                <Button variant="outline" size="sm" onClick={salvarProdutosNoCatalogo}>
                  <Check className="w-4 h-4 mr-2" />Salvar {produtosDetectados.length} no catálogo
                </Button>
              )}
            </div>
            {produtosDetectados.length > 0 && (
              <div className="border rounded-md divide-y">
                {produtosDetectados.map((p, i) => (
                  <div key={i} className="p-2 text-sm flex justify-between">
                    <span>{p.nome} <span className="text-xs text-muted-foreground">({p.tipo} · {p.tipo_calculo} · {p.unidade})</span></span>
                    <span className="font-medium">R$ {p.valor_minimo.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Blocos locked */}
      {step === 1 && blocos.some(b => b.locked) && isAdmin && (
        <Card className="border-amber-500/40">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Lock className="w-4 h-4" /> Blocos protegidos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {blocos.filter(b => b.locked).map(b => (
              <div key={b.id} className="flex items-center justify-between text-sm">
                <span className="truncate max-w-md">{(b.conteudo ?? "").replace(/<[^>]+>/g, "").slice(0, 80)}…</span>
                <Button variant="ghost" size="sm" onClick={() => setUnlocked(u => ({ ...u, [b.id]: !u[b.id] }))}>
                  {unlocked[b.id] ? <><Unlock className="w-3 h-3 mr-1" />Desbloqueado</> : <><Lock className="w-3 h-3 mr-1" />Bloqueado</>}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={gerando}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        {isUltimoStep ? (
          <Button onClick={finalizar} disabled={gerando}>
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
