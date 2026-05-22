import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, CheckSquare, Settings, Users, LogOut, Menu, X, ArrowLeft, Target, ClipboardList, DollarSign, Database, RefreshCw, Trophy, Store } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import andradeLogo from "@/assets/andrade-logo.png";

interface ClientLayoutProps {
  children: React.ReactNode;
  storeName?: string;
}

const navItems = [
  { key: "dashboard", path: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { key: "controladoria", path: "/controladoria", label: "Controladoria", icon: ClipboardList },
  { key: "pic", path: "/pic", label: "PIC", icon: Trophy },
  { key: "repricing", path: "/repricing", label: "Re-PRICING", icon: DollarSign },
  { key: "checklist", path: "/checklist", label: "Checklist", icon: CheckSquare },
];

const adminItems = [
  { key: "admin_stores", path: "/admin/stores", label: "Lojas", icon: Store },
  { key: "admin_metas", path: "/admin/metas", label: "Metas", icon: Target },
  { key: "admin_questions", path: "/admin/questions", label: "Perguntas", icon: Settings },
  { key: "admin_users", path: "/admin/users", label: "Usuários", icon: Users },
  { key: "vtex_collector", path: "/vtex-collector", label: "Coletor VTEX", icon: Database },
  { key: "websac_sync", path: "/websac-sync", label: "Sync WebSac", icon: RefreshCw },
];

const ClientLayout = ({ children, storeName }: ClientLayoutProps) => {
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [allowedModules, setAllowedModules] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!user || isAdmin) { setAllowedModules(null); return; }
    supabase.from("user_module_access").select("module, allowed").eq("user_id", user.id).then(({ data }) => {
      setAllowedModules(new Set((data || []).filter((r) => r.allowed).map((r) => r.module)));
    });
  }, [user, isAdmin]);

  // If no permissions are configured (null or empty set), default to showing all modules.
  const canSee = (key: string) => isAdmin || allowedModules === null || allowedModules.size === 0 || allowedModules.has(key);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isActive = (path: string) => location.pathname === path;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <Link to="/" className="flex items-center gap-2">
          <img src={andradeLogo} alt="Andrade" className="h-9" />
        </Link>
        {storeName && (
          <p className="font-body text-xs text-muted-foreground mt-2 truncate">{storeName}</p>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.filter((i) => canSee(i.key)).map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-body text-sm transition-colors ${
              isActive(item.path)
                ? "bg-primary/10 text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="font-body text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Admin</p>
            </div>
            {adminItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-body text-sm transition-colors ${
                  isActive(item.path)
                    ? "bg-primary/10 text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="p-3 border-t border-border space-y-1">
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-xs text-muted-foreground font-body">Tema</span>
          <ThemeToggle />
        </div>
        <Link
          to="/"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg font-body text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao site
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-body text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 border-r border-border bg-card flex-col shrink-0 sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-56 bg-card border-r border-border z-10">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border h-14 flex items-center px-4 gap-3">
          <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <img src={andradeLogo} alt="Logo" className="h-7" />
        </header>

        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
};

export default ClientLayout;
