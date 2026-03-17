import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";

interface ReportTableData {
  title: string;
  columns: string[];
  rows: string[][];
}

export function AssistenteReportTable({ data }: { data: ReportTableData }) {
  const handleExport = () => {
    const ws = XLSX.utils.aoa_to_sheet([data.columns, ...data.rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    
    // Auto-size columns
    const colWidths = data.columns.map((col, i) => {
      const maxLen = Math.max(col.length, ...data.rows.map(r => (r[i] || "").length));
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws["!cols"] = colWidths;
    
    XLSX.writeFile(wb, `${data.title.replace(/[^a-zA-Z0-9À-ü ]/g, "").trim()}.xlsx`);
  };

  return (
    <Card className="my-3">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">{data.title}</CardTitle>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExport}>
          <Download className="w-3.5 h-3.5" />
          Exportar Excel
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[300px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {data.columns.map((col, i) => (
                  <TableHead key={i} className="text-xs whitespace-nowrap">{col}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.slice(0, 100).map((row, ri) => (
                <TableRow key={ri}>
                  {row.map((cell, ci) => (
                    <TableCell key={ci} className="text-xs py-1.5 whitespace-nowrap">{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {data.rows.length > 100 && (
          <div className="text-xs text-muted-foreground text-center py-2">
            Exibindo 100 de {data.rows.length} registros. Exporte para ver todos.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
