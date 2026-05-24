# Navegai - Uso Rapido da Memoria

Esta e a pasta oficial de memoria tecnica viva do Navegai para Codex, ChatGPT, Claude, Lovable ou qualquer outra IA/agente.

Sempre que o projeto mudar, atualize os mapas afetados aqui. Assim a proxima IA nao depende de memoria de conversa antiga: ela le estes arquivos e continua a partir do estado mais atual do repositorio.

## Para qualquer pedido pequeno

1. Abrir `AGENTS.md` na raiz do repositorio.
2. Abrir `00_NAVEGAI_SUMARIO_GERAL.md`.
3. Abrir `13_NAVEGAI_INDICE_DE_BUSCA_RAPIDA.md`.
4. Abrir o mapa especifico do assunto.
5. Abrir no maximo 3 arquivos reais antes do diagnostico inicial.
6. Alterar somente o ponto pedido.
7. Atualizar o mapa afetado e `15_NAVEGAI_CHANGELOG_TECNICO.md`.

## Modelo de comando para o Codex

```text
Leia primeiro AGENTS.md e use a memoria em docs/contexto/navegai.
Modo rapido incremental.
Pedido:
[descreva aqui]

Antes de mexer, responda:
- modulo dono
- rota/tela
- botao/action, se houver
- hook/service/API/RPC/tabela envolvidos
- ate 3 arquivos que vai abrir
- risco e se precisa ampliar escopo
Depois execute apenas o pedido e atualize os mapas afetados.
```

## Regras obrigatorias para manter memoria atualizada

- Se alterar tela, atualizar `04_NAVEGAI_MAPA_DE_TELAS.md`.
- Se alterar botao/action, atualizar `05_NAVEGAI_MAPA_DE_BOTOES_E_ACOES.md`.
- Se alterar fluxo, atualizar `10_NAVEGAI_FLUXOS_PRINCIPAIS.md`.
- Se alterar regra de negocio, atualizar `11_NAVEGAI_REGRAS_DE_NEGOCIO.md`.
- Se alterar permissao/RLS/policy, atualizar `12` e `20`.
- Se alterar banco/RPC/trigger, atualizar `08` e `09`.
- Sempre registrar em `15_NAVEGAI_CHANGELOG_TECNICO.md`.
- Se houver proposta futura sem implementacao, criar doc em `src/modules/<modulo>/docs/` e linkar no mapa afetado.

## Mapas mais usados

| Pedido | Consultar |
|---|---|
| rota, menu, tela que nao abre | `03`, `04` |
| botao ou acao | `05`, `13` |
| tarefas | `02`, `05`, `09`, `10` |
| propostas | `02`, `07`, `23` |
| permissao | `12`, `20` |
| banco/RPC/trigger | `08`, `09` |
| exportacao/download | `23`, `25` |
| risco/pendencia | `14`, `17`, `18` |
