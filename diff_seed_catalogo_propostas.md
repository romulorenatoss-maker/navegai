# Seed Catálogo Propostas — diff_seed_catalogo_propostas.md

Escopo: módulo `propostas` apenas. Sem alteração de UI, schema, triggers ou regras existentes.
Operação: `INSERT ... ON CONFLICT DO UPDATE` (idempotente) em `public.propostas_produtos`.

## Ajustes feitos no SQL original (compatibilidade com schema vigente)

| Campo no pedido | Ajuste aplicado | Motivo |
|---|---|---|
| `cobranca` | usado `cobranca_padrao` | Coluna real da tabela é `cobranca_padrao` (NOT NULL, default `mensal`). |
| `tipo_input = 'numero'` | substituído por `'quantidade'` | Trigger `propostas_produtos_validate_v2` aceita apenas `quantidade \| boolean \| lista`. |
| `ON CONFLICT (lower(campo_template)) WHERE campo_template IS NOT NULL` | usado predicado completo do índice: `WHERE ((campo_template IS NOT NULL) AND (ativo = true))` | Predicado tem que casar exatamente com `uq_propostas_produtos_campo_template_ativo`. |

Nenhuma coluna foi removida, nenhum trigger/policy alterado.

## Relatório de execução

- produtos_criados: **17**
- produtos_atualizados: **0** (catálogo estava vazio para esses `campo_template`)
- conflitos_resolvidos: **0**
- duplicatas de `lower(campo_template)` entre ativos: **nenhuma**
- ativos sem `categoria`: **nenhum**
- `tipo_input` fora de (`quantidade`,`boolean`,`lista`): **nenhum**

Total final de produtos ativos com `campo_template` no catálogo: **17**.

## Lista final de produtos ativos

### Infraestrutura (cobrança: implantacao)

| Nome | campo_template | tipo_input |
|---|---|---|
| Cabeamento estruturado | `qtd_cabeamento` | quantidade |
| Switch 24 portas | `qtd_switch` | quantidade |
| Rack 12U | `qtd_rack` | quantidade |
| Access Point Wi-Fi | `qtd_ap` | quantidade |
| Roteador | `qtd_roteador` | quantidade |
| Mão de obra | `mao_obra` | quantidade |

### Dados (cobrança: mensal)

| Nome | campo_template | tipo_input |
|---|---|---|
| Internet dedicada | `internet_dedicado` | boolean |
| Internet semi dedicada | `internet_semi_dedicado` | boolean |
| IP /32 | `ip_32` | boolean |
| IP /30 | `ip_30` | boolean |
| IP /29 | `ip_29` | boolean |
| IP /27 | `ip_27` | boolean |
| Hotspot | `qtd_hotspot` | quantidade |

### Segurança (cobrança: mensal)

| Nome | campo_template | tipo_input |
|---|---|---|
| Câmera Dome | `camera_dome` | boolean |
| Câmera Bullet | `camera_bullet` | boolean |
| Analítico Intrusão | `analitico_intrusao` | boolean |
| Analítico Permanência | `analitico_permanencia` | boolean |

## campo_template utilizados (17 únicos)

`qtd_cabeamento, qtd_switch, qtd_rack, qtd_ap, qtd_roteador, mao_obra, internet_dedicado, internet_semi_dedicado, ip_32, ip_30, ip_29, ip_27, qtd_hotspot, camera_dome, camera_bullet, analitico_intrusao, analitico_permanencia`

## Inconsistências detectadas

Nenhuma. Todas as três validações passaram:
1. `campo_template` único entre ativos ✅
2. Toda linha ativa possui `categoria` ✅
3. `tipo_input ∈ ('quantidade','boolean','lista')` ✅

> Observação: a especificação original mencionava `tipo_input='numero'`. Como o trigger atual exige `quantidade`, o seed usa `quantidade` para preservar a regra existente. Caso o domínio precise renomear para `numero`, isso exige migração de schema (fora do escopo desta tarefa).
