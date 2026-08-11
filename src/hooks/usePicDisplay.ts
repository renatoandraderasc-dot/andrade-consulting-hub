import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PicDisplayMode = "valores" | "percentual";

export const PIC_DISPLAY_ID = "pic_display";

/** Mapa loja -> modo de exibicao do PIC (valores + % ou apenas %) */
export type PicDisplayMap = Record<string, PicDisplayMode>;

export async function fetchPicDisplayMap(): Promise<PicDisplayMap> {
  const { data } = await supabase
    .from("site_content")
    .select("data")
    .eq("id", PIC_DISPLAY_ID)
    .maybeSingle();
  return ((data?.data as any) || {}) as PicDisplayMap;
}

export async function savePicDisplayMap(map: PicDisplayMap) {
  return supabase
    .from("site_content")
    .upsert({ id: PIC_DISPLAY_ID, data: map as any, updated_at: new Date().toISOString() });
}

/** Perfil "PIC VISUALIZADOR": usuario que so enxerga percentuais no PIC */
export const PIC_VIEWER_MODULE = "pic_percentual";

async function isPicViewer(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data } = await supabase
    .from("user_module_access")
    .select("allowed")
    .eq("user_id", auth.user.id)
    .eq("module", PIC_VIEWER_MODULE)
    .eq("allowed", true)
    .limit(1);
  return !!data && data.length > 0;
}

/** Modo de exibicao do PIC para uma loja (padrao: valores + %) */
export function usePicDisplayMode(storeId: string | undefined) {
  const [mode, setMode] = useState<PicDisplayMode>("valores");
  const [forcePct, setForcePct] = useState(false);

  useEffect(() => {
    let mounted = true;
    isPicViewer().then((v) => mounted && setForcePct(v));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!storeId) return;
    let mounted = true;
    (async () => {
      const map = await fetchPicDisplayMap();
      if (mounted) setMode(map[storeId] === "percentual" ? "percentual" : "valores");
    })();

    const channel = supabase
      .channel("site_content_pic_display")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "site_content", filter: `id=eq.${PIC_DISPLAY_ID}` },
        (payload: any) => {
          const map = (payload.new?.data || {}) as PicDisplayMap;
          setMode(map[storeId] === "percentual" ? "percentual" : "valores");
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [storeId]);

  return mode;
}
