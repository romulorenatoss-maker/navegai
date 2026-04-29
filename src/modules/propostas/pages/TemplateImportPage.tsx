import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileUp, Sparkles, Save, Plus, Pencil, Trash2, X, FileText, Eye, Loader2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "propostas-templates";

export default function TemplateImportPage() {
  const [templates, setTemplates] = useState<PropostasTemplate[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [html, setHtml] = useState<string>("");
  const [docxPath, setDocxPath] = useState<string | null>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pendingDocx, setPendingDocx] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [convertendo, setConvertendo] = useState(false);
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

  // Preview modal (PDF via CloudConvert)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  async function abrirPreview() {
    if (!pendingDocx && !docxPath) {
      toast.error(
        "Este template foi salvo sem o arquivo .docx original. Importe o .docx novamente (campo acima) para gerar o preview.",
        { duration: 6000 },
      );
      return;
    }
    setConvertendo(true);
    try {
      // Se ainda não há template salvo, cria um agora (rascunho) para vincular o .docx
      let tplId = editandoId;
      if (!tplId) {
        if (!nome.trim()) {
          toast.error("Defina um nome para o template antes do preview");
          setConvertendo(false);
          return;
        }
        const novo = await criarTemplate({
          nome,
          conteudo_html: html,
          tipo: "proposta",
          ativo: true,
          campos_detectados: (analise?.campos ?? []) as never,
        });
        tplId = novo.id;
        setEditandoId(tplId);
      }

      // Garante que o .docx atual está no storage
      let pathFinal = docxPath;
      if (pendingDocx) {
        pathFinal = await uploadDocx(tplId!, pendingDocx);
      }
      const { data, error } = await supabase.functions.invoke("preview-proposta", {
        body: { template_id: tplId, docx_path: pathFinal, force: !!pendingDocx },
      });
      if (error) throw error;
      const url = (data as { signed_url?: string })?.signed_url;
      if (!url) throw new Error("PDF não disponível");
      setPdfPath((data as { pdf_path?: string }).pdf_path ?? null);
      setPreviewUrl(url);
      setPreviewOpen(true);
      setPendingDocx(null);
    } catch (e: unknown) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha ao gerar preview");
    } finally {
      setConvertendo(false);
    }
  }

  async function uploadDocx(templateId: string, file: File): Promise<string> {
    const path = `templates/${templateId}-${Date.now()}.docx`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (upErr) throw upErr;
    await atualizarTemplate(templateId, { arquivo_docx_path: path, tipo_template: "docx" } as never);
    setDocxPath(path);
    return path;
  }

  function novoTemplate() {
    setEditandoId(null);
    setNome("");
    setHtml("");
    setDocxPath(null);
    setPdfPath(null);
    setPendingDocx(null);
    setAnalise(null);
    setEditorOpen(true);
  }

  function editarTemplate(t: PropostasTemplate) {
    setEditandoId(t.id);
    setNome(t.nome);
    setHtml(t.conteudo_html);
    setDocxPath((t as unknown as { arquivo_docx_path?: string | null }).arquivo_docx_path ?? null);
    setPdfPath((t as unknown as { arquivo_pdf_path?: string | null }).arquivo_pdf_path ?? null);
    setPendingDocx(null);
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
    setDocxPath(null);
    setPdfPath(null);
    setPendingDocx(null);
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
      setPendingDocx(file);
      // Invalida PDF antigo (será regenerado no próximo preview)
      setPdfPath(null);
      toast.success("Documento importado. O preview gerará um novo PDF.");
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={abrirPreview}
                    disabled={convertendo || !editandoId}
                    title={!editandoId ? "Salve o template antes" : ""}
                  >
                    {convertendo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                    {convertendo ? "Convertendo..." : "Ver preview"}
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

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" /> Preview do template
              <Badge variant="secondary" className="text-[10px] ml-2">PDF gerado</Badge>
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-xs underline text-primary"
                >
                  Abrir em nova aba
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title="Preview PDF"
              className="flex-1 w-full border rounded-md bg-white min-h-[70vh]"
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando…
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
