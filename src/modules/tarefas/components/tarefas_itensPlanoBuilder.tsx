/**
 * tarefas_itensPlanoBuilder.tsx
 *
 * Componente compartilhado: builder de lista de itens de plano de ação.
 * Permite ADICIONAR INCREMENTALMENTE itens em qualquer ordem, com qualquer
 * combinação de tipos (foto, vídeo, áudio, texto). Múltiplos itens do mesmo
 * tipo são suportados — cada um carrega sua própria descrição/título.
 *
 * Substitui os 6 blocos JSX duplicados que existiam em
 * Usado pelos paineis oficiais para montar itens de plano de acao.
 *
 * Doc:
 *   src/modules/tarefas/docs/tarefas_arquitetura_planos_acao.md
 *
 * Regra 0.7 (verdade única): este é o ÚNICO local de UI para construir
 * itens_plano. Não há cópias.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Video, Music, Pencil, Plus, X, GripVertical } from "lucide-react";

export interface ItemPlano {
  tipo: "foto" | "video" | "audio" | "texto";
  titulo: string;
  obrigatorio: boolean;
}

interface Props {
  itens: ItemPlano[];
  onChange: (itens: ItemPlano[]) => void;
  disabled?: boolean;
  /** Variação compacta para uso em painéis pequenos. */
  compact?: boolean;
  /** Cor de destaque do botão (default: primary). */
  accentColor?: "amber" | "purple" | "blue" | "default";
}

const TIPO_CONFIG: Record<ItemPlano["tipo"], { label: string; placeholder: string; Icon: any; cor: string }> = {
  foto:  { label: "Foto",  placeholder: "O que fotografar?",   Icon: Camera, cor: "text-blue-700" },
  video: { label: "Vídeo", placeholder: "O que filmar?",       Icon: Video,  cor: "text-purple-700" },
  audio: { label: "Áudio", placeholder: "O que gravar?",       Icon: Music,  cor: "text-amber-700" },
  texto: { label: "Texto", placeholder: "O que descrever?",    Icon: Pencil, cor: "text-emerald-700" },
};

const ACCENT_CLASSES: Record<NonNullable<Props["accentColor"]>, { border: string; bg: string; btn: string }> = {
  amber:   { border: "border-amber-300",   bg: "bg-amber-50",   btn: "bg-amber-600 hover:bg-amber-700" },
  purple:  { border: "border-purple-300",  bg: "bg-purple-50",  btn: "bg-purple-600 hover:bg-purple-700" },
  blue:    { border: "border-blue-300",    bg: "bg-blue-50",    btn: "bg-blue-600 hover:bg-blue-700" },
  default: { border: "border-border",      bg: "bg-muted/30",   btn: "bg-primary hover:bg-primary/90" },
};

export function ItensPlanoBuilder({ itens, onChange, disabled, compact, accentColor = "default" }: Props) {
  const [tipoAdicionar, setTipoAdicionar] = useState<ItemPlano["tipo"]>("foto");
  const acc = ACCENT_CLASSES[accentColor];

  const adicionarItem = () => {
    onChange([
      ...itens,
      { tipo: tipoAdicionar, titulo: "", obrigatorio: true },
    ]);
  };

  const removerItem = (idx: number) => {
    onChange(itens.filter((_, i) => i !== idx));
  };

  const atualizarItem = (idx: number, patch: Partial<ItemPlano>) => {
    onChange(itens.map((item, i) => i === idx ? { ...item, ...patch } : item));
  };

  const moverItem = (idx: number, direcao: "up" | "down") => {
    const novo = [...itens];
    const swapIdx = direcao === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= novo.length) return;
    [novo[idx], novo[swapIdx]] = [novo[swapIdx], novo[idx]];
    onChange(novo);
  };

  const txtSize = compact ? "text-[11px]" : "text-xs";

  return (
    <div className="space-y-2">
      <Label className={`${txtSize} font-medium`}>
        O que quero de volta <span className="text-muted-foreground">(adicione na ordem que precisar)</span>
      </Label>

      {/* Lista de itens já adicionados */}
      {itens.length > 0 && (
        <div className="space-y-1.5">
          {itens.map((item, idx) => {
            const cfg = TIPO_CONFIG[item.tipo];
            const Icon = cfg.Icon;
            return (
              <div
                key={idx}
                className={`flex items-start gap-2 rounded-md border ${acc.border} ${acc.bg} p-2`}
              >
                {/* Reorder controls */}
                <div className="flex flex-col items-center gap-0.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => moverItem(idx, "up")}
                    disabled={disabled || idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Mover para cima"
                  >
                    ▲
                  </button>
                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => moverItem(idx, "down")}
                    disabled={disabled || idx === itens.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Mover para baixo"
                  >
                    ▼
                  </button>
                </div>

                {/* Conteúdo do item */}
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1 ${cfg.cor} font-semibold ${txtSize}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">#{idx + 1}</span>
                  </div>
                  <Input
                    value={item.titulo}
                    onChange={(e) => atualizarItem(idx, { titulo: e.target.value })}
                    placeholder={cfg.placeholder}
                    disabled={disabled}
                    className={`h-7 ${txtSize}`}
                  />
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.obrigatorio}
                      onChange={(e) => atualizarItem(idx, { obrigatorio: e.target.checked })}
                      disabled={disabled}
                      className="w-3 h-3"
                    />
                    <span className="text-[10px] text-muted-foreground">Obrigatório</span>
                  </label>
                </div>

                {/* Remover */}
                <button
                  type="button"
                  onClick={() => removerItem(idx)}
                  disabled={disabled}
                  className="text-muted-foreground hover:text-destructive p-1"
                  title="Remover item"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Vazio? */}
      {itens.length === 0 && (
        <p className={`${txtSize} text-muted-foreground italic`}>
          Nenhum item adicionado. Escolha um tipo abaixo e clique em "Adicionar item".
        </p>
      )}

      {/* Adicionar novo item */}
      {!disabled && (
        <div className="flex items-center gap-1.5 pt-1">
          <div className="flex gap-1 flex-1">
            {(Object.keys(TIPO_CONFIG) as ItemPlano["tipo"][]).map((tipo) => {
              const cfg = TIPO_CONFIG[tipo];
              const Icon = cfg.Icon;
              const ativo = tipoAdicionar === tipo;
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setTipoAdicionar(tipo)}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 ${txtSize} font-medium transition-colors ${
                    ativo
                      ? `${acc.border} ${acc.bg} ${cfg.cor}`
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={adicionarItem}
            className={`${acc.btn} text-white h-7 px-2`}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            <span className={txtSize}>Adicionar</span>
          </Button>
        </div>
      )}
    </div>
  );
}

export default ItensPlanoBuilder;
