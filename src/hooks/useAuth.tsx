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
  /** Server-managed membership in the isolated fictional workspace, never an admin role. */
  isDemo: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isAdmin: false,
  isGlobalAdmin: false,
  isSupervisor: false,
  isDemo: false,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const authRevisionRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const roleCheckUserRef = useRef<string | null>(null);
  const hydratedUserRef = useRef<string | null>(null);
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
    const hydrate = async (nextSession: Session | null) => {
      // Silent revalidation: same user (tab focus / token refresh) keeps the screen mounted.
      if (nextSession?.user && hydratedUserRef.current === nextSession.user.id) {
        setSession(nextSession);
        return;
      }
      const revision = ++authRevisionRef.current;
      setLoading(true);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsDemo(false);
      if (!nextSession?.user) {
        hydratedUserRef.current = null;
        roleCheckUserRef.current = null;
        setIsGlobalAdmin(false); setIsSupervisor(false); setLoading(false);
        return;
      }
      try {
        const verified = await withTimeout(supabase.auth.getUser());
        if (revision !== authRevisionRef.current) return;
        if (verified.error || !verified.data.user || verified.data.user.id !== nextSession.user.id) throw new Error("invalid_session");
        setUser(verified.data.user);
        const result = await withTimeout(supabase.from("demo_workspaces").select("user_id").eq("user_id", nextSession.user.id).maybeSingle());
        if (revision !== authRevisionRef.current) return;
        if (result.error) throw result.error;
        if (result.data) { setIsDemo(true); setIsGlobalAdmin(false); setIsSupervisor(false); }
        else await checkAdmin(nextSession.user.id);
        if (revision === authRevisionRef.current) hydratedUserRef.current = nextSession.user.id;
      } catch {
        hydratedUserRef.current = null;
        if (revision !== authRevisionRef.current) return;
        setUser(null); setSession(null); setIsGlobalAdmin(false); setIsSupervisor(false);
      } finally { if (revision === authRevisionRef.current) setLoading(false); }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        // Avoid awaiting client queries inside the auth lock.
        window.setTimeout(() => void hydrate(nextSession), 0);
      }
    );

    withTimeout(supabase.auth.getSession())
      .then(({ data: { session } }) => hydrate(session))
      .catch(() => {
        setSession(null);
        setUser(null);
      })
      .finally(() => { if (authRevisionRef.current === 0) setLoading(false); });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, isGlobalAdmin, isSupervisor, isDemo, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
