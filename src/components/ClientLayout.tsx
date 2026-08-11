import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3, CheckSquare, Settings, Users, LogOut, Menu, X, ArrowLeft,
  Target, ClipboardList, DollarSign, Database, RefreshCw, Trophy, Store, ShoppingCart, LayoutTemplate, TrendingUp, Package, KeyRound,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import andradeLogo from "@/assets/andrade-logo.png";

interface ClientLayoutProps {
  children: React.ReactNode;
  storeName?: string;
}

const navItems = [
  { key: "dashboard", path: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { key: "controladoria", path: "/controladoria", label: "Controladoria", icon: ClipboardList },
  { key: "analise_anual", path: "/analise-anual", label: "Análise Anual", icon: TrendingUp },
  { key: "compras", path: "/compras", label: "Compras", icon: ShoppingCart },
  { key: "pic", path: "/pic", label: "PIC", icon: Trophy },
  { key: "repricing", path: "/repricing", label: "Re-Pricing", icon: DollarSign },
  { key: "checklist", path: "/checklist", label: "Checklist", icon: CheckSquare },
  { key: "catalogo", path: "/catalogo", label: "Catálogo", icon: Package },
];

const adminItems = [
  { key: "admin_stores", path: "/admin/stores", label: "Lojas", icon: Store },
  { key: "admin_metas", path: "/admin/metas", label: "Metas", icon: Target },
  { key: "admin_questions", path: "/admin/questions", label: "Perguntas", icon: Settings },
  { key: "admin_users", path: "/admin/users", label: "Usuários", icon: Users },
  { key: "admin_site", path: "/admin/site", label: "Página Inicial", icon: LayoutTemplate },
  { key: "vtex_collector", path: "/vtex-collector", label: "Coletor VTEX", icon: Database },
  { key: "websac_sync", path: "/websac-sync", label: "Sync WebSac", icon: RefreshCw },
];

const ClientLayout = ({ children, storeName }: ClientLayoutProps) => {
  const { user, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [allowedModules, setAllowedModules] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!user || isAdmin) { setAllowedModules(null); return; }
    supabase.from("user_module_access").select("module, allowed").eq("user_id", user.id).then(({ data }) => {
      setAllowedModules(new Set((data || []).filter((r) => r.allowed).map((r) => r.module)));
    });
  }, [user, isAdmin]);

  const canSee = (key: string) =>
    isAdmin || allowedModules === null || allowedModules.size === 0 || allowedModules.has(key);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const isActive = (path: string) => location.pathname === path;

  const visibleNav = navItems.filter((i) => canSee(i.key));

  const NavButton = ({ item, mobile = false }: any) => {
    const active = isActive(item.path);
    return (
      <Link
        to={item.path}
        onClick={() => setMenuOpen(false)}
        className={`relative flex items-center gap-2 px-3 h-full text-[13px] font-medium transition-colors ${
          mobile ? "py-3 border-b border-border w-full" : ""
        } ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
      >
        <item.icon className="w-4 h-4" strokeWidth={2} />
        {item.label}
        {!mobile && active && (
          <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-primary" />
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border">
        <div className="flex items-stretch h-14 px-4">
          <Link to="/" className="flex items-center gap-3 pr-4 mr-2 border-r border-border">
            <img src={andradeLogo} alt="Andrade" className="h-7" />
            {storeName && (
              <div className="hidden md:flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Loja</span>
                <span className="text-xs font-semibold text-foreground truncate max-w-[180px]">
                  {storeName}
                </span>
              </div>
            )}
          </Link>

          <nav className="hidden md:flex items-stretch">
            {visibleNav.map((item) => (
              <NavButton key={item.path} item={item} />
            ))}
            {isAdmin && (
              <div className="flex items-stretch ml-2 pl-2 border-l border-border">
                {adminItems.map((item) => (
                  <NavButton key={item.path} item={item} />
                ))}
              </div>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/"
              className="hidden md:inline-flex items-center gap-1 px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Site
            </Link>
            <button
              onClick={handleSignOut}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-secondary text-foreground text-[12px] font-medium hover:bg-secondary/70 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sair
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden text-foreground p-2"
              aria-label="Menu"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-card border-t border-border">
            {visibleNav.map((item) => (
              <NavButton key={item.path} item={item} mobile />
            ))}
            {isAdmin && (
              <>
                <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Admin
                </div>
                {adminItems.map((item) => (
                  <NavButton key={item.path} item={item} mobile />
                ))}
              </>
            )}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-3 text-sm text-foreground border-t border-border"
            >
              <LogOut className="w-4 h-4" /> Sair
            </button>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
};

export default ClientLayout;
