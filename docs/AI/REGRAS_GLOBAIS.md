# REGRAS GLOBAIS

1. Mudanca cirurgica ou rebuild autorizado explicitamente.
2. Nunca criar V2/paralelo.
3. Nunca deixar arquivo antigo vivo quando criar substituto.
4. Backend e fonte de verdade.
5. Frontend so exibe UI/estado.
6. Regra critica deve ficar em RPC/service/backend/banco.
7. Historico imutavel.
8. Uma RPC por acao/responsabilidade.
9. Uma trigger por responsabilidade.
10. Uma tabela por dominio claro.
11. Nomes explicitos, sem genericos.
12. Validar rota -> page -> component -> hook -> service -> RPC antes de mexer em UI.
13. Sempre entregar diff real.
14. Sempre atualizar `docs/AI/ULTIMO_CONTEXTO.md` e `docs/AI/ULTIMA_ALTERACAO.md` apos mexer.
15. Sempre gerar pacote de retorno.

## Bloco obrigatorio antes de executar

Antes de alterar, responder:

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

## Sem memoria paralela

Toda regra persistente de IA deve estar em `docs/AI/`.
Arquivos antigos de memoria fora dessa pasta devem ser migrados e removidos no mesmo diff.
