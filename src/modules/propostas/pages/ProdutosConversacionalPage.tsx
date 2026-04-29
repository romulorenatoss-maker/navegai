import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Package, ListChecks, Building2, X, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listarProdutos, criarProduto, atualizarProduto, excluirProduto,
  type PropostasProduto,
} from "../services/propostasService";
import {
  obterContextoEmpresa, salvarContextoEmpresa,
  listarPerguntasProduto, criarPerguntaProduto, atualizarPerguntaProduto, excluirPerguntaProduto,
  type PropostasEmpresaContexto, type PropostasPerguntaProduto, type PropostasCategoria,
} from "../services/propostasContextoService";
import { listarCategorias, atualizarCategoria, type PropostasCategoriaSetup } from "../services/propostasPerguntasService";

interface Msg { role: "user" | "assistant"; content: string }
interface ProdutoSugerido {
  nome: string;
  categoria: PropostasCategoria | "outros";
  tipo: "produto" | "servico";
  cobranca_padrao: "implantacao" | "mensal" | "informativo";
  unidade: string;
  valor_minimo: number;
  valor_medio: number;
  descricao_padrao?: string;
}

const CATEGORIAS: Array<{ value: PropostasCategoria; label: string }> = [
  { value: "infraestrutura", label: "Infraestrutura" },
  { value: "dados", label: "Dados / Internet" },
  { value: "seguranca", label: "Segurança / CFTV" },
  { value: "telefonia", label: "Telefonia" },
];
const COBRANCAS = ["implantacao", "mensal", "informativo"] as const;
const TIPOS = ["produto", "servico"] as const;
type CategoriaCatalogo = PropostasCategoria | "outros";
type TipoCatalogo = typeof TIPOS[number];
type CobrancaCatalogo = typeof COBRANCAS[number];

const fmtBRL = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const normalizarTexto = (v?: string | null) => (v ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();
const normalizarCategoria = (v?: string | null): CategoriaCatalogo | "" => {
  const n = normalizarTexto(v).replace(/[^a-z0-9]+/g, " ").trim();
  if (!n) return "";
  if (n.includes("infra")) return "infraestrutura";
  if (n.includes("dado") || n.includes("internet") || n.includes("link")) return "dados";
  if (n.includes("segur") || n.includes("cftv") || n.includes("camera")) return "seguranca";
  if (n.includes("telefon") || n.includes("ramal") || n.includes("pabx")) return "telefonia";
  if (n.includes("outro")) return "outros";
  return "";
};
const isCategoriaCatalogo = (v: string): v is CategoriaCatalogo =>
  ["infraestrutura", "dados", "seguranca", "telefonia", "outros"].includes(v);
const normalizarTipo = (v?: string | null): TipoCatalogo | "" => {
  const n = normalizarTexto(v);
  if (n.includes("serv")) return "servico";
  if (n.includes("prod")) return "produto";
  return "";
};
const normalizarCobranca = (v?: string | null): CobrancaCatalogo | "" => {
  const n = normalizarTexto(v);
  if (n.includes("impl") || n.includes("instal")) return "implantacao";
  if (n.includes("mens") || n.includes("recorr")) return "mensal";
  if (n.includes("info")) return "informativo";
  return "";
};

// ---------- Editor de array (chips) ----------
function ChipsEditor({ label, values, onChange, placeholder }: {
  label: string; values: string[]; onChange: (next: string[]) => void; placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
        {values.map((v, i) => (
          <Badge key={`${v}-${i}`} variant="secondary" className="gap-1">
            {v}
            <button onClick={() => onChange(values.filter((_, idx) => idx !== i))} className="hover:text-destructive">
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onChange([...values, draft.trim()]);
              setDraft("");
            }
          }}
          placeholder={placeholder ?? "Adicionar e pressionar Enter"}
        />
      </div>
    </div>
  );
}

export default function ProdutosConversacionalPage() {
  const [tab, setTab] = useState<"contexto" | "produtos" | "perguntas">("contexto");

  // ============ DADOS ============
  const [empresa, setEmpresa] = useState<PropostasEmpresaContexto | null>(null);
  const [empresaDraft, setEmpresaDraft] = useState<Partial<PropostasEmpresaContexto>>({});
  const [salvandoEmp, setSalvandoEmp] = useState(false);

  const [produtos, setProdutos] = useState<PropostasProduto[]>([]);
  const [perguntas, setPerguntas] = useState<PropostasPerguntaProduto[]>([]);
  const [categoriasSetup, setCategoriasSetup] = useState<PropostasCategoriaSetup[]>([]);

  // Linhas em rascunho (ainda não salvas)
  type ProdutoDraft = {
    _key: string;
    nome: string;
    categoria: PropostasCategoria | "outros" | "";
    tipo: "produto" | "servico";
    cobranca_padrao: "implantacao" | "mensal" | "informativo";
    unidade: string;
    valor_minimo: number;
    valor_medio: number;
    placeholder_key?: string;
    placeholder_qtd?: string;
    placeholder_valor?: string;
    is_checkbox?: boolean;
  };
  const [drafts, setDrafts] = useState<ProdutoDraft[]>([]);
  const [salvandoDraft, setSalvandoDraft] = useState<string | null>(null);

  function novaLinhaDraft() {
    setDrafts(d => [
      {
        _key: crypto.randomUUID(),
        nome: "",
        categoria: "",
        tipo: "produto",
        cobranca_padrao: "mensal",
        unidade: "un",
        valor_minimo: 0,
        valor_medio: 0,
      },
      ...d,
    ]);
  }
  function patchDraft(key: string, patch: Partial<ProdutoDraft>) {
    setDrafts(ds => ds.map(d => d._key === key ? { ...d, ...patch } : d));
  }
  function removerDraft(key: string) {
    setDrafts(ds => ds.filter(d => d._key !== key));
  }
  async function salvarDraft(key: string) {
    const d = drafts.find(x => x._key === key);
    if (!d) return;
    if (!d.nome.trim()) { toast.error("Informe o nome"); return; }
    if (!d.categoria) { toast.error("Selecione a categoria"); return; }
    if (!d.valor_minimo || d.valor_minimo <= 0) { toast.error("Valor mínimo obrigatório"); return; }
    setSalvandoDraft(key);
    try {
      const novo = await criarProduto({
        nome: d.nome.trim(),
        tipo: d.tipo,
        unidade: d.unidade || "un",
        valor_minimo: Number(d.valor_minimo),
        ativo: true,
        tipo_calculo: "quantidade",
        categoria: d.categoria,
        valor_medio: Number(d.valor_medio) || Number(d.valor_minimo),
        cobranca_padrao: d.cobranca_padrao,
        origem: "manual",
        placeholder_key: d.placeholder_key || null,
        placeholder_qtd: d.placeholder_qtd || null,
        placeholder_valor: d.placeholder_valor || null,
        is_checkbox: d.is_checkbox ?? false,
      } as Partial<PropostasProduto>);
      setProdutos(ps => [novo, ...ps]);
      removerDraft(key);
      toast.success(`"${novo.nome}" cadastrado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setSalvandoDraft(null); }
  }


  // ============ CHAT ============
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: "Olá! Vamos organizar o catálogo de produtos da empresa. Me diga um item que você vende (ex: *switch 24 portas a R$1300* ou *câmera IP 350 cada*)." },
  ]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const catalogoTableScrollRef = useRef<HTMLDivElement>(null);
  const catalogoBottomScrollRef = useRef<HTMLDivElement>(null);
  const [catalogoScrollWidth, setCatalogoScrollWidth] = useState(0);

  // Nova pergunta padrão
  const [novaPergunta, setNovaPergunta] = useState<{ categoria: PropostasCategoria; pergunta: string }>({ categoria: "infraestrutura", pergunta: "" });

  // ============ LOADERS ============
  async function recarregar() {
    const [emp, prods, perg, cats] = await Promise.all([
      obterContextoEmpresa(),
      listarProdutos(),
      listarPerguntasProduto(),
      listarCategorias(),
    ]);
    setEmpresa(emp);
    setEmpresaDraft(emp ?? {});
    setProdutos(prods);
    setPerguntas(perg);
    setCategoriasSetup(cats);
  }

  useEffect(() => { recarregar().catch(e => toast.error(String(e))); }, []);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => {
    const atualizarLargura = () => {
      const el = catalogoTableScrollRef.current;
      if (el) setCatalogoScrollWidth(el.scrollWidth);
    };

    atualizarLargura();
    const el = catalogoTableScrollRef.current;
    if (!el) return;

    const observer = new ResizeObserver(atualizarLargura);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    window.addEventListener("resize", atualizarLargura);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", atualizarLargura);
    };
  }, [produtos.length, drafts.length, tab]);

  const sincronizarScrollCatalogo = (origem: "tabela" | "barra") => {
    const source = origem === "tabela" ? catalogoTableScrollRef.current : catalogoBottomScrollRef.current;
    const target = origem === "tabela" ? catalogoBottomScrollRef.current : catalogoTableScrollRef.current;
    if (!source || !target || target.scrollLeft === source.scrollLeft) return;
    target.scrollLeft = source.scrollLeft;
  };

  const categoriasCatalogo = useMemo<Array<{ value: CategoriaCatalogo; label: string }>>(() => {
    const ativas = categoriasSetup
      .filter(c => c.ativo && isCategoriaCatalogo(c.codigo) && c.codigo !== "outros")
      .map(c => ({ value: c.codigo as CategoriaCatalogo, label: c.nome }));
    return ativas.length ? ativas : CATEGORIAS;
  }, [categoriasSetup]);

  const perguntasPorCategoria = useMemo(() => {
    const map: Record<string, PropostasPerguntaProduto[]> = {};
    for (const p of perguntas) {
      (map[p.categoria] ??= []).push(p);
    }
    return map;
  }, [perguntas]);

  // ============ AÇÕES CONTEXTO ============
  async function salvarContexto() {
    setSalvandoEmp(true);
    try {
      const saved = await salvarContextoEmpresa(empresaDraft);
      setEmpresa(saved);
      toast.success("Contexto salvo");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setSalvandoEmp(false); }
  }

  // ============ AÇÕES PRODUTOS (inline) ============
  async function patchProduto(id: string, patch: Partial<PropostasProduto>) {
    try {
      await atualizarProduto(id, patch);
      setProdutos(ps => ps.map(p => p.id === id ? { ...p, ...patch } as PropostasProduto : p));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function definirCategoriaSetupAtiva(categoria: string, ativo: boolean) {
    const cat = categoriasSetup.find(c => normalizarCategoria(c.codigo) === normalizarCategoria(categoria));
    if (!cat || cat.ativo === ativo) return;
    setCategoriasSetup(cs => cs.map(c => c.id === cat.id ? { ...c, ativo } : c));
    await atualizarCategoria(cat.id, { ativo });
  }
  async function deletarProduto(id: string) {
    if (!confirm("Excluir este produto?")) return;
    try { await excluirProduto(id); setProdutos(ps => ps.filter(p => p.id !== id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function inserirSugerido(s: ProdutoSugerido) {
    try {
      const payload: Record<string, unknown> = {
        nome: s.nome,
        tipo: s.tipo,
        unidade: s.unidade || "un",
        valor_minimo: Number(s.valor_minimo) || 0,
        ativo: true,
        tipo_calculo: "quantidade",
        descricao_padrao: s.descricao_padrao ?? null,
        categoria: s.categoria,
        valor_medio: Number(s.valor_medio) || Number(s.valor_minimo) || 0,
        cobranca_padrao: s.cobranca_padrao,
        origem: "ia_sugerido",
      };
      const novo = await criarProduto(payload as Partial<PropostasProduto>);
      setProdutos(ps => [novo, ...ps]);
      toast.success(`"${novo.nome}" cadastrado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  }

  // ============ AÇÕES PERGUNTAS ============
  async function addPergunta() {
    if (!novaPergunta.pergunta.trim()) return;
    const ordem = (perguntasPorCategoria[novaPergunta.categoria]?.length ?? 0) + 1;
    try {
      const p = await criarPerguntaProduto({ ...novaPergunta, ordem, ativo: true });
      setPerguntas(qs => [...qs, p]);
      setNovaPergunta({ ...novaPergunta, pergunta: "" });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }
  async function togglePergunta(id: string, ativo: boolean) {
    try { await atualizarPerguntaProduto(id, { ativo }); setPerguntas(qs => qs.map(q => q.id === id ? { ...q, ativo } : q)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }
  async function deletarPergunta(id: string) {
    try { await excluirPerguntaProduto(id); setPerguntas(qs => qs.filter(q => q.id !== id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  // ============ CHAT ============
  async function enviar() {
    const texto = input.trim();
    if (!texto || enviando) return;
    setInput("");
    const novo = [...msgs, { role: "user" as const, content: texto }];
    setMsgs(novo);
    setEnviando(true);
    try {
        const catalogoAtual = produtos;
      const perguntasAtuais = perguntas;
      const { data, error } = await supabase.functions.invoke("propostas-produtos-conversa", {
        body: {
          messages: novo,
          contexto: {
            empresa: empresa ? {
              nome_empresa: empresa.nome_empresa,
              descricao_operacional: empresa.descricao_operacional,
              o_que_vendemos: empresa.o_que_vendemos,
              o_que_nao_vendemos: empresa.o_que_nao_vendemos,
              tipo_ambiente: empresa.tipo_ambiente,
              regras_tecnicas: empresa.regras_tecnicas,
            } : null,
            categorias_disponiveis: categoriasCatalogo.map(c => ({ codigo: c.value, nome: c.label })),
            tipos_disponiveis: TIPOS,
            cobrancas_disponiveis: COBRANCAS,
            catalogo: catalogoAtual.filter(p => p.ativo).map(p => ({
              id: p.id,
              nome: p.nome,
              categoria: (p as unknown as { categoria?: string }).categoria,
              tipo: p.tipo,
              valor_minimo: Number(p.valor_minimo),
              valor_medio: Number((p as unknown as { valor_medio?: number }).valor_medio ?? p.valor_minimo),
              unidade: p.unidade,
              cobranca_padrao: (p as unknown as { cobranca_padrao?: string }).cobranca_padrao,
            })),
            perguntas_padrao: perguntasAtuais.filter(q => q.ativo).map(q => ({ id: q.id, categoria: q.categoria, pergunta: q.pergunta })),
          },
        },
      });
      if (error) throw error;
      const resp = data as {
        mensagem: string;
        produtos: ProdutoSugerido[];
        fora_escopo: Array<{ nome: string }>;
        remover_produtos?: Array<{ id?: string; nome?: string }>;
        remover_perguntas?: Array<{ id: string }>;
        remover_categorias?: Array<{ categoria: string }>;
        remover_categorias_completa?: Array<{ categoria: string }>;
        criar_categorias?: Array<{ categoria: string }>;
        migrar_categorias?: Array<{ categoria_origem: string; categoria_destino: string; tipo?: string; cobranca_padrao?: string }>;
        error?: string;
      };
      if (resp.error) { toast.error(resp.error); return; }

      setMsgs(m => [...m, { role: "assistant", content: resp.mensagem || "…" }]);

      // Inserções
      if (resp.produtos?.length) {
        for (const sug of resp.produtos) {
          await inserirSugerido(sug);
        }
      }

      // Criação/ativação de categoria — reflete imediato
      if (resp.criar_categorias?.length) {
        for (const r of resp.criar_categorias) {
          const cat = normalizarCategoria(r.categoria);
          if (!cat || cat === "outros") { toast.error(`Categoria inválida: ${r.categoria}`); continue; }
          try {
            await definirCategoriaSetupAtiva(cat, true);
            toast.success(`Categoria "${cat}" ativada`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : `Erro ao criar categoria ${r.categoria}`);
          }
        }
      }

      // Remoções de produtos individuais
      if (resp.remover_produtos?.length) {
        for (const r of resp.remover_produtos) {
          const alvo = catalogoAtual.find(p => p.id === r.id)
            ?? catalogoAtual.find(p => normalizarTexto(p.nome) === normalizarTexto(r.nome));
          if (!alvo) {
            toast.error(`Produto não encontrado para remover: ${r.nome ?? r.id ?? "sem identificação"}`);
            continue;
          }
          try {
            setProdutos(ps => ps.filter(p => p.id !== alvo.id));
            await excluirProduto(alvo.id);
            toast.success(`Removido: ${alvo.nome}`);
          } catch (e) {
            setProdutos(catalogoAtual);
            toast.error(e instanceof Error ? e.message : "Erro ao remover produto");
          }
        }
      }

      // Migração de produtos de uma categoria antes de remover a categoria antiga do catálogo
      if (resp.migrar_categorias?.length) {
        for (const r of resp.migrar_categorias) {
          const origem = normalizarCategoria(r.categoria_origem);
          const destino = normalizarCategoria(r.categoria_destino);
          const tipo = normalizarTipo(r.tipo);
          const cobranca = normalizarCobranca(r.cobranca_padrao);
          if (!origem || !destino || !isCategoriaCatalogo(destino) || !tipo || !cobranca) {
            toast.error("Migração incompleta: informe categoria destino, tipo e cobrança.");
            continue;
          }
          const prodsDaCat = catalogoAtual.filter(p => normalizarCategoria((p as unknown as { categoria?: string }).categoria) === origem);
          const pergsDaCat = perguntasAtuais.filter(q => normalizarCategoria(q.categoria) === origem);
          if (!prodsDaCat.length && !pergsDaCat.length) {
            toast.info(`Nada encontrado em ${r.categoria_origem}.`);
            continue;
          }
          const patch = { categoria: destino, tipo, cobranca_padrao: cobranca } as Partial<PropostasProduto>;
          try {
            setProdutos(ps => ps.map(p => prodsDaCat.some(alvo => alvo.id === p.id) ? { ...p, ...patch } as PropostasProduto : p));
            if (origem !== "outros") setPerguntas(qs => qs.filter(q => normalizarCategoria(q.categoria) !== origem));
            await Promise.all([
              ...prodsDaCat.map(p => atualizarProduto(p.id, patch)),
              ...(origem !== "outros" ? pergsDaCat.map(q => excluirPerguntaProduto(q.id)) : []),
            ]);
            await definirCategoriaSetupAtiva(destino, true);
            if (origem !== "outros") await definirCategoriaSetupAtiva(origem, false);
            toast.success(`Categoria "${r.categoria_origem}" migrada para "${destino}" (${prodsDaCat.length} produto(s))`);
          } catch (e) {
            setProdutos(catalogoAtual);
            setPerguntas(perguntasAtuais);
            toast.error(e instanceof Error ? e.message : `Erro ao migrar categoria ${r.categoria_origem}`);
          }
        }
      }

      // Remoções de perguntas individuais
      if (resp.remover_perguntas?.length) {
        for (const r of resp.remover_perguntas) {
          try {
            setPerguntas(qs => qs.filter(q => q.id !== r.id));
            await excluirPerguntaProduto(r.id);
          } catch (e) {
            setPerguntas(perguntasAtuais);
            toast.error(e instanceof Error ? e.message : "Erro ao remover pergunta");
          }
        }
      }

      // Remoção em massa por categoria: só remove direto quando não há produto vinculado.
      // Se houver produto, o backend deve pedir migração e só depois emitir migrar_categoria.
      if (resp.remover_categorias?.length) {
        for (const r of resp.remover_categorias) {
          const cat = normalizarCategoria(r.categoria);
          if (!cat) { toast.error(`Categoria inválida: ${r.categoria}`); continue; }
          const prodsDaCat = catalogoAtual.filter(p => normalizarCategoria((p as unknown as { categoria?: string }).categoria) === cat);
          const pergsDaCat = perguntasAtuais.filter(q => normalizarCategoria(q.categoria) === cat);
          if (prodsDaCat.length) {
            setMsgs(m => [...m, { role: "assistant", content: `Antes de remover **${r.categoria}**, preciso migrar ${prodsDaCat.length} produto(s). Para qual **categoria**, **tipo** e **cobrança** eles devem ir?` }]);
            continue;
          }
          try {
            if (cat !== "outros") setPerguntas(qs => qs.filter(q => normalizarCategoria(q.categoria) !== cat));
            await Promise.all(cat !== "outros" ? pergsDaCat.map(q => excluirPerguntaProduto(q.id)) : []);
            if (cat !== "outros") await definirCategoriaSetupAtiva(cat, false);
            toast.success(`Categoria "${r.categoria}" removida (${pergsDaCat.length} pergunta(s))`);
          } catch (e) {
            setPerguntas(perguntasAtuais);
            toast.error(e instanceof Error ? e.message : `Erro ao remover categoria ${r.categoria}`);
          }
        }
      }

      // Remoção COMPLETA: apaga produtos + perguntas vinculados e desativa a categoria.
      // Aviso é dado pela IA na rodada anterior — aqui só executa quando o usuário confirmou.
      if (resp.remover_categorias_completa?.length) {
        for (const r of resp.remover_categorias_completa) {
          const cat = normalizarCategoria(r.categoria);
          if (!cat) { toast.error(`Categoria inválida: ${r.categoria}`); continue; }
          const prodsDaCat = catalogoAtual.filter(p => normalizarCategoria((p as unknown as { categoria?: string }).categoria) === cat);
          const pergsDaCat = perguntasAtuais.filter(q => normalizarCategoria(q.categoria) === cat);
          try {
            setProdutos(ps => ps.filter(p => normalizarCategoria((p as unknown as { categoria?: string }).categoria) !== cat));
            if (cat !== "outros") setPerguntas(qs => qs.filter(q => normalizarCategoria(q.categoria) !== cat));
            await Promise.all([
              ...prodsDaCat.map(p => excluirProduto(p.id)),
              ...(cat !== "outros" ? pergsDaCat.map(q => excluirPerguntaProduto(q.id)) : []),
            ]);
            if (cat !== "outros") await definirCategoriaSetupAtiva(cat, false);
            toast.success(`Categoria "${cat}" removida (${prodsDaCat.length} produto(s) e ${pergsDaCat.length} pergunta(s))`);
          } catch (e) {
            setProdutos(catalogoAtual);
            setPerguntas(perguntasAtuais);
            toast.error(e instanceof Error ? e.message : `Erro ao remover categoria ${r.categoria}`);
          }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setEnviando(false); }
  }

  // ============ RENDER ============
  return (
    <div className="h-[calc(100vh-4rem)] overflow-y-auto p-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="mb-4">
                <TabsTrigger value="contexto"><Building2 className="w-4 h-4 mr-1" />Contexto</TabsTrigger>
                <TabsTrigger value="produtos"><Package className="w-4 h-4 mr-1" />Produtos ({produtos.length})</TabsTrigger>
                <TabsTrigger value="perguntas"><ListChecks className="w-4 h-4 mr-1" />Perguntas ({perguntas.length})</TabsTrigger>
              </TabsList>

              {/* CONTEXTO */}
              <TabsContent value="contexto" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Contexto da empresa</CardTitle>
                    <p className="text-xs text-muted-foreground">Esta informação é usada pela IA para validar o escopo de qualquer proposta.</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Nome da empresa</Label>
                        <Input value={empresaDraft.nome_empresa ?? ""} onChange={(e) => setEmpresaDraft({ ...empresaDraft, nome_empresa: e.target.value })} />
                      </div>
                      <div className="flex items-end">
                        <div className="flex items-center gap-2">
                          <Switch checked={empresaDraft.ativo ?? true} onCheckedChange={(v) => setEmpresaDraft({ ...empresaDraft, ativo: v })} />
                          <Label className="!mb-0 text-sm">Ativo</Label>
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Quem somos / Descrição operacional</Label>
                      <Textarea rows={3} value={empresaDraft.descricao_operacional ?? ""} onChange={(e) => setEmpresaDraft({ ...empresaDraft, descricao_operacional: e.target.value })} />
                    </div>
                    <ChipsEditor label="O que vendemos" values={empresaDraft.o_que_vendemos ?? []} onChange={(v) => setEmpresaDraft({ ...empresaDraft, o_que_vendemos: v })} placeholder="Ex: rede corporativa" />
                    <ChipsEditor label="O que NÃO vendemos" values={empresaDraft.o_que_nao_vendemos ?? []} onChange={(v) => setEmpresaDraft({ ...empresaDraft, o_que_nao_vendemos: v })} placeholder="Ex: computadores" />
                    <ChipsEditor label="Tipo de ambiente" values={empresaDraft.tipo_ambiente ?? []} onChange={(v) => setEmpresaDraft({ ...empresaDraft, tipo_ambiente: v })} placeholder="Ex: industrial" />
                    <ChipsEditor label="Regras técnicas" values={empresaDraft.regras_tecnicas ?? []} onChange={(v) => setEmpresaDraft({ ...empresaDraft, regras_tecnicas: v })} placeholder="Ex: proteção contra corrosão" />
                    <Button onClick={salvarContexto} disabled={salvandoEmp}>
                      <Save className="w-4 h-4 mr-2" /> Salvar contexto
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* PRODUTOS */}
              <TabsContent value="produtos">
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">Catálogo (edição inline)</CardTitle>
                      <p className="text-xs text-muted-foreground">Adicione novos via conversa à esquerda ou diretamente aqui.</p>
                    </div>
                    <Button size="sm" onClick={novaLinhaDraft}>
                      <Plus className="w-4 h-4 mr-1" /> Adicionar linha
                    </Button>
                  </CardHeader>
                    <CardContent className="relative pb-9">
                    {produtos.length === 0 && drafts.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">Nenhum produto. Use a conversa ou clique em "Adicionar linha".</p>
                    ) : (
                      <>
                      <div
                        ref={catalogoTableScrollRef}
                        onScroll={() => sincronizarScrollCatalogo("tabela")}
                        className="overflow-y-auto overflow-x-hidden max-h-[calc(100vh-300px)] border rounded-md"
                      >
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Cobrança</TableHead>
                            <TableHead>Unidade</TableHead>
                            <TableHead className="text-right" title="Valor mínimo aceito de venda (piso). A IA nunca sugere abaixo disso.">Valor mín. (R$)</TableHead>
                            <TableHead className="text-right" title="Valor médio praticado. Usado pela IA como sugestão padrão na proposta.">Valor médio (R$)</TableHead>
                            <TableHead>Placeholder item</TableHead>
                            <TableHead>Placeholder qtd</TableHead>
                            <TableHead>Placeholder valor</TableHead>
                            <TableHead className="text-center">Checkbox?</TableHead>
                            <TableHead className="w-20" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {/* Linhas em rascunho (não salvas) */}
                          {drafts.map(d => (
                            <TableRow key={d._key} className="bg-primary/5">
                              <TableCell>
                                <Input autoFocus className="h-8 min-w-[160px]" placeholder="Nome do item"
                                  value={d.nome} onChange={(e) => patchDraft(d._key, { nome: e.target.value })} />
                              </TableCell>
                              <TableCell>
                                <Select value={d.categoria || undefined} onValueChange={(v) => patchDraft(d._key, { categoria: v as ProdutoDraft["categoria"] })}>
                                  <SelectTrigger className="h-8 w-36"><SelectValue placeholder="—" /></SelectTrigger>
                                  <SelectContent>
                                    {categoriasCatalogo.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                    <SelectItem value="outros">Outros</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select value={d.tipo} onValueChange={(v) => patchDraft(d._key, { tipo: v as ProdutoDraft["tipo"] })}>
                                  <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                                  <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select value={d.cobranca_padrao} onValueChange={(v) => patchDraft(d._key, { cobranca_padrao: v as ProdutoDraft["cobranca_padrao"] })}>
                                  <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                                  <SelectContent>{COBRANCAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input className="h-8 w-20" value={d.unidade} onChange={(e) => patchDraft(d._key, { unidade: e.target.value })} />
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                                  <Input type="number" step="0.01" min="0" className="h-8 w-28 pl-8 text-right"
                                    value={d.valor_minimo || ""} onChange={(e) => patchDraft(d._key, { valor_minimo: Number(e.target.value) })} />
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                                  <Input type="number" step="0.01" min="0" className="h-8 w-28 pl-8 text-right"
                                    value={d.valor_medio || ""} onChange={(e) => patchDraft(d._key, { valor_medio: Number(e.target.value) })} />
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input className="h-7 text-xs w-28 font-mono" placeholder="{item_switch}"
                                  value={d.placeholder_key ?? ""} onChange={(e) => patchDraft(d._key, { placeholder_key: e.target.value })} />
                              </TableCell>
                              <TableCell>
                                <Input className="h-7 text-xs w-24 font-mono" placeholder="{qtd_switch}"
                                  value={d.placeholder_qtd ?? ""} onChange={(e) => patchDraft(d._key, { placeholder_qtd: e.target.value })} />
                              </TableCell>
                              <TableCell>
                                <Input className="h-7 text-xs w-24 font-mono" placeholder="{valor_switch}"
                                  value={d.placeholder_valor ?? ""} onChange={(e) => patchDraft(d._key, { placeholder_valor: e.target.value })} />
                              </TableCell>
                              <TableCell className="text-center">
                                <input
                                  type="checkbox"
                                  checked={d.is_checkbox ?? false}
                                  onChange={(e) => patchDraft(d._key, { is_checkbox: e.target.checked })}
                                  className="w-4 h-4 accent-primary"
                                  title="Marcar (x) na proposta quando selecionado"
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button variant="default" size="icon" className="h-7 w-7" title="Salvar"
                                    disabled={salvandoDraft === d._key} onClick={() => salvarDraft(d._key)}>
                                    {salvandoDraft === d._key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Descartar"
                                    onClick={() => removerDraft(d._key)}>
                                    <X className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {produtos.map(p => {
                            const ext = p as unknown as { categoria?: string; cobranca_padrao?: string; valor_medio?: number };
                            return (
                              <TableRow key={p.id}>
                                <TableCell>
                                  <Input className="h-8 min-w-[160px]" defaultValue={p.nome} onBlur={(e) => e.target.value !== p.nome && patchProduto(p.id, { nome: e.target.value })} />
                                </TableCell>
                                <TableCell>
                                  <Select defaultValue={ext.categoria ?? ""} onValueChange={(v) => patchProduto(p.id, { categoria: v } as never)}>
                                    <SelectTrigger className="h-8 w-36"><SelectValue placeholder="—" /></SelectTrigger>
                                    <SelectContent>
                                      {categoriasCatalogo.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                      <SelectItem value="outros">Outros</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Select defaultValue={p.tipo} onValueChange={(v) => patchProduto(p.id, { tipo: v as typeof TIPOS[number] })}>
                                    <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                                    <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Select defaultValue={ext.cobranca_padrao ?? "mensal"} onValueChange={(v) => patchProduto(p.id, { cobranca_padrao: v } as never)}>
                                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                                    <SelectContent>{COBRANCAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Input className="h-8 w-20" defaultValue={p.unidade} onBlur={(e) => e.target.value !== p.unidade && patchProduto(p.id, { unidade: e.target.value })} />
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                                    <Input type="number" step="0.01" min="0" className="h-8 w-28 pl-8 text-right" defaultValue={p.valor_minimo}
                                      onBlur={(e) => Number(e.target.value) !== p.valor_minimo && patchProduto(p.id, { valor_minimo: Number(e.target.value) })} />
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">R$</span>
                                    <Input type="number" step="0.01" min="0" className="h-8 w-28 pl-8 text-right" defaultValue={ext.valor_medio ?? 0}
                                      onBlur={(e) => Number(e.target.value) !== (ext.valor_medio ?? 0) && patchProduto(p.id, { valor_medio: Number(e.target.value) } as never)} />
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletarProduto(p.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      </div>
                      <div
                        ref={catalogoBottomScrollRef}
                        onScroll={() => sincronizarScrollCatalogo("barra")}
                        className="absolute inset-x-6 bottom-3 overflow-x-auto overflow-y-hidden h-5"
                      >
                        <div style={{ width: catalogoScrollWidth, height: 1 }} />
                      </div>
                      </>
                    )}
                    <div className="flex gap-2 mt-3 text-xs text-muted-foreground">
                      <span>Total: {produtos.length}</span>
                      <span>•</span>
                      <span>Médio: {fmtBRL(produtos.reduce((s, p) => s + Number((p as unknown as { valor_medio?: number }).valor_medio ?? 0), 0))}</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* PERGUNTAS */}
              <TabsContent value="perguntas" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Perguntas padrão por categoria</CardTitle>
                    <p className="text-xs text-muted-foreground">A IA usa estas perguntas durante a conversa de proposta.</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2 items-end p-3 border rounded-md bg-muted/40">
                      <div className="w-44">
                        <Label className="text-xs">Categoria</Label>
                        <Select value={novaPergunta.categoria} onValueChange={(v) => setNovaPergunta({ ...novaPergunta, categoria: v as PropostasCategoria })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>{categoriasCatalogo.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">Pergunta</Label>
                        <Input value={novaPergunta.pergunta} onChange={(e) => setNovaPergunta({ ...novaPergunta, pergunta: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && addPergunta()} placeholder="Ex: Vai precisar de rack?" />
                      </div>
                      <Button onClick={addPergunta}><Plus className="w-4 h-4 mr-1" />Adicionar</Button>
                    </div>

                    {CATEGORIAS.map(cat => {
                      const lista = perguntasPorCategoria[cat.value] ?? [];
                      return (
                        <div key={cat.value}>
                          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                            {cat.label}
                            <Badge variant="secondary">{lista.length}</Badge>
                          </h3>
                          {lista.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic mb-3">Sem perguntas</p>
                          ) : (
                            <div className="space-y-1.5 mb-3">
                              {lista.map(q => (
                                <div key={q.id} className="flex items-center gap-2 p-2 border rounded-md">
                                  <Switch checked={q.ativo} onCheckedChange={(v) => togglePergunta(q.id, v)} />
                                  <Input className="h-8 flex-1" defaultValue={q.pergunta}
                                    onBlur={(e) => e.target.value !== q.pergunta && atualizarPerguntaProduto(q.id, { pergunta: e.target.value }).then(() => setPerguntas(ps => ps.map(p => p.id === q.id ? { ...p, pergunta: e.target.value } : p)))} />
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletarPergunta(q.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
    </div>
  );
}
