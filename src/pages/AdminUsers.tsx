import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, XCircle, Clock, Users } from "lucide-react";
import andradeLogo from "@/assets/andrade-logo.png";

interface UserAccess {
  id: string;
  user_id: string;
  store_id: string;
  approved: boolean;
  created_at: string;
  profiles: { full_name: string | null } | null;
  stores: { name: string } | null;
}

const AdminUsers = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [accesses, setAccesses] = useState<UserAccess[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate("/login");
    }
  }, [user, isAdmin, authLoading]);

  useEffect(() => {
    if (isAdmin) fetchAccesses();
  }, [isAdmin]);

  const fetchAccesses = async () => {
    const { data } = await supabase
      .from("user_store_access")
      .select("*, stores(name)")
      .order("created_at", { ascending: false });

    if (!data) { setAccesses([]); setLoading(false); return; }

    // Fetch profiles for all user_ids
    const userIds = [...new Set(data.map((a: any) => a.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", userIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));

    const enriched = data.map((a: any) => ({
      ...a,
      profiles: { full_name: profileMap.get(a.user_id) || null },
    }));

    setAccesses(enriched);
    setLoading(false);
  };

  const updateApproval = async (id: string, approved: boolean) => {
    const { error } = await supabase.from("user_store_access").update({ approved }).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: approved ? "Aprovado!" : "Rejeitado", description: "Acesso atualizado." });
      fetchAccesses();
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  const pending = accesses.filter((a) => !a.approved);
  const approved = accesses.filter((a) => a.approved);

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={andradeLogo} alt="Logo" className="h-10" />
          </Link>
          <Link to="/checklist" className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-body text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
        </div>
      </nav>

      <div className="container mx-auto px-6 py-10 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Users className="w-8 h-8 text-primary" />
            <h1 className="font-display text-3xl font-bold">Gerenciar Usuários</h1>
          </div>
          <p className="text-muted-foreground font-body">Aprove ou rejeite o acesso dos clientes às lojas.</p>
        </motion.div>

        {/* Pending */}
        <div className="mb-8">
          <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-yellow-400" /> Pendentes ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p className="text-muted-foreground font-body text-sm bg-card border border-border rounded-xl p-6 text-center">Nenhum acesso pendente.</p>
          ) : (
            <div className="space-y-3">
              {pending.map((a) => (
                <div key={a.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-body font-semibold text-sm">{(a.profiles as any)?.full_name || "Sem nome"}</p>
                    <p className="font-body text-xs text-muted-foreground">{(a.stores as any)?.name}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => updateApproval(a.id, true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 font-body text-xs font-semibold hover:bg-green-500/30 transition-colors">
                      <CheckCircle className="w-4 h-4" /> Aprovar
                    </button>
                    <button onClick={() => updateApproval(a.id, false)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 font-body text-xs font-semibold hover:bg-red-500/30 transition-colors">
                      <XCircle className="w-4 h-4" /> Rejeitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Approved */}
        <div>
          <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" /> Aprovados ({approved.length})
          </h2>
          {approved.length === 0 ? (
            <p className="text-muted-foreground font-body text-sm bg-card border border-border rounded-xl p-6 text-center">Nenhum usuário aprovado.</p>
          ) : (
            <div className="space-y-3">
              {approved.map((a) => (
                <div key={a.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-body font-semibold text-sm">{(a.profiles as any)?.full_name || "Sem nome"}</p>
                    <p className="font-body text-xs text-muted-foreground">{(a.stores as any)?.name}</p>
                  </div>
                  <button onClick={() => updateApproval(a.id, false)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 font-body text-xs font-semibold hover:bg-red-500/30 transition-colors">
                    <XCircle className="w-4 h-4" /> Revogar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminUsers;
