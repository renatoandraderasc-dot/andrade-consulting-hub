import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

const AUTH_QUERY_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      window.setTimeout(() => reject(new Error("auth_timeout")), AUTH_QUERY_TIMEOUT_MS),
    ),
  ]);
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  /** true para Administrador e Supervisor (mesmos poderes; supervisor é limitado às suas lojas) */
  isAdmin: boolean;
  /** somente Administrador global (configurações da rede: lojas, usuários, parâmetros, site) */
  isGlobalAdmin: boolean;
  isSupervisor: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isAdmin: false,
  isGlobalAdmin: false,
  isSupervisor: false,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [loading, setLoading] = useState(true);
  const roleCheckUserRef = useRef<string | null>(null);
  const isAdmin = isGlobalAdmin || isSupervisor;

  const checkAdmin = async (userId: string) => {
    if (roleCheckUserRef.current === userId) return;
    roleCheckUserRef.current = userId;
    try {
      const { data } = await withTimeout(
        supabase.from("user_roles").select("role").eq("user_id", userId),
      );
      const roles = (data || []).map((r) => r.role as string);
      setIsGlobalAdmin(roles.includes("admin"));
      setIsSupervisor(roles.includes("supervisor"));
    } catch {
      roleCheckUserRef.current = null;
      setIsGlobalAdmin(false);
      setIsSupervisor(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          void checkAdmin(session.user.id);
        } else {
          roleCheckUserRef.current = null;
          setIsGlobalAdmin(false);
          setIsSupervisor(false);
        }
        setLoading(false);
      }
    );

    withTimeout(supabase.auth.getSession())
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) void checkAdmin(session.user.id);
      })
      .catch(() => {
        setSession(null);
        setUser(null);
      })
      .finally(() => setLoading(false));

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, isGlobalAdmin, isSupervisor, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
