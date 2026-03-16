import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ImportRow {
  nome: string;
  telefone: string;
  email?: string;
  endereco?: string;
  plano?: string;
}

interface ImportResult {
  row: ImportRow;
  status: "ok" | "duplicate" | "error";
  message?: string;
}

const normalizePhone = (phone: string) => phone.replace(/\D/g, "");

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(/[;,]/).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(/[;,]/).map((v) => v.trim().replace(/"/g, ""));
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return {
      nome: obj.nome || "",
      telefone: obj.telefone || obj.phone || obj.celular || "",
      email: obj.email || "",
      endereco: obj.endereco || "",
      plano: obj.plano || "",
    };
  }).filter((r) => r.nome && r.telefone);
}

export default function ImportadorLeadsPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults([]);

    if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
      const text = await file.text();
      setRows(parseCSV(text));
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      toast.error("Para arquivos Excel, salve como CSV antes de importar.");
      setRows([]);
    } else {
      toast.error("Formato não suportado. Use CSV.");
      setRows([]);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!profile || rows.length === 0) return;
    setImporting(true);
    const importResults: ImportResult[] = [];

    // Fetch existing phones for duplicate check
    const { data: existingLeadContatos } = await supabase
      .from("lead_contatos").select("valor").eq("tipo_contato", "telefone");
    const { data: existingClienteContatos } = await supabase
      .from("cliente_contatos").select("valor").eq("tipo", "movel");

    const existingPhones = new Set([
      ...(existingLeadContatos || []).map((c) => normalizePhone(c.valor)),
      ...(existingClienteContatos || []).map((c) => normalizePhone(c.valor)),
    ]);

    // Fetch rotina for auto-task
    const { data: firstRotina } = await supabase
      .from("rotina_tentativas_leads")
      .select("*").eq("tentativa_numero", 1).eq("ativo", true).maybeSingle();

    for (const row of rows) {
      const phoneNorm = normalizePhone(row.telefone);
      if (phoneNorm.length < 8) {
        importResults.push({ row, status: "error", message: "Telefone inválido" });
        continue;
      }
      if (existingPhones.has(phoneNorm)) {
        importResults.push({ row, status: "duplicate", message: "Telefone já cadastrado" });
        continue;
      }

      try {
        const { data: newLead, error } = await supabase.from("leads").insert({
          nome: row.nome,
          status_lead: "novo",
          responsavel_id: null,
          origem_lead: "importacao",
        }).select().single();

        if (error || !newLead) throw error || new Error("Falha ao criar lead");

        await supabase.from("lead_contatos").insert({
          lead_id: newLead.id,
          tipo_contato: "telefone",
          valor: row.telefone,
          tem_whatsapp: false,
        });

        if (row.email) {
          await supabase.from("lead_contatos").insert({
            lead_id: newLead.id,
            tipo_contato: "email",
            valor: row.email,
            tem_whatsapp: false,
          });
        }

        await supabase.from("lead_historico").insert({
          lead_id: newLead.id,
          usuario_id: profile.id,
          tipo_evento: "lead_criado",
          descricao: "Lead importado via CSV",
        });

        // Auto-create first task
        if (firstRotina) {
          const nextDate = new Date();
          // Primeira tentativa sempre no dia seguinte para evitar atraso no mesmo dia
          const diasAdicionais = Math.max(firstRotina.dias_apos_anterior || 0, 1);
          nextDate.setDate(nextDate.getDate() + diasAdicionais);
          await supabase.from("lead_tarefas_contato").insert({
            lead_id: newLead.id,
            tentativa: 1,
            data_contato: nextDate.toISOString(),
            periodo: firstRotina.periodo_contato,
            status: "pendente",
            responsavel_id: null,
          });
        }

        existingPhones.add(phoneNorm);
        importResults.push({ row, status: "ok" });
      } catch (err: any) {
        importResults.push({ row, status: "error", message: err.message });
      }
    }

    setResults(importResults);
    setImporting(false);
    const ok = importResults.filter((r) => r.status === "ok").length;
    const dupes = importResults.filter((r) => r.status === "duplicate").length;
    const errs = importResults.filter((r) => r.status === "error").length;
    toast.success(`Importação concluída: ${ok} criados, ${dupes} duplicados, ${errs} erros`);
  }, [rows, profile]);

  return (
    <div className="flex-1 min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Importador de Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">Importe leads a partir de arquivos CSV</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4" /> Selecionar Arquivo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border hover:border-primary cursor-pointer transition-colors">
                <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm">{fileName || "Escolher arquivo CSV"}</span>
                <input type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
              </label>
              {rows.length > 0 && (
                <Button onClick={() => { setRows([]); setResults([]); setFileName(""); }} variant="ghost" size="sm">
                  <X className="w-4 h-4 mr-1" /> Limpar
                </Button>
              )}
            </div>

            <Alert className="border-muted">
              <FileSpreadsheet className="h-4 w-4" />
              <AlertTitle>Formato esperado</AlertTitle>
              <AlertDescription className="text-xs">
                Colunas: <strong>nome, telefone, email, endereco, plano</strong> (separadas por vírgula ou ponto-e-vírgula)
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {rows.length > 0 && results.length === 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{rows.length} leads para importar</CardTitle>
              <Button onClick={handleImport} disabled={importing} className="press-effect">
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {importing ? "Importando..." : "Importar Leads"}
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plano</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell>{r.telefone}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.plano || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 50 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-xs">
                        ... e mais {rows.length - 50} registros
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultado da Importação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3 mb-4">
                <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
                  {results.filter((r) => r.status === "ok").length} criados
                </Badge>
                <Badge variant="default" className="bg-amber-500/10 text-amber-600 border-amber-200">
                  {results.filter((r) => r.status === "duplicate").length} duplicados
                </Badge>
                <Badge variant="default" className="bg-red-500/10 text-red-600 border-red-200">
                  {results.filter((r) => r.status === "error").length} erros
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.row.nome}</TableCell>
                      <TableCell>{r.row.telefone}</TableCell>
                      <TableCell>
                        {r.status === "ok" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        {r.status === "duplicate" && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                        {r.status === "error" && <X className="w-4 h-4 text-red-500" />}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.message || "Importado"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
