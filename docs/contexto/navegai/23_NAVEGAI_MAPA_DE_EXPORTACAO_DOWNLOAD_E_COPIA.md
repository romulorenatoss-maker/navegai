# Navegai - Exportacao, Download, Impressao e Copia

## 1. Pontos de saida de dados

| Tela/rota | Botao/action | Tipo | Dados exportados | Permissao separada | Audita | Marca d'agua | Risco |
|---|---|---|---|---|---|---|---|
| `/assistente` | exportar tabela | Excel/XLSX | relatorio do assistente | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | nao | medio |
| `/relatorios` | relatorios OS | PDF/CSV possivel | OS/avaliacoes | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | medio |
| `/leads/relatorios` | relatorios leads | CSV/Excel possivel | leads/comercial | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | alto |
| `/tarefas/relatorios` | relatorios tarefas | relatorio/export | tarefas/desempenho | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | alto |
| tarefas anexos | download anexo | download | evidencias/anexos | `permitir_download` existe | NAO ENCONTRADO NO CODIGO | nao | alto |
| propostas templates | preview/download PDF/DOCX | PDF/DOCX | propostas/templates | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO | alto |

## 2. Regras de protecao

- Exportacao nunca deve depender apenas de botao escondido.
- Download sensivel deve usar URL assinada/temporaria.
- `can_export` e `permitir_download` devem ser respeitados no backend.
- Relatorio sensivel deve gerar auditoria.
- Documento de proposta deve evitar URL publica permanente.
