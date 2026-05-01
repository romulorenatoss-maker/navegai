import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Phone, Mail, Plus, Trash2, Star, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { applyPhoneMask, normalizePhone, isValidPhone, detectPhoneType, getPhoneTypeLabel } from "@/lib/phone-utils";

interface Props {
  clienteId: string;
}

type TipoContato = "celular" | "fixo" | "0800" | "email";

export default function ClienteContatosResponsaveis({ clienteId }: Props) {
  const qc = useQueryClient();

  const { data: contatos = [] } = useQuery({
    queryKey: ["cliente_contatos", clienteId],
    queryFn: async () => {
      const { data } = await supabase.from("cliente_contatos").select("*").eq("cliente_id", clienteId).order("created_at");
      return data || [];
    },
    enabled: !!clienteId,
  });

  const { data: responsaveis = [] } = useQuery({
    queryKey: ["cliente_responsaveis", clienteId],
    queryFn: async () => {
      const { data } = await supabase.from("cliente_responsaveis").select("*").eq("cliente_id", clienteId).order("principal", { ascending: false });
      return data || [];
    },
    enabled: !!clienteId,
  });

  // ===== CONTATO: novo =====
  const [novoTipo, setNovoTipo] = useState<TipoContato>("celular");
  const [novoValor, setNovoValor] = useState("");
  const [novoWpp, setNovoWpp] = useState(false);

  const handleAddContato = async () => {
    const valor = novoValor.trim();
    if (!valor) { toast.error("Informe o valor"); return; }
    if (novoTipo === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) { toast.error("E-mail inválido"); return; }
    } else {
      const digits = normalizePhone(valor);
      if (!isValidPhone(digits)) { toast.error("Telefone inválido"); return; }
    }
    const { error } = await supabase.from("cliente_contatos").insert({
      cliente_id: clienteId,
      tipo: novoTipo,
      valor: novoTipo === "email" ? valor : applyPhoneMask(valor),
      tem_whatsapp: novoTipo !== "email" ? novoWpp : false,
    });
    if (error) { toast.error(error.message); return; }
    setNovoValor(""); setNovoWpp(false);
    qc.invalidateQueries({ queryKey: ["cliente_contatos", clienteId] });
    toast.success("Contato adicionado");
  };

  const handleDelContato = async (id: string) => {
    const usado = responsaveis.some((r: any) => r.contato_telefone_id === id || r.contato_email_id === id);
    if (usado) { toast.error("Contato vinculado a um responsável. Desvincule antes."); return; }
    const { error } = await supabase.from("cliente_contatos").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["cliente_contatos", clienteId] });
    toast.success("Contato removido");
  };

  const toggleWpp = async (id: string, atual: boolean) => {
    const { error } = await supabase.from("cliente_contatos").update({ tem_whatsapp: !atual }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["cliente_contatos", clienteId] });
  };

  // ===== RESPONSÁVEL: novo =====
  const [respNome, setRespNome] = useState("");
  const [respCargo, setRespCargo] = useState("");
  const [respCpf, setRespCpf] = useState("");
  const [respTelId, setRespTelId] = useState<string>("");
  const [respEmailId, setRespEmailId] = useState<string>("");
  const [respPrincipal, setRespPrincipal] = useState(false);

  const telefones = contatos.filter((c: any) => c.tipo !== "email");
  const emails = contatos.filter((c: any) => c.tipo === "email");

  const handleAddResp = async () => {
    if (!respNome.trim()) { toast.error("Nome obrigatório"); return; }
    // se principal: zerar os outros
    if (respPrincipal) {
      await supabase.from("cliente_responsaveis").update({ principal: false }).eq("cliente_id", clienteId);
    }
    const { error } = await supabase.from("cliente_responsaveis").insert({
      cliente_id: clienteId,
      nome: respNome.trim(),
      cargo: respCargo.trim() || null,
      cpf: respCpf.trim() || null,
      contato_telefone_id: respTelId || null,
      contato_email_id: respEmailId || null,
      principal: respPrincipal || responsaveis.length === 0,
    });
    if (error) { toast.error(error.message); return; }
    setRespNome(""); setRespCargo(""); setRespCpf(""); setRespTelId(""); setRespEmailId(""); setRespPrincipal(false);
    qc.invalidateQueries({ queryKey: ["cliente_responsaveis", clienteId] });
    toast.success("Responsável adicionado");
  };

  const handleDelResp = async (id: string) => {
    const { error } = await supabase.from("cliente_responsaveis").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["cliente_responsaveis", clienteId] });
    toast.success("Responsável removido");
  };

  const setPrincipal = async (id: string) => {
    await supabase.from("cliente_responsaveis").update({ principal: false }).eq("cliente_id", clienteId);
    const { error } = await supabase.from("cliente_responsaveis").update({ principal: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["cliente_responsaveis", clienteId] });
  };

  return (
    <div className="space-y-4">
      {/* CONTATOS */}
      <div className="bg-muted/30 rounded-lg p-4 space-y-3">
        <h3 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5" /> Contatos
        </h3>

        {contatos.length === 0 && <p className="text-caption text-muted-foreground italic">Nenhum contato cadastrado.</p>}

        <div className="space-y-1.5">
          {contatos.map((ct: any) => {
            const isEmail = ct.tipo === "email";
            const tipoLabel = isEmail ? "E-mail" : (ct.tipo === "0800" ? "0800" : ct.tipo === "fixo" ? "Fixo" : ct.tipo === "celular" ? "Celular" : getPhoneTypeLabel(normalizePhone(ct.valor)));
            return (
              <div key={ct.id} className="flex items-center gap-2 bg-card border border-border rounded px-2 py-1.5">
                {isEmail ? <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                <span className="text-body text-foreground flex-1 truncate">{ct.valor}</span>
                <Badge variant="outline" className="text-xs">{tipoLabel}</Badge>
                {!isEmail && (
                  <button type="button" onClick={() => toggleWpp(ct.id, ct.tem_whatsapp)} className={`text-xs px-1.5 py-0.5 rounded border ${ct.tem_whatsapp ? "bg-success/10 text-success border-success/30" : "text-muted-foreground border-border"}`}>
                    WhatsApp
                  </button>
                )}
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDelContato(ct.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* Adicionar contato */}
        <div className="border-t border-border pt-3 grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3">
            <Label className="text-xs">Tipo</Label>
            <Select value={novoTipo} onValueChange={(v: TipoContato) => { setNovoTipo(v); setNovoValor(""); }}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="celular">Celular</SelectItem>
                <SelectItem value="fixo">Fixo</SelectItem>
                <SelectItem value="0800">0800</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-6">
            <Label className="text-xs">{novoTipo === "email" ? "E-mail" : "Telefone"}</Label>
            <Input
              className="h-8 text-xs"
              placeholder={novoTipo === "email" ? "exemplo@dominio.com" : novoTipo === "0800" ? "0800 000 0000" : novoTipo === "fixo" ? "(00) 0000-0000" : "(00) 00000-0000"}
              value={novoValor}
              onChange={e => setNovoValor(novoTipo === "email" ? e.target.value : applyPhoneMask(e.target.value))}
            />
          </div>
          <div className="col-span-2 flex items-center gap-1 pb-1.5">
            {novoTipo !== "email" && (
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <Checkbox checked={novoWpp} onCheckedChange={v => setNovoWpp(!!v)} />
                <span>WhatsApp</span>
              </label>
            )}
          </div>
          <div className="col-span-1">
            <Button size="sm" className="h-8 w-full" onClick={handleAddContato}><Plus className="w-3 h-3" /></Button>
          </div>
        </div>
      </div>

      {/* RESPONSÁVEIS */}
      <div className="bg-muted/30 rounded-lg p-4 space-y-3">
        <h3 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <UserIcon className="w-3.5 h-3.5" /> Responsáveis
        </h3>

        {responsaveis.length === 0 && <p className="text-caption text-muted-foreground italic">Nenhum responsável cadastrado.</p>}

        <div className="space-y-1.5">
          {responsaveis.map((r: any) => {
            const tel = contatos.find((c: any) => c.id === r.contato_telefone_id);
            const em = contatos.find((c: any) => c.id === r.contato_email_id);
            return (
              <div key={r.id} className="bg-card border border-border rounded p-2 flex items-start gap-2">
                <button type="button" onClick={() => !r.principal && setPrincipal(r.id)} className={r.principal ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"} title={r.principal ? "Principal" : "Marcar como principal"}>
                  <Star className="w-4 h-4" fill={r.principal ? "currentColor" : "none"} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-body font-medium text-foreground">{r.nome}</span>
                    {r.cargo && <span className="text-caption text-muted-foreground">— {r.cargo}</span>}
                    {r.principal && <Badge variant="outline" className="text-xs">Principal</Badge>}
                  </div>
                  <div className="text-caption text-muted-foreground space-x-3">
                    {r.cpf && <span>CPF: {r.cpf}</span>}
                    {tel && <span>Tel: {tel.valor}</span>}
                    {em && <span>E-mail: {em.valor}</span>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDelResp(r.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* Adicionar responsável */}
        <div className="border-t border-border pt-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input className="h-8 text-xs" value={respNome} onChange={e => setRespNome(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Cargo</Label>
              <Input className="h-8 text-xs" value={respCargo} onChange={e => setRespCargo(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">CPF</Label>
              <Input className="h-8 text-xs" value={respCpf} onChange={e => setRespCpf(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-5">
              <Label className="text-xs">Telefone</Label>
              <Select value={respTelId || "none"} onValueChange={v => setRespTelId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {telefones.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.valor} ({c.tipo})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-5">
              <Label className="text-xs">E-mail</Label>
              <Select value={respEmailId || "none"} onValueChange={v => setRespEmailId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {emails.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.valor}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex items-center gap-1 pb-1.5">
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <Checkbox checked={respPrincipal} onCheckedChange={v => setRespPrincipal(!!v)} />
                <span>Principal</span>
              </label>
            </div>
          </div>
          <Button size="sm" className="w-full h-8" onClick={handleAddResp}><Plus className="w-3 h-3 mr-1" /> Adicionar responsável</Button>
        </div>
      </div>
    </div>
  );
}
