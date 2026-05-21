# Pendências backend - Resumo de Notas

O frontend ficou preparado sem alterar banco, SQL, RPC, trigger ou RLS.

Pendências para funcionamento 100% oficial:

1. Persistência das respostas manuais do resumo

- RPC existente recebe `p_notas`, mas é necessário confirmar se grava:
  - resposta manual;
  - N/A;
  - justificativa de N/A;
  - origem da pergunta;
  - peso;
  - desconto;
  - ponto devolvido.

2. Cálculo final da nota

- O frontend não calcula nota final como fonte de verdade.
- Backend/RPC/trigger deve retornar ou gravar:
  - nota parcial;
  - descontos;
  - devolução por N/A;
  - nota final;
  - destino final da nota.

3. Destino nominal da nota

- O frontend tenta exibir destino vindo de snapshot/assignment.
- Se o backend não enviar nome da pessoa/setor, aparece descrição genérica ou pendência.
- Ideal: RPC/hook retornar:
  - tipo_destino: `pessoa` ou `setor`;
  - target_profile_id e nome, ou target_setor_id e nome.

4. Métricas automáticas pendentes

- Perguntas com `metrica_pendente` aparecem como pendentes de backend.
- Não foi criada simulação de cálculo no React.

Payload já preparado no frontend:

```json
{
  "origem": "resumo_notas_frontend",
  "modo": "aprovador|auditor",
  "destino": {},
  "respostas_manuais": {},
  "perguntas_automaticas": [],
  "score_existente": {},
  "backend_pendente": true
}
```
