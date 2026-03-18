import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, UserCheck, Archive, XCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type RowStatus = "new" | "duplicate_active" | "duplicate_archived" | "duplicate_lost" | "duplicate_client" | "invalid";
export type RowAction = "import" | "skip" | "import_alert";

export interface PreviewRow {
  index: number;
  nome: string;
  telefone: string;
  phoneNormalized: string;
  email: string;
  cidade: string;
  bairro: string;
  rua: string;
  numero: string;
  plano: string;
  repetidor: string;
  status: RowStatus;
  action: RowAction;
  duplicateInfo?: {
    leadId?: string;
    leadNome?: string;
    statusLead?: string;
    responsavelNome?: string;
    isClient?: boolean;
  };
  error?: string;
}

interface Props {
  rows: PreviewRow[];
  onActionChange: (index: number, action: RowAction) => void;
}

const STATUS_CONFIG: Record<RowStatus, { label: string; color: string; icon: React.ReactNode }> = {
  new: { label: "Novo", color: "bg-emerald-500/10 text-emerald-600 border-emerald-200", icon: <CheckCircle2 className="w-3 h-3" /> },
  duplicate_active: { label: "Ativo", color: "bg-amber-500/10 text-amber-600 border-amber-200", icon: <UserCheck className="w-3 h-3" /> },
  duplicate_archived: { label: "Arquivado", color: "bg-slate-500/10 text-slate-500 border-slate-200", icon: <Archive className="w-3 h-3" /> },
  duplicate_lost: { label: "Perdido", color: "bg-red-500/10 text-red-500 border-red-200", icon: <XCircle className="w-3 h-3" /> },
  duplicate_client: { label: "Cliente", color: "bg-blue-500/10 text-blue-500 border-blue-200", icon: <UserCheck className="w-3 h-3" /> },
  invalid: { label: "Inválido", color: "bg-red-500/10 text-red-500 border-red-200", icon: <XCircle className="w-3 h-3" /> },
};

export default function ImportPreviewTable({ rows, onActionChange }: Props) {
  const newCount = rows.filter(r => r.status === "new").length;
  const dupCount = rows.filter(r => r.status.startsWith("duplicate")).length;
  const invalidCount = rows.filter(r => r.status === "invalid").length;
  const importCount = rows.filter(r => r.action !== "skip").length;

  // Sort: duplicates & invalids first, then new
  const STATUS_ORDER: Record<RowStatus, number> = {
    duplicate_active: 0,
    duplicate_client: 1,
    duplicate_archived: 2,
    duplicate_lost: 3,
    invalid: 4,
    new: 5,
  };
  const sortedRows = [...rows].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">{newCount} novos</Badge>
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">{dupCount} duplicados</Badge>
        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-200">{invalidCount} inválidos</Badge>
        <Badge variant="outline" className="border-primary/30 text-primary">{importCount} para importar</Badge>
      </div>

      <div className="max-h-[420px] overflow-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead>Detalhes</TableHead>
              <TableHead className="text-center">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => {
              const cfg = STATUS_CONFIG[row.status];
              const isSkipped = row.action === "skip";
              return (
                <TableRow key={row.index} className={isSkipped ? "opacity-50" : ""}>
                  <TableCell className="text-xs text-muted-foreground">{row.index + 1}</TableCell>
                  <TableCell className="font-medium text-sm">{row.nome || "—"}</TableCell>
                  <TableCell className="text-sm">{row.telefone || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.email || "—"}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={`${cfg.color} text-[10px] gap-1`}>
                      {cfg.icon} {cfg.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                    {row.error && <span className="text-destructive">{row.error}</span>}
                    {row.duplicateInfo && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 cursor-help">
                            <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                            <span className="truncate">
                              {row.duplicateInfo.isClient
                                ? "Cliente cadastrado"
                                : `${row.duplicateInfo.statusLead || "ativo"} — ${row.duplicateInfo.responsavelNome || "sem responsável"}`}
                            </span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs max-w-xs">
                          {row.duplicateInfo.isClient ? (
                            <p>Telefone pertence a cliente já cadastrado na base.</p>
                          ) : (
                            <div>
                              <p><strong>Lead:</strong> {row.duplicateInfo.leadNome}</p>
                              <p><strong>Status:</strong> {row.duplicateInfo.statusLead}</p>
                              <p><strong>Responsável:</strong> {row.duplicateInfo.responsavelNome || "Nenhum"}</p>
                            </div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {!row.error && !row.duplicateInfo && "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {row.status === "invalid" ? (
                      <span className="text-[10px] text-muted-foreground">Pular</span>
                    ) : (
                      <Select
                        value={row.action}
                        onValueChange={(val) => onActionChange(row.index, val as RowAction)}
                      >
                        <SelectTrigger className="h-7 text-[11px] w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="import">Importar</SelectItem>
                          <SelectItem value="skip">Pular</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}