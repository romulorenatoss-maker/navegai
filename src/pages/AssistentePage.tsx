import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, User, Loader2, Sparkles, TrendingUp, Users, BarChart3, FileSpreadsheet, PieChart } from "lucide-react";
import { toast } from "sonner";
import { AssistenteMessageRenderer } from "@/components/assistente/AssistenteMessageRenderer";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/business-assistant`;

type Message = { role: "user" | "assistant"; content: string };

const quickSuggestions = [
  { label: "Vendas hoje", icon: TrendingUp, question: "Quantas vendas (conversões) foram feitas hoje? Mostre um gráfico de barras e uma tabela com os leads convertidos." },
  { label: "Leads na fila", icon: Users, question: "Quantos leads estão na fila aguardando atendimento? Mostre tabela completa com nome, telefone, campanha e tentativas." },
  { label: "Relatório geral", icon: FileSpreadsheet, question: "Gere um relatório completo dos leads com nome, contato, tentativas, status e campanha. Inclua gráfico de distribuição por status." },
  { label: "Campanha top", icon: Sparkles, question: "Qual campanha mais converteu leads? Mostre gráfico comparativo de conversão entre campanhas." },
  { label: "Performance", icon: BarChart3, question: "Mostre o desempenho dos colaboradores: interações, atrasos, conversões. Inclua gráfico e tabela." },
  { label: "Análise leads", icon: PieChart, question: "Quais leads tiveram mais interações mas não converteram? Identifique gargalos e sugira melhorias." },
];

async function streamChat({
  question,
  onDelta,
  onDone,
  onError,
}: {
  question: string;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ question }),
  });

  if (!resp.ok) {
    let errMsg = "Erro ao consultar o assistente.";
    try {
      const body = await resp.json();
      if (body.error) errMsg = body.error;
    } catch { await resp.text(); }
    onError(errMsg);
    return;
  }

  if (!resp.body) { onError("Sem resposta do servidor."); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = "";
  let streamDone = false;

  while (!streamDone) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
      let line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);

      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") { streamDone = true; break; }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch {
        textBuffer = line + "\n" + textBuffer;
        break;
      }
    }
  }

  // Final flush
  if (textBuffer.trim()) {
    for (let raw of textBuffer.split("\n")) {
      if (!raw) continue;
      if (raw.endsWith("\r")) raw = raw.slice(0, -1);
      if (raw.startsWith(":") || raw.trim() === "") continue;
      if (!raw.startsWith("data: ")) continue;
      const jsonStr = raw.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) onDelta(content);
      } catch { /* ignore */ }
    }
  }

  onDone();
}

export default function AssistentePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (question: string) => {
    if (!question.trim() || isLoading) return;
    const userMsg: Message = { role: "user", content: question.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        question: question.trim(),
        onDelta: (chunk) => upsertAssistant(chunk),
        onDone: () => setIsLoading(false),
        onError: (msg) => {
          toast.error(msg);
          setIsLoading(false);
        },
      });
    } catch (e) {
      console.error(e);
      toast.error("Erro de conexão com o assistente.");
      setIsLoading(false);
    }

    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Assistente Inteligente</h1>
            <p className="text-xs text-muted-foreground">Pergunte sobre vendas, leads ou desempenho do negócio</p>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-hidden px-4">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="space-y-4 py-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Como posso ajudar?</h2>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                  Faça perguntas sobre seus leads, vendas, campanhas e desempenho. As respostas são baseadas nos dados reais do sistema.
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {quickSuggestions.map((s) => (
                    <Button
                      key={s.label}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => send(s.question)}
                      disabled={isLoading}
                    >
                      <s.icon className="w-3.5 h-3.5" />
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <Card className={`max-w-[80%] ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50"}`}>
                  <CardContent className="p-3">
                    {msg.role === "user" ? (
                      <p className="text-sm">{msg.content}</p>
                    ) : (
                      <AssistenteMessageRenderer content={msg.content} />
                    )}
                  </CardContent>
                </Card>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <Card className="bg-muted/50">
                  <CardContent className="p-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Analisando dados...</span>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Quick suggestions (when there are messages) */}
      {messages.length > 0 && !isLoading && (
        <div className="px-4 py-1 shrink-0">
          <div className="flex gap-1.5 flex-wrap">
            {quickSuggestions.map((s) => (
              <Badge
                key={s.label}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 transition-colors text-xs py-0.5"
                onClick={() => send(s.question)}
              >
                <s.icon className="w-3 h-3 mr-1" />
                {s.label}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            placeholder="Pergunte sobre vendas, leads ou desempenho..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={() => send(input)} disabled={isLoading || !input.trim()} className="gap-1.5 shrink-0">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Perguntar
          </Button>
        </div>
      </div>
    </div>
  );
}
