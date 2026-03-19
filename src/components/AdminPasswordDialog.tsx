import { forwardRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from "lucide-react";

interface AdminPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onConfirm: () => Promise<void> | void;
}

const AdminPasswordDialog = forwardRef<HTMLDivElement, AdminPasswordDialogProps>(function AdminPasswordDialog({
  open,
  onOpenChange,
  title = "Confirmar Exclusão",
  description = "Esta ação é irreversível. Informe a senha de um administrador para confirmar.",
  onConfirm,
}, ref) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClose = (v: boolean) => {
    if (!loading) {
      setPassword("");
      setError("");
      onOpenChange(v);
    }
  };

  const handleConfirm = async () => {
    if (!password.trim()) {
      setError("Informe a senha para confirmar.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setError("Erro ao verificar usuário.");
        return;
      }
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (authErr) {
        setError("Senha incorreta.");
        return;
      }
      await onConfirm();
      setPassword("");
      setError("");
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Erro ao executar ação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent ref={ref} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Lock className="w-5 h-5" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Senha do Administrador</Label>
            <Input
              type="password"
              placeholder="Digite sua senha"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
              autoFocus
            />
            {error && <p className="text-caption text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading || !password.trim()} className="press-effect">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Aguarde...</> : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export default AdminPasswordDialog;
