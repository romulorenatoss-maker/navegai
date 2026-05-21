# PACOTE DE RETORNO OBRIGATORIO

Ao terminar qualquer alteracao, gerar uma pasta:

```text
/reports/AI_RETURN/YYYY-MM-DD_HH-mm_nome-da-tarefa/
```

Dentro dela, criar obrigatoriamente:

1. `RESUMO_EXECUTIVO.md`
2. `O_QUE_FOI_FEITO.md`
3. `ARQUIVOS_CRIADOS.md`
4. `ARQUIVOS_ALTERADOS.md`
5. `ARQUIVOS_DELETADOS.md`
6. `IMPORTS_ROTAS_ATUALIZADOS.md`
7. `BANCO_RPC_TRIGGER_ALTERADOS.md`
8. `REGRAS_DE_NEGOCIO_AFETADAS.md`
9. `TESTES_EXECUTADOS.md`
10. `PENDENCIAS_E_RISCOS.md`
11. `DIFF_COMPLETO.patch`
12. `TREE_ANTES.txt`
13. `TREE_DEPOIS.txt`
14. `GREP_LEGADO.txt`
15. `ULTIMO_CONTEXTO_ATUALIZADO.md`
16. `ULTIMA_ALTERACAO_ATUALIZADA.md`

Tambem gerar, se possivel:

- ZIP do pacote de retorno;
- ZIP dos arquivos reais alterados;
- migrations SQL aplicadas;
- rollback SQL;
- `manifest_deploy.json`.

Esse pacote deve permitir que outra IA leia o que foi feito sem precisar abrir o projeto inteiro.
