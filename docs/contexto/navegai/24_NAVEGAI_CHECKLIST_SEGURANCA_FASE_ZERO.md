# Navegai - Checklist Seguranca Fase Zero

| Item | Status inicial | Observacao |
|---|---|---|
| `.env` fora do Git | OK | `.gitignore` contem `.env` |
| Service role fora do frontend | A validar | Edge Functions podem usar secrets |
| RLS habilitada em tabelas principais | Parcialmente OK | Confirmar por tabela antes de mexer |
| Policies por dados pessoais | A validar | Clientes/contatos reforcados em migration recente |
| Permissao de menu separada de backend | Parcial | Sidebar filtra, backend deve validar |
| Auditoria para acoes criticas | Parcial | Existem historicos; validar por action |
| Storage com policies | Parcial | Evidencias e buckets precisam revisao especifica |
| Exportacao controlada | A validar | PDF/DOCX/Excel exigem checagem |

## Proibicao

Nao criar nova policy/RLS/migration sem autorizacao explicita.
