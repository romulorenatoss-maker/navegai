import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Sparkles, FilePlus2, Plus, Trash2, ArrowRight, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  buscarClientes, listarTemplates, listarProdutos, criarProposta,
  type ClienteLite, type PropostasTemplate, type PropostasProduto,
} from "../services/propostasService";
import { sugerirConfiguracao, type SugestaoItem } from "../services/propostasIAService";
import { calcularItem, calcularTotal, renderTabelaHtml, formatarBRL, type ItemCalculado } from "../utils/propostasCalculo";
import { propostasRenderizarTemplate } from "../utils/propostasRender";
import { limparHtmlFinal } from "../utils/propostasLimpeza";

export default function PropostaCreatePage() {
  const navigate = useNavigate();

  // Cliente
  const [termoCliente, setTermoCliente] = useState("");
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [clienteSel, setClienteSel] = useState<ClienteLite | null>(null);

  // Template
  const [templates, setTemplates] = useState<PropostasTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");

  // Cenário
  const [metragem, setMetragem] = useState<string>("");
  const [usuarios, setUsuarios] = useState<string>("");
  const [necessidade, setNecessidade] = useState("");

  // Produtos
  const [produtos, setProdutos] = useState<PropostasProduto[]>([]);
  const [itens, setItens] = useState<ItemCalculado[]>([]);
  const [sugerindo, setSugerindo] = useState(false);

  // Validade
  const [validade, setValidade] = useState<string>("");

  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    listarTemplates().then(setTemplates).catch(console.error);
    listarProdutos().then(setProdutos).catch(console.error);
  }, []);

  // Busca clientes em tempo real (debounce simples)
  useEffect(() => {
    const t = setTimeout(() => {
      buscarClientes(termoCliente).then(setClientes).catch(console.error);
    }, 300);
    return () => clearTimeout(t);
  }, [termoCliente]);

  const total = useMemo(() => calcularTotal(itens), [itens]);

  async function handleSugerir() {
    setSugerindo(true);
    try {
      const { itens: sug } = await sugerirConfiguracao({
        metragem: metragem ? Number(metragem) : undefined,
        usuarios: usuarios ? Number(usuarios) : undefined,
        necessidade,
      });
      const novos = sug.map((s: SugestaoItem) =>
        calcularItem({
          produto_id: s.produto_id,
          descricao: s.nome,
          quantidade: s.quantidade,
          unidade: s.unidade,
          valor_unitario: s.valor_unitario,
          tipo_calculo: s.tipo_calculo,
          gb: s.gb ?? undefined,
        })
      );
      setItens(novos);
      toast.success(`${novos.length} produto(s) sugerido(s)`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao sugerir";
      toast.error(msg);
    } finally {
      setSugerindo(false);
    }
  }

  function adicionarManual(produtoId: string) {
    const p = produtos.find(x => x.id === produtoId);
    if (!p) return;
    setItens(prev => [
      ...prev,
      calcularItem({
        produto_id: p.id,
        descricao: p.nome,
        quantidade: 1,
        unidade: p.unidade,
        valor_unitario: Number(p.valor_minimo),
        tipo_calculo: p.tipo_calculo,
        gb: undefined,
      }),
    ]);
  }

  function atualizarItem(idx: number, patch: Partial<ItemCalculado>) {
    setItens(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      return calcularItem({
        produto_id: merged.produto_id,
        descricao: merged.descricao,
        quantidade: Number(merged.quantidade) || 0,
        unidade: merged.unidade,
        valor_unitario: Number(merged.valor_unitario) || 0,
        tipo_calculo: merged.tipo_calculo,
        gb: merged.gb != null ? Number(merged.gb) : undefined,
      });
    }));
  }

  function removerItem(idx: number) {
    setItens(prev => prev.filter((_, i) => i !== idx));
  }

  async function gerarProposta() {
    if (!clienteSel) { toast.error("Selecione um cliente"); return; }
    if (itens.length === 0) { toast.error("Adicione ao menos um produto"); return; }

    setSalvando(true);
    try {
      const template = templates.find(t => t.id === templateId);
      const baseHtml = template?.conteudo_html ?? "";

      // Tokens (compatível com <span data-token> e {token})
      const dados: Record<string, unknown> = {
        cliente_nome: clienteSel.nome,
        cliente_cpf: clienteSel.cpf ?? "",
        cliente_cidade: clienteSel.cidade ?? "",
        valor_total: formatarBRL(total),
        validade: validade ? new Date(validade).toLocaleDateString("pt-BR") : "",
        data_emissao: new Date().toLocaleDateString("pt-BR"),
        itens_tabela: renderTabelaHtml(itens),
      };

      let conteudo = propostasRenderizarTemplate(baseHtml, dados);

      // Se template não tem {itens_tabela}, anexa a tabela ao final
      if (!baseHtml.includes("{itens_tabela}")) {
        conteudo = `${conteudo}<h3>Itens</h3>${renderTabelaHtml(itens)}<p style="text-align:right"><strong>Total: ${formatarBRL(total)}</strong></p>`;
      }

      conteudo = limparHtmlFinal(conteudo);

      const proposta = await criarProposta({
        cliente_id: clienteSel.id,
        template_id: templateId || null,
        conteudo_original: conteudo,
        conteudo_editado: conteudo,
        valor_total: total,
        validade: validade || null,
        itens: itens.map(it => ({
          produto_id: it.produto_id ?? null,
          descricao: it.descricao,
          quantidade: it.quantidade,
          unidade: it.unidade,
          valor_unitario: it.valor_unitario,
          valor_total: it.valor_total,
        })),
      });

      toast.success("Proposta criada");
      navigate(`/propostas/${proposta.id}/preview`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao gerar";
      toast.error(msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FilePlus2 className="w-6 h-6" /> Nova Proposta
        </h1>
        <Button variant="outline" onClick={() => navigate("/propostas/setup")}>
          <Wand2 className="w-4 h-4 mr-2" /> Modo Guiado (IA)
        </Button>
      </div>

      {/* CLIENTE */}
      <Card>
        <CardHeader><CardTitle className="text-base">1. Cliente</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Buscar por nome..." value={termoCliente} onChange={(e) => setTermoCliente(e.target.value)} />
          <div className="max-h-48 overflow-auto border rounded-md divide-y">
            {clientes.length === 0
              ? <p className="p-3 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
              : clientes.map(c => (
                <button
                  key={c.id}
                  className={`w-full text-left p-3 text-sm hover:bg-accent transition-colors ${clienteSel?.id === c.id ? "bg-accent" : ""}`}
                  onClick={() => setClienteSel(c)}
                >
                  <div className="font-medium">{c.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.cpf ?? "—"} {c.cidade ? `· ${c.cidade}` : ""}
                  </div>
                </button>
              ))}
          </div>
          {clienteSel && <Badge>Selecionado: {clienteSel.nome}</Badge>}
        </CardContent>
      </Card>

      {/* TEMPLATE + CENÁRIO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">2. Template (opcional)</CardTitle></CardHeader>
          <CardContent>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Sem template" /></SelectTrigger>
              <SelectContent>
                {templates.filter(t => t.ativo).map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-3">
              <Label>Validade</Label>
              <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">3. Cenário</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Metragem (m²)</Label>
                <Input type="number" value={metragem} onChange={(e) => setMetragem(e.target.value)} />
              </div>
              <div>
                <Label>Usuários</Label>
                <Input type="number" value={usuarios} onChange={(e) => setUsuarios(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Necessidade / observação</Label>
              <Textarea rows={2} value={necessidade} onChange={(e) => setNecessidade(e.target.value)} placeholder="Ex.: alta demanda de upload, equipe de vídeo..." />
            </div>
            <Button variant="outline" size="sm" onClick={handleSugerir} disabled={sugerindo}>
              <Sparkles className="w-4 h-4 mr-2" />
              {sugerindo ? "Sugerindo..." : "Sugerir produtos com IA"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* PRODUTOS */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">4. Produtos</CardTitle>
          <Select value="" onValueChange={adicionarManual}>
            <SelectTrigger className="w-56"><SelectValue placeholder="+ Adicionar manualmente" /></SelectTrigger>
            <SelectContent>
              {produtos.filter(p => p.ativo).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto. Use "Sugerir com IA" ou adicione manualmente.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="w-24">Qtd</TableHead>
                  <TableHead className="w-24">GB</TableHead>
                  <TableHead className="w-28">Unit.</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((it, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input value={it.descricao} onChange={(e) => atualizarItem(idx, { descricao: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" value={it.quantidade} onChange={(e) => atualizarItem(idx, { quantidade: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      {it.tipo_calculo === "quantidade"
                        ? <span className="text-muted-foreground text-xs">—</span>
                        : <Input type="number" value={it.gb ?? ""} onChange={(e) => atualizarItem(idx, { gb: Number(e.target.value) })} />}
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" value={it.valor_unitario} onChange={(e) => atualizarItem(idx, { valor_unitario: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatarBRL(it.valor_total)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removerItem(idx)}><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Total da proposta</span>
            <span className="text-xl font-bold">{formatarBRL(total)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={gerarProposta} disabled={salvando || !clienteSel || itens.length === 0}>
          {salvando ? "Gerando..." : "Gerar e abrir preview"} <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
