import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Send, Sparkles, ArrowLeft, Trash2, Save, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  buscarClientes, listarTemplates, criarProposta, criarProdutoSugerido,
  type ClienteLite, type PropostasTemplate,
} from "../services/propostasService";
import {
  listarCategorias, listarPerguntas,
  type PropostasCategoriaSetup, type PropostasPerguntaSetup, type PropostasCobranca,
} from "../services/propostasPerguntasService";
import {
  obterContextoEmpresa, listarPerguntasProduto,
  type PropostasEmpresaContexto, type PropostasPerguntaProduto,
} from "../services/propostasContextoService";
import { listarProdutos, type PropostasProduto } from "../services/propostasService";
import { propostasRenderizarTemplate } from "../utils/propostasRender";
import {
  buscarRascunhoPorCliente, salvarRascunho, excluirRascunho,
  type PropostasRascunhoConversa,
} from "../services/propostasRascunhoService";
import { PerguntaGuiadaPanel } from "../components/PerguntaGuiadaPanel";

interface Msg { role: "user" | "assistant"; content: string }
interface ItemConv {
  produto_id?: string;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  cobranca: PropostasCobranca;
  categoria?: string;
}

type Etapa = "contexto" | "infraestrutura" | "dados" | "seguranca" | "telefonia" | "financeiro" | "fechamento";
const ETAPAS_ORDEM: Etapa[] = ["contexto", "infraestrutura", "dados", "seguranca", "telefonia", "financeiro", "fechamento"];

interface IAAction {
  type: "add_item" | "update_item" | "next_step" | "finalizar" | "none";
  item?: { nome?: string; quantidade?: number; valor?: number; categoria?: string; cobranca?: string };
  match?: { produto_id?: string; nome?: string };
  updates?: { quantidade?: number; valor?: number; cobranca?: string };
  proxima_etapa?: Etapa;
  validacao?: { ok: false; mensagem: string };
}

const COBRANCAS: PropostasCobranca[] = ["implantacao", "mensal", "informativo"];
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

export default function PropostaConversacionalPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const clienteParam = params.get("cliente");

  // Cliente
  const [modalCliente, setModalCliente] = useState(true);
  const [termoCliente, setTermoCliente] = useState("");
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [clienteSel, setClienteSel] = useState<ClienteLite | null>(null);

  // Rascunho
  const [rascunhoId, setRascunhoId] = useState<string | null>(null);
  const [retomado, setRetomado] = useState(false);

  // Template
  const [templates, setTemplates] = useState<PropostasTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");

  // Setup
  const [categorias, setCategorias] = useState<PropostasCategoriaSetup[]>([]);
  const [perguntas, setPerguntas] = useState<PropostasPerguntaSetup[]>([]);
  const [respostas, setRespostas] = useState<Record<string, unknown>>({});

  // Chat + planilha
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [itens, setItens] = useState<ItemConv[]>([]);
  const [finalizado, setFinalizado] = useState(false);
  const [gerando, setGerando] = useState(false);

  // Estado conversacional (frontend = fonte da verdade)
  const [etapa, setEtapa] = useState<Etapa>("contexto");
  const [perguntasRespondidas, setPerguntasRespondidas] = useState<string[]>([]);

  // Contexto da empresa + catálogo + perguntas padrão por categoria
  const [empresa, setEmpresa] = useState<PropostasEmpresaContexto | null>(null);
  const [catalogo, setCatalogo] = useState<PropostasProduto[]>([]);
  const [perguntasProd, setPerguntasProd] = useState<PropostasPerguntaProduto[]>([]);

  // Duplicata pendente (modal de decisão)
  const [duplicata, setDuplicata] = useState<{ existenteIdx: number; novo: ItemConv; fila: ItemConv[] } | null>(null);

  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      listarTemplates(), listarCategorias(true), listarPerguntas(true),
      obterContextoEmpresa().catch(() => null),
      listarProdutos().catch(() => []),
      listarPerguntasProduto().catch(() => []),
    ])
      .then(([t, c, p, emp, cat, pp]) => {
        setTemplates(t); setCategorias(c); setPerguntas(p);
        setEmpresa(emp); setCatalogo(cat); setPerguntasProd(pp.filter(q => q.ativo));
      })
      .catch(e => toast.error(String(e)));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscarClientes(termoCliente).then(setClientes).catch(console.error), 300);
    return () => clearTimeout(t);
  }, [termoCliente]);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const perguntasOrdenadas = useMemo(() => {
    const categoriasAtivas = categorias.filter(c => c.ativo);
    const catMap = new Map(categoriasAtivas.map(c => [c.id, c]));
    return perguntas
      .filter(p => catMap.has(p.categoria_id))
      .sort((a, b) => {
        const ca = catMap.get(a.categoria_id)?.ordem ?? 999;
        const cb = catMap.get(b.categoria_id)?.ordem ?? 999;
        return ca - cb || a.ordem - b.ordem;
      });
  }, [perguntas, categorias]);

  const pendentes = useMemo(() => perguntasOrdenadas.filter(p => {
    const k = p.campo_token ?? p.id;
    return respostas[k] === undefined || respostas[k] === "";
  }), [perguntasOrdenadas, respostas]);

  const totais = useMemo(() => {
    const acc = { implantacao: 0, mensal: 0, informativo: 0, total: 0 };
    itens.forEach(i => {
      const sub = i.quantidade * i.valor_unitario;
      acc[i.cobranca] += sub;
      acc.total += sub;
    });
    return acc;
  }, [itens]);

  function hidratarRascunho(r: PropostasRascunhoConversa, nomeCliente: string) {
    setRascunhoId(r.id);
    setMsgs(r.mensagens);
    setItens(r.itens);
    setRespostas(r.respostas);
    if (r.template_id) setTemplateId(r.template_id);
    // Restaura etapa e perguntas respondidas
    const et = (r.respostas as { __etapa?: Etapa }).__etapa;
    if (et && ETAPAS_ORDEM.includes(et)) setEtapa(et);
    const pr = (r.respostas as { __perguntas_respondidas?: string[] }).__perguntas_respondidas;
    if (Array.isArray(pr)) setPerguntasRespondidas(pr);
    setRetomado(true);
    toast.success(`Conversa de ${nomeCliente} retomada (${r.mensagens.length} msg, ${r.itens.length} item${r.itens.length !== 1 ? "s" : ""})`);
  }

  function iniciarConversa(nomeCliente: string) {
    const primeira = perguntasOrdenadas[0];
    const cat = primeira ? categorias.find(c => c.id === primeira.categoria_id) : null;
    setMsgs([{
      role: "assistant",
      content: `Olá! Vamos montar a proposta para **${nomeCliente}**. ${primeira ? `Começando por **${cat?.nome ?? "Contexto"}**:\n\n${primeira.pergunta}` : "Pode descrever o que o cliente precisa (ex.: \"switch 1300\")."}`,
    }]);
    setRetomado(true);
  }

  // Retomada via ?cliente= : carrega cliente + rascunho automaticamente
  useEffect(() => {
    if (!clienteParam || perguntasOrdenadas.length === 0) return;
    let cancelado = false;
    (async () => {
      try {
        const [lista, rascunho] = await Promise.all([
          buscarClientes(""),
          buscarRascunhoPorCliente(clienteParam),
        ]);
        if (cancelado) return;
        const cli = lista.find(c => c.id === clienteParam) ?? null;
        if (!cli) { toast.error("Cliente não encontrado"); return; }
        setClienteSel(cli);
        setModalCliente(false);
        if (rascunho) hidratarRascunho(rascunho, cli.nome);
        else iniciarConversa(cli.nome);
      } catch (e) { console.error(e); }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteParam, perguntasOrdenadas.length]);

  // Auto-save com debounce (inclui etapa + perguntasRespondidas dentro de respostas)
  useEffect(() => {
    if (!clienteSel || !retomado || gerando) return;
    const t = setTimeout(() => {
      const respostasComEstado = {
        ...respostas,
        __etapa: etapa,
        __perguntas_respondidas: perguntasRespondidas,
      };
      salvarRascunho({
        cliente_id: clienteSel.id,
        cliente_nome: clienteSel.nome,
        template_id: templateId || null,
        mensagens: msgs,
        itens,
        respostas: respostasComEstado,
        estado_proposta: {
          etapa_atual: etapa,
          itens,
          perguntas_respondidas: perguntasRespondidas,
          totais,
        },
        finalizado: false,
      }).then(r => setRascunhoId(r.id)).catch(e => console.error("auto-save", e));
    }, 800);
    return () => clearTimeout(t);
  }, [clienteSel, retomado, gerando, templateId, msgs, itens, respostas, etapa, perguntasRespondidas, totais]);

  async function confirmarCliente() {
    if (!clienteSel) { toast.error("Selecione um cliente"); return; }
    setModalCliente(false);
    try {
      const r = await buscarRascunhoPorCliente(clienteSel.id);
      if (r) hidratarRascunho(r, clienteSel.nome);
      else iniciarConversa(clienteSel.nome);
    } catch (e) {
      console.error(e);
      iniciarConversa(clienteSel.nome);
    }
  }

  /** Processa fila de novos itens, perguntando sobre duplicatas um a um. */
  function processarFila(fila: ItemConv[], baseItens: ItemConv[]) {
    const restante = [...fila];
    let trabalho = [...baseItens];
    while (restante.length > 0) {
      const novo = restante.shift()!;
      const idx = trabalho.findIndex(x => normalize(x.nome) === normalize(novo.nome));
      if (idx >= 0) {
        // Pausa para decisão do usuário
        setItens(trabalho);
        setDuplicata({ existenteIdx: idx, novo, fila: restante });
        return;
      }
      trabalho.push(novo);
    }
    setItens(trabalho);
    setDuplicata(null);
  }

  function resolverDuplicata(acao: "incrementar" | "atualizar" | "nova" | "ignorar") {
    if (!duplicata) return;
    const { existenteIdx, novo, fila } = duplicata;
    setItens(prev => {
      const arr = [...prev];
      if (acao === "incrementar") {
        arr[existenteIdx] = { ...arr[existenteIdx], quantidade: arr[existenteIdx].quantidade + novo.quantidade };
      } else if (acao === "atualizar") {
        arr[existenteIdx] = { ...arr[existenteIdx], quantidade: novo.quantidade, valor_unitario: novo.valor_unitario, cobranca: novo.cobranca };
      } else if (acao === "nova") {
        arr.push(novo);
      }
      // continua a fila
      setTimeout(() => processarFila(fila, arr), 0);
      return arr;
    });
    setDuplicata(null);
  }

  function avancarEtapa(prox?: Etapa) {
    setEtapa(prev => {
      if (prox && ETAPAS_ORDEM.includes(prox)) return prox;
      const idx = ETAPAS_ORDEM.indexOf(prev);
      return ETAPAS_ORDEM[Math.min(idx + 1, ETAPAS_ORDEM.length - 1)];
    });
  }

  async function enviar() {
    if (!input.trim() || enviando) return;
    const texto = input.trim();
    setInput("");

    const novaMsg: Msg = { role: "user", content: texto };
    const novoHistorico = [...msgs, novaMsg];
    setMsgs(novoHistorico);

    // Marca a próxima pergunta pendente como respondida (texto normalizado)
    const proxima = pendentes[0];
    let novasRespondidas = perguntasRespondidas;
    if (proxima) {
      const k = proxima.campo_token ?? proxima.id;
      setRespostas(r => ({ ...r, [k]: texto }));
      const norm = proxima.pergunta.trim().toLowerCase();
      if (!perguntasRespondidas.includes(norm)) {
        novasRespondidas = [...perguntasRespondidas, norm];
        setPerguntasRespondidas(novasRespondidas);
      }
    }

    setEnviando(true);
    try {
      const cat = categorias.filter(c => c.ativo).map(c => ({ codigo: c.codigo, nome: c.nome, cobranca_padrao: c.cobranca_padrao }));
      const pend = pendentes.slice(1, 6).map(p => ({
        categoria: categorias.find(c => c.id === p.categoria_id)?.codigo ?? "",
        pergunta: p.pergunta,
        campo_token: p.campo_token ?? undefined,
        tipo: p.tipo,
        opcoes: p.opcoes ?? undefined,
      }));

      // === Estado da proposta (frontend = fonte da verdade) ===
      const estadoProposta = {
        etapa_atual: etapa,
        itens: itens.map(i => ({
          nome: i.nome, quantidade: i.quantidade, valor: i.valor_unitario,
          cobranca: i.cobranca, categoria: i.categoria,
        })),
        perguntas_respondidas: novasRespondidas,
        totais: {
          implantacao: totais.implantacao,
          mensal: totais.mensal,
          informativo: totais.informativo,
        },
      };

      const { data, error } = await supabase.functions.invoke("propostas-conversacional", {
        body: {
          template_id: templateId || undefined, // Etapa 4: ativa execução de fluxo se houver registros
          messages: novoHistorico,
          contexto: {
            cliente_nome: clienteSel?.nome,
            categorias: cat,
            perguntas_pendentes: pend,
            respostas,
            empresa: empresa ? {
              nome_empresa: empresa.nome_empresa ?? undefined,
              descricao_operacional: empresa.descricao_operacional ?? undefined,
              o_que_vendemos: empresa.o_que_vendemos,
              o_que_nao_vendemos: empresa.o_que_nao_vendemos,
              tipo_ambiente: empresa.tipo_ambiente,
              regras_tecnicas: empresa.regras_tecnicas,
            } : null,
            catalogo: catalogo.filter(p => p.ativo).slice(0, 80).map(p => ({
              id: (p as unknown as { id?: string }).id,
              nome: p.nome,
              categoria: (p as unknown as { categoria?: string }).categoria,
              valor_minimo: Number(p.valor_minimo),
              valor_medio: Number((p as unknown as { valor_medio?: number }).valor_medio ?? p.valor_minimo),
              valor_padrao: Number((p as unknown as { valor_padrao?: number }).valor_padrao ?? 0),
              unidade: p.unidade,
              cobranca_padrao: (p as unknown as { cobranca_padrao?: string }).cobranca_padrao,
              campo_template: (p as unknown as { campo_template?: string | null }).campo_template ?? null,
              tipo_input: (p as unknown as { tipo_input?: string }).tipo_input,
            })),
            perguntas_produtos: perguntasProd.map(q => ({ categoria: q.categoria, pergunta: q.pergunta })),
            estado_proposta: estadoProposta,
          },
        },
      });
      if (error) throw error;

      const resp = data as {
        message?: string; mensagem?: string;
        actions?: IAAction[];
        produtos?: Array<{ nome: string; quantidade?: number; valor_unitario?: number; cobranca?: string; categoria?: string }>;
        finalizado?: boolean;
        error?: string;
        // Etapa 4
        fluxo_executado?: boolean;
        tokens_preenchidos?: Record<string, string>;
        bloco_atual?: string | null;
        fluxo_log?: { etapas_executadas: unknown[]; respostas_geradas: unknown[]; blocos_liberados: string[] };
      };
      if (resp.error) { toast.error(resp.error); return; }

      // Etapa 4: aplicar tokens preenchidos pela IA via fluxo
      if (resp.fluxo_executado && resp.tokens_preenchidos) {
        const novos = resp.tokens_preenchidos;
        if (Object.keys(novos).length > 0) {
          setRespostas(r => ({ ...r, ...novos }));
          console.log("[fluxo] tokens preenchidos pela IA:", Object.keys(novos));
          toast.success(`Fluxo executado: ${Object.keys(novos).length} campo(s) preenchido(s) automaticamente.`);
        }
        if (resp.bloco_atual) {
          console.log("[fluxo] bloco atual liberado:", resp.bloco_atual);
        }
      }

      const message = resp.message ?? resp.mensagem ?? "…";
      setMsgs(m => [...m, { role: "assistant", content: message }]);

      // === Processa actions[] (preferencial) ===
      const actions: IAAction[] = Array.isArray(resp.actions) ? resp.actions : [];
      const novosItens: ItemConv[] = [];

      for (const a of actions) {
        if (a.type === "add_item" && a.item?.nome) {
          novosItens.push({
            nome: String(a.item.nome),
            quantidade: Number(a.item.quantidade ?? 1),
            valor_unitario: Number(a.item.valor ?? 0),
            cobranca: (a.item.cobranca as PropostasCobranca) ?? "mensal",
            categoria: a.item.categoria,
          });
        } else if (a.type === "update_item") {
          // Aplica update no item correspondente (match por nome normalizado)
          const alvoNome = normalize(String(a.match?.nome ?? ""));
          if (!alvoNome) continue;
          setItens(arr => arr.map(it => {
            if (normalize(it.nome) !== alvoNome) return it;
            const u = a.updates ?? {};
            return {
              ...it,
              quantidade: u.quantidade !== undefined ? Number(u.quantidade) : it.quantidade,
              valor_unitario: u.valor !== undefined ? Number(u.valor) : it.valor_unitario,
              cobranca: (u.cobranca as PropostasCobranca) ?? it.cobranca,
            };
          }));
        } else if (a.type === "next_step") {
          avancarEtapa(a.proxima_etapa);
        } else if (a.type === "finalizar") {
          setFinalizado(true);
        }
        // Mensagem de validação (preço abaixo do mínimo, etc.)
        if (a.validacao && a.validacao.ok === false) {
          toast.error(a.validacao.mensagem);
        }
      }

      // === Fallback: se não veio actions mas veio produtos[] (compat) ===
      if (novosItens.length === 0 && resp.produtos?.length) {
        for (const p of resp.produtos) {
          if (!p.nome) continue;
          novosItens.push({
            nome: String(p.nome),
            quantidade: Number(p.quantidade ?? 1),
            valor_unitario: Number(p.valor_unitario ?? 0),
            cobranca: (p.cobranca as PropostasCobranca) ?? "mensal",
            categoria: p.categoria,
          });
        }
      }

      if (novosItens.length) {
        // Catálogo (ia_sugerido) — silencioso
        for (const p of novosItens) {
          try {
            await criarProdutoSugerido({
              nome: p.nome, tipo: "produto",
              valor_minimo: p.valor_unitario, tipo_calculo: "quantidade", unidade: "un",
            });
          } catch { /* duplicado */ }
        }
        // Detecta duplicatas (um a um) — UI é dona da reconciliação
        processarFila(novosItens, itens);
      }

      if (resp.finalizado) setFinalizado(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro na conversa");
    } finally {
      setEnviando(false);
    }
  }

  function atualizarItem<K extends keyof ItemConv>(idx: number, campo: K, valor: ItemConv[K]) {
    setItens(arr => arr.map((it, i) => i === idx ? { ...it, [campo]: valor } : it));
  }

  function adicionarLinhaManual() {
    setItens(arr => [...arr, { nome: "Novo item", quantidade: 1, valor_unitario: 0, cobranca: "mensal" }]);
  }

  async function gerarProposta() {
    if (!clienteSel || !templateId) { toast.error("Selecione cliente e template"); return; }
    setGerando(true);
    try {
      const tpl = templates.find(t => t.id === templateId);
      if (!tpl) throw new Error("Template não encontrado");

      const dados: Record<string, unknown> = {
        ...respostas,
        cliente_nome: clienteSel.nome,
        cliente_cpf: clienteSel.cpf ?? "",
        cliente_cidade: clienteSel.cidade ?? "",
        data_emissao: new Date().toLocaleDateString("pt-BR"),
        valor_total: fmtBRL(totais.total),
        valor_implantacao: fmtBRL(totais.implantacao),
        valor_mensal: fmtBRL(totais.mensal),
      };

      const html = propostasRenderizarTemplate(tpl.conteudo_html, dados);

      const proposta = await criarProposta({
        cliente_id: clienteSel.id,
        template_id: templateId,
        conteudo_original: html,
        conteudo_editado: html,
        valor_total: totais.total,
        validade: null,
        itens: itens.map(i => ({
          descricao: i.nome,
          quantidade: i.quantidade,
          unidade: "un",
          valor_unitario: i.valor_unitario,
          valor_total: i.quantidade * i.valor_unitario,
          cobranca: i.cobranca,
          categoria: i.categoria,
        } as unknown as {
          descricao: string; quantidade: number; unidade: string;
          valor_unitario: number; valor_total: number;
        })),
      });

      // Remove rascunho ao concluir
      if (rascunhoId) {
        try { await excluirRascunho(rascunhoId); } catch (e) { console.error(e); }
      }
      toast.success("Proposta gerada");
      navigate(`/propostas/${proposta.id}/preview`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar");
    } finally {
      setGerando(false);
    }
  }

  // Modal cliente
  if (modalCliente) {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) navigate("/propostas/nova"); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecione o cliente</DialogTitle>
            <DialogDescription>O modo conversacional começa pela escolha do cliente.</DialogDescription>
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
              <Button onClick={confirmarCliente} disabled={!clienteSel}>Continuar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="p-4 mx-auto max-w-[1600px] h-[calc(100vh-6rem)] flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> Proposta Conversacional
        </h1>
        <div className="flex gap-2 items-center">
          <Badge variant="outline">Cliente: {clienteSel?.nome}</Badge>
          <Badge variant="default" className="capitalize">Etapa: {etapa}</Badge>
          {rascunhoId && <Badge variant="secondary" className="text-xs">Auto-salvo</Badge>}
          <select className="border rounded-md p-1.5 text-sm bg-background"
            value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Selecione template…</option>
            {templates.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <Button variant="ghost" size="sm" onClick={() => navigate("/propostas/nova")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Sair
          </Button>
          {rascunhoId && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
              onClick={async () => {
                if (!confirm("Cancelar e descartar esta conversa?")) return;
                try { await excluirRascunho(rascunhoId); toast.success("Conversa descartada"); navigate("/propostas/nova"); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
              }}>
              <Trash2 className="w-4 h-4 mr-1" /> Cancelar
            </Button>
          )}
        </div>
      </div>

      {/* Split 40/60 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 flex-1 min-h-0">
        {/* CHAT — 40% */}
        <Card className="lg:col-span-2 flex flex-col min-h-0">
          <CardHeader className="py-2 border-b"><CardTitle className="text-sm">Conversa</CardTitle></CardHeader>
          <CardContent className="flex-1 overflow-auto p-3 space-y-3">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {enviando && <div className="text-xs text-muted-foreground">IA digitando…</div>}
            <div ref={fim} />
          </CardContent>
          <div className="border-t p-2 flex gap-2">
            <Input
              placeholder='Ex.: "switch 1300", "rack 800 implantação"…'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              disabled={enviando}
            />
            <Button onClick={enviar} disabled={enviando || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        {/* PLANILHA VIVA — 60% */}
        <Card className="lg:col-span-3 flex flex-col min-h-0">
          <CardHeader className="py-2 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Planilha viva ({itens.length} item{itens.length !== 1 ? "s" : ""})</CardTitle>
            <Button size="sm" variant="outline" onClick={adicionarLinhaManual}>
              <Plus className="w-3 h-3 mr-1" /> Linha
            </Button>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="text-left">
                  <th className="p-2 font-medium w-28">Categoria</th>
                  <th className="p-2 font-medium">Item</th>
                  <th className="p-2 font-medium w-16 text-right">Qtd</th>
                  <th className="p-2 font-medium w-32">Cobrança</th>
                  <th className="p-2 font-medium w-32 text-right">Valor unit.</th>
                  <th className="p-2 font-medium w-32 text-right">Subtotal</th>
                  <th className="p-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-xs">
                    Descreva produtos no chat (ex.: <i>"switch 1300"</i>) e eles aparecerão aqui.
                  </td></tr>
                )}
                {itens.map((it, i) => {
                  const subtotal = it.quantidade * it.valor_unitario;
                  return (
                    <tr key={i} className="border-t hover:bg-muted/30">
                      <td className="p-1">
                        <input className="w-full bg-transparent px-1 py-1 text-xs rounded focus:bg-background focus:outline-ring focus:ring-1"
                          value={it.categoria ?? ""} placeholder="—"
                          onChange={(e) => atualizarItem(i, "categoria", e.target.value)} />
                      </td>
                      <td className="p-1">
                        <input className="w-full bg-transparent px-1 py-1 rounded focus:bg-background focus:outline-ring focus:ring-1"
                          value={it.nome}
                          onChange={(e) => atualizarItem(i, "nome", e.target.value)} />
                      </td>
                      <td className="p-1">
                        <input type="number" min={1} className="w-full bg-transparent px-1 py-1 text-right rounded focus:bg-background focus:outline-ring focus:ring-1"
                          value={it.quantidade}
                          onChange={(e) => atualizarItem(i, "quantidade", Math.max(1, Number(e.target.value) || 1))} />
                      </td>
                      <td className="p-1">
                        <select className="w-full bg-transparent px-1 py-1 rounded text-xs focus:bg-background focus:outline-ring focus:ring-1"
                          value={it.cobranca}
                          onChange={(e) => atualizarItem(i, "cobranca", e.target.value as PropostasCobranca)}>
                          {COBRANCAS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="p-1">
                        <input type="number" min={0} step="0.01" className="w-full bg-transparent px-1 py-1 text-right rounded focus:bg-background focus:outline-ring focus:ring-1"
                          value={it.valor_unitario}
                          onChange={(e) => atualizarItem(i, "valor_unitario", Math.max(0, Number(e.target.value) || 0))} />
                      </td>
                      <td className="p-2 text-right tabular-nums font-medium">{fmtBRL(subtotal)}</td>
                      <td className="p-1 text-center">
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setItens(arr => arr.filter((_, k) => k !== i))}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>

          {/* Rodapé com totais */}
          <div className="border-t p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-muted/20">
            <div>
              <div className="text-xs text-muted-foreground">Investimento (implantação)</div>
              <div className="font-bold tabular-nums">{fmtBRL(totais.implantacao)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Mensal</div>
              <div className="font-bold tabular-nums">{fmtBRL(totais.mensal)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Informativo</div>
              <div className="font-bold tabular-nums">{fmtBRL(totais.informativo)}</div>
            </div>
            <div className="flex items-end justify-end">
              <Button onClick={gerarProposta} disabled={!templateId || itens.length === 0 || gerando}>
                <Save className="w-4 h-4 mr-2" />{gerando ? "Gerando…" : `Gerar proposta${finalizado ? " ✓" : ""}`}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Modal duplicata */}
      <Dialog open={!!duplicata} onOpenChange={(o) => { if (!o) resolverDuplicata("ignorar"); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item já existe</DialogTitle>
            <DialogDescription>
              Já existe <b>{duplicata && itens[duplicata.existenteIdx]?.nome}</b> na planilha
              ({duplicata && itens[duplicata.existenteIdx]?.quantidade}× {duplicata && fmtBRL(itens[duplicata.existenteIdx]?.valor_unitario ?? 0)}).
              <br />Novo: <b>{duplicata?.novo.nome}</b> ({duplicata?.novo.quantidade}× {duplicata && fmtBRL(duplicata.novo.valor_unitario)}).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="ghost" onClick={() => resolverDuplicata("ignorar")}>Ignorar</Button>
            <Button variant="outline" onClick={() => resolverDuplicata("nova")}>Adicionar como novo</Button>
            <Button variant="outline" onClick={() => resolverDuplicata("atualizar")}>Atualizar valor/qtd</Button>
            <Button onClick={() => resolverDuplicata("incrementar")}>Somar quantidade</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
