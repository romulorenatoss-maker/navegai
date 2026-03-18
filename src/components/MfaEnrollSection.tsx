import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

export default function MfaEnrollSection() {
  const [enrolled, setEnrolled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkEnrollment = async () => {
    setLoading(true);
    const { data } = await supabase.auth.mfa.listFactors();
    const totp = data?.totp?.find((f) => f.status === "verified");
    if (totp) {
      setEnrolled(true);
      setFactorId(totp.id);
    } else {
      setEnrolled(false);
      setFactorId(null);
    }
    setLoading(false);
  };

  useEffect(() => { checkEnrollment(); }, []);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      // Clean up any unverified factors first
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const unverified = existing?.totp?.filter((f) => f.status !== "verified") || [];
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Nexus Ops Authenticator",
      });
      if (error) throw error;

      setQrUri(data.totp.uri);
      setSecret(data.totp.secret);
      setPendingFactorId(data.id);
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar configuração 2FA.");
    } finally {
      setEnrolling(false);
    }
  };

  const handleVerifyEnrollment = async () => {
    if (!pendingFactorId || verifyCode.length < 6) return;
    setVerifying(true);
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: pendingFactorId });
      if (cErr) throw cErr;

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: challenge.id,
        code: verifyCode,
      });
      if (vErr) throw vErr;

      toast.success("2FA ativado com sucesso!");
      setQrUri(null);
      setSecret(null);
      setPendingFactorId(null);
      setVerifyCode("");
      await checkEnrollment();
    } catch (err: any) {
      toast.error(err.message || "Código inválido.");
      setVerifyCode("");
    } finally {
      setVerifying(false);
    }
  };

  const handleUnenroll = async () => {
    if (!factorId) return;
    setUnenrolling(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success("2FA desativado.");
      await checkEnrollment();
    } catch (err: any) {
      toast.error(err.message || "Erro ao desativar 2FA.");
    } finally {
      setUnenrolling(false);
    }
  };

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> Verificando status do 2FA...
      </div>
    );
  }

  // Enrollment in progress — show QR
  if (qrUri && pendingFactorId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h3 className="font-medium text-sm">Configurar Autenticação em Duas Etapas</h3>
        </div>

        <p className="text-sm text-muted-foreground">
          Escaneie o QR code abaixo com seu aplicativo autenticador (Google Authenticator, Authy, etc.):
        </p>

        <div className="flex justify-center p-4 bg-background rounded-lg border">
          <QRCodeSVG value={qrUri} size={180} />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Ou insira a chave manualmente:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all select-all">
              {secret}
            </code>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={copySecret}>
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="verify-enroll">Código de verificação</Label>
          <Input
            id="verify-enroll"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="text-center text-lg tracking-[0.5em] font-mono"
            maxLength={6}
            inputMode="numeric"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => { setQrUri(null); setSecret(null); setPendingFactorId(null); setVerifyCode(""); }}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleVerifyEnrollment} disabled={verifying || verifyCode.length < 6}>
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ativar 2FA"}
          </Button>
        </div>
      </div>
    );
  }

  // Already enrolled
  if (enrolled) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-500" />
            <span className="text-sm font-medium">Autenticação em Duas Etapas</span>
          </div>
          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">Ativo</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Sua conta está protegida com verificação em duas etapas via aplicativo autenticador.
        </p>
        <Button variant="destructive" size="sm" onClick={handleUnenroll} disabled={unenrolling}>
          {unenrolling ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldOff className="w-4 h-4 mr-1" />}
          Desativar 2FA
        </Button>
      </div>
    );
  }

  // Not enrolled
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldOff className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm font-medium">Autenticação em Duas Etapas</span>
        </div>
        <Badge variant="outline" className="text-muted-foreground">Inativo</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Adicione uma camada extra de segurança à sua conta usando um aplicativo autenticador.
      </p>
      <Button size="sm" onClick={handleEnroll} disabled={enrolling}>
        {enrolling ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
        Configurar 2FA
      </Button>
    </div>
  );
}
