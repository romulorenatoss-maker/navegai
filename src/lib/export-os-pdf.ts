import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface RespostaExport {
  pergunta: string;
  resposta: string;
  peso: number;
  observacao?: string | null;
}

interface AvaliacaoExport {
  avaliador_nome: string;
  tipo_avaliacao_nome: string;
  nota_final: number | null;
  concluida: boolean;
  concluida_em?: string | null;
  respostas: RespostaExport[];
}

interface OSExportData {
  numero_os: string;
  cliente_nome?: string | null;
  cliente_cpf?: string | null;
  colaborador_nome?: string | null;
  avaliacoes: AvaliacaoExport[];
}

export function exportOSPdf(data: OSExportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Relatório OS #${data.numero_os}`, pageWidth / 2, y, { align: "center" });
  y += 10;

  // Client info
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  if (data.cliente_nome) {
    doc.text(`Cliente: ${data.cliente_nome}`, 14, y);
    y += 5;
  }
  if (data.cliente_cpf) {
    doc.text(`CPF: ${data.cliente_cpf}`, 14, y);
    y += 5;
  }
  if (data.colaborador_nome) {
    doc.text(`Colaborador: ${data.colaborador_nome}`, 14, y);
    y += 5;
  }

  doc.text(`Data de exportação: ${new Date().toLocaleDateString("pt-BR")}`, 14, y);
  y += 8;

  // Each evaluation
  for (const aval of data.avaliacoes) {
    // Check page space
    if (y > 260) { doc.addPage(); y = 15; }

    // Evaluator header
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Avaliador: ${aval.avaliador_nome}`, 14, y);
    if (aval.nota_final != null) {
      doc.text(`Nota: ${Number(aval.nota_final).toFixed(1)}%`, pageWidth - 14, y, { align: "right" });
    }
    y += 5;

    if (aval.concluida_em) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`Concluída em: ${new Date(aval.concluida_em).toLocaleString("pt-BR")}`, 14, y);
      y += 5;
    }

    // Responses table
    const tableData = aval.respostas.map((r, i) => {
      const respLabel = r.resposta === "sim" ? "SIM" : r.resposta === "nao" ? "NÃO" : "N/A";
      return [
        String(i + 1),
        r.pergunta,
        respLabel,
        String(r.peso),
        r.observacao || "",
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["#", "Pergunta", "Resposta", "Peso", "Observação"]],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 51, 51], textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 80 },
        2: { cellWidth: 18, halign: "center" },
        3: { cellWidth: 12, halign: "center" },
        4: { cellWidth: 60 },
      },
      margin: { left: 14, right: 14 },
      didDrawPage: () => {
        // Footer
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);
        doc.text(`OS #${data.numero_os}`, 14, doc.internal.pageSize.getHeight() - 8);
        doc.text(`Página ${doc.getNumberOfPages()}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
        doc.setTextColor(0);
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  doc.save(`OS_${data.numero_os}.pdf`);
}
