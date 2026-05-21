# PADRAO GLOBAL DE ARQUITETURA E GOVERNANCA

Versao: 1.0
Status: OBRIGATORIO
Aplicacao: todos os modulos, telas, RPCs, triggers, SQL, Lovable, Claude e Codex.

## 0. Principio Mestre

O sistema nao deve crescer por remendos.

Objetivo:

- Sem V2.
- Sem telas paralelas.
- Sem duplicacao.
- Sem regras espalhadas.
- Sem logica critica no frontend.
- Sem recriar fluxo existente.
- Sem alteracao global desnecessaria.
- Sem reescrever telas funcionando.
- Sem leitura total repetitiva do projeto.

Toda alteracao deve ser:

- Cirurgica.
- Isolada.
- Rastreavel.
- Reversivel.
- Validada.

## 1. Bloco De Protecao Global

Antes de qualquer alteracao, o agente deve analisar a causa e informar:

- arquivos afetados;
- hooks afetados;
- componentes afetados;
- services afetados;
- RPCs afetadas;
- triggers afetadas;
- tabelas afetadas;
- telas afetadas;
- menus afetados;
- impactos;
- dependencias;
- reutilizacao validada;
- duplicidade verificada;
- regra existente verificada;
- alteracao minima confirmada.

Proibido:

- alterar regra validada sem justificativa;
- substituir regra funcionando;
- alterar modulo nao relacionado;
- refatorar globalmente;
- renomear em massa;
- alterar layout inteiro para ajuste pequeno.

## 2. Mudancas Cirurgicas

Regra absoluta: modificar somente o ponto exato.

Proibido:

- reescrever tela inteira;
- trocar layout completo;
- recriar componente existente;
- criar versao V2;
- criar paralelo.

Se existir arquivo oficial, a correcao deve ocorrer nele, somente no trecho necessario.

## 3. Proibido V2 E Paralelos

Nunca criar arquivos, pastas, rotas ou fluxos com sufixos/nomes como:

- V2;
- Novo;
- Final;
- Refactor;
- Old;
- Backup;
- Temp;
- Clone;
- Copy;
- Legacy paralelo.

A correcao deve ocorrer no arquivo oficial.

## 4. Sem Telas Paralelas

Antes de criar tela, verificar:

- rotas;
- menus;
- imports;
- componentes;
- hooks;
- render real.

Se existir tela equivalente, reutilizar. Nunca duplicar para corrigir.

## 5. Memoria Incremental

Apos indexacao inicial, manter:

- `docs/MEMORIA_PROJETO_CODEX.md`;
- ultimo contexto quando necessario;
- `docs/ULTIMA_ALTERACAO_CODEX.md`.

Proibido:

- reler projeto inteiro sem autorizacao;
- scanner global repetitivo;
- mapear tudo novamente sem necessidade.

Padrao por tarefa:

- 1 arquivo alterado;
- 1 arquivo relacionado;
- 1 dependencia.

Maximo padrao: 3 arquivos. Expansao somente com autorizacao.

## 6. Fase 0 Obrigatoria

Todo projeto/modulo relevante deve manter documentacao e artefatos de controle quando houver mudanca ampla:

- docs;
- manifest;
- rollback;
- checklist;
- diff.

Estrutura esperada por modulo:

- pages;
- hooks;
- components;
- services;
- utils;
- types;
- permissions;
- api/RPC;
- routes;
- validations;
- docs.

## 7. Nomenclatura Obrigatoria

- Tela: `modulo_nomeTela.tsx`.
- Hook: `modulo_useNomeHook.ts`.
- Componente: `modulo_nomeComponente.tsx`.
- Service: `modulo_service.ts` ou `modulo_nomeService.ts`.
- Util: `modulo_util.ts` ou `modulo_nomeUtil.ts`.
- Types: `modulo_types.ts`.
- RPC: `modulo_rpc_acao`.
- Trigger: `modulo_trigger_responsabilidade`.
- Migration: `YYYYMMDD_modulo_descricao.sql`.

Nomes devem carregar modulo e responsabilidade exata.

## 8. Arquitetura Em Camadas

Fluxo obrigatorio:

```text
UI -> Hook -> Service -> RPC -> Banco -> Trigger
```

Frontend controla apenas UI, estado visual e renderizacao.

Proibido no frontend quando for regra critica:

- `UPDATE` direto;
- `INSERT` direto;
- `DELETE` direto;
- regra critica;
- calculo critico;
- estoque;
- financeiro;
- validacao critica.

Fonte da verdade: banco.

## 9. Backend Como Fonte Da Verdade

Toda regra critica deve ficar em RPC, trigger, service, RLS ou banco. Nunca somente no componente.

## 10. Responsabilidade Unica

- Cada acao critica deve ter uma RPC explicita.
- Cada evento critico deve ter uma trigger explicita.

Proibido:

- RPC monstro;
- trigger generica;
- regra compartilhada sem fronteira clara.

## 11. Isolamento Por Modulo

Cada modulo possui tabelas, RPCs, triggers, services, hooks, tipos, rotas, permissoes e docs proprios.

Sem compartilhamento generico quando a responsabilidade pertence a um modulo.

## 12. Sem Nomes Genericos

Proibido usar nomes vagos como:

- dados;
- config;
- item;
- controle;
- temp;
- registro;
- geral;
- novo;
- v2;
- final.

Exigir nome explicito.

## 13. Historico Imutavel

Nunca sobrescrever historico validado.

Sempre usar:

- append;
- auditoria;
- log;
- timestamp;
- usuario;
- origem;
- acao.

Historico e imutavel.

## 14. Auditoria Obrigatoria

Operacoes criticas devem gerar auditoria:

- exclusao;
- estorno;
- financeiro;
- estoque;
- producao;
- fechamento;
- OS;
- implantacao.

Campos minimos:

- `user_id`;
- `acao`;
- `origem`;
- `antes`;
- `depois`;
- `data_hora`.

## 15. Idempotencia

Toda operacao critica deve prever:

- anti duplicidade;
- retry seguro;
- token;
- lock;
- controle transacional.

## 16. Seguranca

Obrigatorio quando aplicavel:

- bcrypt ou argon2;
- anti brute force;
- captcha progressivo;
- limite de login;
- delay progressivo;
- anti enumeracao;
- MFA admin;
- timeout de sessao;
- invalidar sessao;
- rate limit;
- auditoria;
- reset com expiracao;
- alertas.

## 17. Tenant / SaaS

Toda estrutura operacional nova deve prever:

- `tenant_id` ou chave equivalente;
- `cliente_id` quando aplicavel;
- RLS;
- isolamento.

Proibido modulo global indevido.

## 18. Offline First

Antes de implementar offline, mapear:

- cache;
- fila;
- `pendente_sync`;
- idempotencia;
- conflito;
- reserva;
- reenvio;
- status.

Sem diagnostico, nao implementar.

## 19. Validacao UI Real

Obrigatorio validar:

- rota;
- page;
- wrapper;
- component;
- hook;
- service;
- RPC.

Confirmar que o arquivo alterado e realmente renderizado.

Tambem validar:

- `git diff`;
- imports;
- arquivo morto;
- condicao de renderizacao.

## 20. Regra De Evolucao

Nova funcionalidade nao deve alterar regra validada sem aviso.

Preferir:

- nova RPC;
- novo trigger;
- nova excecao;
- nova camada.

Regra antiga permanece quando ainda ha consumidor.

## 21. Protocolo Lovable

Antes da alteracao:

- explicar;
- listar arquivos;
- listar impactos;
- listar SQL;
- listar RPC;
- listar trigger;
- listar telas;
- listar rotas.

Apos alteracao ampla, gerar quando aplicavel:

- diff;
- manifest;
- rollback;
- checklist;
- backup/artefato equivalente.

## 22. Pacote Obrigatorio Deploy

Quando houver deploy amplo ou banco, gerar:

- `diff_da_alteracao.md`;
- `manifest_deploy.json`;
- `rollback.sql`;
- `migration.sql`;
- `checklist_validacao.md`;
- backup ou instrucao de rollback.

Documentar:

- arvore antes/depois;
- imports;
- rotas;
- RPCs;
- triggers;
- menus.

## 23. Proibido Alteracao Silenciosa

Nunca criar ou alterar sem informar:

- arquivo;
- RPC;
- trigger;
- layout;
- rota;
- menu;
- service;
- hook;
- tabela.

## 24. Proibido Reescrita Global

Nunca executar "refatorar tudo", "reescrever modulo" ou "trocar tudo" sem diagnostico e autorizacao.

## 25. Regra De Menu Igual Modulo

Cada item de menu pertence a um modulo oficial do sistema.

Exemplos:

- Financeiro;
- Estoque;
- Producao;
- Engenharia;
- Tarefas;
- OS;
- Implantacao;
- Operacao.

Cada modulo deve ter estrutura propria e nomes coerentes com o modulo.

## 26. Checklist Antes De Codar

- Existe tela?
- Existe RPC?
- Existe trigger?
- Existe regra?
- Existe componente?
- Existe hook?
- Render foi confirmado?
- Dependencias foram mapeadas?
- Impacto foi informado?
- Diff previsto foi entendido?

## 27. Resposta Obrigatoria Do Agente

Antes de executar, responder:

```text
O QUE ENTENDI:
IMPACTO:
ARQUIVOS:
RPC:
TRIGGER:
RISCO:
ALTERACAO:
VALIDACAO:
```

Somente depois executar.
