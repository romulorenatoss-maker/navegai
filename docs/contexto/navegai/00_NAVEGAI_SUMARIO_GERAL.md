# Navegai - Sumario Geral

## 1. Identificacao

- Nome oficial: Navegai Metricas / Navegai
- Slug tecnico: navegai
- Data do mapeamento: 2026-05-24
- Responsavel pelo mapeamento: Codex
- Origem analisada: repositorio local Git
- Branch/tag/versao analisada: main
- Stack identificada: Vite, React 18, TypeScript, Tailwind, shadcn/ui, React Router, TanStack Query, Supabase, Edge Functions, Vitest, Playwright

## 2. Como usar esta memoria

Este documento e o ponto de entrada. Para qualquer bug ou alteracao, consultar primeiro este sumario e depois `13_NAVEGAI_INDICE_DE_BUSCA_RAPIDA.md`.

## 3. Onde encontrar cada coisa

| Assunto | Arquivo |
|---|---|
| Diretriz | `01_NAVEGAI_DIRETRIZ_DO_SISTEMA.md` |
| Modulos | `02_NAVEGAI_MAPA_DE_MODULOS.md` |
| Menus/rotas | `03_NAVEGAI_MAPA_DE_MENUS_E_ROTAS.md` |
| Telas | `04_NAVEGAI_MAPA_DE_TELAS.md` |
| Botoes/actions | `05_NAVEGAI_MAPA_DE_BOTOES_E_ACOES.md` |
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
| Erros | `17_NAVEGAI_MAPA_DE_ERROS_CONHECIDOS.md` |
| Mortos/duplicados | `18_NAVEGAI_MAPA_DE_ARQUIVOS_MORTOS_DUPLICADOS.md` |
| Manifest | `19_NAVEGAI_MANIFEST_ATUAL_DO_PROJETO.md` |
| Seguranca/RLS | `20_NAVEGAI_SEGURANCA_ACESSO_RLS_E_POLICIES.md` |
| Dados sensiveis | `21_NAVEGAI_MATRIZ_DE_DADOS_SENSIVEIS.md` |
| Auditoria | `22_NAVEGAI_MAPA_DE_AUDITORIA_E_ALERTAS_DE_SEGURANCA.md` |
| Exportacao/download | `23_NAVEGAI_MAPA_DE_EXPORTACAO_DOWNLOAD_E_COPIA.md` |
| Checklist seguranca | `24_NAVEGAI_CHECKLIST_SEGURANCA_FASE_ZERO.md` |
| Backup/secrets | `25_NAVEGAI_MAPA_DE_BACKUP_SECRETS_E_AMBIENTES.md` |

## 4. Fluxo rapido para bug

1. Consultar `13_NAVEGAI_INDICE_DE_BUSCA_RAPIDA.md`.
2. Consultar o mapa especifico do modulo.
3. Abrir no maximo 3 arquivos reais.
4. Se precisar ampliar escopo, parar e pedir autorizacao.
5. Depois de alterar, atualizar mapa afetado e changelog.

## 5. Modulos oficiais

| Modulo | Menu | Dono da regra | Status | Observacao |
|---|---|---|---|---|
| Tarefas | Tarefas | `src/modules/tarefas` | Ativo | Fluxo executor/aprovador/auditor e rotinas operacionais |
| Propostas | Propostas | `src/modules/propostas` | Ativo | Templates, produtos, conversa IA e render |
| Avaliacoes/OS | Avaliacoes, Cadastros, Relatorios | `src/pages`, `src/hooks` | Ativo legado | OS, perguntas, respostas, inconsistencias |
| Leads | Leads | `src/pages` | Ativo legado | Fila, importador, campanhas, dashboards |
| Configuracoes/Permissoes | Configuracoes | `src/pages`, `src/lib/screen-permissions.ts` | Ativo | Permissoes de telas e integracoes |

## 6. Riscos principais

| Risco | Severidade | Onde consultar | Acao recomendada |
|---|---|---|---|
| Muitas regras criticas chamadas direto do frontend via Supabase | Alta | `06`, `20` | Preferir RPC/Edge Function para regra sensivel |
| Historico de documentos e diffs gerados por IA no repo | Media | `18` | Evitar criar artefatos fora de `docs/contexto/navegai` |
| Tarefas tem fluxo sensivel por status e anexos | Alta | `10`, `11`, `09` | Alterar somente arquivo alvo e validar envio ao aprovador |
| Edge Functions exigem secrets externos | Alta | `25` | Nunca expor `.env` ou service role no frontend |

## 7. Ultima alteracao mapeada

- Data: 2026-05-24
- Pedido do usuario: aplicar gabarito global e criar memoria tecnica para acelerar alteracoes
- Arquivos alterados: `docs/contexto/navegai/*`
- Mapas atualizados: todos os mapas iniciais
