import { useEffect, useState } from "react";
import { Store as StoreIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Store {
  id: string;
  name: string;
}

/**
 * Seletor de loja global: um único login, filtro de loja em todas as telas.
 * Grava a loja escolhida em sessionStorage (mesma chave usada pelas páginas)
 * e recarrega para que todos os dados sejam refeitos para a loja ativa.
 */
const StoreSwitcher = () => {
  const { user, isAdmin } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [current, setCurrent] = useState<string>(
    () => sessionStorage.getItem("selectedStoreId") || ""
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      let list: Store[] = [];
      if (isAdmin) {
        const { data } = await supabase.from("stores").select("id, name").order("name");
        list = data || [];
      } else {
        const { data: access } = await supabase
          .from("user_store_access")
          .select("store_id")
          .eq("user_id", user.id)
          .eq("approved", true);
        const ids = (access || []).map((a) => a.store_id);
        if (ids.length) {
          const { data } = await supabase
            .from("stores")
            .select("id, name")
            .in("id", ids)
            .order("name");
          list = data || [];
        }
      }
      if (cancelled) return;
      setStores(list);
      const saved = sessionStorage.getItem("selectedStoreId");
      if ((!saved || !list.some((s) => s.id === saved)) && list.length) {
        sessionStorage.setItem("selectedStoreId", list[0].id);
        setCurrent(list[0].id);
        window.dispatchEvent(new CustomEvent("store-changed", { detail: list[0].id }));
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin]);

  const change = (id: string) => {
    if (!id || id === current) return;
    sessionStorage.setItem("selectedStoreId", id);
    setCurrent(id);
    window.dispatchEvent(new CustomEvent("store-changed", { detail: id }));
    window.location.reload();
  };

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
