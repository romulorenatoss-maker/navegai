# ARQUITETURA OFICIAL

## Principio mestre

O sistema nao deve crescer por remendos.

Toda alteracao deve ser:

- cirurgica;
- isolada;
- rastreavel;
- reversivel;
- validada.

Proibido:

- V2;
- telas paralelas;
- fluxos paralelos;
- duplicacao de hooks/services/RPCs/triggers;
- regra critica apenas no frontend;
- reescrita global sem diagnostico e autorizacao.

## Menu igual modulo

Cada item de menu pertence a um modulo oficial. O modulo deve carregar suas telas, hooks, componentes, services, tipos, permissoes, docs, tabelas, RPCs e triggers proprios.

## Estrutura de modulo

```text
src/modules/modulo/
  pages/
  hooks/
  components/
  services/
  utils/
  types/
```

## Nomenclatura

- Tela: `modulo_nomeTela.tsx`
- Hook: `modulo_useNomeHook.ts`
- Componente: `modulo_nomeComponente.tsx`
- Service: `modulo_service.ts` ou `modulo_nomeService.ts`
- Util: `modulo_util.ts`
- Types: `modulo_types.ts`
- RPC: `modulo_rpc_acao`
- Trigger: `modulo_trigger_responsabilidade`
- Migration: `YYYYMMDD_modulo_descricao.sql`

## Camadas

```text
UI -> Hook -> Service -> RPC -> Banco -> Trigger
```

Frontend controla UI, estado visual e renderizacao.

Regra critica deve ficar em service, RPC, trigger, RLS ou banco.

## Banco

- Uma tabela por dominio claro.
- Toda tabela nova deve prever auditoria.
- Em SaaS, toda estrutura operacional nova deve prever `tenant_id` ou isolamento equivalente, RLS e separacao de cliente.
- Historico validado nunca deve ser sobrescrito.
- Operacoes criticas devem ser idempotentes.

## RPC e trigger

- Uma RPC = uma acao.
- Um trigger = uma responsabilidade.
- `SECURITY DEFINER` somente quando necessario e justificado.
- Trigger silencioso sem auditoria e proibido.

## Offline

Antes de implementar offline, mapear:

- cache;
- fila;
- status local;
- conflito;
- idempotencia;
- reenvio;
- auditoria de sync;
- bloqueios.

Sem diagnostico, nao implementar offline.
