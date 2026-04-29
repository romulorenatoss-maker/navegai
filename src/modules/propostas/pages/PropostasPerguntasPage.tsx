import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import {
  listarCategorias, listarPerguntas, criarPergunta, atualizarPergunta, excluirPergunta,
  criarCategoria, atualizarCategoria, excluirCategoria, reordenarPerguntas,
  type PropostasCategoriaSetup, type PropostasPerguntaSetup, type PropostasPerguntaTipo, type PropostasCobranca,
} from "../services/propostasPerguntasService";

const TIPOS: { v: PropostasPerguntaTipo; l: string }[] = [
  { v: "texto", l: "Texto" }, { v: "numero", l: "Número" },
  { v: "escolha", l: "Escolha" }, { v: "sim_nao", l: "Sim / Não" },
];
const COBRANCAS: { v: PropostasCobranca; l: string }[] = [
  { v: "implantacao", l: "Implantação" }, { v: "mensal", l: "Mensal" }, { v: "informativo", l: "Informativo" },
];

export default function PropostasPerguntasPage() {
  const [categorias, setCategorias] = useState<PropostasCategoriaSetup[]>([]);
  const [perguntas, setPerguntas] = useState<PropostasPerguntaSetup[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroCat, setFiltroCat] = useState<string>("todas");

  // Diálogo pergunta
  const [dlgPerg, setDlgPerg] = useState<Partial<PropostasPerguntaSetup> | null>(null);
  // Diálogo categoria
  const [dlgCat, setDlgCat] = useState<Partial<PropostasCategoriaSetup> | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const [cs, ps] = await Promise.all([listarCategorias(), listarPerguntas()]);
      setCategorias(cs); setPerguntas(ps);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar");
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, []);

  const perguntasFiltradas = useMemo(() => {
    if (filtroCat === "todas") return perguntas;
    return perguntas.filter(p => p.categoria_id === filtroCat);
  }, [perguntas, filtroCat]);

  function nomeCategoria(id: string) {
    return categorias.find(c => c.id === id)?.nome ?? "—";
  }

  async function salvarPergunta() {
    if (!dlgPerg) return;
    if (!dlgPerg.pergunta || !dlgPerg.categoria_id) { toast.error("Preencha categoria e pergunta"); return; }
    try {
      const payload = {
        ...dlgPerg,
        opcoes: typeof dlgPerg.opcoes === "string"
          ? (dlgPerg.opcoes as unknown as string).split(",").map(s => s.trim()).filter(Boolean)
          : dlgPerg.opcoes ?? null,
      };
      if (dlgPerg.id) await atualizarPergunta(dlgPerg.id, payload);
      else await criarPergunta({ ordem: (perguntas.filter(p => p.categoria_id === dlgPerg.categoria_id).length + 1) * 10, ...payload });
      toast.success("Pergunta salva");
      setDlgPerg(null);
      await carregar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function removerPergunta(id: string) {
    if (!confirm("Excluir esta pergunta?")) return;
    try { await excluirPergunta(id); toast.success("Excluída"); await carregar(); }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function moverPergunta(id: string, dir: -1 | 1) {
    const lista = perguntasFiltradas;
    const idx = lista.findIndex(p => p.id === id);
    const swap = lista[idx + dir];
    if (!swap) return;
    const cur = lista[idx];
    await reordenarPerguntas([{ id: cur.id, ordem: swap.ordem }, { id: swap.id, ordem: cur.ordem }]);
    await carregar();
  }

  async function salvarCategoria() {
    if (!dlgCat) return;
    if (!dlgCat.codigo || !dlgCat.nome) { toast.error("Código e nome são obrigatórios"); return; }
    try {
      if (dlgCat.id) await atualizarCategoria(dlgCat.id, dlgCat);
      else await criarCategoria({ ordem: (categorias.length + 1) * 10, cobranca_padrao: "mensal", ativo: true, ...dlgCat });
      toast.success("Categoria salva");
      setDlgCat(null);
      await carregar();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function removerCategoria(id: string) {
    if (!confirm("Excluir categoria? Todas as perguntas associadas serão removidas.")) return;
    try { await excluirCategoria(id); toast.success("Excluída"); await carregar(); }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Perguntas do Setup</h1>
          <p className="text-sm text-muted-foreground">Configure o fluxo conversacional de geração de propostas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDlgCat({})}>
            <Plus className="w-4 h-4 mr-2" /> Categoria
          </Button>
          <Button onClick={() => setDlgPerg({ tipo: "texto", obrigatoria: false, ativo: true })}>
            <Plus className="w-4 h-4 mr-2" /> Pergunta
          </Button>
        </div>
      </div>

      {/* Categorias */}
      <Card>
        <CardHeader><CardTitle className="text-base">Categorias ({categorias.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {categorias.map(c => (
              <div key={c.id} className="flex items-center justify-between border rounded-md p-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.nome} <Badge variant="outline" className="ml-1">{c.codigo}</Badge></div>
                  <div className="text-xs text-muted-foreground">ordem {c.ordem} · {c.cobranca_padrao} · {c.ativo ? "ativo" : "inativo"}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setDlgCat(c)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => removerCategoria(c.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Perguntas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Perguntas ({perguntasFiltradas.length})</CardTitle>
            <Select value={filtroCat} onValueChange={setFiltroCat}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
            <div className="space-y-2">
              {perguntasFiltradas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pergunta nesta categoria.</p>}
              {perguntasFiltradas.map((p) => (
                <div key={p.id} className="flex items-center gap-2 border rounded-md p-2">
                  <div className="flex flex-col">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moverPergunta(p.id, -1)}><ArrowUp className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => moverPergunta(p.id, 1)}><ArrowDown className="w-3 h-3" /></Button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.pergunta}</div>
                    <div className="text-xs text-muted-foreground">
                      {nomeCategoria(p.categoria_id)} · {p.tipo} {p.campo_token ? `· token: ${p.campo_token}` : ""} {p.obrigatoria ? "· obrigatória" : ""}
                    </div>
                  </div>
                  <Switch checked={p.ativo} onCheckedChange={async (v) => { await atualizarPergunta(p.id, { ativo: v }); await carregar(); }} />
                  <Button size="icon" variant="ghost" onClick={() => setDlgPerg(p)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => removerPergunta(p.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Pergunta */}
      <Dialog open={!!dlgPerg} onOpenChange={(o) => !o && setDlgPerg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dlgPerg?.id ? "Editar pergunta" : "Nova pergunta"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Categoria</Label>
              <Select value={dlgPerg?.categoria_id ?? ""} onValueChange={(v) => setDlgPerg(d => ({ ...d!, categoria_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pergunta</Label>
              <Input value={dlgPerg?.pergunta ?? ""} onChange={(e) => setDlgPerg(d => ({ ...d!, pergunta: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={dlgPerg?.tipo ?? "texto"} onValueChange={(v) => setDlgPerg(d => ({ ...d!, tipo: v as PropostasPerguntaTipo }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Token (opcional)</Label>
                <Input placeholder="ex: segmento" value={dlgPerg?.campo_token ?? ""} onChange={(e) => setDlgPerg(d => ({ ...d!, campo_token: e.target.value || null }))} />
              </div>
            </div>
            {dlgPerg?.tipo === "escolha" && (
              <div>
                <Label>Opções (separadas por vírgula)</Label>
                <Input
                  value={Array.isArray(dlgPerg?.opcoes) ? (dlgPerg!.opcoes as string[]).join(", ") : (dlgPerg?.opcoes as unknown as string ?? "")}
                  onChange={(e) => setDlgPerg(d => ({ ...d!, opcoes: e.target.value as unknown as string[] }))}
                />
              </div>
            )}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={dlgPerg?.obrigatoria ?? false} onCheckedChange={(v) => setDlgPerg(d => ({ ...d!, obrigatoria: v }))} />
                Obrigatória
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={dlgPerg?.ativo ?? true} onCheckedChange={(v) => setDlgPerg(d => ({ ...d!, ativo: v }))} />
                Ativa
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgPerg(null)}>Cancelar</Button>
            <Button onClick={salvarPergunta}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Categoria */}
      <Dialog open={!!dlgCat} onOpenChange={(o) => !o && setDlgCat(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dlgCat?.id ? "Editar categoria" : "Nova categoria"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código</Label>
                <Input value={dlgCat?.codigo ?? ""} onChange={(e) => setDlgCat(d => ({ ...d!, codigo: e.target.value }))} />
              </div>
              <div>
                <Label>Nome</Label>
                <Input value={dlgCat?.nome ?? ""} onChange={(e) => setDlgCat(d => ({ ...d!, nome: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={dlgCat?.ordem ?? 0} onChange={(e) => setDlgCat(d => ({ ...d!, ordem: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Cobrança padrão</Label>
                <Select value={dlgCat?.cobranca_padrao ?? "mensal"} onValueChange={(v) => setDlgCat(d => ({ ...d!, cobranca_padrao: v as PropostasCobranca }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COBRANCAS.map(c => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={dlgCat?.ativo ?? true} onCheckedChange={(v) => setDlgCat(d => ({ ...d!, ativo: v }))} />
              Ativa
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgCat(null)}>Cancelar</Button>
            <Button onClick={salvarCategoria}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
