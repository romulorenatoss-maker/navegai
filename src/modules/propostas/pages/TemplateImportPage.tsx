import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUp, FileText } from "lucide-react";
import { toast } from "sonner";
import { criarTemplate } from "../services/propostasService";

export default function TemplateImportPage() {
  const [nome, setNome] = useState("");
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      // mammoth carregado dinamicamente para não pesar bundle
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setHtml(result.value);
      if (!nome) setNome(file.name.replace(/\.(docx?|html?)$/i, ""));
      toast.success("Documento importado. Revise e salve como template.");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao converter o documento. Use .docx.");
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    if (!nome.trim() || !html.trim()) {
      toast.error("Nome e conteúdo são obrigatórios");
      return;
    }
    try {
      await criarTemplate({ nome, conteudo_html: html, tipo: "proposta", ativo: true });
      toast.success("Template salvo");
      setNome(""); setHtml("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar template";
      toast.error(msg);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileUp className="w-6 h-6" /> Importar Template
        </h1>
        <p className="text-sm text-muted-foreground">
          Faça upload de um arquivo <strong>.docx</strong>. O conteúdo será convertido para HTML editável.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Upload</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Arquivo .docx</Label>
            <Input type="file" accept=".docx" onChange={handleFile} disabled={loading} />
          </div>
          <div>
            <Label>Nome do template</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Proposta padrão 2026" />
          </div>
        </CardContent>
      </Card>

      {html && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> 2. Pré-visualização
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm max-w-none border rounded-md p-4 bg-card max-h-[480px] overflow-auto"
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <div className="flex justify-end mt-4">
              <Button onClick={salvar}>Salvar como template</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
