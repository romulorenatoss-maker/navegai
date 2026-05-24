# Navegai - Sumario Geral

## 1. Identificacao

- Nome oficial: Navegai
- Slug tecnico: navegai
- Data do mapeamento: 2026-05-24
- Responsavel pelo mapeamento: Codex
- Origem analisada: repositorio `romulorenatoss-maker/navegai`
- Branch/tag/versao analisada: `main`
- Stack identificada: React 18, TypeScript, Vite, Tailwind CSS, shadcn-ui/Radix, React Router, TanStack Query, Supabase, Supabase Edge Functions, Vitest, Playwright.

## 2. Como usar esta memoria

Este documento e o ponto de entrada. Para qualquer bug, ajuste ou nova tarefa, consultar primeiro este arquivo, depois `13_NAVEGAI_INDICE_DE_BUSCA_RAPIDA.md`, e so entao abrir arquivos reais.

## 3. Onde encontrar cada coisa

| Assunto | Arquivo |
|---|---|
| Diretriz do sistema | `01_NAVEGAI_DIRETRIZ_DO_SISTEMA.md` |
| Modulos | `02_NAVEGAI_MAPA_DE_MODULOS.md` |
| Menus e rotas | `03_NAVEGAI_MAPA_DE_MENUS_E_ROTAS.md` |
| Telas | `04_NAVEGAI_MAPA_DE_TELAS.md` |
| Botoes e actions | `05_NAVEGAI_MAPA_DE_BOTOES_E_ACOES.md` |
| Frontend | `06_NAVEGAI_MAPA_DE_FRONTEND.md` |
| Backend/APIs | `07_NAVEGAI_MAPA_DE_BACKEND_E_APIS.md` |
| Banco | `08_NAVEGAI_MAPA_DE_BANCO_DE_DADOS.md` |
| RPCs/triggers | `09_NAVEGAI_MAPA_DE_RPCS_E_TRIGGERS.md` |
| Fluxos | `10_NAVEGAI_FLUXOS_PRINCIPAIS.md` |
| Regras | `11_NAVEGAI_REGRAS_DE_NEGOCIO.md` |
| Permissoes | `12_NAVEGAI_PERMISSOES_E_FEATURE_FLAGS.md` |
| Busca rapida | `13_NAVEGAI_INDICE_DE_BUSCA_RAPIDA.md` |
| Riscos | `14_NAVEGAI_PROBLEMAS_RISCOS_E_PENDENCIAS.md` |
| Changelog | `15_NAVEGAI_CHANGELOG_TECNICO.md` |
| Decisoes | `16_NAVEGAI_DECISOES_TECNICAS.md` |
| Erros conhecidos | `17_NAVEGAI_MAPA_DE_ERROS_CONHECIDOS.md` |
| Arquivos mortos/duplicados | `18_NAVEGAI_MAPA_DE_ARQUIVOS_MORTOS_DUPLICADOS.md` |
| Manifest | `19_NAVEGAI_MANIFEST_ATUAL_DO_PROJETO.md` |
| Seguranca/RLS | `20_NAVEGAI_SEGURANCA_ACESSO_RLS_E_POLICIES.md` |
| Dados sensiveis | `21_NAVEGAI_MATRIZ_DE_DADOS_SENSIVEIS.md` |
| Auditoria/alertas | `22_NAVEGAI_MAPA_DE_AUDITORIA_E_ALERTAS_DE_SEGURANCA.md` |
| Exportacao/download/copia | `23_NAVEGAI_MAPA_DE_EXPORTACAO_DOWNLOAD_E_COPIA.md` |
| Checklist seguranca | `24_NAVEGAI_CHECKLIST_SEGURANCA_FASE_ZERO.md` |
| Backup/secrets/ambientes | `25_NAVEGAI_MAPA_DE_BACKUP_SECRETS_E_AMBIENTES.md` |

## 4. Fluxo rapido para bug em botao

1. Consultar `13_NAVEGAI_INDICE_DE_BUSCA_RAPIDA.md`.
2. Abrir `05_NAVEGAI_MAPA_DE_BOTOES_E_ACOES.md`.
3. Localizar action_id ou tela provavel.
4. Abrir no maximo 3 arquivos reais.
5. Atualizar mapa afetado e changelog depois da alteracao.

## 5. Modulos oficiais

| Modulo | Menu | Dono da regra | Status | Observacao |
|---|---|---|---|---|
| dashboards | Dashboards | Frontend + Supabase | ativo | Dashboards OS, Leads, Vendas e Assistente. |
| propostas | Propostas | `src/modules/propostas` + Edge Functions | ativo | Modulo mais isolado. |
| avaliacoes | Avaliacoes | `src/pages` e `src/modules/avaliacoes` | ativo | OS, perguntas, respostas, tempo de avaliacao. |
| leads | Leads | `src/pages` | ativo | Fluxo amplo, ainda pouco modularizado. |
| tarefas | Tarefas | `src/modules/tarefas` + RPCs Supabase | ativo/critico | Modulo mais documentado e com fluxo executor/aprovador/auditor. |
| cadastros | Cadastros | `src/pages` + componentes compartilhados | ativo | Clientes, enderecos, tipos de servico, perguntas. |
| configuracoes | Configuracoes | `src/pages` + permissao | ativo | Permissoes, integracoes, configuracoes. |
| relatorios | Relatorios | `src/pages` e `src/modules/tarefas` | ativo | Saida de dados exige controle. |

## 6. Riscos principais

| Risco | Severidade | Onde consultar | Acao recomendada |
|---|---|---|---|
| Muitas paginas legadas acessam Supabase direto no frontend | alta | `06`, `14`, `20` | Priorizar service/RPC para regras criticas. |
| Edge Functions usam secrets e service role | alta | `07`, `25` | Verificar validacao de auth e permissao em cada function. |
| Modulo Tarefas possui historico de V2/limpeza/rebuild | media | `18`, `docs/AI` | Nao recriar rotas antigas sem validar mapa. |
| Exportacoes, downloads e PDF existem | media | `23` | Exigir permissao separada e auditoria. |

## 7. Ultima alteracao mapeada

- Data: 2026-05-24
- Pedido do usuario: criar memoria tecnica para mapear e acelerar execucoes/alteracoes.
- Arquivos alterados: `docs/contexto/navegai/*`
- Mapas atualizados: 00 a 25
