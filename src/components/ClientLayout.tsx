import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3, CheckSquare, Settings, Users, LogOut, Menu, X, ArrowLeft,
  Target, ClipboardList, DollarSign, Database, RefreshCw, Trophy, Store, ShoppingCart, LayoutTemplate, TrendingUp, Package, KeyRound, Plug, ScanLine, Tags, ChevronDown, Globe,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import StoreSwitcher from "@/components/StoreSwitcher";
import andradeLogo from "@/assets/andrade-logo.png";


interface ClientLayoutProps {
  children: React.ReactNode;
  storeName?: string;
}

type NavItem = { key: string; path: string; label: string; icon: any };
type NavGroup = { id: string; label: string; icon: any; admin?: boolean; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    id: "gestao",
    label: "Gestão",
    icon: BarChart3,
    items: [
      { key: "dashboard", path: "/dashboard", label: "Dashboard", icon: BarChart3 },
      { key: "pic", path: "/pic", label: "PIC", icon: Trophy },
      { key: "analise_anual", path: "/analise-anual", label: "Análise Anual", icon: TrendingUp },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: ClipboardList,
    items: [
      { key: "controladoria", path: "/controladoria", label: "Controladoria", icon: ClipboardList },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    icon: ShoppingCart,
    items: [
      { key: "compras", path: "/compras", label: "Compras", icon: ShoppingCart },
      { key: "estoque_dinamico", path: "/estoque-dinamico", label: "Estoque Dinâmico", icon: Package },
      { key: "repricing", path: "/repricing", label: "Re-Pricing", icon: DollarSign },
      { key: "pricing", path: "/precificacao/pricing", label: "Pricing", icon: Tags },
      { key: "catalogo", path: "/catalogo", label: "Catálogo", icon: Package },
      { key: "consulta_preco", path: "/consulta-preco", label: "Consulta de Preços", icon: ScanLine },
    ],
  },
  {
    id: "encartes",
    label: "Encartes",
    icon: Tags,
    items: [
      { key: "encarte_sugestao", path: "/encarte-sugestao", label: "Sugestão de Encarte", icon: Tags },
      { key: "encartes", path: "/encartes", label: "Meus Encartes", icon: LayoutTemplate },
    ],
  },
  {
    id: "operacao",
    label: "Operação",
    icon: CheckSquare,
    items: [
      { key: "checklist", path: "/checklist", label: "Checklist", icon: CheckSquare },
    ],
  },
  {
    id: "cadastros",
    label: "Cadastros",
    icon: Settings,
    admin: true,
    items: [
      { key: "admin_stores", path: "/admin/stores", label: "Lojas", icon: Store },
      { key: "admin_users", path: "/admin/users", label: "Usuários", icon: Users },
      { key: "admin_metas", path: "/admin/metas", label: "Metas", icon: Target },
      { key: "admin_questions", path: "/admin/questions", label: "Perguntas", icon: Settings },
      { key: "admin_site", path: "/admin/site", label: "Página Inicial", icon: LayoutTemplate },
    ],
  },
  {
    id: "integracoes",
    label: "Integrações",
    icon: Plug,
    admin: true,
    items: [
      { key: "admin_conexoes", path: "/admin/conexoes", label: "Conexões", icon: Plug },
      { key: "admin_sites_concorrentes", path: "/admin/sites-concorrentes", label: "Catálogo de Sites", icon: Globe },
      { key: "vtex_collector", path: "/vtex-collector", label: "Coletor de Preços", icon: Database },
      { key: "websac_sync", path: "/websac-sync", label: "Sync WebSac", icon: RefreshCw },
    ],
  },
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

  const visibleGroups = navGroups
    .filter((g) => (g.admin ? isAdmin : true))
    .map((g) => ({ ...g, items: g.items.filter((i) => canSee(i.key)) }))
    .filter((g) => g.items.length > 0);

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

          <nav className="hidden md:flex items-stretch gap-1">
            {visibleGroups.map((group) => {
              const groupActive = group.items.some((i) => isActive(i.path));
              return (
                <DropdownMenu key={group.id}>
                  <DropdownMenuTrigger
                    className={`relative flex items-center gap-1.5 px-3 h-full text-[13px] font-medium outline-none transition-colors ${
                      groupActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <group.icon className="w-4 h-4" strokeWidth={2} />
                    <span translate="no">{group.label}</span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                    {groupActive && (
                      <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-primary" />
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[200px] bg-popover">
                    {group.items.map((item) => (
                      <DropdownMenuItem key={item.path} asChild>
                        <Link
                          to={item.path}
                          className={`flex items-center gap-2 cursor-pointer ${
                            isActive(item.path) ? "text-primary font-medium" : ""
                          }`}
                        >
                          <item.icon className="w-4 h-4" strokeWidth={2} />
                          <span translate="no">{item.label}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block"><StoreSwitcher /></div>
            <ThemeToggle />

            <Link
              to="/"
              className="hidden lg:inline-flex items-center gap-1 px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Site
            </Link>
            <button
              onClick={() => setPwdOpen(true)}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-secondary text-foreground text-[12px] font-medium hover:bg-secondary/70 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" /> Senha
            </button>
            <button
              onClick={handleSignOut}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-secondary text-foreground text-[12px] font-medium hover:bg-secondary/70 transition-colors"
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
          <div className="md:hidden bg-card border-t border-border max-h-[70vh] overflow-y-auto">
            <div className="p-3 border-b border-border sm:hidden"><StoreSwitcher /></div>
            {visibleGroups.map((group) => (
              <div key={group.id}>
                <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2 px-4 py-3 text-[13px] border-b border-border ${
                      isActive(item.path) ? "text-primary font-medium" : "text-foreground"
                    }`}
                  >
                    <item.icon className="w-4 h-4" strokeWidth={2} />
                    <span translate="no">{item.label}</span>
                  </Link>
                ))}
              </div>
            ))}
            <button
              onClick={() => { setMenuOpen(false); setPwdOpen(true); }}
              className="w-full flex items-center gap-2 px-3 py-3 text-sm text-foreground border-t border-border"
            >
              <KeyRound className="w-4 h-4" /> Alterar senha
            </button>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-3 text-sm text-foreground border-t border-border"
            >
              <LogOut className="w-4 h-4" /> Sair
            </button>
          </div>
        )}
      </header>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />

      <main className="flex-1">{children}</main>
    </div>
  );
};

export default ClientLayout;
