import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import andradeLogo from "@/assets/andrade-logo.png";

const AdminSetup = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("validate-admin-secret", {
        body: { secret_code: secretCode, email, password, full_name: fullName },
      });

      if (fnError) {
        // Try to extract the error message from the response
        const errorMsg = data?.error || fnError.message || "Erro ao criar conta admin.";
        setError(errorMsg);
        setLoading(false);
        return;
      }

      if (data?.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      // Sign in with the newly created account
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Conta criada! Faça login manualmente.");
      } else {
        navigate("/checklist");
      }
    } catch (err: any) {
      setError(err.message || "Erro inesperado.");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <img src={andradeLogo} alt="Andrade" className="h-14 mx-auto mb-4" />
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="font-display text-2xl font-bold">Cadastro Admin</h1>
          </div>
          <p className="text-muted-foreground font-body text-sm">
            Crie uma conta de administrador com o código secreto
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="font-body">Nome completo</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="font-body">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@email.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="font-body">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secret" className="font-body">Código Secreto</Label>
              <Input id="secret" type="password" value={secretCode} onChange={(e) => setSecretCode(e.target.value)} placeholder="Código de administrador" required />
            </div>

            {error && <p className="text-destructive text-sm font-body">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-gold text-primary-foreground font-body font-semibold py-3 rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Shield className="w-4 h-4" />
              {loading ? "Criando..." : "Criar Conta Admin"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminSetup;
