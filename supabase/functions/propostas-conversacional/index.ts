import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Conversa guiada para construir proposta:
 * - recebe histórico de mensagens, perguntas configuradas e respostas atuais
 * - pergunta o próximo item (categoria → pergunta → produto)
 * - quando o usuário menciona produto, IA extrai {nome, qtd, valor, cobranca}
 *
 * Retorno: { mensagem, action?: { tipo: 'produto', dados }, finalizado: bool }
 */

interface Msg { role: "user" | "assistant"; content: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, contexto } = await req.json() as {
      messages: Msg[];
      contexto: {
        cliente_nome?: string;
        categorias: Array<{ codigo: string; nome: string; cobranca_padrao: string }>;
        perguntas_pendentes: Array<{ categoria: string; pergunta: string; campo_token?: string; tipo: string; opcoes?: string[] }>;
        respostas: Record<string, unknown>;
        empresa?: {
          nome_empresa?: string;
          descricao_operacional?: string;
          o_que_vendemos?: string[];
          o_que_nao_vendemos?: string[];
          tipo_ambiente?: string[];
          regras_tecnicas?: string[];
        } | null;
        catalogo?: Array<{ nome: string; categoria?: string; valor_minimo: number; valor_medio?: number; unidade: string; cobranca_padrao?: string }>;
        perguntas_produtos?: Array<{ categoria: string; pergunta: string }>;
      };
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");

    const emp = contexto.empresa ?? null;
    const cat = contexto.catalogo ?? [];
    const ppr = contexto.perguntas_produtos ?? [];
    const escopoTxt = emp
      ? `\n\n═══ ESCOPO DA EMPRESA "${emp.nome_empresa ?? ""}" ═══\n${emp.descricao_operacional ?? ""}\nVENDEMOS: ${(emp.o_que_vendemos ?? []).join(", ") || "(?)"}\nNÃO VENDEMOS: ${(emp.o_que_nao_vendemos ?? []).join(", ") || "(?)"}\nAMBIENTE: ${(emp.tipo_ambiente ?? []).join(", ") || "(?)"}\nREGRAS: ${(emp.regras_tecnicas ?? []).join(", ") || "(?)"}\n\nSe o cliente pedir algo FORA de "VENDEMOS", responda: "Esse item não está no escopo da empresa. Deseja adicionar como ADENDO (cobranca=informativo, categoria=outros)?" — só emita o produto se o usuário confirmar.`
      : "";
    const catalogoTxt = cat.length
      ? `\n\n═══ CATÁLOGO PADRÃO (use estes valores como base) ═══\n${cat.map(p => `- ${p.nome} [${p.categoria ?? "?"}] ${p.unidade} mín=R$${p.valor_minimo} méd=R$${p.valor_medio ?? p.valor_minimo} (${p.cobranca_padrao ?? "?"})`).join("\n")}\n\nQuando o usuário citar um item do catálogo, use o valor_medio como sugestão e PERGUNTE confirmação.`
      : "";
    const perguntasProdTxt = ppr.length
      ? `\n\n═══ PERGUNTAS PADRÃO POR CATEGORIA (use durante o fluxo) ═══\n${ppr.map(q => `[${q.categoria}] ${q.pergunta}`).join("\n")}`
      : "";

    const sys = `Você é um VENDEDOR TÉCNICO especialista em propostas comerciais de:
- Infraestrutura de rede
- Conectividade (internet)
- Segurança (CFTV)
- Telefonia

Você está conduzindo uma conversa para montar a proposta do cliente "${contexto.cliente_nome ?? ''}".

═══ REGRAS CRÍTICAS ═══
- NUNCA gere HTML, layout ou código.
- NUNCA invente valores. Sempre pergunte ao usuário.
- NUNCA mencione "Cloud" a menos que o usuário peça.
- NÃO trate duplicidade: a UI já gerencia itens repetidos.
- Faça APENAS UMA pergunta por vez.
- Seja direto, técnico e comercial. Sem prolixidade. Sem repetir info.
- Markdown leve, no máximo 3 linhas por resposta.

═══ FLUXO OBRIGATÓRIO (ordem fixa) ═══
1. CONTEXTO do cliente (porte, segmento, dor)
2. INFRAESTRUTURA → cobrança: implantacao
3. DADOS (internet/conectividade) → cobrança: mensal
4. SEGURANÇA (CFTV) → cobrança: mensal
5. TELEFONIA → cobrança: mensal
6. FINANCEIRO (validade, condições) → confirmação final

Em cada etapa: pergunte primeiro o que precisa, depois capture os itens, e só então avance para a próxima.

═══ CLASSIFICAÇÃO AUTOMÁTICA ═══
- infraestrutura → implantacao
- dados → mensal
- seguranca → mensal
- telefonia → mensal
Itens "informativos" (cortesia, brindes) → cobranca: informativo (não somam totais).

═══ INTERPRETAÇÃO DE ENTRADA ═══
Transforme texto livre em itens estruturados:
- "switch 1300" → nome=Switch, qtd=1, valor=1300, categoria=infraestrutura, cobranca=implantacao
- "camera 4 unidades 300 cada" → nome=Câmera, qtd=4, valor=300, categoria=seguranca, cobranca=mensal
- "internet 2000" → nome=Internet, qtd=1, valor=2000, categoria=dados, cobranca=mensal
Se faltar valor, pergunte: "Qual o valor unitário?". Default qtd=1.

═══ EMISSÃO DE PRODUTO (formato exato) ═══
Sempre que identificar um item COM nome E valor confirmados, anexe ao FINAL da resposta:
\`\`\`produto
{"nome":"...","quantidade":1,"valor_unitario":0,"cobranca":"implantacao","categoria":"infraestrutura"}
\`\`\`
Múltiplos itens = múltiplos blocos. NÃO emita produto sem valor.

═══ CONFIRMAÇÃO FINAL ═══
Antes de finalizar, mostre:
- Total de implantação (R$ X)
- Total mensal (R$ Y)
- Lista resumida de itens
E pergunte: "Está correto?"
Após o "sim" do usuário, finalize com: \`\`\`finalizar\`\`\`

═══ CONTEXTO DA SESSÃO ═══
Categorias configuradas (use os códigos nos blocos produto):
${contexto.categorias.map(c => `- ${c.nome} (codigo=${c.codigo}, cobranca_padrao=${c.cobranca_padrao})`).join("\n")}

Perguntas auxiliares já configuradas pelo admin (use como dica de conteúdo, mas siga o FLUXO acima):
${contexto.perguntas_pendentes.map(p => `- [${p.categoria}] ${p.pergunta}${p.opcoes ? ` (opções: ${p.opcoes.join(", ")})` : ""}`).join("\n") || "(nenhuma pendente)"}
${escopoTxt}${catalogoTxt}${perguntasProdTxt}

Respostas já coletadas:
${JSON.stringify(contexto.respostas, null, 2)}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, ...messages],
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Muitas requisições, tente em instantes." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos da IA esgotados. Adicione créditos em Lovable AI." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", t);
      return new Response(JSON.stringify({ error: "Erro na IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "";

    // Extrai blocos ```produto``` e ```finalizar```
    const produtos: Array<Record<string, unknown>> = [];
    let finalizado = false;
    let mensagem = raw;

    mensagem = mensagem.replace(/```produto\s*([\s\S]*?)```/g, (_full, json) => {
      try { produtos.push(JSON.parse(json.trim())); } catch (e) { console.error("parse produto:", e); }
      return "";
    }).replace(/```finalizar```/g, () => { finalizado = true; return ""; }).trim();

    return new Response(JSON.stringify({ mensagem, produtos, finalizado }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
