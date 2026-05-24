# Navegai - Decisoes Tecnicas

### Decisao: criar memoria em `docs/contexto/navegai`

- Data: 2026-05-24
- Contexto: usuario forneceu gabarito global V4 e pediu mapeamento para acelerar execucao.
- Opcoes avaliadas: usar docs antigas em `docs/AI` ou criar pasta padronizada nova.
- Decisao tomada: criar `docs/contexto/navegai/` seguindo o gabarito.
- Motivo: separar memoria operacional do projeto e permitir modo rapido incremental.
- Impacto: futuras alteracoes devem consultar mapas antes de abrir codigo.
- Risco: mapas iniciais podem estar incompletos em detalhes finos.
- Como reverter: remover pasta criada.
- Usuario aprovou? sim, por pedido direto.

### Decisao: manter documentacao como mapeamento, sem alterar codigo de regra

- Data: 2026-05-24
- Contexto: gabarito proibe implementacao durante setup.
- Decisao tomada: nao alterar fluxo, tela, banco, RPC ou permissao.
- Motivo: setup controlado.
- Impacto: nenhum comportamento da aplicacao muda.
- Usuario aprovou? implicito no pedido de procedimento.
