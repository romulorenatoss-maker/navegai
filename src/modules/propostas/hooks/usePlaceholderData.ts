import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PLACEHOLDER_MOCK, type PlaceholderTipo } from "../components/PropostaPlaceholderModal";

export interface PlaceholderOpcao {
  label: string;
  value: string;
}

export type PlaceholderData = Record<PlaceholderTipo, PlaceholderOpcao[]>;

/**
 * Etapa 2 — Carrega placeholders reais do banco (perguntas + produtos).
 * Mantém fallback para PLACEHOLDER_MOCK em caso de erro ou listas vazias.
 * Não altera tabelas, backend ou comportamento atual do editor.
 */
export function usePlaceholderData() {
  const [data, setData] = useState<PlaceholderData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function load() {
      setLoading(true);
      setErro(null);

      // CLIENTE (fixo — não vem do banco nesta etapa)
      const cliente: PlaceholderOpcao[] = [
        { label: "Nome do cliente", value: "cliente_nome" },
        { label: "CNPJ", value: "cliente_cnpj" },
        { label: "Endereço", value: "cliente_endereco" },
        { label: "Responsável", value: "cliente_responsavel" },
        { label: "E-mail", value: "cliente_email" },
      ];

      let pergunta: PlaceholderOpcao[] = [];
      let produto: PlaceholderOpcao[] = [];
      let boolean: PlaceholderOpcao[] = [];

      try {
        // PERGUNTAS (somente as que têm campo_token)
        const { data: perguntas, error: errPerg } = await supabase
          .from("propostas_perguntas_setup" as never)
          .select("campo_token, pergunta, ativo")
          .eq("ativo", true);

        if (errPerg) throw errPerg;

        pergunta = ((perguntas as Array<{ campo_token: string | null; pergunta: string }>) || [])
          .filter((p) => p.campo_token && p.campo_token.trim() !== "")
          .map((p) => ({ label: p.pergunta, value: p.campo_token as string }));

        // PRODUTOS
        const { data: produtos, error: errProd } = await supabase
          .from("propostas_produtos" as never)
          .select("campo_template, nome, categoria, tipo_input, ativo")
          .eq("ativo", true)
          .not("campo_template", "is", null);

        if (errProd) throw errProd;

        const categorias = new Set<string>();
        for (const p of (produtos as Array<{
          campo_template: string | null;
          nome: string;
          categoria: string | null;
          tipo_input: string | null;
        }>) || []) {
          if (p.categoria) categorias.add(p.categoria);
          if (p.tipo_input === "boolean" && p.campo_template) {
            boolean.push({ label: p.nome, value: p.campo_template });
          }
        }

        for (const cat of categorias) {
          produto.push({ label: `Loop ${cat}`, value: `#${cat}` });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[placeholder] erro ao carregar do banco, usando MOCK", msg);
        setErro(msg);
      }

      // FALLBACK: se vazio, recorre ao MOCK (idempotente, não quebra UI)
      if (pergunta.length === 0) pergunta = PLACEHOLDER_MOCK.pergunta;
      if (produto.length === 0) produto = PLACEHOLDER_MOCK.produto;
      if (boolean.length === 0) boolean = PLACEHOLDER_MOCK.boolean;

      if (cancelado) return;

      const next: PlaceholderData = { cliente, pergunta, produto, boolean };
      setData(next);
      setLoading(false);

      console.log("[placeholder] dados carregados", {
        perguntas: pergunta.length,
        produtos: produto.length,
        boolean: boolean.length,
      });
    }

    load();
    return () => {
      cancelado = true;
    };
  }, []);

  return { data, loading, erro };
}
