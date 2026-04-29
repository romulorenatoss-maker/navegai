import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileUp, Sparkles, Save, Plus, Pencil, Trash2, X, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  criarTemplate,
  listarTemplates,
  atualizarTemplate,
  excluirTemplate,
  type PropostasTemplate,
} from "../services/propostasService";
import { analisarTemplate, type AnaliseTemplate } from "../services/propostasIAService";
import { prepararHtmlParaEditor } from "../utils/propostasParser";
import { PropostaEditorVisual } from "../components/PropostaEditorVisual";

export default function TemplateImportPage() {
  const [templates, setTemplates] = useState<PropostasTemplate[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [analise, setAnalise] = useState<AnaliseTemplate | null>(null);

  async function carregar() {
    setLoadingList(true);
    try {
      const lista = await listarTemplates();
      setTemplates(lista);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar templates");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  function novoTemplate() {
    setEditandoId(null);
    setNome("");
    setHtml("");
    setAnalise(null);
    setEditorOpen(true);
  }

  function editarTemplate(t: PropostasTemplate) {
    setEditandoId(t.id);
    setNome(t.nome);
    setHtml(t.conteudo_html);
    setAnalise(null);
    setEditorOpen(true);
  }

  async function removerTemplate(t: PropostasTemplate) {
    if (!confirm(`Excluir o template "${t.nome}"?`)) return;
    try {
      await excluirTemplate(t.id);
      toast.success("Template excluído");
      carregar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  function fecharEditor() {
    setEditorOpen(false);
    setEditandoId(null);
    setNome("");
    setHtml("");
    setAnalise(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setHtml(prepararHtmlParaEditor(result.value));
      if (!nome) setNome(file.name.replace(/\.(docx?|html?)$/i, ""));
      setAnalise(null);
      toast.success("Documento importado.");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao converter o documento. Use .docx.");
    } finally {
      setLoading(false);
    }
  }

  async function analisarComIA() {
    if (!html.trim()) { toast.error("Importe ou cole conteúdo primeiro"); return; }
    setAnalisando(true);
    try {
      const result = await analisarTemplate(html);
      setAnalise(result);
      toast.success(`${result.campos.length} campo(s) detectado(s)`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro na análise IA";
      toast.error(msg);
    } finally {
      setAnalisando(false);
    }
  }

  async function salvar() {
    if (!nome.trim() || !html.trim()) {
      toast.error("Nome e conteúdo são obrigatórios");
      return;
    }
    try {
      if (editandoId) {
        await atualizarTemplate(editandoId, {
          nome,
          conteudo_html: html,
          ...(analise ? { campos_detectados: analise.campos as never } : {}),
        });
        toast.success("Template atualizado");
      } else {
        await criarTemplate({
          nome,
          conteudo_html: html,
          tipo: "proposta",
          ativo: true,
          campos_detectados: (analise?.campos ?? []) as never,
        });
        toast.success("Template salvo");
      }
      fecharEditor();
      carregar();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar template";
      toast.error(msg);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" /> Templates de Proposta
          </h1>
          <p className="text-sm text-muted-foreground">
            Templates salvos ficam aqui. Importe um <strong>.docx</strong> usando placeholders no formato{" "}
            <code className="px-1 bg-muted rounded">{"{chave}"}</code>.
          </p>
        </div>
        {!editorOpen && (
          <Button onClick={novoTemplate}>
            <Plus className="w-4 h-4 mr-2" /> Importar / Novo
          </Button>
        )}
      </div>

      {/* LISTA DE TEMPLATES SALVOS */}
      {!editorOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Templates salvos</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingList ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : templates.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                Nenhum template salvo ainda.<br />
                Clique em <strong>Importar / Novo</strong> para começar.
              </div>
            ) : (
              <div className="divide-y">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.nome}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-[10px]">{t.tipo}</Badge>
                        {Array.isArray(t.campos_detectados) && (
                          <span>{t.campos_detectados.length} campo(s)</span>
                        )}
                        <span>· atualizado em {new Date(t.updated_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => editarTemplate(t)}>
                        <Pencil className="w-4 h-4 mr-1" /> Editar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => removerTemplate(t)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* EDITOR (importar novo OU editar existente) */}
      {editorOpen && (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileUp className="w-5 h-5" />
                {editandoId ? "Editar template" : "Importar novo template"}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={fecharEditor}>
                <X className="w-4 h-4 mr-1" /> Fechar
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Arquivo .docx {editandoId && <span className="text-xs text-muted-foreground">(opcional — substitui o conteúdo)</span>}</Label>
                  <Input type="file" accept=".docx" onChange={handleFile} disabled={loading} />
                </div>
                <div>
                  <Label>Nome do template</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Proposta padrão 2026" />
                </div>
              </div>
            </CardContent>
          </Card>

          {html && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Editor visual</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={analisarComIA} disabled={analisando}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    {analisando ? "Analisando..." : "Analisar com IA"}
                  </Button>
                  <Button size="sm" onClick={salvar}>
                    <Save className="w-4 h-4 mr-2" />
                    {editandoId ? "Salvar alterações" : "Salvar template"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <PropostaEditorVisual value={html} onChange={setHtml} />
              </CardContent>
            </Card>
          )}

          {analise && (
            <Card>
              <CardHeader><CardTitle className="text-base">Análise IA</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <strong>Campos detectados:</strong>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {analise.campos.length === 0
                      ? <span className="text-muted-foreground">nenhum</span>
                      : analise.campos.map(c => (
                        <Badge key={c.chave} variant="secondary" title={c.sugestao}>{`{${c.chave}}`}</Badge>
                      ))}
                  </div>
                </div>
                {analise.blocos?.length > 0 && (
                  <div>
                    <strong>Blocos identificados:</strong>
                    <ul className="list-disc pl-5 mt-1 text-muted-foreground">
                      {analise.blocos.map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                )}
                {analise.onde_inserir_tabela && (
                  <p><strong>Tabela de produtos:</strong> {analise.onde_inserir_tabela}</p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
