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

const normalizarTexto = (v?: string | null) => (v ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();
const normalizarCategoria = (v?: string | null) => {
  const n = normalizarTexto(v).replace(/[^a-z0-9]+/g, " ").trim();
  if (!n) return "";
  if (n.includes("infra")) return "infraestrutura";
  if (n.includes("dado") || n.includes("internet") || n.includes("link")) return "dados";
  if (n.includes("segur") || n.includes("cftv") || n.includes("camera")) return "seguranca";
  if (n.includes("telefon") || n.includes("ramal") || n.includes("pabx")) return "telefonia";
  if (n.includes("outro")) return "outros";
  return "";
};
const normalizarTipo = (v?: string | null) => {
  const n = normalizarTexto(v);
  if (n.includes("serv")) return "servico";
  if (n.includes("prod")) return "produto";
  return "";
};
const normalizarCobranca = (v?: string | null) => {
  const n = normalizarTexto(v);
  if (n.includes("impl") || n.includes("instal")) return "implantacao";
  if (n.includes("mens") || n.includes("recorr")) return "mensal";
  if (n.includes("info")) return "informativo";
  return "";
};
const extrairUltimaMensagemUsuario = (messages: Msg[]) => [...messages].reverse().find(m => m.role === "user")?.content ?? "";

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
        catalogo: Array<{ id?: string; nome: string; categoria?: string; tipo?: string; valor_minimo: number; valor_medio?: number; unidade: string; cobranca_padrao?: string }>;
        perguntas_padrao: Array<{ id?: string; categoria: string; pergunta: string }>;
      };
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");

    const emp = contexto.empresa ?? {};
    const ultimaMensagemUsuario = extrairUltimaMensagemUsuario(messages);
    const categoriasNaMensagem = ["infraestrutura", "dados", "seguranca", "telefonia", "outros"]
      .filter(c => normalizarTexto(ultimaMensagemUsuario).includes(normalizarTexto(c))
        || (c === "seguranca" && normalizarTexto(ultimaMensagemUsuario).includes("cftv"))
        || (c === "dados" && normalizarTexto(ultimaMensagemUsuario).includes("internet")));
    const palavrasMigracao = ["migr", "vai para", "manda para", "coloca em", "joga para", "destino", "nova categoria"];
    const querMigrar = palavrasMigracao.some(p => normalizarTexto(ultimaMensagemUsuario).includes(p));
    const categoriaDestinoDetectada = categoriasNaMensagem[categoriasNaMensagem.length - 1] ?? "";
    const tipoDetectado = normalizarTipo(ultimaMensagemUsuario);
    const cobrancaDetectada = normalizarCobranca(ultimaMensagemUsuario);
    const ultimaCategoriaComProdutos = [...messages].reverse()
      .map(m => /Antes de remover \*\*([^*]+)\*\*/i.exec(m.content)?.[1])
      .find(Boolean);

    const sys = `Você é o ASSISTENTE DE CATÁLOGO da empresa "${emp.nome_empresa ?? "(sem nome)"}".

═══ CONTEXTO DA EMPRESA ═══
${emp.descricao_operacional ?? "(sem descrição)"}

VENDEMOS: ${(emp.o_que_vendemos ?? []).join(", ") || "(não definido)"}
NÃO VENDEMOS: ${(emp.o_que_nao_vendemos ?? []).join(", ") || "(não definido)"}
AMBIENTE: ${(emp.tipo_ambiente ?? []).join(", ") || "(não definido)"}
REGRAS: ${(emp.regras_tecnicas ?? []).join(", ") || "(não definido)"}

═══ CATÁLOGO ATUAL (use o id para remover) ═══
${contexto.catalogo.length === 0 ? "(catálogo vazio)" : contexto.catalogo.map(p => `- id=${p.id ?? "?"} | ${p.nome} [${p.categoria ?? "?"}] tipo=${p.tipo ?? "?"} ${p.unidade} mín=R$${p.valor_minimo} méd=R$${p.valor_medio ?? p.valor_minimo} (${p.cobranca_padrao ?? "?"})`).join("\n")}

═══ PERGUNTAS PADRÃO POR CATEGORIA (use o id para remover) ═══
${contexto.perguntas_padrao.map(q => `- id=${q.id ?? "?"} [${q.categoria}] ${q.pergunta}`).join("\n") || "(nenhuma)"}

═══ SUA TAREFA ═══
Conduza uma conversa para AJUDAR O ADMIN A GERENCIAR o catálogo: cadastrar, ajustar e REMOVER produtos/perguntas/categorias.
Para cada item NOVO, colete: nome, categoria, tipo (produto|servico), cobrança (implantacao|mensal|informativo), unidade, valor mínimo, valor médio.

═══ REGRAS CRÍTICAS ═══
- NUNCA invente valores. Se faltar valor, PERGUNTE.
- NUNCA afirme que removeu algo SEM emitir o bloco de remoção/migração correspondente. O frontend só executa via blocos.
- Se o usuário pediu remover produto específico e ele existe, emita remover_produto imediatamente; não apenas diga que removeu.
- Se o usuário pediu remover categoria e houver produtos nela, NÃO emita remover_categoria ainda. Pergunte obrigatoriamente: para qual categoria, tipo e cobrança migrar os produtos.
- Depois que o usuário informar categoria destino + tipo + cobrança, emita migrar_categoria.
- Faça UMA pergunta por vez. Markdown leve, no máx 3 linhas.
- Se o item já existe no catálogo, AVISE e pergunte se quer atualizar.
- CONTROLE DE ESCOPO: se o item NÃO se encaixa em "${(emp.o_que_vendemos ?? []).join(", ") || "escopo da empresa"}", responda:
  "Esse item parece estar fora do escopo. Cadastrar como 'outros'?" e emita \`\`\`fora_escopo {"nome":"..."}\`\`\`
- Categorias válidas: infraestrutura, dados, seguranca, telefonia, outros.
- Cobrança: infraestrutura→implantacao; dados/seguranca/telefonia→mensal; brindes→informativo.

═══ EMISSÃO DE PRODUTO NOVO ═══
\`\`\`produto
{"nome":"...","categoria":"infraestrutura","tipo":"produto","cobranca_padrao":"implantacao","unidade":"un","valor_minimo":0,"valor_medio":0,"descricao_padrao":"..."}
\`\`\`

═══ EMISSÃO DE REMOÇÃO ═══
Para remover UM produto (use o id do catálogo acima):
\`\`\`remover_produto
{"id":"uuid-aqui","nome":"nome para confirmar"}
\`\`\`
Para remover UMA pergunta padrão (use o id):
\`\`\`remover_pergunta
{"id":"uuid-aqui"}
\`\`\`
Para remover/desativar TODA UMA CATEGORIA SOMENTE quando NÃO houver produto vinculado nela:
\`\`\`remover_categoria
{"categoria":"telefonia"}
\`\`\`
Para migrar todos os produtos de uma categoria antes de remover a categoria antiga do catálogo:
\`\`\`migrar_categoria
{"categoria_origem":"telefonia","categoria_destino":"dados","tipo":"servico","cobranca_padrao":"mensal"}
\`\`\`
Múltiplos itens = múltiplos blocos. SEMPRE confirme com o usuário ANTES de emitir blocos de remoção em massa (categoria inteira).`;

    const categoriaSolicitada = normalizarCategoria(ultimaMensagemUsuario);
    const textoNormalizado = normalizarTexto(ultimaMensagemUsuario);
    const pediuRemoverCategoria = /\b(remov|exclu|apag|tir|delet)/i.test(textoNormalizado)
      && Boolean(categoriaSolicitada)
      && (textoNormalizado.includes("categoria")
        || /\b(infraestrutura|dados|seguranca|cftv|telefonia|outros)\b/i.test(textoNormalizado));
    const produtosDaCategoria = contexto.catalogo.filter(p => normalizarCategoria(p.categoria) === categoriaSolicitada);
    if (pediuRemoverCategoria && produtosDaCategoria.length > 0 && !querMigrar) {
      return new Response(JSON.stringify({
        mensagem: `A categoria **${categoriaSolicitada}** tem ${produtosDaCategoria.length} produto(s) vinculado(s). Para qual **nova categoria**, **tipo** (produto/servico) e **cobrança** (implantacao/mensal/informativo) devo migrar antes de remover?`,
        produtos: [],
        fora_escopo: [],
        remover_produtos: [],
        remover_perguntas: [],
        remover_categorias: [],
        migrar_categorias: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if ((querMigrar || ultimaCategoriaComProdutos) && ultimaCategoriaComProdutos && categoriaDestinoDetectada && tipoDetectado && cobrancaDetectada) {
      return new Response(JSON.stringify({
        mensagem: `Certo, vou migrar os produtos para **${categoriaDestinoDetectada}** e remover a categoria anterior da lista.`,
        produtos: [],
        fora_escopo: [],
        remover_produtos: [],
        remover_perguntas: [],
        remover_categorias: [],
        migrar_categorias: [{ categoria_origem: normalizarCategoria(ultimaCategoriaComProdutos), categoria_destino: categoriaDestinoDetectada, tipo: tipoDetectado, cobranca_padrao: cobrancaDetectada }],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
    const remover_produtos: Array<{ id?: string; nome?: string }> = [];
    const remover_perguntas: Array<{ id: string }> = [];
    const remover_categorias: Array<{ categoria: string }> = [];
    const migrar_categorias: Array<{ categoria_origem: string; categoria_destino: string; tipo: string; cobranca_padrao: string }> = [];
    let mensagem = raw;

    mensagem = mensagem
      .replace(/```produto\s*([\s\S]*?)```/g, (_f, json) => {
        try { produtos.push(JSON.parse(json.trim())); } catch (e) { console.error("parse produto:", e); }
        return "";
      })
      .replace(/```fora_escopo\s*([\s\S]*?)```/g, (_f, json) => {
        try { fora_escopo.push(JSON.parse(json.trim())); } catch (e) { console.error("parse fora_escopo:", e); }
        return "";
      })
      .replace(/```remover_produto\s*([\s\S]*?)```/g, (_f, json) => {
        try { remover_produtos.push(JSON.parse(json.trim())); } catch (e) { console.error("parse remover_produto:", e); }
        return "";
      })
      .replace(/```remover_pergunta\s*([\s\S]*?)```/g, (_f, json) => {
        try { remover_perguntas.push(JSON.parse(json.trim())); } catch (e) { console.error("parse remover_pergunta:", e); }
        return "";
      })
      .replace(/```remover_categoria\s*([\s\S]*?)```/g, (_f, json) => {
        try { remover_categorias.push(JSON.parse(json.trim())); } catch (e) { console.error("parse remover_categoria:", e); }
        return "";
      })
      .replace(/```migrar_categoria\s*([\s\S]*?)```/g, (_f, json) => {
        try { migrar_categorias.push(JSON.parse(json.trim())); } catch (e) { console.error("parse migrar_categoria:", e); }
        return "";
      })
      .trim();

    return new Response(JSON.stringify({ mensagem, produtos, fora_escopo, remover_produtos, remover_perguntas, remover_categorias, migrar_categorias }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
