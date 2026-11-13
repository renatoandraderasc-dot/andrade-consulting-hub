import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ClientLayout from "@/components/ClientLayout";
import { useDemoWorkspace } from "@/hooks/useDemoWorkspace";
import { APP_MODULES } from "@/lib/modules";
import { DEMO_EXTRA_ROUTES, demoDomain } from "@/lib/demo/routes";
import { DEPARTMENTS, DEMO_STORE, MONTHS, type DemoFilters } from "@/lib/demo/model";
import DemoDashboard from "@/components/demo/DemoDashboard";
import DemoCommercial from "@/components/demo/DemoCommercial";
import DemoFinance from "@/components/demo/DemoFinance";
import DemoWorkforce from "@/components/demo/DemoWorkforce";
import DemoOperations from "@/components/demo/DemoOperations";
import DemoMarketing from "@/components/demo/DemoMarketing";
import DemoAdmin from "@/components/demo/DemoAdmin";
import { Check, Grid2X2, RefreshCw, RotateCcw, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function DemoWorkspace() {
  const { pathname: path } = useLocation();
  const { ready, saving, saveError, reset } = useDemoWorkspace();
  const [filters, setFilters] = useState<DemoFilters>({ month: 10, year: 2026, department: "", search: "" });
  const [all, setAll] = useState(false);
  const domain = demoDomain(path);
  const title = DEMO_EXTRA_ROUTES[path] ?? APP_MODULES.find(m => m.path === path)?.label.replace(/^Admin: /, "") ?? (path.startsWith("/recebimento/") ? "Conferência de NF-e" : path.startsWith("/tv/") ? "TV Aurora" : "Demonstração");
  const candidates = [...APP_MODULES.map(m => ({ path: m.path, label: m.label.replace(/^Admin: /, "") })), ...Object.entries(DEMO_EXTRA_ROUTES).map(([path, label]) => ({ path, label }))];
  const pages = candidates.filter((item, index) => candidates.findIndex(other => other.path === item.path) === index);
  useEffect(() => { document.title = `${title} · ${DEMO_STORE} | Demonstração`; }, [title]);
  return <ClientLayout storeName={DEMO_STORE}><div className="px-4 sm:px-6 py-5 w-full demo-workspace">
    <div className="flex justify-between flex-wrap gap-3 items-center border-b border-border pb-4 mb-5"><span className="text-xs font-medium text-warning">DEMONSTRAÇÃO · DADOS FICTÍCIOS</span><div className="flex flex-wrap gap-2 items-center"><span className={`text-xs ${saveError ? "text-destructive" : "text-muted-foreground"}`}>{saveError ? "Não salvo" : saving ? "Salvando..." : <span className="inline-flex gap-1 items-center"><Check className="h-3 w-3" /> Salvo</span>}</span><Button size="sm" variant="outline" onClick={() => setAll(true)}><Grid2X2 /> Todas as telas</Button><Button size="icon" variant="ghost" title="Restaurar dados fictícios" aria-label="Restaurar dados fictícios" onClick={() => { if (window.confirm("Restaurar todos os dados fictícios? Suas alterações da demonstração serão apagadas.")) { reset(); toast.success("Dados fictícios restaurados."); } }}><RotateCcw /></Button></div></div>
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6"><div className="min-w-0"><p className="text-xs text-muted-foreground mb-2">{DEMO_STORE}</p><h1 className="text-2xl font-semibold break-words">{title}</h1></div><Button size="sm" variant="outline" onClick={() => toast.success("Dados da demonstração recalculados; alterações preservadas.")}><RefreshCw /> Atualizar</Button></div>
    <div className="flex flex-wrap gap-3 items-end border-y border-border py-4"><label className="grid gap-1.5 text-xs flex-1 sm:flex-none"><span className="text-muted-foreground">Mês</span><select className="h-10 rounded-md border border-input bg-background px-3 text-sm min-w-32" aria-label="Mês" value={filters.month} onChange={e => setFilters(f => ({ ...f, month: Number(e.target.value) }))}>{MONTHS.map((month, i) => <option key={month} value={i + 1}>{month}</option>)}</select></label><label className="grid gap-1.5 text-xs flex-1 sm:flex-none"><span className="text-muted-foreground">Ano</span><select aria-label="Ano" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filters.year} onChange={e => setFilters(f => ({ ...f, year: Number(e.target.value) }))}>{[2025, 2026, 2027].map(year => <option key={year}>{year}</option>)}</select></label><label className="grid gap-1.5 text-xs w-full sm:w-auto"><span className="text-muted-foreground">Departamento</span><select aria-label="Departamento" className="h-10 rounded-md border border-input bg-background px-3 text-sm w-full" value={filters.department} onChange={e => setFilters(f => ({ ...f, department: e.target.value }))}><option value="">Todos os departamentos</option>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></label><div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar nos dados" className="pl-9" placeholder="Buscar descrição ou código" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} /></div></div>
    {!ready ? <p className="py-12 text-center text-muted-foreground">{saveError ? "Não foi possível carregar os dados salvos. Reabra a página para tentar novamente." : "Abrindo supermercado fictício..."}</p> : domain === "finance" ? <DemoFinance filters={filters} /> : domain === "commercial" ? <DemoCommercial filters={filters} path={path} /> : domain === "workforce" ? <DemoWorkforce filters={filters} path={path} /> : domain === "operations" ? <DemoOperations filters={filters} path={path} /> : domain === "marketing" ? <DemoMarketing filters={filters} path={path} /> : domain === "admin" ? <DemoAdmin filters={filters} path={path} /> : <DemoDashboard filters={filters} path={path} />}
    <Dialog open={all} onOpenChange={setAll}><DialogContent className="max-w-3xl max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Telas da demonstração · {pages.length}</DialogTitle></DialogHeader><div className="grid sm:grid-cols-2 gap-1">{pages.map(item => <Button key={item.path} variant="ghost" className="justify-start h-auto py-3 whitespace-normal text-left" asChild><Link to={item.path} onClick={() => setAll(false)}>{item.label}</Link></Button>)}</div></DialogContent></Dialog>
  </div></ClientLayout>;
}