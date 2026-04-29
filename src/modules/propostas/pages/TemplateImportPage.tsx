import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileUp, Sparkles, Save } from "lucide-react";
import { toast } from "sonner";
import { criarTemplate } from "../services/propostasService";
import { analisarTemplate, type AnaliseTemplate } from "../services/propostasIAService";
import { prepararHtmlParaEditor } from "../utils/propostasParser";
import { PropostaEditorVisual } from "../components/PropostaEditorVisual";

export default function TemplateImportPage() {
  const [nome, setNome] = useState("");
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [analise, setAnalise] = useState<AnaliseTemplate | null>(null);

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
      await criarTemplate({
        nome,
        conteudo_html: html,
        tipo: "proposta",
        ativo: true,
        campos_detectados: (analise?.campos ?? []) as never,
      });
      toast.success("Template salvo");
      setNome(""); setHtml(""); setAnalise(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar template";
      toast.error(msg);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileUp className="w-6 h-6" /> Importar / Editar Template
        </h1>
        <p className="text-sm text-muted-foreground">
          Faça upload de um <strong>.docx</strong>. Use placeholders no formato <code className="px-1 bg-muted rounded">{"{chave}"}</code>.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Upload e nome</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Arquivo .docx</Label>
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
            <CardTitle className="text-base">2. Editor visual</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={analisarComIA} disabled={analisando}>
                <Sparkles className="w-4 h-4 mr-2" />
                {analisando ? "Analisando..." : "Analisar com IA"}
              </Button>
              <Button size="sm" onClick={salvar}>
                <Save className="w-4 h-4 mr-2" /> Salvar template
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
          <CardHeader><CardTitle className="text-base">3. Análise IA</CardTitle></CardHeader>
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
    </div>
  );
}
