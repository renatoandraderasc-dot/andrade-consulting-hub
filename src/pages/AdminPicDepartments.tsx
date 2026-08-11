import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { LayoutGrid, Plus, Save, RotateCcw } from "lucide-react";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PicDepartmentsMap,
  fetchPicDepartmentsMap,
  savePicDepartmentsMap,
} from "@/hooks/usePicDepartments";

const BASE_DEPARTMENTS = ["LOJA", "PADARIA", "AÇOUGUE", "HORTIFRUTI", "OUTROS"];

interface StoreItem {
  id: string;
  name: string;
}

const AdminPicDepartments = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stores, setStores] = useState<StoreItem[]>([]);
  const [storeId, setStoreId] = useState("");
  const [map, setMap] = useState<PicDepartmentsMap>({});
  const [options, setOptions] = useState<string[]>(BASE_DEPARTMENTS);
  const [novo, setNovo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
  }, [user, isAdmin, authLoading]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase.from("stores").select("id, name").order("name");
      setStores(data || []);
      if (data?.length) setStoreId((s) => s || data[0].id);
      setMap(await fetchPicDepartmentsMap());
    })();
  }, [isAdmin]);

  // Sugestoes: departamentos ja usados nas metas da loja
  useEffect(() => {
    if (!storeId) return;
    (async () => {
      const { data } = await supabase
        .from("store_daily_metrics")
        .select("department")
        .eq("store_id", storeId)
        .limit(2000);
      const vistos = Array.from(new Set((data || []).map((r: any) => String(r.department))));
      const extras = vistos.filter((d) => !BASE_DEPARTMENTS.includes(d)).sort();
      setOptions([...BASE_DEPARTMENTS, ...extras]);
    })();
  }, [storeId]);

  const selecionados = map[storeId] || [];
  const automatico = selecionados.length === 0;

  const toggle = (dept: string) => {
    const atual = map[storeId] || [];
    const next = atual.includes(dept) ? atual.filter((d) => d !== dept) : [...atual, dept];
    setMap({ ...map, [storeId]: next });
  };

  const adicionar = () => {
    const dept = novo.trim().toUpperCase();
    if (!dept) return;
    if (!options.includes(dept)) setOptions([...options, dept]);
    const atual = map[storeId] || [];
    if (!atual.includes(dept)) setMap({ ...map, [storeId]: [...atual, dept] });
    setNovo("");
  };

  const limpar = () => setMap({ ...map, [storeId]: [] });

  const salvar = async () => {
    setSaving(true);
    const { error } = await savePicDepartmentsMap(map);
    setSaving(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Configuração salva!", description: "O PIC já reflete os departamentos." });
  };

  return (
    <ClientLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-2">
          <LayoutGrid className="w-5 h-5 text-primary" />
          <h1 className="font-display text-2xl font-bold">Departamentos do PIC por cliente</h1>
        </div>
        <p className="text-sm text-muted-foreground font-body mb-6">
          Escolha quais departamentos aparecem no painel PIC de cada loja. Sem nenhum marcado, o
          sistema detecta automaticamente os departamentos disponíveis.
        </p>

        <div className="bg-card border border-border rounded-xl p-5 space-y-5">
          <div>
            <label className="text-xs font-body text-muted-foreground">Loja</label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione a loja" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-body font-semibold">Departamentos exibidos</span>
              {automatico && (
                <span className="text-xs font-body text-muted-foreground">Modo automático</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {options.map((dept) => (
                <label
                  key={dept}
                  className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selecionados.includes(dept)}
                    onCheckedChange={() => toggle(dept)}
                    disabled={!storeId}
                  />
                  <span className="font-body text-sm">{dept}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
              placeholder="Adicionar outro departamento"
            />
            <Button type="button" variant="outline" onClick={adicionar} disabled={!storeId}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={salvar} disabled={!storeId || saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" onClick={limpar} disabled={!storeId}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Voltar ao automático
            </Button>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
};

export default AdminPicDepartments;
