import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      navigate("/");
    }, 600);
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        className="w-full max-w-sm"
      >
        <div className="bg-card rounded-lg border border-border shadow-card p-8">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-bold">N</span>
            </div>
            <span className="text-subhead font-semibold text-foreground">Nexus Ops</span>
          </div>

          <h1 className="text-section font-semibold text-foreground mb-1">Entrar</h1>
          <p className="text-body text-muted-foreground mb-6">
            Acesse o sistema de gestão operacional.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="user" className="text-body font-medium">Usuário</Label>
              <Input
                id="user"
                type="text"
                placeholder="seu.usuario"
                className="h-10"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-body font-medium">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="h-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 press-effect"
              disabled={loading}
            >
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>

        <p className="text-caption text-muted-foreground text-center mt-4">
          Nexus Ops — Sistema de Gestão Operacional
        </p>
      </motion.div>
    </div>
  );
}
