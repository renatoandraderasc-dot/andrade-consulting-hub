import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, UserPlus } from "lucide-react";
import andradeLogo from "@/assets/andrade-logo.png";
import { getLandingPath, getAllowedModules, APP_MODULES } from "@/lib/modules";

interface Store {
  id: string;
  name: string;
}

// Only allow same-origin relative paths as post-login redirect targets.
function sanitizeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

// Evita telas travadas: qualquer chamada que passar do tempo vira erro tratado.
function comTimeout<T>(p: PromiseLike<T>, ms: number, rotulo: string): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout:${rotulo}`)), ms)),
  ]);
}

function ehFalhaDeRede(err: unknown): boolean {
  const m = String((err as Error)?.message || err || "");
  return /failed to fetch|networkerror|load failed|timeout:/i.test(m);
}

const MSG_REDE =
  "Não foi possível falar com o servidor agora. Verifique sua conexão e tente novamente.";

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = sanitizeNext(searchParams.get("next"));
  const postLoginTarget = nextPath ?? "/dashboard";
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
    supabase.functions
      .invoke("list-stores")
      .then(({ data }) => {
        if (data?.stores) setStores(data.stores);
      })
      .catch(() => {
        /* lista de lojas é opcional: só é usada no cadastro */
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (isSignup) {
        if (!selectedStore) {
          setError("Selecione uma loja.");
          setLoading(false);
          return;
        }
        const { data: signUpData, error: signUpError } = await comTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: fullName },
              emailRedirectTo: window.location.origin + (nextPath ?? ""),
            },
          }),
          20000,
          "signup",
        );
        if (signUpError) {
          setError(signUpError.message);
        } else if (signUpData.user) {
          await supabase.from("user_store_access").insert({
            user_id: signUpData.user.id,
            store_id: selectedStore,
            approved: false,
          });
          setSuccess("Cadastro realizado! Aguarde a aprovação do administrador para acessar o sistema.");
        }
        setLoading(false);
        return;
      }

      // Uma única tentativa curta: repetir automaticamente mantinha a tela
      // parada por até 40 segundos quando o navegador estava sem resposta.
      const { data: signInData, error: signInError } = await comTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        12000,
        "login",
      );

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
      if (!signInData?.user) {
        setLoading(false);
        return;
      }

      const userId = signInData.user.id;

      // A autenticação já foi concluída. As consultas abaixo apenas escolhem
      // loja e página inicial; falhas nelas não podem devolver erro de login.

      // Consultas de perfil não podem travar a entrada: em caso de falha,
      // o usuário entra e a própria tela resolve as permissões.
      let isAdmin = false;
      try {
        const { data: roles } = await comTimeout(
          supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin"),
          12000,
          "roles",
        );
        isAdmin = !!roles && roles.length > 0;
      } catch {
        navigate(postLoginTarget);
        return;
      }

      if (isAdmin) {
        sessionStorage.removeItem("selectedStoreId");
        navigate(postLoginTarget);
        return;
      }

      let access;
      try {
        const r = await comTimeout(
          supabase
            .from("user_store_access")
            .select("store_id")
            .eq("user_id", userId)
            .eq("approved", true),
          12000,
          "acesso",
        );
        access = r.data;
      } catch (err) {
        navigate(postLoginTarget);
        return;
      }

      if (!access || access.length === 0) {
        await comTimeout(supabase.auth.signOut(), 8000, "logout").catch(() => undefined);
        setError("Você ainda não tem acesso aprovado. Aguarde a aprovação do administrador.");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("selectedStoreId", access[0].store_id);
      try {
        const allowed = await comTimeout(getAllowedModules(userId), 12000, "modulos");
        const landing = await comTimeout(getLandingPath(userId), 12000, "landing");
        const nextAllowed =
          nextPath &&
          (allowed === null ||
            APP_MODULES.some((m) => allowed.has(m.key) && nextPath.startsWith(m.path)));
        navigate(nextAllowed ? nextPath! : landing);
      } catch {
        navigate(postLoginTarget);
      }
    } catch (err) {
      setError(ehFalhaDeRede(err) ? MSG_REDE : String((err as Error)?.message || err));
      setLoading(false);
      return;
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
                  <div className="space-y-2">
                    <Label htmlFor="name" className="font-body">Nome completo</Label>
                    <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" required />
                  </div>
                )}
                {isSignup && (
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
