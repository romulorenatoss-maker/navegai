# Navegai - Decisoes Tecnicas

## 1. Memoria oficial

- Decisao: usar `docs/contexto/navegai/` como memoria atual para Codex/IA.
- Motivo: seguir gabarito global e evitar releitura completa em toda alteracao.
- Impacto: modo rapido consulta `00`, `13` e mapa especifico antes de abrir codigo.

## 2. Sem implementacao no setup

- Decisao: setup inicial cria somente documentacao.
- Banco/RPC/migrations: nao alterados.
- UI/fluxos: nao alterados.

## 3. Git/publicacao

- Decisao operacional: apos alteracao validada, Codex pode executar commit/push em `main`.
- Risco: publicar direto em `main`; usar commits pequenos e descritivos.
