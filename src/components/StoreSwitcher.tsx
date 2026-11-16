import { useEffect, useState } from "react";
import { Store as StoreIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { saveSelectedStore } from "@/lib/selectedStore";

interface Store {
  id: string;
  name: string;
}

/**
 * Seletor de loja global: um único login, filtro de loja em todas as telas.
 * Grava a loja por usuário para novas abas e em sessionStorage para as páginas
 * e recarrega para que todos os dados sejam refeitos para a loja ativa.
 */
const StoreSwitcher = () => {
  const { user, isDemo } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [current, setCurrent] = useState<string>(
    () => sessionStorage.getItem("selectedStoreId") || ""
  );

  useEffect(() => {
    if (!user || isDemo) return;
    let cancelled = false;

    const load = async () => {
      // Uma consulta apenas. As regras do banco devolvem todas as lojas para
      // administrador e somente as aprovadas para os demais usuários.
      const { data } = await supabase.from("stores").select("id, name").order("name");
      const list: Store[] = data || [];
      if (cancelled) return;
      setStores(list);
      const saved = sessionStorage.getItem("selectedStoreId");
      if ((!saved || !list.some((s) => s.id === saved)) && list.length) {
        saveSelectedStore(list[0].id);
        setCurrent(list[0].id);
        window.location.reload();
      } else if (saved && list.some((s) => s.id === saved)) {
        saveSelectedStore(saved);
        setCurrent(saved);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user, isDemo]);

  const change = (id: string) => {
    if (!id || id === current) return;
    saveSelectedStore(id);
    setCurrent(id);
    window.dispatchEvent(new CustomEvent("store-changed", { detail: id }));
    window.location.reload();
  };

  if (isDemo) return <span className="inline-flex gap-2 items-center text-xs text-muted-foreground"><StoreIcon className="h-3.5 w-3.5" /> Supermercado Aurora</span>;
  if (stores.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <StoreIcon className="w-3.5 h-3.5 text-muted-foreground" />
      <select
        value={current}
        onChange={(e) => change(e.target.value)}
        aria-label="Selecionar loja"
        className="max-w-[190px] rounded-md border border-border bg-secondary px-2 py-1.5 text-[12px] font-medium text-foreground"
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id} translate="no">
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default StoreSwitcher;
