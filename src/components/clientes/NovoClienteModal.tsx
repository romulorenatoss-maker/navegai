import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { applyPhoneMask, normalizePhone, isValidPhone } from "@/lib/phone-utils";
import { useQuery } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (cliente: { id: string; nome: string; cpf?: string | null; cidade?: string | null }) => void;
}

type TipoTel = "celular" | "fixo" | "0800";

export default function NovoClienteModal({ open, onOpenChange, onCreated }: Props) {
  const [tipoPessoa, setTipoPessoa] = useState<"PF" | "PJ">("PF");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [rg, setRg] = useState("");
  const [nomeMae, setNomeMae] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [ie, setIe] = useState("");
  const [im, setIm] = useState("");

  const [cidadeId, setCidadeId] = useState("");
  const [bairroId, setBairroId] = useState("");
  const [ruaId, setRuaId] = useState("");
  const [numero, setNumero] = useState("");
  const [referencia, setReferencia] = useState("");

  const [telTipo, setTelTipo] = useState<TipoTel>("celular");
  const [telValor, setTelValor] = useState("");
  const [emailValor, setEmailValor] = useState("");

  const [respNome, setRespNome] = useState("");
  const [respCargo, setRespCargo] = useState("");

  const [saving, setSaving] = useState(false);

  const { data: cidades = [] } = useQuery({
    queryKey: ["enderecos-cidades"],
    queryFn: async () => { const { data } = await supabase.from("cidades").select("*").order("nome"); return data || []; },
    enabled: open,
  });
  const { data: bairros = [] } = useQuery({
    queryKey: ["enderecos-bairros"],
    queryFn: async () => { const { data } = await supabase.from("bairros").select("*").order("nome"); return data || []; },
    enabled: open,
  });
  const { data: ruas = [] } = useQuery({
    queryKey: ["enderecos-ruas"],
    queryFn: async () => { const { data } = await supabase.from("ruas").select("*").order("nome"); return data || []; },
    enabled: open,
  });

  const filteredBairros = bairros.filter((b: any) => !cidadeId || b.cidade_id === cidadeId);
  const filteredRuas = ruas.filter((r: any) => !bairroId || r.bairro_id === bairroId);

  const reset = () => {
    setTipoPessoa("PF"); setNome(""); setCpf(""); setRg(""); setNomeMae("");
    setCnpj(""); setRazaoSocial(""); setNomeFantasia(""); setIe(""); setIm("");
    setCidadeId(""); setBairroId(""); setRuaId(""); setNumero(""); setReferencia("");
    setTelTipo("celular"); setTelValor(""); setEmailValor("");
    setRespNome(""); setRespCargo("");
  };

  const handleSubmit = async () => {
    if (!nome.trim()) { toast.error("Nome obrigatório"); return; }
    const isPJ = tipoPessoa === "PJ";

    setSaving(true);
    try {
      // 1. Cliente
      const { data: cli, error } = await supabase.from("clientes").insert({
        tipo_pessoa: tipoPessoa,
        nome: nome.trim(),
        cpf: !isPJ ? (cpf.trim() || null) : null,
        rg: !isPJ ? (rg.trim() || null) : null,
        nome_mae: !isPJ ? (nomeMae.trim() || null) : null,
        cnpj: isPJ ? (cnpj.trim() || null) : null,
        razao_social: isPJ ? (razaoSocial.trim() || null) : null,
        nome_fantasia: isPJ ? (nomeFantasia.trim() || null) : null,
        inscricao_estadual: isPJ ? (ie.trim() || null) : null,
        inscricao_municipal: isPJ ? (im.trim() || null) : null,
        cidade_id: cidadeId || null,
        bairro_id: bairroId || null,
        rua_id: ruaId || null,
        numero: numero.trim() || null,
        referencia: referencia.trim() || null,
      } as any).select("id, nome, cpf").single();

      if (error || !cli) throw error;

      // 2. Contatos opcionais
      let telId: string | null = null;
      let emId: string | null = null;
      if (telValor.trim()) {
        const digits = normalizePhone(telValor);
        if (!isValidPhone(digits)) { toast.error("Telefone inválido"); setSaving(false); return; }
        const { data: ct } = await supabase.from("cliente_contatos").insert({
          cliente_id: cli.id, tipo: telTipo, valor: applyPhoneMask(telValor), tem_whatsapp: telTipo === "celular",
        }).select("id").single();
        telId = ct?.id || null;
      }
      if (emailValor.trim()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValor.trim())) { toast.error("E-mail inválido"); setSaving(false); return; }
        const { data: em } = await supabase.from("cliente_contatos").insert({
          cliente_id: cli.id, tipo: "email", valor: emailValor.trim(), tem_whatsapp: false,
        }).select("id").single();
        emId = em?.id || null;
      }

      // 3. Responsável opcional
      if (respNome.trim()) {
        await supabase.from("cliente_responsaveis").insert({
          cliente_id: cli.id,
          nome: respNome.trim(),
          cargo: respCargo.trim() || null,
          contato_telefone_id: telId,
          contato_email_id: emId,
          principal: true,
        });
      }

      toast.success("Cliente criado!");
      onCreated({ id: cli.id, nome: cli.nome, cpf: cli.cpf });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "falha ao criar cliente"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
          <DialogDescription>Cadastro completo. Após salvar, o cliente é selecionado automaticamente.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-3">
          <div className="space-y-4">
            {/* Tipo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo de pessoa</Label>
                <Select value={tipoPessoa} onValueChange={(v: "PF" | "PJ") => setTipoPessoa(v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Nome *</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} className="h-9" />
              </div>
            </div>

            {/* PF */}
            {tipoPessoa === "PF" ? (
              <div className="grid grid-cols-3 gap-3">
                <div><Label className="text-xs">CPF</Label><Input value={cpf} onChange={e => setCpf(e.target.value)} className="h-9" /></div>
                <div><Label className="text-xs">RG</Label><Input value={rg} onChange={e => setRg(e.target.value)} className="h-9" /></div>
                <div><Label className="text-xs">Nome da mãe</Label><Input value={nomeMae} onChange={e => setNomeMae(e.target.value)} className="h-9" /></div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">CNPJ</Label><Input value={cnpj} onChange={e => setCnpj(e.target.value)} className="h-9" /></div>
                  <div><Label className="text-xs">Razão Social</Label><Input value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} className="h-9" /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label className="text-xs">Nome Fantasia</Label><Input value={nomeFantasia} onChange={e => setNomeFantasia(e.target.value)} className="h-9" /></div>
                  <div><Label className="text-xs">Insc. Estadual</Label><Input value={ie} onChange={e => setIe(e.target.value)} className="h-9" /></div>
                  <div><Label className="text-xs">Insc. Municipal</Label><Input value={im} onChange={e => setIm(e.target.value)} className="h-9" /></div>
                </div>
              </div>
            )}

            {/* Endereço */}
            <div className="border-t pt-3 space-y-3">
              <h3 className="text-caption font-semibold text-muted-foreground uppercase">Endereço</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Cidade</Label>
                  <Select value={cidadeId || "none"} onValueChange={v => { setCidadeId(v === "none" ? "" : v); setBairroId(""); setRuaId(""); }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nenhuma —</SelectItem>
                      {cidades.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Bairro</Label>
                  <Select value={bairroId || "none"} onValueChange={v => { setBairroId(v === "none" ? "" : v); setRuaId(""); }} disabled={!cidadeId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nenhum —</SelectItem>
                      {filteredBairros.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Rua</Label>
                  <Select value={ruaId || "none"} onValueChange={v => setRuaId(v === "none" ? "" : v)} disabled={!bairroId}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nenhuma —</SelectItem>
                      {filteredRuas.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Número</Label><Input value={numero} onChange={e => setNumero(e.target.value)} className="h-9" /></div>
                <div><Label className="text-xs">Referência</Label><Input value={referencia} onChange={e => setReferencia(e.target.value)} className="h-9" /></div>
              </div>
            </div>

            {/* Contato */}
            <div className="border-t pt-3 space-y-3">
              <h3 className="text-caption font-semibold text-muted-foreground uppercase">Contato (opcional)</h3>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-3">
                  <Label className="text-xs">Tipo telefone</Label>
                  <Select value={telTipo} onValueChange={(v: TipoTel) => setTelTipo(v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="celular">Celular</SelectItem>
                      <SelectItem value="fixo">Fixo</SelectItem>
                      <SelectItem value="0800">0800</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-4">
                  <Label className="text-xs">Telefone</Label>
                  <Input value={telValor} onChange={e => setTelValor(applyPhoneMask(e.target.value))} className="h-9"
                    placeholder={telTipo === "0800" ? "0800 000 0000" : telTipo === "fixo" ? "(00) 0000-0000" : "(00) 00000-0000"} />
                </div>
                <div className="col-span-5">
                  <Label className="text-xs">E-mail</Label>
                  <Input type="email" value={emailValor} onChange={e => setEmailValor(e.target.value)} className="h-9" />
                </div>
              </div>
            </div>

            {/* Responsável */}
            <div className="border-t pt-3 space-y-3">
              <h3 className="text-caption font-semibold text-muted-foreground uppercase">Responsável principal (opcional)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Nome</Label><Input value={respNome} onChange={e => setRespNome(e.target.value)} className="h-9" /></div>
                <div><Label className="text-xs">Cargo</Label><Input value={respCargo} onChange={e => setRespCargo(e.target.value)} className="h-9" /></div>
              </div>
              {respNome.trim() && (telValor.trim() || emailValor.trim()) && (
                <p className="text-xs text-muted-foreground">O telefone e/ou e-mail acima serão vinculados a este responsável.</p>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Salvando..." : "Criar e selecionar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
