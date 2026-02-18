import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, UserPlus } from "lucide-react";
import andradeLogo from "@/assets/andrade-logo.png";

interface Store {
  id: string;
  name: string;
}

const Login = () => {
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("stores").select("*").order("name").then(({ data }) => {
      if (data) setStores(data);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (isSignup) {
      if (!selectedStore) {
        setError("Selecione uma loja.");
        setLoading(false);
        return;
      }
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (signUpError) {
        setError(signUpError.message);
      } else if (signUpData.user) {
        // Create store access request (pending approval)
        await supabase.from("user_store_access").insert({
          user_id: signUpData.user.id,
          store_id: selectedStore,
          approved: false,
        });
        setSuccess("Cadastro realizado! Aguarde a aprovação do administrador para acessar o sistema.");
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
      } else {
        navigate("/checklist");
      }
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
          <Link to="/">
            <img src={andradeLogo} alt="Andrade" className="h-14 mx-auto mb-4" />
          </Link>
          <h1 className="font-display text-2xl font-bold">
            {isSignup ? "Criar Conta" : "Área do Cliente"}
          </h1>
          <p className="text-muted-foreground font-body text-sm mt-1">
            {isSignup ? "Preencha seus dados para se cadastrar" : "Faça login para acessar o checklist"}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          {success ? (
            <div className="text-center py-4">
              <p className="text-green-400 font-body text-sm mb-4">{success}</p>
              <button
                onClick={() => { setIsSignup(false); setSuccess(""); }}
                className="text-primary font-body text-sm hover:underline"
              >
                Ir para login
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignup && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="name" className="font-body">Nome completo</Label>
                      <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="store" className="font-body">Loja</Label>
                      <select
                        id="store"
                        value={selectedStore}
                        onChange={(e) => setSelectedStore(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-body text-foreground"
                        required
                      >
                        <option value="">Selecione sua loja</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email" className="font-body">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="font-body">Senha</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
                </div>

                {error && <p className="text-destructive text-sm font-body">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-gold text-primary-foreground font-body font-semibold py-3 rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isSignup ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                  {loading ? "Aguarde..." : isSignup ? "Cadastrar" : "Entrar"}
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => { setIsSignup(!isSignup); setError(""); setSuccess(""); }}
                  className="text-primary font-body text-sm hover:underline"
                >
                  {isSignup ? "Já tem conta? Faça login" : "Não tem conta? Cadastre-se"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="text-center mt-4">
          <Link to="/" className="text-muted-foreground font-body text-sm hover:text-foreground transition-colors">
            ← Voltar ao site
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
