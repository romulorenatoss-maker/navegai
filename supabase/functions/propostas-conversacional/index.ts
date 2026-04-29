import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Conversa guiada para construir proposta.
 *
 * Contrato (NOVO — JSON estruturado):
 *  Resposta:
 *    {
 *      message: string,
 *      actions: Array<{ type: "add_item"|"next_step"|"finalizar"|"none",
 *                       item?: { nome, quantidade, valor, categoria, cobranca },
 *                       proxima_etapa?: string }>,
 *      mensagem: string,        // alias legacy
 *      produtos: Item[],        // alias legacy (compat com frontend antigo)
 *      finalizado: boolean
 *    }
 *
 * Compatibilidade: aceita também blocos legacy ```produto``` e ```finalizar```.
 */

interface Msg { role: "user" | "assistant"; content: string }

type Etapa = "contexto" | "infraestrutura" | "dados" | "seguranca" | "telefonia" | "financeiro" | "fechamento";

interface ItemAcao {
  nome: string;
  quantidade: number;
  valor: number;
  categoria: string;
  cobranca: "implantacao" | "mensal" | "informativo";
  produto_id?: string; // OBRIGATÓRIO no fluxo conversacional — referência ao catálogo
  campo_template?: string;
  tipo_input?: "quantidade" | "boolean" | "lista";
}

interface IAAction {
  type: "add_item" | "next_step" | "finalizar" | "none";
  item?: Partial<ItemAcao>;
  proxima_etapa?: Etapa;
}

const ETAPAS_ORDEM: Etapa[] = ["contexto", "infraestrutura", "dados", "seguranca", "telefonia", "financeiro", "fechamento"];

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
        catalogo?: Array<{ id?: string; nome: string; categoria?: string; valor_minimo: number; valor_medio?: number; unidade: string; cobranca_padrao?: string; campo_template?: string | null; tipo_input?: "quantidade" | "boolean" | "lista" }>;
        perguntas_produtos?: Array<{ categoria: string; pergunta: string }>;
        // === NOVO: estado controlado pelo frontend (fonte da verdade) ===
        estado_proposta?: {
          etapa_atual: Etapa;
          itens: Array<{ nome: string; quantidade: number; valor: number; cobranca: string; categoria?: string }>;
          perguntas_respondidas: string[]; // textos normalizados das perguntas já respondidas
          totais: { implantacao: number; mensal: number; informativo?: number };
        };
      };
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");

    const emp = contexto.empresa ?? null;
    const cat = contexto.catalogo ?? [];
    const ppr = contexto.perguntas_produtos ?? [];
    const estado = contexto.estado_proposta ?? null;

    // === Filtro server-side: nunca mandar perguntas já respondidas ===
    const respondidasNorm = new Set((estado?.perguntas_respondidas ?? []).map(p => p.trim().toLowerCase()));
    const perguntasFiltradas = (contexto.perguntas_pendentes ?? []).filter(
      p => !respondidasNorm.has(p.pergunta.trim().toLowerCase())
    );
    const perguntasProdFiltradas = ppr.filter(p => !respondidasNorm.has(p.pergunta.trim().toLowerCase()));

    const escopoTxt = emp
      ? `\n\n═══ ESCOPO DA EMPRESA "${emp.nome_empresa ?? ""}" ═══\n${emp.descricao_operacional ?? ""}\nVENDEMOS: ${(emp.o_que_vendemos ?? []).join(", ") || "(?)"}\nNÃO VENDEMOS: ${(emp.o_que_nao_vendemos ?? []).join(", ") || "(?)"}\nAMBIENTE: ${(emp.tipo_ambiente ?? []).join(", ") || "(?)"}\nREGRAS: ${(emp.regras_tecnicas ?? []).join(", ") || "(?)"}\n\nSe o cliente pedir algo FORA de "VENDEMOS", responda: "Esse item não está no escopo da empresa. Deseja adicionar como ADENDO (cobranca=informativo, categoria=outros)?" — só emita add_item se o usuário confirmar.`
      : "";
    const catalogoTxt = cat.length
      ? `\n\n═══ CATÁLOGO PADRÃO (use estes valores como base) ═══\n${cat.map(p => `- ${p.nome} [${p.categoria ?? "?"}] ${p.unidade} mín=R$${p.valor_minimo} méd=R$${p.valor_medio ?? p.valor_minimo} (${p.cobranca_padrao ?? "?"})`).join("\n")}`
      : "";
    const perguntasProdTxt = perguntasProdFiltradas.length
      ? `\n\n═══ PERGUNTAS PADRÃO POR CATEGORIA (ainda não respondidas) ═══\n${perguntasProdFiltradas.map(q => `[${q.categoria}] ${q.pergunta}`).join("\n")}`
      : "";

    const estadoTxt = estado ? `

═══ ESTADO DA PROPOSTA (FONTE DA VERDADE — NÃO IGNORE) ═══
${JSON.stringify({
      etapa_atual: estado.etapa_atual,
      itens_ja_adicionados: estado.itens.map(i => ({ nome: i.nome, qtd: i.quantidade, valor: i.valor, cobranca: i.cobranca })),
      perguntas_ja_respondidas: estado.perguntas_respondidas,
      totais: estado.totais,
    }, null, 2)}

REGRAS DE USO DO ESTADO:
- Se um item já está em itens_ja_adicionados, NÃO emita add_item para ele de novo (a UI gerencia duplicatas).
- NUNCA repita uma pergunta de "perguntas_ja_respondidas".
- Se a etapa_atual já cumpriu seu objetivo (capturou itens necessários ou usuário disse "próximo"), emita action.type="next_step".
- Quando todas as etapas terminarem (ordem: contexto→infraestrutura→dados→seguranca→telefonia→financeiro→fechamento) e o usuário confirmar, emita action.type="finalizar".
` : "";

    const sys = `Você é um VENDEDOR TÉCNICO especialista em propostas comerciais (rede, internet, CFTV, telefonia).
Cliente: "${contexto.cliente_nome ?? ''}".

═══ REGRAS CRÍTICAS ═══
- NUNCA gere HTML, layout ou código.
- NUNCA invente valores. Se faltar valor, PERGUNTE.
- NUNCA repita perguntas já em "perguntas_ja_respondidas".
- NUNCA re-emita item já em "itens_ja_adicionados".
- A UI é dona dos dados; você só interpreta e sugere ação.
- Faça UMA pergunta por vez. Markdown leve, máximo 3 linhas.

═══ FLUXO (etapa_atual vem no estado) ═══
contexto → infraestrutura(implantacao) → dados(mensal) → seguranca(mensal) → telefonia(mensal) → financeiro → fechamento

═══ FORMATO OBRIGATÓRIO DE RESPOSTA (JSON) ═══
Responda SEMPRE com APENAS um JSON válido entre tags <json>...</json>, sem texto antes/depois:

<json>
{
  "message": "texto curto para o usuário",
  "actions": [
    { "type": "add_item",
      "item": { "nome": "Switch 24P", "quantidade": 1, "valor": 1300, "categoria": "infraestrutura", "cobranca": "implantacao" } },
    { "type": "next_step", "proxima_etapa": "dados" }
  ]
}
</json>

Tipos de action:
- "add_item": novo item identificado (nome + valor confirmados). NÃO usar para itens já no estado.
- "next_step": avançar etapa. Inclua proxima_etapa.
- "finalizar": só após confirmação final do usuário.
- "none": apenas mensagem (perguntas, esclarecimentos).

Pode haver 0..N actions. Se nenhuma action for necessária, use [].

═══ CONTEXTO DA SESSÃO ═══
Categorias: ${contexto.categorias.map(c => `${c.codigo}(${c.cobranca_padrao})`).join(", ")}

Perguntas pendentes (use como dica, NUNCA repita):
${perguntasFiltradas.map(p => `- [${p.categoria}] ${p.pergunta}`).join("\n") || "(nenhuma)"}
${escopoTxt}${catalogoTxt}${perguntasProdTxt}${estadoTxt}`;

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

    // === Parse novo formato JSON ===
    let message = "";
    let actions: IAAction[] = [];
    let finalizado = false;

    const jsonMatch = raw.match(/<json>\s*([\s\S]*?)\s*<\/json>/i)
      ?? raw.match(/```json\s*([\s\S]*?)```/i);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        message = String(parsed.message ?? "");
        actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      } catch (e) {
        console.error("parse JSON IA falhou:", e, "raw:", jsonMatch[1].slice(0, 200));
      }
    }

    // === Fallback legacy: blocos ```produto``` e ```finalizar``` ===
    let mensagemLegacy = raw;
    const produtosLegacy: Array<Record<string, unknown>> = [];
    mensagemLegacy = mensagemLegacy.replace(/```produto\s*([\s\S]*?)```/g, (_f, json) => {
      try { produtosLegacy.push(JSON.parse(json.trim())); } catch (e) { console.error("parse produto:", e); }
      return "";
    }).replace(/```finalizar```/g, () => { finalizado = true; return ""; })
      .replace(/<json>[\s\S]*?<\/json>/gi, "")
      .replace(/```json[\s\S]*?```/gi, "")
      .trim();

    // Se IA usou só legacy, converte para actions
    if (actions.length === 0 && produtosLegacy.length > 0) {
      actions = produtosLegacy.map(p => ({
        type: "add_item",
        item: {
          nome: String(p.nome ?? ""),
          quantidade: Number(p.quantidade ?? 1),
          valor: Number(p.valor_unitario ?? p.valor ?? 0),
          categoria: String(p.categoria ?? ""),
          cobranca: (p.cobranca as ItemAcao["cobranca"]) ?? "mensal",
        },
      }));
    }

    // Se ainda não tem message, usa o texto bruto
    if (!message) message = mensagemLegacy || "…";

    if (actions.some(a => a.type === "finalizar")) finalizado = true;

    // === SEGURANÇA: filtra add_item que já está no estado (anti-duplicata) ===
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const nomesExistentes = new Set((estado?.itens ?? []).map(i => norm(i.nome)));
    actions = actions.filter(a => {
      if (a.type !== "add_item") return true;
      const n = norm(String(a.item?.nome ?? ""));
      if (!n) return false;
      if (nomesExistentes.has(n)) {
        console.log("⚠️ add_item filtrado (já existe no estado):", n);
        return false;
      }
      return true;
    });

    // Compat: produtos[] (formato antigo) derivado de actions
    const produtos = actions
      .filter(a => a.type === "add_item" && a.item?.nome)
      .map(a => ({
        nome: a.item!.nome,
        quantidade: a.item!.quantidade ?? 1,
        valor_unitario: a.item!.valor ?? 0,
        cobranca: a.item!.cobranca ?? "mensal",
        categoria: a.item!.categoria,
      }));

    return new Response(JSON.stringify({
      message,
      actions,
      finalizado,
      // aliases legacy
      mensagem: message,
      produtos,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
