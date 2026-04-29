import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Conversa para gerenciar o catálogo de produtos da empresa.
 *
 * Recebe:
 *  - messages: histórico
 *  - contexto: { empresa, catalogo, perguntas_padrao }
 *
 * Retorna:
 *  - mensagem: texto para o usuário
 *  - produtos: produtos sugeridos para inserir/atualizar no catálogo
 *  - fora_de_escopo: itens que o usuário pediu mas estão fora do escopo
 */

interface Msg { role: "user" | "assistant"; content: string }

interface ProdutoSugerido {
  nome: string;
  categoria: "infraestrutura" | "dados" | "seguranca" | "telefonia" | "outros";
  tipo: "produto" | "servico";
  cobranca_padrao: "implantacao" | "mensal" | "informativo";
  unidade: string;
  valor_minimo: number;
  valor_medio: number;
  descricao_padrao?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, contexto } = await req.json() as {
      messages: Msg[];
      contexto: {
        empresa: {
          nome_empresa?: string;
          descricao_operacional?: string;
          o_que_vendemos?: string[];
          o_que_nao_vendemos?: string[];
          tipo_ambiente?: string[];
          regras_tecnicas?: string[];
        } | null;
        catalogo: Array<{ nome: string; categoria?: string; valor_minimo: number; valor_medio?: number; unidade: string; cobranca_padrao?: string }>;
        perguntas_padrao: Array<{ categoria: string; pergunta: string }>;
      };
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");

    const emp = contexto.empresa ?? {};
    const sys = `Você é o ASSISTENTE DE CATÁLOGO da empresa "${emp.nome_empresa ?? "(sem nome)"}".

═══ CONTEXTO DA EMPRESA ═══
${emp.descricao_operacional ?? "(sem descrição)"}

VENDEMOS: ${(emp.o_que_vendemos ?? []).join(", ") || "(não definido)"}
NÃO VENDEMOS: ${(emp.o_que_nao_vendemos ?? []).join(", ") || "(não definido)"}
AMBIENTE: ${(emp.tipo_ambiente ?? []).join(", ") || "(não definido)"}
REGRAS: ${(emp.regras_tecnicas ?? []).join(", ") || "(não definido)"}

═══ CATÁLOGO ATUAL ═══
${contexto.catalogo.length === 0 ? "(catálogo vazio)" : contexto.catalogo.map(p => `- ${p.nome} [${p.categoria ?? "?"}] ${p.unidade} mín=R$${p.valor_minimo} méd=R$${p.valor_medio ?? p.valor_minimo} (${p.cobranca_padrao ?? "?"})`).join("\n")}

═══ PERGUNTAS PADRÃO POR CATEGORIA ═══
${contexto.perguntas_padrao.map(q => `[${q.categoria}] ${q.pergunta}`).join("\n") || "(nenhuma)"}

═══ SUA TAREFA ═══
Conduza uma conversa para AJUDAR O ADMIN A CADASTRAR/AJUSTAR PRODUTOS do catálogo.
Para cada item identificado, colete: nome, categoria, tipo (produto|servico), cobrança (implantacao|mensal|informativo), unidade, valor mínimo, valor médio.

═══ REGRAS CRÍTICAS ═══
- NUNCA invente valores. Se faltar valor, PERGUNTE.
- Faça UMA pergunta por vez. Markdown leve, no máx 3 linhas.
- Se o item já existe no catálogo, AVISE e pergunte se quer atualizar.
- CONTROLE DE ESCOPO: se o item NÃO se encaixa em "${(emp.o_que_vendemos ?? []).join(", ") || "escopo da empresa"}", responda:
  "Esse item parece estar fora do escopo da empresa. Deseja cadastrar mesmo assim como categoria 'outros' (adendo)?"
  E emita um bloco \`\`\`fora_escopo {"nome":"..."}\`\`\`
- Categorias válidas: infraestrutura, dados, seguranca, telefonia, outros.
- Cobrança: infraestrutura→implantacao; dados/seguranca/telefonia→mensal; brindes→informativo.

═══ EMISSÃO DE PRODUTO (formato exato) ═══
Sempre que tiver TODOS os dados confirmados (incluindo valor):
\`\`\`produto
{"nome":"...","categoria":"infraestrutura","tipo":"produto","cobranca_padrao":"implantacao","unidade":"un","valor_minimo":0,"valor_medio":0,"descricao_padrao":"..."}
\`\`\`
Múltiplos itens = múltiplos blocos.`;

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
      return new Response(JSON.stringify({ error: "Créditos da IA esgotados." }), {
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

    const produtos: ProdutoSugerido[] = [];
    const fora_escopo: Array<{ nome: string }> = [];
    let mensagem = raw;

    mensagem = mensagem.replace(/```produto\s*([\s\S]*?)```/g, (_f, json) => {
      try { produtos.push(JSON.parse(json.trim())); } catch (e) { console.error("parse produto:", e); }
      return "";
    }).replace(/```fora_escopo\s*([\s\S]*?)```/g, (_f, json) => {
      try { fora_escopo.push(JSON.parse(json.trim())); } catch (e) { console.error("parse fora_escopo:", e); }
      return "";
    }).trim();

    return new Response(JSON.stringify({ mensagem, produtos, fora_escopo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
