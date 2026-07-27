import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3, CheckSquare, Settings, Users, LogOut, Menu, X, ArrowLeft,
  Target, ClipboardList, DollarSign, Database, RefreshCw, Trophy, Store,
} from "lucide-react";
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
  { key: "repricing", path: "/repricing", label: "Re-Pricing", icon: DollarSign },
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
  const [menuOpen, setMenuOpen] = useState(false);
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
        className={`relative group flex items-center gap-2 px-3 h-full font-condensed text-sm uppercase tracking-wider font-semibold transition-colors ${
          mobile ? "py-3 border-b border-sidebar-border w-full" : ""
        } ${active ? "text-poster-yellow" : "text-paper hover:text-poster-yellow"}`}
      >
        <item.icon className="w-4 h-4" />
        {item.label}
        {!mobile && (
          <span
            className={`absolute left-0 right-0 -bottom-[1px] h-1.5 bg-poster-yellow transition-transform origin-left ${
              active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
            }`}
          />
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Gondola top bar */}
      <header className="sticky top-0 z-40 bg-ink border-b-4 border-poster-yellow">
        <div className="flex items-stretch h-14 pl-3 pr-2">
          <Link to="/" className="flex items-center gap-3 pr-4 border-r border-sidebar-border">
            <img src={andradeLogo} alt="Andrade" className="h-8" />
            {storeName && (
              <div className="hidden md:flex flex-col leading-tight">
                <span className="font-condensed uppercase text-[10px] tracking-widest text-poster-yellow">Loja</span>
                <span className="font-condensed uppercase text-xs font-bold text-paper truncate max-w-[180px]">
                  {storeName}
                </span>
              </div>
            )}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-stretch ml-2">
            {visibleNav.map((item) => (
              <NavButton key={item.path} item={item} />
            ))}
            {isAdmin && (
              <div className="flex items-stretch ml-2 pl-2 border-l border-sidebar-border">
                {adminItems.map((item) => (
                  <NavButton key={item.path} item={item} />
                ))}
              </div>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2 pl-2">
            <ThemeToggle />
            <Link
              to="/"
              className="hidden md:inline-flex items-center gap-1 px-2 py-1 font-condensed uppercase text-[11px] tracking-widest text-paper/70 hover:text-poster-yellow"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Site
            </Link>
            <button
              onClick={handleSignOut}
              className="hidden md:inline-flex items-center gap-1 px-3 py-1 border-2 border-poster-yellow bg-poster-yellow text-ink font-condensed uppercase text-[11px] tracking-widest hover:bg-offer-red hover:text-white hover:border-offer-red transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sair
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden text-paper p-2"
              aria-label="Menu"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="md:hidden bg-ink border-t border-sidebar-border">
            {visibleNav.map((item) => (
              <NavButton key={item.path} item={item} mobile />
            ))}
            {isAdmin && (
              <>
                <div className="px-3 py-2 font-condensed uppercase text-[10px] tracking-widest text-poster-yellow">
                  Admin
                </div>
                {adminItems.map((item) => (
                  <NavButton key={item.path} item={item} mobile />
                ))}
              </>
            )}
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-3 font-condensed uppercase text-sm tracking-widest text-paper"
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
