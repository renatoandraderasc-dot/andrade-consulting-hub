import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { APP_MODULES } from "@/lib/modules";

interface ModuleGuardProps {
  module: string;
  children: React.ReactNode;
}

/**
 * Blocks access to a module when the logged user has explicit module
 * restrictions that do not include it. Admins always pass.
 */
const ModuleGuard = ({ module, children }: ModuleGuardProps) => {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();
  const [allowed, setAllowed] = useState<Set<string> | null | undefined>(undefined);

  useEffect(() => {
    if (loading) return;
    if (!user || isAdmin) {
      setAllowed(null);
      return;
    }
    let active = true;
    supabase
      .from("user_module_access")
      .select("module, allowed")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!active) return;
        const rows = data || [];
        // no rows = no restriction configured
        if (rows.length === 0) return setAllowed(null);
        setAllowed(new Set(rows.filter((r) => r.allowed).map((r) => r.module)));
      });
    return () => {
      active = false;
    };
  }, [user, isAdmin, loading]);

  if (loading || allowed === undefined) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (allowed === null || allowed.has(module)) return <>{children}</>;

  const first = APP_MODULES.find((m) => allowed.has(m.key));
  if (!first || first.path === location.pathname) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para acessar esta área. Fale com o administrador.
        </p>
      </div>
    );
  }
  return <Navigate to={first.path} replace />;
};

export default ModuleGuard;
