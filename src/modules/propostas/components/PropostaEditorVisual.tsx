import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TextAlign from "@tiptap/extension-text-align";
import { Color } from "@tiptap/extension-color";
import TextStyle from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Bold, Italic, Underline as UI_Under, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Heading1, Heading2, Heading3, Table as TableIcon, Plus, Minus,
} from "lucide-react";
import { PropostasPlaceholder } from "./PropostasPlaceholderExtension";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  /** Permite acesso externo à instância (ex: aplicar edição da IA em range específico). */
  onReady?: (editor: Editor) => void;
  editable?: boolean;
}

export function PropostaEditorVisual({ value, onChange, className, onReady, editable = true }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "propostas-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      Link.configure({ openOnClick: false }),
      PropostasPlaceholder,
    ],
    content: value,
    editable,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[420px] p-4 [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_th]:bg-muted",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  // Sincroniza valor externo somente se diferir (evita loop)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) return <div className="border rounded-md p-4 text-sm text-muted-foreground">Carregando editor...</div>;

  const ToolBtn = ({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded hover:bg-accent transition-colors",
        active && "bg-accent text-accent-foreground"
      )}
    >
      {children}
    </button>
  );

  return (
    <div className={cn("border rounded-md bg-card", className)}>
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-muted/30">
          <ToolBtn title="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="Itálico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="Sublinhado" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UI_Under className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="Tachado" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-4 h-4" /></ToolBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolBtn title="Título 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="Título 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="Título 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="w-4 h-4" /></ToolBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolBtn title="Esquerda" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="Centro" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="Direita" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="Justificar" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}><AlignJustify className="w-4 h-4" /></ToolBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolBtn title="Lista" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" /></ToolBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <ToolBtn title="Inserir tabela" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="+ linha" onClick={() => editor.chain().focus().addRowAfter().run()}><Plus className="w-4 h-4" /></ToolBtn>
          <ToolBtn title="- linha" onClick={() => editor.chain().focus().deleteRow().run()}><Minus className="w-4 h-4" /></ToolBtn>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            type="button" variant="outline" size="sm" className="h-7 text-xs"
            onClick={() => {
              const chave = prompt("Chave do placeholder (ex: cliente_nome):");
              if (chave) editor.chain().focus().insertContent({ type: "propostasPlaceholder", attrs: { chave } }).run();
            }}
          >
            + Placeholder
          </Button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
