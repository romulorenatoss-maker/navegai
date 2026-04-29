import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import {
  listarProdutos, criarProduto, atualizarProduto, excluirProduto,
  type PropostasProduto, type PropostasTipoCalculo, type PropostasTipoProduto,
} from "../services/propostasService";

const TIPOS_CALC: { value: PropostasTipoCalculo; label: string }[] = [
  { value: "quantidade", label: "Quantidade × Unitário" },
  { value: "gb_total", label: "Por GB total" },
  { value: "gb_por_unidade", label: "GB por unidade" },
];

const TIPOS_PROD: { value: PropostasTipoProduto; label: string }[] = [
  { value: "produto", label: "Produto (infraestrutura)" },
  { value: "servico", label: "Serviço (recorrente)" },
];

const emptyForm: Partial<PropostasProduto> = {
  nome: "",
  descricao_padrao: "",
  valor_minimo: 0,
  tipo_calculo: "quantidade",
  tipo: "produto",
  unidade: "un",
  ativo: true,
};

export default function PropostaProdutosPage() {
  const [produtos, setProdutos] = useState<PropostasProduto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PropostasProduto | null>(null);
  const [form, setForm] = useState<Partial<PropostasProduto>>(emptyForm);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | PropostasTipoProduto>("todos");

  const produtosFiltrados = filtroTipo === "todos" ? produtos : produtos.filter(p => p.tipo === filtroTipo);

  async function load() {
    setLoading(true);
    try {
      setProdutos(await listarProdutos());
    } catch (e) {
      toast.error("Erro ao carregar produtos");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(p: PropostasProduto) {
    setEditing(p);
    setForm(p);
    setOpen(true);
  }

  async function save() {
    if (!form.nome?.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    try {
      if (editing) {
        await atualizarProduto(editing.id, form);
        toast.success("Produto atualizado");
      } else {
        await criarProduto(form);
        toast.success("Produto criado");
      }
      setOpen(false);
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast.error(msg);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir este produto?")) return;
    try {
      await excluirProduto(id);
      toast.success("Produto excluído");
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao excluir";
      toast.error(msg);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6" /> Produtos de Propostas
          </h1>
          <p className="text-sm text-muted-foreground">Catálogo isolado do módulo Propostas.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Novo produto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome *</Label>
                <Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div>
                <Label>Descrição padrão</Label>
                <Textarea value={form.descricao_padrao ?? ""} onChange={(e) => setForm({ ...form, descricao_padrao: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de cálculo</Label>
                  <Select value={form.tipo_calculo ?? "quantidade"} onValueChange={(v) => setForm({ ...form, tipo_calculo: v as PropostasTipoCalculo })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_CALC.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Input value={form.unidade ?? ""} onChange={(e) => setForm({ ...form, unidade: e.target.value })} placeholder="un, GB, mês..." />
                </div>
              </div>
              <div>
                <Label>Valor mínimo (R$)</Label>
                <Input type="number" step="0.01" value={form.valor_minimo ?? 0}
                  onChange={(e) => setForm({ ...form, valor_minimo: Number(e.target.value) })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label className="!mb-0">Ativo</Label>
                <Switch checked={form.ativo ?? true} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={save}>{editing ? "Salvar" : "Criar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lista</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : produtos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum produto cadastrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Valor mín.</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {produtos.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{TIPOS_CALC.find(t => t.value === p.tipo_calculo)?.label}</TableCell>
                    <TableCell>{p.unidade}</TableCell>
                    <TableCell className="text-right">R$ {Number(p.valor_minimo).toFixed(2)}</TableCell>
                    <TableCell>{p.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                    <TableCell className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)}><Trash2 className="w-4 h-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
