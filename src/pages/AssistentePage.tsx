import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Send, User, Loader2, Sparkles, TrendingUp, Users, BarChart3, FileSpreadsheet, PieChart, MessageSquare, TableProperties, Download, Trophy, Target } from "lucide-react";
import { toast } from "sonner";
import { AssistenteMessageRenderer } from "@/components/assistente/AssistenteMessageRenderer";
import { useAuth } from "@/contexts/AuthContext";
import * as XLSX from "xlsx";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/business-assistant`;

type Message = { role: "user" | "assistant"; content: string };

const quickSuggestions = [
  { label: "📊 Gráfico de vendas", icon: TrendingUp, question: "Quantas vendas (conversões) foram feitas hoje? Mostre um gráfico de barras e uma tabela com os leads convertidos." },
  { label: "🏆 Ranking performance", icon: Trophy, question: "Mostre o ranking de desempenho dos colaboradores com interações, conversões e atrasos. Inclua gráfico comparativo." },
  { label: "👥 Leads na fila", icon: Users, question: "Quantos leads estão na fila aguardando atendimento? Mostre tabela completa com nome, telefone, campanha e tentativas." },
  { label: "📋 Relatório geral", icon: FileSpreadsheet, question: "Gere um relatório completo dos leads com nome, contato, tentativas, status e campanha. Inclua gráfico de distribuição por status." },
  { label: "🎯 Campanha top", icon: Target, question: "Qual campanha mais converteu leads? Mostre gráfico comparativo de conversão entre campanhas." },
  { label: "📈 Análise leads", icon: PieChart, question: "Quais leads tiveram mais interações mas não converteram? Identifique gargalos e sugira melhorias." },
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
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) { onError("Sessão expirada. Faça login novamente."); return; }

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
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

// ─── Simple Mode Component ───
function SimpleMode() {
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");
  const [dados, setDados] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false);

  async function perguntarIA() {
    if (!pergunta.trim() || loading) return;
    setLoading(true);
    setResposta("");
    setDados([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { toast.error("Sessão expirada."); setLoading(false); return; }

      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ question: pergunta, mode: "simple" }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Erro ao consultar o assistente.");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setResposta(data.texto || "");
      setDados(Array.isArray(data.dados) ? data.dados : []);
    } catch (e) {
      console.error(e);
      toast.error("Erro de conexão com o assistente.");
    }
    setLoading(false);
  }

  function exportarExcel() {
    if (dados.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
    XLSX.writeFile(wb, "relatorio.xlsx");
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2 shrink-0">
        <Input
          placeholder="Pergunte sobre vendas, leads, desempenho..."
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && perguntarIA()}
          disabled={loading}
          className="flex-1"
        />
        <Button onClick={perguntarIA} disabled={loading || !pergunta.trim()} className="gap-1.5 shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Perguntar
        </Button>
      </div>

      {/* Quick suggestions */}
      <div className="flex flex-wrap gap-1.5 shrink-0">
        {quickSuggestions.map((s) => (
          <Badge
            key={s.label}
            variant="outline"
            className="cursor-pointer hover:bg-primary/10 transition-colors text-xs py-0.5"
            onClick={() => { setPergunta(s.question); }}
          >
            <s.icon className="w-3 h-3 mr-1" />
            {s.label}
          </Badge>
        ))}
      </div>

      {loading && (
        <Card className="bg-muted/50">
          <CardContent className="p-4 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Processando consulta...</span>
          </CardContent>
        </Card>
      )}

      {resposta && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">📋 Resposta</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{resposta}</p>
          </CardContent>
        </Card>
      )}

      {dados.length > 0 && (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <span className="text-sm font-medium text-foreground">{dados.length} registro(s)</span>
            <Button variant="outline" size="sm" onClick={exportarExcel} className="gap-1.5">
              <Download className="w-4 h-4" />
              Baixar Excel
            </Button>
          </div>
          <ScrollArea className="flex-1 border rounded-md">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {Object.keys(dados[0]).map((col) => (
                      <th key={col} className="px-3 py-2 text-left font-medium text-foreground whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {String(v ?? "-")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// ─── Chat Mode Component ───
function ChatMode() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const userName = profile?.nome?.split(" ").slice(0, 2).join(" ") || "Colaborador";

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
    <div className="flex flex-col h-full">
      {/* Chat area */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="space-y-4 py-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  Olá, {userName}! 👋
                </h2>
                <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                  Sou a <span className="font-semibold text-primary">Naví</span>, sua assistente inteligente. O que deseja fazer hoje?
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg">
                  {quickSuggestions.map((s) => (
                    <Button
                      key={s.label}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-auto py-2.5 justify-start"
                      onClick={() => send(s.question)}
                      disabled={isLoading}
                    >
                      <s.icon className="w-4 h-4 shrink-0" />
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
      </div>

      {/* Quick suggestions (when there are messages) */}
      {messages.length > 0 && !isLoading && (
        <div className="py-1 shrink-0">
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
      <div className="pb-2 pt-2 shrink-0">
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

// ─── Main Page ───
export default function AssistentePage() {
  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Naví</h1>
            <p className="text-xs text-muted-foreground">Sua assistente inteligente de negócios</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-4 pb-4">
        <Tabs defaultValue="chat" className="flex flex-col h-full">
          <TabsList className="shrink-0 w-fit">
            <TabsTrigger value="chat" className="gap-1.5">
              <MessageSquare className="w-4 h-4" />
              Chat IA
            </TabsTrigger>
            <TabsTrigger value="simple" className="gap-1.5">
              <TableProperties className="w-4 h-4" />
              Consulta Rápida
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex-1 overflow-hidden mt-2">
            <ChatMode />
          </TabsContent>
          <TabsContent value="simple" className="flex-1 overflow-hidden mt-2">
            <SimpleMode />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
