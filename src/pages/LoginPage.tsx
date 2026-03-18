import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import MfaVerifyDialog from "@/components/MfaVerifyDialog";
import { supabase } from "@/integrations/supabase/client";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, nome);
        if (error) throw error;
        toast.success("Conta criada! Verifique seu email para confirmar.");
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;

        // Check if MFA is required
        const { data: { totp } } = await supabase.auth.mfa.listFactors();
        const hasVerifiedFactor = totp?.some((f) => f.status === "verified");

        if (hasVerifiedFactor) {
          // Need MFA verification before proceeding
          setMfaRequired(true);
          setLoading(false);
          return;
        }

        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerified = () => {
    setMfaRequired(false);
    navigate("/");
  };

  const handleMfaCancel = async () => {
    setMfaRequired(false);
    await supabase.auth.signOut();
    toast.info("Login cancelado.");
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        <div className="bg-card rounded-lg border border-border shadow-card p-8">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-bold">N</span>
            </div>
            <span className="text-subhead font-semibold text-foreground">Nexus Ops</span>
          </div>

          <h1 className="text-section font-semibold text-foreground mb-1">
            {isSignUp ? "Criar Conta" : "Entrar"}
          </h1>
          <p className="text-body text-muted-foreground mb-6">
            {isSignUp ? "Preencha os dados para criar sua conta." : "Acesse o sistema de gestão operacional."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-1.5">
                <Label htmlFor="nome" className="text-body font-medium">Nome</Label>
                <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" className="h-10" required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-body font-medium">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="h-10" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-body font-medium">Senha</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-10 pr-10" required minLength={6} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-10 press-effect" disabled={loading}>
              {loading ? "Aguarde..." : isSignUp ? "Criar Conta" : "Entrar"}
            </Button>
          </form>

          <button onClick={() => setIsSignUp(!isSignUp)} className="w-full text-center text-body text-muted-foreground hover:text-foreground mt-4 transition-colors">
            {isSignUp ? "Já tem conta? Entrar" : "Não tem conta? Criar"}
          </button>
        </div>
        <p className="text-caption text-muted-foreground text-center mt-4">Nexus Ops — Sistema de Gestão Operacional</p>
      </motion.div>

      <MfaVerifyDialog
        open={mfaRequired}
        onVerified={handleMfaVerified}
        onCancel={handleMfaCancel}
      />
    </div>
  );
}
