import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Store, Plus, Pencil, Trash2, X, Check, Eye } from "lucide-react";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PicDisplayMap,
  PicDisplayMode,
  fetchPicDisplayMap,
  savePicDisplayMap,
} from "@/hooks/usePicDisplay";


interface StoreItem {
  id: string;
  name: string;
  created_at: string;
}

const AdminStores = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [picDisplay, setPicDisplay] = useState<PicDisplayMap>({});
  const [savingPic, setSavingPic] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate("/login");
    }
  }, [user, isAdmin, authLoading]);

  useEffect(() => {
    if (isAdmin) {
      fetchStores();
      fetchPicDisplayMap().then(setPicDisplay);
    }
  }, [isAdmin]);

  const changePicDisplay = async (storeId: string, mode: PicDisplayMode) => {
    const next = { ...picDisplay, [storeId]: mode };
    setPicDisplay(next);
    setSavingPic(storeId);
    const { error } = await savePicDisplayMap(next);
    setSavingPic(null);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Exibição do PIC atualizada!" });
  };


  const fetchStores = async () => {
    const { data } = await supabase
      .from("stores")
      .select("*")
      .order("name");
    setStores(data || []);
    setLoading(false);
  };

  const addStore = async () => {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from("stores").insert({ name });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Loja cadastrada!" });
      setNewName("");
      setAdding(false);
      fetchStores();
    }
  };

  const updateStore = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    const { error } = await supabase.from("stores").update({ name }).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Loja atualizada!" });
      setEditingId(null);
      fetchStores();
    }
  };

  const deleteStore = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir "${name}"?`)) return;
    const { error } = await supabase.from("stores").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Loja excluída!" });
      fetchStores();
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  return (
    <ClientLayout>
      <div className="container mx-auto px-6 py-10 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Store className="w-8 h-8 text-primary" />
            <h1 className="font-display text-3xl font-bold">Cadastro de Lojas</h1>
          </div>
          <p className="text-muted-foreground font-body">Gerencie as lojas da rede.</p>
        </motion.div>

        <div className="mb-6">
          {adding ? (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="flex gap-2">
              <Input
                placeholder="Nome da loja"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addStore()}
                autoFocus
                className="flex-1"
              />
              <Button onClick={addStore} size="sm">
                <Check className="w-4 h-4 mr-1" /> Salvar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setNewName(""); }}>
                <X className="w-4 h-4" />
              </Button>
            </motion.div>
          ) : (
            <Button onClick={() => setAdding(true)} className="w-full">
              <Plus className="w-4 h-4 mr-2" /> Adicionar Loja
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {stores.map((store, i) => (
            <motion.div
              key={store.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3"
            >
              {editingId === store.id ? (
                <div className="flex-1 flex gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && updateStore(store.id)}
                    autoFocus
                    className="flex-1"
                  />
                  <Button size="sm" onClick={() => updateStore(store.id)}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <Store className="w-4 h-4 text-muted-foreground" />
                    <span className="font-body font-semibold text-sm">{store.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => { setEditingId(store.id); setEditName(store.name); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteStore(store.id, store.name)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          ))}
          {stores.length === 0 && (
            <p className="text-muted-foreground font-body text-sm bg-card border border-border rounded-xl p-6 text-center">
              Nenhuma loja cadastrada.
            </p>
          )}
        </div>
      </div>
    </ClientLayout>
  );
};

export default AdminStores;
