import { useState, useCallback, useMemo } from "react";
import { normalizePhone } from "@/lib/phone-utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown } from "lucide-react";
import * as XLSX from "xlsx";
import ColumnMapper, { autoDetectMapping, type ColumnMapping } from "@/components/import/ColumnMapper";

const PREPOSITIONS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "nas", "nos", "com", "para", "por"]);

/** "JOÃO DA SILVA" → "João da Silva" */
function toProperCase(text: string): string {
  if (!text) return text;
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (i > 0 && PREPOSITIONS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Universal file parser: CSV, XLS, XLSX, Google Sheets exports */
function parseFileToJSON(buffer: ArrayBuffer, fileName: string): { headers: string[]; rows: Record<string, string>[] } {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
  if (jsonData.length === 0) return { headers: [], rows: [] };
  const headers = Object.keys(jsonData[0]);
  const rows = jsonData.map(row => {
    const obj: Record<string, string> = {};
    headers.forEach(h => { obj[h] = String(row[h] ?? "").trim(); });
    return obj;
  }).filter(r => Object.values(r).some(v => v.trim()));
  return { headers, rows };
}

import ImportPreviewTable, { type PreviewRow, type RowAction, type RowStatus } from "@/components/import/ImportPreviewTable";
import { TooltipProvider } from "@/components/ui/tooltip";

type Step = "upload" | "mapping" | "preview" | "results";

interface ImportResult {
  nome: string;
  telefone: string;
  status: "ok" | "skipped" | "error";
  message?: string;

export default function ImportadorLeadsPage() {
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ nome: "", telefone: "", email: "", endereco: "", plano: "" });
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [showResultDetails, setShowResultDetails] = useState(false);
  const [campanhaId, setCampanhaId] = useState("");

  const { data: campanhas = [] } = useQuery({
    queryKey: ["campanhas-ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campanhas").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
  });

  const selectedCampanhaNome = campanhas.find(c => c.id === campanhaId)?.nome || null;
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Pick file (no processing yet)
  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".csv") && !ext.endsWith(".txt") && !ext.endsWith(".xls") && !ext.endsWith(".xlsx")) {
      toast.error("Formato não suportado. Use CSV, XLS ou XLSX.");
      return;
    }
    setFileName(file.name);
    setPendingFile(file);
    setResults([]);
  }, []);

  // Process file on button click
  const handleLoadFile = useCallback(async () => {
    if (!pendingFile) return;
    if (!campanhaId || campanhaId === "__none") {
      toast.error("Selecione uma campanha antes de carregar.");
      return;
    }
    const buffer = await pendingFile.arrayBuffer();
    const { headers, rows } = parseFileToJSON(buffer, pendingFile.name);
    if (headers.length === 0 || rows.length === 0) {
      toast.error("Arquivo vazio ou sem dados válidos.");
      return;
    }
    setRawHeaders(headers);
    setRawRows(rows);
    const detected = autoDetectMapping(headers);
    setMapping(detected);
    setStep("mapping");
  }, [pendingFile, campanhaId]);

  // Step 2: Build preview with duplicate detection
  const buildPreview = useCallback(async () => {
    if (!mapping.nome || !mapping.telefone) {
      toast.error("Mapeie pelo menos Nome e Telefone.");
      return;
    }
    setLoadingPreview(true);

    // Fetch all existing phone records
    const [{ data: leadContatos }, { data: clienteContatos }, { data: allLeads }, { data: allProfiles }] = await Promise.all([
      supabase.from("lead_contatos").select("lead_id, valor").eq("tipo_contato", "telefone"),
      supabase.from("cliente_contatos").select("cliente_id, valor").in("tipo", ["movel", "fixo", "telefone"]),
      supabase.from("leads").select("id, nome, status_lead, responsavel_id"),
      supabase.from("profiles").select("id, nome"),
    ]);

    // Build phone lookup maps
    const leadPhoneMap = new Map<string, string>(); // normalized phone -> lead_id
    for (const c of leadContatos || []) leadPhoneMap.set(normalizePhone(c.valor), c.lead_id);

    const clientPhoneSet = new Set<string>();
    for (const c of clienteContatos || []) clientPhoneSet.add(normalizePhone(c.valor));

    const leadMap = new Map<string, any>();
    for (const l of allLeads || []) leadMap.set(l.id, l);

    const profileMap = new Map<string, string>();
    for (const p of allProfiles || []) profileMap.set(p.id, p.nome);

    // Track phones within the CSV itself for intra-file duplicates
    const seenInFile = new Map<string, number>();

    const rows: PreviewRow[] = rawRows.map((raw, i) => {
      const nome = toProperCase(raw[mapping.nome] || "");
      const telefone = raw[mapping.telefone] || "";
      const email = mapping.email ? raw[mapping.email] || "" : "";
      const phoneNorm = normalizePhone(telefone);

      // Validate
      if (!nome.trim() || phoneNorm.length < 8) {
        return {
          index: i, nome, telefone, phoneNormalized: phoneNorm, email,
          status: "invalid" as RowStatus, action: "skip" as RowAction,
          error: !nome.trim() ? "Nome vazio" : "Telefone inválido",
        };
      }

      // Intra-file duplicate
      if (seenInFile.has(phoneNorm)) {
        return {
          index: i, nome, telefone, phoneNormalized: phoneNorm, email,
          status: "duplicate_active" as RowStatus, action: "skip" as RowAction,
          duplicateInfo: { leadNome: rawRows[seenInFile.get(phoneNorm)!][mapping.nome], statusLead: "duplicado no arquivo", responsavelNome: "" },
        };
      }
      seenInFile.set(phoneNorm, i);

      // Check existing leads
      const existingLeadId = leadPhoneMap.get(phoneNorm);
      if (existingLeadId) {
        const lead = leadMap.get(existingLeadId);
        if (lead) {
          const statusMap: Record<string, RowStatus> = {
            arquivado: "duplicate_archived",
            perdido: "duplicate_lost",
          };
          const rowStatus: RowStatus = statusMap[lead.status_lead] || "duplicate_active";
          return {
            index: i, nome, telefone, phoneNormalized: phoneNorm, email,
            status: rowStatus,
            action: rowStatus === "duplicate_archived" || rowStatus === "duplicate_lost" ? "import" as RowAction : "skip" as RowAction,
            duplicateInfo: {
              leadId: lead.id, leadNome: lead.nome, statusLead: lead.status_lead,
              responsavelNome: lead.responsavel_id ? profileMap.get(lead.responsavel_id) || "—" : "Sem responsável",
            },
          };
        }
      }

      // Check existing clients
      if (clientPhoneSet.has(phoneNorm)) {
        return {
          index: i, nome, telefone, phoneNormalized: phoneNorm, email,
          status: "duplicate_client" as RowStatus, action: "import_alert" as RowAction,
          duplicateInfo: { isClient: true },
        };
      }

      return {
        index: i, nome, telefone, phoneNormalized: phoneNorm, email,
        status: "new" as RowStatus, action: "import" as RowAction,
      };
    });

    setPreviewRows(rows);
    setLoadingPreview(false);
    setStep("preview");
  }, [rawRows, mapping]);

  const handleActionChange = useCallback((index: number, action: RowAction) => {
    setPreviewRows(prev => prev.map(r => r.index === index ? { ...r, action } : r));
  }, []);

  // Step 3: Import
  const handleImport = useCallback(async () => {
    if (!profile) return;
    setImporting(true);
    const toImport = previewRows.filter(r => r.action !== "skip" && r.status !== "invalid");
    const importResults: ImportResult[] = [];

    const { data: firstRotina } = await supabase
      .from("rotina_tentativas_leads")
      .select("*").eq("tentativa_numero", 1).eq("ativo", true).maybeSingle();

    for (const row of toImport) {
      try {
        const nomeFmt = toProperCase(row.nome);
        const { data: newLead, error } = await supabase.from("leads").insert({
          nome: nomeFmt,
          status_lead: "aguardando_captura",
          responsavel_id: null,
          origem_lead: "importacao",
          campanha_id: (campanhaId && campanhaId !== "__none") ? campanhaId : null,
        } as any).select().single();

        if (error || !newLead) throw error || new Error("Falha ao criar lead");

        await supabase.from("lead_contatos").insert({
          lead_id: newLead.id, tipo_contato: "telefone", valor: row.telefone, tem_whatsapp: false,
        });

        if (row.email) {
          await supabase.from("lead_contatos").insert({
            lead_id: newLead.id, tipo_contato: "email", valor: row.email, tem_whatsapp: false,
          });
        }

        const descParts = [selectedCampanhaNome
          ? `Lead importado da campanha "${selectedCampanhaNome}"`
          : "Lead importado via CSV"];
        if (row.action === "import_alert") descParts.push("⚠️ Importado com alerta de duplicidade");
        if (row.duplicateInfo) {
          if (row.duplicateInfo.isClient) {
            descParts.push("— telefone pertence a cliente cadastrado");
          } else {
            descParts.push(`— duplicado de lead "${row.duplicateInfo.leadNome}" (${row.duplicateInfo.statusLead})`);
          }
        }

        await supabase.from("lead_historico").insert({
          lead_id: newLead.id, usuario_id: profile.id,
          tipo_evento: "lead_criado", descricao: descParts.join(" "),
        });

        if (firstRotina) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + Math.max(firstRotina.dias_apos_anterior || 0, 1));
          await supabase.from("lead_tarefas_contato").insert({
            lead_id: newLead.id, tentativa: 1,
            data_contato: nextDate.toISOString(), periodo: firstRotina.periodo_contato,
            status: "pendente", responsavel_id: null,
          });
        }

        importResults.push({ nome: row.nome, telefone: row.telefone, status: "ok" });
      } catch (err: any) {
        importResults.push({ nome: row.nome, telefone: row.telefone, status: "error", message: err.message });
      }
    }

    // Add skipped
    for (const row of previewRows.filter(r => r.action === "skip" || r.status === "invalid")) {
      importResults.push({ nome: row.nome, telefone: row.telefone, status: "skipped", message: row.error || "Pulado pelo usuário" });
    }

    setResults(importResults);
    setStep("results");
    setImporting(false);
    const ok = importResults.filter(r => r.status === "ok").length;
    const skipped = importResults.filter(r => r.status === "skipped").length;
    const errs = importResults.filter(r => r.status === "error").length;
    toast.success(`Importação concluída: ${ok} criados, ${skipped} pulados, ${errs} erros`);
  }, [previewRows, profile, campanhaId, selectedCampanhaNome]);

  const reset = () => {
    setStep("upload"); setFileName(""); setRawHeaders([]); setRawRows([]);
    setMapping({ nome: "", telefone: "", email: "", endereco: "", plano: "" });
    setPreviewRows([]); setResults([]);
  };

  return (
    <TooltipProvider>
      <div className="flex-1 min-h-screen bg-background">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Importador de Leads</h1>
              <p className="text-sm text-muted-foreground mt-1">Importe leads com mapeamento inteligente e detecção de duplicados</p>
            </div>
            {step !== "upload" && (
              <Button variant="ghost" size="sm" onClick={reset}><X className="w-4 h-4 mr-1" /> Recomeçar</Button>
            )}
          </div>

          {/* Step indicators */}
          <div className="flex gap-2 text-xs">
            {(["upload", "mapping", "preview", "results"] as Step[]).map((s, i) => (
              <Badge
                key={s}
                variant={step === s ? "default" : "secondary"}
                className={`text-[10px] ${step === s ? "" : "opacity-50"}`}
              >
                {i + 1}. {s === "upload" ? "Arquivo" : s === "mapping" ? "Mapeamento" : s === "preview" ? "Pré-visualização" : "Resultado"}
              </Badge>
            ))}
          </div>

          {/* Upload step */}
          {step === "upload" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Selecionar Arquivo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-2 px-4 py-6 rounded-lg border-2 border-dashed border-border hover:border-primary cursor-pointer transition-colors justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm">{fileName || "Escolher arquivo CSV, XLS ou XLSX"}</span>
                  <input type="file" accept=".csv,.txt,.xls,.xlsx" className="hidden" onChange={handleFilePick} />
                </label>

                <div className="space-y-1.5">
                  <Label>Campanha *</Label>
                  <Select value={campanhaId} onValueChange={setCampanhaId}>
                    <SelectTrigger className="w-full sm:w-72">
                      <SelectValue placeholder="Selecione uma campanha..." />
                    </SelectTrigger>
                    <SelectContent>
                      {campanhas.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Obrigatório. Todos os leads importados serão vinculados a esta campanha.</p>
                </div>

                <Alert className="border-muted">
                  <FileSpreadsheet className="h-4 w-4" />
                  <AlertTitle>Formato esperado</AlertTitle>
                   <AlertDescription className="text-xs">
                    Aceita arquivos <strong>CSV, XLS e XLSX</strong> (incluindo exportações do Google Sheets).
                    O sistema detecta automaticamente as colunas: nome, telefone, email, endereco, plano.
                  </AlertDescription>
                </Alert>

                <div className="flex justify-end">
                  <Button
                    onClick={handleLoadFile}
                    disabled={!pendingFile || !campanhaId || campanhaId === "__none"}
                    className="press-effect"
                  >
                    <Upload className="w-4 h-4 mr-2" /> Carregar Arquivo
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mapping step */}
          {step === "mapping" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {rawRows.length} registros encontrados em "{fileName}"
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ColumnMapper headers={rawHeaders} mapping={mapping} onChange={setMapping} />

                {selectedCampanhaNome && (
                  <p className="text-xs text-muted-foreground">
                    Campanha: <span className="font-semibold text-foreground">{selectedCampanhaNome}</span>
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setStep("upload")}>Voltar</Button>
                  <Button
                    onClick={buildPreview}
                    disabled={!mapping.nome || !mapping.telefone || loadingPreview}
                    className="press-effect"
                  >
                    {loadingPreview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    {loadingPreview ? "Analisando..." : "Analisar e Pré-visualizar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview step */}
          {step === "preview" && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Pré-visualização da Importação</CardTitle>
                  {selectedCampanhaNome && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Campanha: <span className="font-semibold">{selectedCampanhaNome}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep("mapping")}>Voltar</Button>
                  <Button
                    onClick={handleImport}
                    disabled={importing || previewRows.filter(r => r.action !== "skip" && r.status !== "invalid").length === 0}
                    className="press-effect"
                  >
                    {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {importing ? "Importando..." : `Importar ${previewRows.filter(r => r.action !== "skip" && r.status !== "invalid").length} Leads`}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ImportPreviewTable rows={previewRows} onActionChange={handleActionChange} />
              </CardContent>
            </Card>
          )}

          {/* Results step */}
          {step === "results" && results.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resultado da Importação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-600">{results.filter(r => r.status === "ok").length}</p>
                    <p className="text-xs text-muted-foreground">Criados</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-muted-foreground">{results.filter(r => r.status === "skipped").length}</p>
                    <p className="text-xs text-muted-foreground">Pulados</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold text-destructive">{results.filter(r => r.status === "error").length}</p>
                    <p className="text-xs text-muted-foreground">Erros</p>
                  </div>
                </div>

                {selectedCampanhaNome && (
                  <p className="text-xs text-muted-foreground">Campanha: <span className="font-semibold text-foreground">{selectedCampanhaNome}</span></p>
                )}

                {/* Expandable details */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowResultDetails(v => !v)}
                >
                  <ChevronDown className={`w-4 h-4 mr-2 transition-transform ${showResultDetails ? "rotate-180" : ""}`} />
                  {showResultDetails ? "Ocultar detalhes" : "Ver leads importados"}
                </Button>

                {showResultDetails && (
                  <div className="max-h-[350px] overflow-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                          <TableHead>Detalhe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{r.nome}</TableCell>
                            <TableCell className="text-sm">{r.telefone}</TableCell>
                            <TableCell className="text-center">
                              {r.status === "ok" && <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />}
                              {r.status === "skipped" && <AlertTriangle className="w-4 h-4 text-muted-foreground mx-auto" />}
                              {r.status === "error" && <X className="w-4 h-4 text-destructive mx-auto" />}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.message || "Importado"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
