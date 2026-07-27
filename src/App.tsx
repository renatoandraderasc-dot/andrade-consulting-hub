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
import Dashboard from "./pages/Dashboard";
import AdminMetas from "./pages/AdminMetas";
import MetasGerador from "./pages/MetasGerador";
import Controladoria from "./pages/Controladoria";
import Repricing from "./pages/Repricing";
import VtexCollector from "./pages/VtexCollector";
import WebSacSync from "./pages/WebSacSync";
import PIC from "./pages/PIC";
import DashboardPadaria from "./pages/DashboardPadaria";
import AdminPadariaImport from "./pages/AdminPadariaImport";
import AdminStores from "./pages/AdminStores";
import Produtos from "./pages/Produtos";
import EncarteEditor from "./pages/EncarteEditor";
import MeusEncartes from "./pages/MeusEncartes";
import OAuthConsent from "./pages/OAuthConsent";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
            <Route path="/admin/questions" element={<AdminQuestions />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/checklist" element={<Checklist />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/admin/metas" element={<AdminMetas />} />
            <Route path="/controladoria" element={<Controladoria />} />
            <Route path="/repricing" element={<Repricing />} />
            <Route path="/vtex-collector" element={<VtexCollector />} />
            <Route path="/websac-sync" element={<WebSacSync />} />
            <Route path="/pic" element={<PIC />} />
            <Route path="/pic/padaria" element={<DashboardPadaria />} />
            <Route path="/admin/padaria-import" element={<AdminPadariaImport />} />
            <Route path="/admin/stores" element={<AdminStores />} />
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/encartes" element={<MeusEncartes />} />
            <Route path="/encartes/editor" element={<EncarteEditor />} />
            <Route path="/encartes/editor/:id" element={<EncarteEditor />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
