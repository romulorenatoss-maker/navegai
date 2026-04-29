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
      };
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");

    const sys = `Você é um consultor comercial guiando a construção de uma proposta para o cliente "${contexto.cliente_nome ?? ''}".

REGRAS CRÍTICAS:
- Conduza a conversa por categorias na ordem fornecida.
- Para cada pergunta pendente, faça UMA pergunta clara por vez.
- Quando o usuário descrever um produto/serviço, extraia: nome, quantidade, valor unitário, cobrança (implantacao | mensal | informativo).
- Se faltar valor, pergunte "Qual o valor unitário?".
- NUNCA mencione "Cloud" a menos que o usuário peça.
- Use Markdown leve. Seja breve (máx 3 linhas por resposta).

CATEGORIAS (na ordem):
${contexto.categorias.map(c => `- ${c.nome} (${c.codigo}, cobrança padrão: ${c.cobranca_padrao})`).join("\n")}

PERGUNTAS PENDENTES:
${contexto.perguntas_pendentes.map(p => `- [${p.categoria}] ${p.pergunta}${p.opcoes ? ` (opções: ${p.opcoes.join(", ")})` : ""}`).join("\n") || "(nenhuma — passe para produtos por categoria)"}

RESPOSTAS JÁ COLETADAS:
${JSON.stringify(contexto.respostas, null, 2)}

Quando detectar um produto explicitamente mencionado pelo usuário com nome E valor, retorne uma linha no FINAL da sua resposta no formato exato:
\`\`\`produto
{"nome":"...","quantidade":1,"valor_unitario":0,"cobranca":"mensal","categoria":"infraestrutura"}
\`\`\`

Quando todas as categorias e produtos estiverem cobertos, finalize com a linha:
\`\`\`finalizar\`\`\``;

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
