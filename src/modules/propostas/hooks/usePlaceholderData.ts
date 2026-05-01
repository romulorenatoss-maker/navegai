import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PLACEHOLDER_MOCK, type PlaceholderTipo } from "../components/PropostaPlaceholderModal";

export interface PlaceholderOpcao {
  label: string;
  value: string;
}

export type PlaceholderData = Record<PlaceholderTipo, PlaceholderOpcao[]>;

/**
 * Carrega placeholders do banco.
 *
 * CLIENTE: lista 100% derivada do schema real de `clientes` + `cliente_contatos` + `cliente_responsaveis`.
 *   - Tokens correspondem ao payload estruturado montado em PropostaConversacionalPage:
 *     cliente.{nome,cnpj,cpf,razao_social,nome_fantasia,inscricao_estadual,inscricao_municipal,
 *              endereco,numero,bairro,cidade,cep,referencia,telefone,celular,fixo,telefone_0800,email}
 *     responsavel.{nome,cargo,cpf,telefone,email}
 *   - Mantém também os tokens legados planos ({cliente_nome}, etc.) para compat.
 *
 * PERGUNTA / PRODUTO / BOOLEAN: vêm do banco. Fallback para MOCK só se vazio.
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

      // ===== CLIENTE (estrutura derivada do banco) =====
      // Tokens estruturados (preferenciais — usam o payload aninhado)
      const cliente: PlaceholderOpcao[] = [
        // Identificação
        { label: "Tipo de pessoa (PF/PJ)", value: "cliente.tipo_pessoa" },
        { label: "Nome / Razão social", value: "cliente.nome" },
        { label: "CPF", value: "cliente.cpf" },
        { label: "RG", value: "cliente.rg" },
        { label: "Nome da mãe", value: "cliente.nome_mae" },
        // PJ
        { label: "CNPJ", value: "cliente.cnpj" },
        { label: "Razão social", value: "cliente.razao_social" },
        { label: "Nome fantasia", value: "cliente.nome_fantasia" },
        { label: "Inscrição estadual", value: "cliente.inscricao_estadual" },
        { label: "Inscrição municipal", value: "cliente.inscricao_municipal" },
        // Endereço
        { label: "Endereço (rua)", value: "cliente.endereco" },
        { label: "Número", value: "cliente.numero" },
        { label: "Bairro", value: "cliente.bairro" },
        { label: "Cidade", value: "cliente.cidade" },
        { label: "CEP", value: "cliente.cep" },
        { label: "Ponto de referência", value: "cliente.referencia" },
        // Contatos (derivados de cliente_contatos)
        { label: "E-mail principal", value: "cliente.email" },
        { label: "Telefone principal", value: "cliente.telefone" },
        { label: "Celular", value: "cliente.celular" },
        { label: "Telefone fixo", value: "cliente.fixo" },
        { label: "0800 / Especial", value: "cliente.telefone_0800" },
        // Responsável principal (derivado de cliente_responsaveis principal=true)
        { label: "Responsável — nome", value: "responsavel.nome" },
        { label: "Responsável — cargo", value: "responsavel.cargo" },
        { label: "Responsável — CPF", value: "responsavel.cpf" },
        { label: "Responsável — telefone", value: "responsavel.telefone" },
        { label: "Responsável — e-mail", value: "responsavel.email" },
        // Tokens planos legados (compat com templates antigos)
        { label: "[legado] {cliente_nome}", value: "cliente_nome" },
        { label: "[legado] {cliente_cnpj}", value: "cliente_cnpj" },
        { label: "[legado] {cliente_cpf}", value: "cliente_cpf" },
        { label: "[legado] {cliente_email}", value: "cliente_email" },
        { label: "[legado] {cliente_telefone}", value: "cliente_telefone" },
        { label: "[legado] {cliente_endereco}", value: "cliente_endereco" },
        { label: "[legado] {cliente_cidade}", value: "cliente_cidade" },
        { label: "[legado] {responsavel_nome}", value: "responsavel_nome" },
        { label: "[legado] {responsavel_email}", value: "responsavel_email" },
        { label: "[legado] {responsavel_telefone}", value: "responsavel_telefone" },
        { label: "[legado] {responsavel_cargo}", value: "responsavel_cargo" },
      ];

      let pergunta: PlaceholderOpcao[] = [];
      let produto: PlaceholderOpcao[] = [];
      let boolean: PlaceholderOpcao[] = [];

      try {
        // PERGUNTAS
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

        // Loop genérico de categorias→itens (recomendado pelo template novo)
        produto.unshift({ label: "Loop categorias → itens (recomendado)", value: "#categorias" });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[placeholder] erro ao carregar do banco, usando MOCK", msg);
        setErro(msg);
      }

      // FALLBACK
      if (pergunta.length === 0) pergunta = PLACEHOLDER_MOCK.pergunta;
      if (produto.length === 0) produto = PLACEHOLDER_MOCK.produto;
      if (boolean.length === 0) boolean = PLACEHOLDER_MOCK.boolean;

      if (cancelado) return;

      const next: PlaceholderData = { cliente, pergunta, produto, boolean };
      setData(next);
      setLoading(false);

      console.log("[placeholder] dados carregados", {
        cliente: cliente.length,
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
