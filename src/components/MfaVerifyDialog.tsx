import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MfaVerifyDialogProps {
  open: boolean;
  onVerified: () => void;
  onCancel: () => void;
}

export default function MfaVerifyDialog({ open, onVerified, onCancel }: MfaVerifyDialogProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCode("");
    // Get the TOTP factor
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = data?.totp?.[0];
      if (totp) setFactorId(totp.id);
    });
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const handleVerify = async () => {
    if (!factorId || code.length < 6) return;
    setLoading(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;

      onVerified();
    } catch (err: any) {
      toast.error(err.message || "Código inválido. Tente novamente.");
      setCode("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Verificação em Duas Etapas
          </DialogTitle>
          <DialogDescription>
            Insira o código de 6 dígitos do seu aplicativo autenticador.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); handleVerify(); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mfa-code">Código TOTP</Label>
            <Input
              ref={inputRef}
              id="mfa-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="text-center text-lg tracking-[0.5em] font-mono"
              maxLength={6}
              autoComplete="one-time-code"
              inputMode="numeric"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading || code.length < 6}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verificar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
