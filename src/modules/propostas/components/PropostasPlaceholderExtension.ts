import { Node, mergeAttributes } from "@tiptap/core";

/**
 * PropostasPlaceholder — token inline {chave} tratado como nó atômico editável.
 * Não pode ser quebrado, só substituído por valor. Reconhece padrão {[a-zA-Z0-9_.]+}.
 */
export const PropostasPlaceholder = Node.create({
  name: "propostasPlaceholder",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      chave: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-propostas-placeholder]",
        getAttrs: (el) => ({ chave: (el as HTMLElement).getAttribute("data-chave") ?? "" }),
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-propostas-placeholder": "true",
        "data-chave": node.attrs.chave,
        class:
          "inline-block px-1.5 py-0.5 rounded bg-primary/15 text-primary text-sm font-mono border border-primary/30",
      }),
      `{${node.attrs.chave}}`,
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.setAttribute("data-propostas-placeholder", "true");
      dom.setAttribute("data-chave", node.attrs.chave);
      dom.className =
        "inline-block px-1.5 py-0.5 rounded bg-primary/15 text-primary text-sm font-mono border border-primary/30";
      dom.textContent = `{${node.attrs.chave}}`;
      return { dom };
    };
  },
});
