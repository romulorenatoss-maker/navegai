import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Plus, ArrowRight, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { PropostasPerguntaSetup, PropostasCobranca } from "../services/propostasPerguntasService";
import type { PropostasProduto } from "../services/propostasService";
import { gerarTextoContexto } from "../services/propostasService";

// ============================================================================
// FASE 2 (ajustes) + FASE 3 (sugestões IA) — Painel de Pergunta Guiada
// Pergunta → UI → comportamento → cria itens
// Fallback: se a pergunta não tiver tipo_pergunta definido,
//           o componente devolve null (a tela usa o chat IA antigo).
// ============================================================================

interface ItemConv {
  produto_id?: string;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  cobranca: PropostasCobranca;
  categoria?: string;
}

interface SugestaoIA {
  nome: string;
  categoria?: string;
  cobranca?: PropostasCobranca;
  motivo?: string;
}

interface Props {
  pergunta: PropostasPerguntaSetup | null;
  itens: ItemConv[];
  onAdicionarItem: (item: ItemConv) => void;
  onRemoverItem: (produto_id: string) => void;
  onResponder: (pergunta: PropostasPerguntaSetup, resposta: string) => void;
  onContexto: (texto: string) => void;
  onAvancar: () => void;
  clienteNome?: string;
  // Fase 2 — controle de etapa visual (opcional)
  etapaIndex?: number;
  etapaTotal?: number;
}

// ===== Cache de produtos compartilhado entre instâncias (Fase 2 — performance)
const produtosCache: Record<string, PropostasProduto[]> = {};

async function carregarProdutosCached(categoria: string): Promise<PropostasProduto[]> {
  if (produtosCache[categoria]) return produtosCache[categoria];
  const { data, error } = await supabase
    .from("propostas_produtos" as never)
    .select("*")
    .eq("categoria", categoria)
    .eq("ativo", true)
    .order("nome");
  if (error) {
    console.error("[PerguntaGuiada] erro ao carregar produtos:", error);
    return [];
  }
  const list = (data ?? []) as unknown as PropostasProduto[];
  produtosCache[categoria] = list;
  return list;
}

// ===== Render placeholder helper (Fase 2 — robusto)
function renderPlaceholder(template: string | undefined | null, dados: { qtd: number; valor: number; nome: string }): string {
  if (!template) return dados.nome;
  return template
    .replaceAll("{qtd}", String(dados.qtd))
    .replaceAll("{valor}", dados.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
    .replaceAll("{nome}", dados.nome);
}

// ===== UUID leve (sem dependência externa)
function uid(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function PerguntaGuiadaPanel(props: Props) {
  const { pergunta, etapaIndex, etapaTotal } = props;

  // Fallback: sem tipo_pergunta → não renderiza (chat IA assume)
  if (!pergunta || !pergunta.tipo_pergunta) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="py-2 border-b flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <CardTitle className="text-sm">Pergunta guiada</CardTitle>
          <Badge variant="outline" className="text-[10px] capitalize">
            {pergunta.tipo_pergunta}
          </Badge>
          {typeof etapaIndex === "number" && typeof etapaTotal === "number" && etapaTotal > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              Etapa {Math.min(etapaIndex + 1, etapaTotal)} / {etapaTotal}
            </Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={props.onAvancar}>
          Pular <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </CardHeader>
      <CardContent className="p-3">
        {pergunta.tipo_pergunta === "contexto" && <PerguntaContexto {...props} />}
        {pergunta.tipo_pergunta === "produto" && <PerguntaProduto {...props} />}
        {pergunta.tipo_pergunta === "input" && <PerguntaInput {...props} />}
      </CardContent>
    </Card>
  );
}

// ====== CONTEXTO ============================================================
function PerguntaContexto({ pergunta, onResponder, onContexto, onAvancar, clienteNome }: Props) {
  const [valor, setValor] = useState("");
  const [gerando, setGerando] = useState(false);
  if (!pergunta) return null;

  async function confirmar() {
    if (!valor.trim()) return;
    onResponder(pergunta!, valor.trim());
    if (pergunta!.gera_contexto) {
      try {
        setGerando(true);
        const texto = await gerarTextoContexto({ [pergunta!.campo_token ?? "resposta"]: valor }, clienteNome);
        // Fase 2 — contexto acumulado: o handler externo concatena
        onContexto(texto || valor);
        toast.success("Contexto gerado pela IA");
      } catch (e) {
        console.error(e);
        // Fallback total: ignora IA, usa o texto do usuário como contexto
        onContexto(valor);
      } finally {
        setGerando(false);
      }
    }
    setValor("");
    onAvancar();
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{pergunta.pergunta}</p>
      <Textarea
        rows={3}
        placeholder="Descreva..."
        value={valor}
        onChange={(e) => setValor(e.target.value)}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={confirmar} disabled={!valor.trim() || gerando}>
          {gerando ? "Gerando contexto…" : pergunta.gera_contexto ? "Gerar contexto IA" : "Confirmar"}
        </Button>
      </div>
    </div>
  );
}

// ====== INPUT (texto/numero/escolha) ========================================
function PerguntaInput({ pergunta, onResponder, onAvancar }: Props) {
  const [valor, setValor] = useState("");
  if (!pergunta) return null;

  function confirmar(v?: string) {
    const r = (v ?? valor).trim();
    if (!r) return;
    onResponder(pergunta!, r);
    setValor("");
    onAvancar();
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{pergunta.pergunta}</p>
      {pergunta.tipo === "escolha" && pergunta.opcoes?.length ? (
        <div className="flex flex-wrap gap-1">
          {pergunta.opcoes.map((op) => (
            <Button key={op} size="sm" variant="outline" onClick={() => confirmar(op)}>
              {op}
            </Button>
          ))}
        </div>
      ) : pergunta.tipo === "sim_nao" ? (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => confirmar("sim")}>Sim</Button>
          <Button size="sm" variant="outline" onClick={() => confirmar("não")}>Não</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            type={pergunta.tipo === "numero" ? "number" : "text"}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }}
            placeholder="Resposta..."
          />
          <Button size="sm" onClick={() => confirmar()} disabled={!valor.trim()}>OK</Button>
        </div>
      )}
    </div>
  );
}

// ====== PRODUTO (lista com checkbox + qtd + valor) ==========================
function PerguntaProduto({ pergunta, itens, onAdicionarItem, onRemoverItem, onResponder, onAvancar, clienteNome }: Props) {
  const [produtos, setProdutos] = useState<PropostasProduto[]>([]);
  const [loading, setLoading] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);

  // Fase 3 — sugestões IA
  const [sugestoes, setSugestoes] = useState<SugestaoIA[]>([]);
  const [carregandoSug, setCarregandoSug] = useState(false);
  const sugestoesPedidasRef = useRef(false);

  useEffect(() => {
    if (!pergunta?.categoria_produto) return;
    setLoading(true);
    carregarProdutosCached(pergunta.categoria_produto)
      .then((list) => setProdutos(list))
      .finally(() => setLoading(false));
  }, [pergunta?.categoria_produto]);

  // Fase 3 — pedir sugestões à IA (uma vez por categoria; fallback silencioso)
  useEffect(() => {
    if (!pergunta?.categoria_produto || sugestoesPedidasRef.current) return;
    sugestoesPedidasRef.current = true;
    let cancelado = false;
    (async () => {
      try {
        setCarregandoSug(true);
        const { data, error } = await supabase.functions.invoke("propostas-conversacional", {
          body: {
            acao: "sugerir_produto",
            contexto: {
              cliente_nome: clienteNome,
              categoria: pergunta!.categoria_produto,
              pergunta: pergunta!.pergunta,
              itens_atuais: itens.map(i => ({ nome: i.nome, categoria: i.categoria })),
            },
          },
        });
        if (cancelado) return;
        if (error) { console.warn("[sugerir_produto] error:", error.message); return; }
        const arr: SugestaoIA[] = Array.isArray((data as { sugestoes?: SugestaoIA[] })?.sugestoes)
          ? (data as { sugestoes: SugestaoIA[] }).sugestoes
          : [];
        // Filtra sugestões já presentes no catálogo da categoria atual (evita duplicar UI)
        const nomesCatalogo = new Set(produtos.map(p => p.nome.toLowerCase().trim()));
        const filtradas = arr.filter(s => s?.nome && !nomesCatalogo.has(s.nome.toLowerCase().trim()));
        setSugestoes(filtradas.slice(0, 6));
      } catch (e) {
        // Fallback total — segue fluxo normal sem sugestões
        console.warn("[sugerir_produto] fallback:", e);
      } finally {
        if (!cancelado) setCarregandoSug(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pergunta?.categoria_produto]);

  function adicionarSugestao(s: SugestaoIA) {
    // Item novo (fora do catálogo) — id forte para reconciliação
    onAdicionarItem({
      produto_id: "novo_" + uid(),
      nome: s.nome,
      quantidade: 1,
      valor_unitario: 0, // valor padrão = 0 → UI destaca (Fase 2)
      cobranca: s.cobranca ?? "mensal",
      categoria: s.categoria ?? pergunta!.categoria_produto,
    });
    // Remove da lista de sugestões para não duplicar
    setSugestoes(prev => prev.filter(x => x.nome !== s.nome));
    toast.success(`"${s.nome}" adicionado. Defina o valor.`);
  }

  function concluir() {
    onResponder(pergunta!, `[guiado:${pergunta!.categoria_produto}]`);
    onAvancar();
  }

  if (!pergunta) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{pergunta.pergunta}</p>
        <Badge variant="secondary" className="text-[10px] capitalize">
          {pergunta.categoria_produto}
        </Badge>
      </div>

      {loading && <div className="text-xs text-muted-foreground">Carregando produtos…</div>}
      {!loading && produtos.length === 0 && (
        <div className="text-xs text-muted-foreground">
          Nenhum produto cadastrado nesta categoria.
        </div>
      )}

      <div className="space-y-1 max-h-72 overflow-auto pr-1">
        {produtos.map((p) => (
          <ProdutoLinha
            key={p.id}
            produto={p}
            itens={itens}
            onAdicionar={onAdicionarItem}
            onRemover={onRemoverItem}
          />
        ))}
      </div>

      {/* Fase 3 — Sugestões IA (não auto-insere, usuário decide) */}
      {(carregandoSug || sugestoes.length > 0) && (
        <div className="border rounded-md p-2 bg-amber-500/5 border-amber-500/30 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Lightbulb className="w-3 h-3" />
            Sugestões baseadas no cenário
          </div>
          {carregandoSug && <div className="text-[11px] text-muted-foreground">Pensando…</div>}
          {!carregandoSug && (
            <div className="flex flex-wrap gap-1">
              {sugestoes.map((s) => (
                <Button
                  key={s.nome}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => adicionarSugestao(s)}
                  title={s.motivo ?? ""}
                >
                  <Plus className="w-3 h-3 mr-1" /> {s.nome}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between pt-2 border-t">
        <Button size="sm" variant="outline" onClick={() => setNovoOpen(true)}>
          <Plus className="w-3 h-3 mr-1" /> Item novo
        </Button>
        <Button size="sm" onClick={concluir}>
          Concluir etapa <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </div>

      {novoOpen && (
        <NovoItemForm
          categoria={pergunta.categoria_produto ?? "outros"}
          onSalvar={(it) => { onAdicionarItem(it); setNovoOpen(false); }}
          onCancelar={() => setNovoOpen(false)}
        />
      )}
    </div>
  );
}

// ---- ProdutoLinha ----
function ProdutoLinha({
  produto, itens, onAdicionar, onRemover,
}: {
  produto: PropostasProduto;
  itens: ItemConv[];
  onAdicionar: (i: ItemConv) => void;
  onRemover: (produto_id: string) => void;
}) {
  const existente = itens.find((i) => i.produto_id === produto.id);
  const [checked, setChecked] = useState(!!existente);
  const [qtd, setQtd] = useState<number>(existente?.quantidade ?? 1);
  // Fase 2 — valor padrão: valor_base (se existir) || valor_padrao || valor_minimo || 0
  const valorPadrao = Number(
    (produto as unknown as { valor_base?: number }).valor_base ??
    (produto as unknown as { valor_padrao?: number }).valor_padrao ??
    produto.valor_minimo ?? 0
  );
  const [valor, setValor] = useState<number>(existente?.valor_unitario ?? valorPadrao);

  const cobrancaPadrao = ((produto as unknown as { cobranca_padrao?: string }).cobranca_padrao ?? "mensal") as PropostasCobranca;
  const categoria = (produto as unknown as { categoria?: string }).categoria;

  const preview = useMemo(
    () => renderPlaceholder(produto.placeholder_template, { qtd, valor, nome: produto.nome }),
    [produto, qtd, valor]
  );

  // Sincroniza com o estado externo
  useEffect(() => {
    if (checked) {
      onAdicionar({
        produto_id: produto.id,
        nome: produto.nome,
        quantidade: qtd,
        valor_unitario: valor,
        cobranca: cobrancaPadrao,
        categoria,
      });
    } else if (existente) {
      onRemover(produto.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, qtd, valor]);

  // Fase 2 — destaque visual quando valor = 0
  const valorZero = checked && valor === 0;

  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-background border hover:border-primary/50">
      <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{produto.nome}</div>
        <div className="text-[11px] text-muted-foreground truncate">{preview}</div>
      </div>
      <Input
        type="number"
        min={1}
        value={qtd}
        onChange={(e) => setQtd(Math.max(1, Number(e.target.value) || 1))}
        className="w-16 h-8 text-xs"
        disabled={!checked}
      />
      <Input
        type="number"
        min={0}
        step="0.01"
        value={valor}
        onChange={(e) => setValor(Math.max(0, Number(e.target.value) || 0))}
        className={`w-24 h-8 text-xs ${valorZero ? "border-destructive ring-1 ring-destructive/40" : ""}`}
        disabled={!checked}
        title={valorZero ? "Defina o valor" : undefined}
      />
    </div>
  );
}

// ---- NovoItemForm ----
function NovoItemForm({
  categoria, onSalvar, onCancelar,
}: {
  categoria: string;
  onSalvar: (i: ItemConv) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [qtd, setQtd] = useState(1);
  const [valor, setValor] = useState(0);
  const [cobranca, setCobranca] = useState<PropostasCobranca>("mensal");

  function salvar() {
    if (!nome.trim()) { toast.error("Informe o nome do item"); return; }
    onSalvar({
      // Fase 2 — id forte para item novo (evita colisão e permite remoção precisa)
      produto_id: "novo_" + uid(),
      nome: nome.trim(),
      quantidade: qtd,
      valor_unitario: valor,
      cobranca,
      categoria,
    });
  }

  return (
    <div className="border rounded-md p-2 space-y-2 bg-background">
      <div className="text-xs font-medium">Novo item ({categoria})</div>
      <Input placeholder="Nome do item" value={nome} onChange={(e) => setNome(e.target.value)} />
      <div className="grid grid-cols-3 gap-2">
        <Input type="number" min={1} value={qtd}
          onChange={(e) => setQtd(Math.max(1, Number(e.target.value) || 1))} placeholder="Qtd" />
        <Input type="number" min={0} step="0.01" value={valor}
          onChange={(e) => setValor(Math.max(0, Number(e.target.value) || 0))} placeholder="Valor"
          className={valor === 0 ? "border-destructive" : ""} />
        <select className="border rounded-md text-sm bg-background"
          value={cobranca} onChange={(e) => setCobranca(e.target.value as PropostasCobranca)}>
          <option value="implantacao">implantação</option>
          <option value="mensal">mensal</option>
          <option value="informativo">informativo</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        <Button size="sm" onClick={salvar}>Adicionar</Button>
      </div>
    </div>
  );
}
