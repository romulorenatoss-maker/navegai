# Navegai - Mapa de Exportacao, Download e Copia

## 1. Exportacoes/downloads encontrados

| Recurso | Caminho | Modulo | Risco |
|---|---|---|---|
| PDF OS | `src/lib/export-os-pdf.ts` | Avaliacoes/Relatorios | Dados de OS/cliente |
| Planilhas/Excel | dependencia `xlsx` e paginas de relatorio/importador | Leads/Relatorios | Dados pessoais |
| DOCX proposta | `propostas-render-docx`, `preview-proposta` | Propostas | Dados comerciais |
| Anexos tarefas | `tarefas-storage-signed-url`, `tarefas-storage-upload` | Tarefas | Evidencias |
| Templates proposta | Storage/bucket propostas | Propostas | Arquivos comerciais |

## 2. Regras

- Download/exportacao sensivel deve validar permissao.
- Signed URL deve ter escopo e tempo controlado.
- Nao expor bucket publico sem necessidade.
- Ao alterar exportacao, atualizar mapas `20`, `21`, `22` e `23`.
