import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, User, Users, MessageSquare, Settings, Plus, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { buscarClientes, type ClienteLite } from "../services/propostasService";
import {
  listarResponsaveis, criarResponsavel, atualizarResponsavel, excluirResponsavel,
  listarContatosCliente,
  type ClienteResponsavel, type ContatoLite,
} from "../services/propostasResponsaveisService";
import { listarPerguntas, type PropostasPerguntaSetup } from "../services/propostasPerguntasService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/**
 * Nova UI estruturada por origem de dados.
 * Não substitui a tela conversacional — convive em paralelo.
 * Acessível em /propostas/dados-render.
 */
export default function PropostaDadosRenderPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const clienteParam = params.get("cliente");

  const [modalCliente, setModalCliente] = useState(!clienteParam);
  const [termoCliente, setTermoCliente] = useState("");
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [clienteSel, setClienteSel] = useState<ClienteLite | null>(null);

  const [responsaveis, setResponsaveis] = useState<ClienteResponsavel[]>([]);
  const [contatos, setContatos] = useState<ContatoLite[]>([]);
  const [responsavelSel, setResponsavelSel] = useState<string | null>(null);

  const [perguntas, setPerguntas] = useState<PropostasPerguntaSetup[]>([]);
  const [respostas] = useState<Record<string, string>>({});

  const [novoResp, setNovoResp] = useState({ nome: "", cargo: "", contato_id: "", principal: false });

  // Busca de cliente
  useEffect(() => {
    const t = setTimeout(() => buscarClientes(termoCliente).then(setClientes).catch(console.error), 300);
    return () => clearTimeout(t);
  }, [termoCliente]);

  // Pré-carrega cliente via querystring
  useEffect(() => {
    if (!clienteParam) return;
    buscarClientes("").then(lista => {
      const c = lista.find(x => x.id === clienteParam);
      if (c) { setClienteSel(c); setModalCliente(false); }
    });
  }, [clienteParam]);

  // Carrega dados quando cliente é selecionado
  useEffect(() => {
    if (!clienteSel) return;
    Promise.all([
      listarResponsaveis(clienteSel.id),
      listarContatosCliente(clienteSel.id),
      listarPerguntas(true),
    ]).then(([r, c, p]) => {
      setResponsaveis(r);
      setContatos(c);
      setPerguntas(p);
      const principal = r.find(x => x.principal) ?? r[0];
      setResponsavelSel(principal?.id ?? null);
    }).catch(e => toast.error(String(e)));
  }, [clienteSel]);

  const responsavelAtual = useMemo(
    () => responsaveis.find(r => r.id === responsavelSel) ?? null,
    [responsaveis, responsavelSel],
  );

  async function handleCriarResponsavel() {
    if (!clienteSel || !novoResp.nome.trim()) { toast.error("Informe ao menos o nome"); return; }
    try {
      const r = await criarResponsavel({
        cliente_id: clienteSel.id,
        nome: novoResp.nome.trim(),
        cargo: novoResp.cargo.trim() || null,
        contato_id: novoResp.contato_id || null,
        principal: novoResp.principal,
      });
      const lista = await listarResponsaveis(clienteSel.id);
      setResponsaveis(lista);
      setResponsavelSel(r.id);
      setNovoResp({ nome: "", cargo: "", contato_id: "", principal: false });
      toast.success("Responsável adicionado");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function handleMarcarPrincipal(id: string) {
    if (!clienteSel) return;
    try {
      await atualizarResponsavel(id, { principal: true }, clienteSel.id);
      const lista = await listarResponsaveis(clienteSel.id);
      setResponsaveis(lista);
      toast.success("Responsável marcado como principal");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function handleRemover(id: string) {
    if (!clienteSel || !confirm("Remover este responsável?")) return;
    try {
      await excluirResponsavel(id);
      const lista = await listarResponsaveis(clienteSel.id);
      setResponsaveis(lista);
      if (responsavelSel === id) setResponsavelSel(lista[0]?.id ?? null);
      toast.success("Responsável removido");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  if (modalCliente) {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) navigate("/propostas"); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecione o cliente</DialogTitle>
            <DialogDescription>Esta tela mostra os dados estruturados que vão para o template.</DialogDescription>
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
              <Button variant="outline" onClick={() => navigate("/propostas")}>Cancelar</Button>
              <Button onClick={() => setModalCliente(false)} disabled={!clienteSel}>Continuar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!clienteSel) return null;

  const total_geral = "—"; // calculado no momento da geração da proposta
  const tabela_itens_preview = "Os itens são definidos na conversa da proposta (Planilha viva).";

  return (
    <div className="p-4 mx-auto max-w-[1200px] space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/propostas")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-2xl font-bold mt-1">Dados do Render</h1>
          <p className="text-sm text-muted-foreground">
            Cliente: <strong>{clienteSel.nome}</strong> ·{" "}
            <Badge variant="secondary">Estruturado por origem</Badge>
          </p>
        </div>
        <Button onClick={() => navigate(`/propostas/conversa?cliente=${clienteSel.id}`)}>
          Abrir conversa →
        </Button>
      </div>

      <Tabs defaultValue="cliente" className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="cliente"><User className="w-4 h-4 mr-1" /> Cliente</TabsTrigger>
          <TabsTrigger value="responsavel"><Users className="w-4 h-4 mr-1" /> Responsável</TabsTrigger>
          <TabsTrigger value="perguntas"><MessageSquare className="w-4 h-4 mr-1" /> Perguntas</TabsTrigger>
          <TabsTrigger value="sistema"><Settings className="w-4 h-4 mr-1" /> Sistema</TabsTrigger>
        </TabsList>

        {/* CLIENTE — somente leitura */}
        <TabsContent value="cliente">
          <Card>
            <CardHeader><CardTitle className="text-base">Dados automáticos do cliente</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Nome" value={clienteSel.nome} />
              <Field label="CPF" value={clienteSel.cpf ?? "—"} />
              <Field label="Cidade" value={clienteSel.cidade ?? "—"} />
              <Field label="E-mail (de contatos)" value={contatos.find(c => c.tipo === "email")?.valor ?? "—"} />
              <Field label="Telefone (de contatos)" value={contatos.find(c => c.tipo === "telefone")?.valor ?? "—"} />
              <Field label="Total de contatos" value={String(contatos.length)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* RESPONSÁVEL */}
        <TabsContent value="responsavel">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Responsável da proposta</CardTitle>
              <p className="text-xs text-muted-foreground">
                Quem assina/recebe esta proposta. Email/telefone vêm de <code>cliente_contatos</code> via referência —
                sem duplicar dados.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {responsaveis.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum responsável cadastrado para este cliente.</p>
              ) : (
                <div className="border rounded-md divide-y">
                  {responsaveis.map(r => (
                    <div key={r.id} className={`p-3 flex items-center gap-3 ${responsavelSel === r.id ? "bg-accent/50" : ""}`}>
                      <input
                        type="radio"
                        name="responsavel"
                        checked={responsavelSel === r.id}
                        onChange={() => setResponsavelSel(r.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          {r.nome}
                          {r.principal && <Badge variant="default" className="text-xs"><Star className="w-3 h-3 mr-0.5" /> Principal</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.cargo ?? "—"} · {r.email ?? "sem email"} · {r.telefone ?? "sem telefone"}
                        </div>
                      </div>
                      {!r.principal && (
                        <Button size="sm" variant="ghost" onClick={() => handleMarcarPrincipal(r.id)}>
                          Marcar principal
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleRemover(r.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Form novo */}
              <Card className="border-dashed">
                <CardHeader className="py-3"><CardTitle className="text-sm">Adicionar responsável</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Nome *</Label>
                    <Input value={novoResp.nome} onChange={e => setNovoResp(s => ({ ...s, nome: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Cargo</Label>
                    <Input value={novoResp.cargo} onChange={e => setNovoResp(s => ({ ...s, cargo: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Contato vinculado (de cliente_contatos)</Label>
                    <select
                      className="w-full border rounded-md p-2 text-sm bg-background"
                      value={novoResp.contato_id}
                      onChange={e => setNovoResp(s => ({ ...s, contato_id: e.target.value }))}
                    >
                      <option value="">— sem vínculo —</option>
                      {contatos.map(c => (
                        <option key={c.id} value={c.id}>{c.tipo}: {c.valor}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={novoResp.principal} onCheckedChange={v => setNovoResp(s => ({ ...s, principal: v }))} />
                    <Label>Marcar como principal</Label>
                  </div>
                  <div className="flex items-end justify-end">
                    <Button onClick={handleCriarResponsavel}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
                  </div>
                </CardContent>
              </Card>

              {responsavelAtual && (
                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm">Preview do responsável selecionado</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3">
                    <Field label="responsavel.nome" value={responsavelAtual.nome} />
                    <Field label="responsavel.cargo" value={responsavelAtual.cargo ?? "—"} />
                    <Field label="responsavel.email" value={responsavelAtual.email ?? "—"} />
                    <Field label="responsavel.telefone" value={responsavelAtual.telefone ?? "—"} />
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERGUNTAS */}
        <TabsContent value="perguntas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Perguntas configuradas</CardTitle>
              <p className="text-xs text-muted-foreground">
                As respostas reais são coletadas durante a conversa. Aqui você vê apenas a estrutura.
              </p>
            </CardHeader>
            <CardContent>
              {perguntas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma pergunta cadastrada.</p>
              ) : (
                <div className="border rounded-md divide-y">
                  {perguntas.map(p => (
                    <div key={p.id} className="p-3">
                      <div className="text-sm font-medium">{p.pergunta}</div>
                      <div className="text-xs text-muted-foreground">
                        Token: <code>perguntas.{p.campo_token ?? p.id}</code> ·
                        Tipo: {p.tipo} ·
                        Resposta atual: {respostas[p.campo_token ?? p.id] ?? "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SISTEMA */}
        <TabsContent value="sistema">
          <Card>
            <CardHeader><CardTitle className="text-base">Tokens de sistema</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field label="totais.total_geral" value={total_geral} />
              <Field label="categorias[].itens[]" value={tabela_itens_preview} mono />
              <div className="text-xs text-muted-foreground border-t pt-2">
                <strong>Como usar no template:</strong>
                <pre className="mt-2 bg-muted p-2 rounded text-[11px] overflow-auto">
{`{cliente.nome} - {cliente.cidade}
{responsavel.nome} ({responsavel.cargo})

{#categorias}
  {nome}
  {#itens}
    {nome} | qtd {quantidade} | {valor_total}
  {/itens}
  Subtotal: {subtotal}
{/categorias}

Total Geral: {totais.total_geral}`}
                </pre>
                <p className="mt-2">
                  Templates legados ainda funcionam: <code>{'{cliente_nome}'}</code>, <code>{'{#itens_infra}'}</code>, etc.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className={`text-sm border rounded-md px-3 py-2 bg-muted/30 ${mono ? "font-mono text-xs" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}
