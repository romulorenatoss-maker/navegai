# Navegai - Checklist de Seguranca Fase Zero

## Antes de criar tabela

- [ ] Tem modulo dono?
- [ ] Tem tenant_id quando aplicavel?
- [ ] Tem empresa_id/cnpj_id/local_id quando aplicavel?
- [ ] Tem RLS/policies?
- [ ] Tem auditoria?
- [ ] Tem dado sensivel?
- [ ] Tem indice necessario?
- [ ] Tem rollback?

## Antes de criar tela

- [ ] Tem rota protegida?
- [ ] Tem permissao de visualizar?
- [ ] Tem mascaramento quando necessario?
- [ ] Tem controle de exportacao/download?
- [ ] Tem action contract para botoes criticos?
- [ ] Nao duplica tela existente?

## Antes de criar RPC/API

- [ ] Valida permissao?
- [ ] Valida tenant/local?
- [ ] Usa action_id?
- [ ] Usa correlation_id?
- [ ] Usa idempotency_key se critica?
- [ ] Audita?
- [ ] Tem fluxo reverso?
- [ ] Tem tratamento de erro?
- [ ] Nao usa service role antes de validar usuario?

## Antes de alterar Tarefas

- [ ] Consultou `02`, `05`, `09`, `10` e docs do modulo?
- [ ] Confirmou RPC oficial?
- [ ] Confirmou trigger/status?
- [ ] Confirmou fluxo reverso?
- [ ] Atualizou changelog e mapa especifico?

## Antes de alterar Propostas

- [ ] Confirmou pagina/service/function?
- [ ] Confirmou storage `propostas-templates`?
- [ ] Confirmou impacto em DOCX/PDF/CloudConvert/IA?
- [ ] Nao expôs segredo?
