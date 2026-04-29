import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
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
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Send, Sparkles, Plus, Trash2, Save, Package, MessageSquare, ListChecks, Building2, X } from "lucide-react";
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

const fmtBRL = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

  // ============ CHAT ============
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: "Olá! Vamos organizar o catálogo de produtos da empresa. Me diga um item que você vende (ex: *switch 24 portas a R$1300* ou *câmera IP 350 cada*)." },
  ]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  // Nova pergunta padrão
  const [novaPergunta, setNovaPergunta] = useState<{ categoria: PropostasCategoria; pergunta: string }>({ categoria: "infraestrutura", pergunta: "" });

  // ============ LOADERS ============
  async function recarregar() {
    const [emp, prods, perg] = await Promise.all([
      obterContextoEmpresa(),
      listarProdutos(),
      listarPerguntasProduto(),
    ]);
    setEmpresa(emp);
    setEmpresaDraft(emp ?? {});
    setProdutos(prods);
    setPerguntas(perg);
  }

  useEffect(() => { recarregar().catch(e => toast.error(String(e))); }, []);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

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
            catalogo: produtos.filter(p => p.ativo).map(p => ({
              nome: p.nome,
              categoria: (p as unknown as { categoria?: string }).categoria,
              valor_minimo: Number(p.valor_minimo),
              valor_medio: Number((p as unknown as { valor_medio?: number }).valor_medio ?? p.valor_minimo),
              unidade: p.unidade,
              cobranca_padrao: (p as unknown as { cobranca_padrao?: string }).cobranca_padrao,
            })),
            perguntas_padrao: perguntas.filter(q => q.ativo).map(q => ({ categoria: q.categoria, pergunta: q.pergunta })),
          },
        },
      });
      if (error) throw error;
      const resp = data as { mensagem: string; produtos: ProdutoSugerido[]; fora_escopo: Array<{ nome: string }>; error?: string };
      if (resp.error) { toast.error(resp.error); return; }

      setMsgs(m => [...m, { role: "assistant", content: resp.mensagem || "…" }]);
      if (resp.produtos?.length) {
        for (const sug of resp.produtos) {
          await inserirSugerido(sug);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setEnviando(false); }
  }

  // ============ RENDER ============
  return (
    <div className="h-[calc(100vh-4rem)]">
      <ResizablePanelGroup direction="horizontal">
        {/* CONVERSA */}
        <ResizablePanel defaultSize={40} minSize={28}>
          <Card className="h-full rounded-none border-0 border-r flex flex-col">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="w-4 h-4 text-primary" /> Assistente de Catálogo
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Conta sobre seus produtos. Eu valido o escopo e cadastro automaticamente.
              </p>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="leading-snug">{children}</p>,
                      }}
                    >{m.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {enviando && <div className="text-xs text-muted-foreground">Pensando…</div>}
              <div ref={fim} />
            </CardContent>
            <div className="border-t p-3 flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviar()}
                placeholder="Ex: switch 24 portas R$1300"
                disabled={enviando}
              />
              <Button onClick={enviar} disabled={enviando || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* PAINEL */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="h-full overflow-y-auto p-4">
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
                  <CardHeader>
                    <CardTitle className="text-base">Catálogo (edição inline)</CardTitle>
                    <p className="text-xs text-muted-foreground">Adicione novos via conversa à esquerda; ajuste valores aqui.</p>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    {produtos.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">Nenhum produto. Use a conversa para cadastrar.</p>
                    ) : (
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
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
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
                                      {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
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
                                  <Input type="number" step="0.01" className="h-8 w-24 text-right" defaultValue={p.valor_minimo}
                                    onBlur={(e) => Number(e.target.value) !== p.valor_minimo && patchProduto(p.id, { valor_minimo: Number(e.target.value) })} />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Input type="number" step="0.01" className="h-8 w-24 text-right" defaultValue={ext.valor_medio ?? 0}
                                    onBlur={(e) => Number(e.target.value) !== (ext.valor_medio ?? 0) && patchProduto(p.id, { valor_medio: Number(e.target.value) } as never)} />
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
                          <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
