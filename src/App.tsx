import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Login from "./pages/Login";
import AdminSetup from "./pages/AdminSetup";
import AdminQuestions from "./pages/AdminQuestions";
import AdminUsers from "./pages/AdminUsers";
import Checklist from "./pages/Checklist";
import ChecklistTemperatura from "./pages/ChecklistTemperatura";
import Catalogo from "./pages/Catalogo";
import ConsultaPreco from "./pages/ConsultaPreco";
import Dashboard from "./pages/Dashboard";
import AdminMetas from "./pages/AdminMetas";
import MetasGerador from "./pages/MetasGerador";
import Controladoria from "./pages/Controladoria";
import AnaliseAnual from "./pages/AnaliseAnual";
import Compras from "./pages/Compras";
import EstoqueDinamico from "./pages/EstoqueDinamico";
import Repricing from "./pages/Repricing";
import Pricing from "./pages/Pricing";
import VtexCollector from "./pages/VtexCollector";
import WebSacSync from "./pages/WebSacSync";
import PIC from "./pages/PIC";
import DashboardPadaria from "./pages/DashboardPadaria";
import AdminPadariaImport from "./pages/AdminPadariaImport";
import AdminStores from "./pages/AdminStores";
import AdminPicDepartments from "./pages/AdminPicDepartments";
import Produtos from "./pages/Produtos";
import EncarteEditor from "./pages/EncarteEditor";
import MeusEncartes from "./pages/MeusEncartes";
import EncarteSugestao from "./pages/EncarteSugestao";
import OAuthConsent from "./pages/OAuthConsent";
import AdminSite from "./pages/AdminSite";
import AdminSitesConcorrentes from "./pages/AdminSitesConcorrentes";
import AdminConexoes from "./pages/AdminConexoes";
import AdminRede from "./pages/AdminRede";
import NotFound from "./pages/NotFound";
import ModuleGuard from "@/components/ModuleGuard";

const queryClient = new QueryClient();

const g = (module: string, el: React.ReactNode) => (
  <ModuleGuard module={module}>{el}</ModuleGuard>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin/setup" element={<AdminSetup />} />
            <Route path="/admin/questions" element={g("admin_questions", <AdminQuestions />)} />
            <Route path="/admin/users" element={g("admin_users", <AdminUsers />)} />
            <Route path="/checklist" element={g("checklist", <Checklist />)} />
            <Route path="/checklist-temperatura" element={g("checklist_temperatura", <ChecklistTemperatura />)} />
            <Route path="/catalogo" element={g("catalogo", <Catalogo />)} />
            <Route path="/consulta-preco" element={g("consulta_preco", <ConsultaPreco />)} />
            <Route path="/dashboard" element={g("dashboard", <Dashboard />)} />
            <Route path="/admin/metas" element={g("admin_metas", <AdminMetas />)} />
            <Route path="/metas-gerador" element={g("metas_gerador", <MetasGerador />)} />
            <Route path="/controladoria" element={g("controladoria", <Controladoria />)} />
            <Route path="/analise-anual" element={g("analise_anual", <AnaliseAnual />)} />

            <Route path="/compras" element={g("compras", <Compras />)} />
            <Route path="/estoque-dinamico" element={g("estoque_dinamico", <EstoqueDinamico />)} />
            <Route path="/precificacao/pricing" element={g("pricing", <Pricing />)} />
            <Route path="/repricing" element={g("repricing", <Repricing />)} />
            <Route path="/vtex-collector" element={g("vtex_collector", <VtexCollector />)} />
            <Route path="/websac-sync" element={g("websac_sync", <WebSacSync />)} />
            <Route path="/pic" element={g("pic", <PIC />)} />
            <Route path="/pic/padaria" element={g("pic_padaria", <DashboardPadaria />)} />
            <Route path="/admin/padaria-import" element={g("admin_padaria_import", <AdminPadariaImport />)} />
            <Route path="/admin/pic-departamentos" element={g("admin_pic_departamentos", <AdminPicDepartments />)} />
            <Route path="/admin/stores" element={g("admin_stores", <AdminStores />)} />
            <Route path="/admin/rede" element={g("admin_rede", <AdminRede />)} />
            <Route path="/admin/conexoes" element={g("admin_conexoes", <AdminConexoes />)} />
            <Route path="/admin/site" element={g("admin_site", <AdminSite />)} />
            <Route path="/admin/sites-concorrentes" element={g("admin_sites_concorrentes", <AdminSitesConcorrentes />)} />
            <Route path="/produtos" element={g("produtos", <Produtos />)} />
            <Route path="/encartes" element={g("encartes", <MeusEncartes />)} />
            <Route path="/encarte-sugestao" element={g("encarte_sugestao", <EncarteSugestao />)} />
            <Route path="/encartes/editor" element={g("encarte_editor", <EncarteEditor />)} />
            <Route path="/encartes/editor/:id" element={g("encarte_editor", <EncarteEditor />)} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
