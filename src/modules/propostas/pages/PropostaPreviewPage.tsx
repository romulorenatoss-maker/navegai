import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Save, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { obterProposta, atualizarProposta } from "../services/propostasService";
import { ajustarTexto, registrarAjusteIA } from "../services/propostasIAService";
import { PropostaEditorVisual } from "../components/PropostaEditorVisual";
import { Input } from "@/components/ui/input";

export default function PropostaPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [prop, setProp] = useState<any | null>(null);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const [instrucao, setInstrucao] = useState("");

  useEffect(() => {
    if (!id) return;
    obterProposta(id)
      .then((p) => { setProp(p); setHtml(p.conteudo_editado ?? p.conteudo_original ?? ""); })
      .catch((e) => toast.error(e.message ?? "Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [id]);

  async function salvar() {
    if (!id) return;
    setSaving(true);
    try {
      await atualizarProposta(id, { conteudo_editado: html });
      toast.success("Edição salva");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setSaving(false); }
  }

  async function ajustarComIA() {
    if (!instrucao.trim()) { toast.error("Descreva o ajuste desejado"); return; }
    setAjustando(true);
    const antes = html;
    try {
      const novo = await ajustarTexto(html, instrucao, `proposta_${id}`);
      setHtml(novo);
      // memória — registro fire-and-forget
      registrarAjusteIA(antes, novo, instrucao).catch(console.error);
      toast.success("Texto ajustado pela IA");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro IA");
    } finally { setAjustando(false); }
  }

  async function aprovar() {
    if (!id) return;
    if (!confirm("Aprovar esta proposta? O conteúdo atual será marcado como versão aprovada.")) return;
    setSaving(true);
    try {
      await atualizarProposta(id, { conteudo_editado: html, status: "aprovado" });
      toast.success("Proposta aprovada");
      navigate("/propostas");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  if (!prop) return <div className="p-6 text-sm text-muted-foreground">Proposta não encontrada.</div>;

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/propostas")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-2xl font-bold mt-1">Preview & Edição</h1>
          <p className="text-sm text-muted-foreground">
            Cliente: <strong>{prop.clientes?.nome}</strong> ·{" "}
            <Badge variant={prop.status === "aprovado" ? "default" : "secondary"}>{prop.status}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={salvar} disabled={saving}><Save className="w-4 h-4 mr-2" /> Salvar</Button>
          <Button onClick={aprovar} disabled={saving || prop.status === "aprovado"}>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Aprovar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Documento</CardTitle></CardHeader>
        <CardContent>
          <PropostaEditorVisual value={html} onChange={setHtml} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Ajustar texto com IA
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            placeholder='Ex.: "tornar a introdução mais formal", "remover seção de garantia"'
            disabled={ajustando}
          />
          <Button onClick={ajustarComIA} disabled={ajustando || !instrucao.trim()}>
            {ajustando ? "Ajustando..." : "Aplicar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
