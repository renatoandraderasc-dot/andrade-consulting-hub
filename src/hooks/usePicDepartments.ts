import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const PIC_DEPARTMENTS_ID = "pic_departments";

/** Mapa loja -> lista de departamentos exibidos no PIC (vazio/ausente = automático) */
export type PicDepartmentsMap = Record<string, string[]>;

export async function fetchPicDepartmentsMap(): Promise<PicDepartmentsMap> {
  const { data } = await supabase
    .from("site_content")
    .select("data")
    .eq("id", PIC_DEPARTMENTS_ID)
    .maybeSingle();
  const raw = ((data?.data as any) || {}) as Record<string, unknown>;
  const map: PicDepartmentsMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) map[k] = v.map((d) => String(d));
  }
  return map;
}

export async function savePicDepartmentsMap(map: PicDepartmentsMap) {
  return supabase
    .from("site_content")
    .upsert({ id: PIC_DEPARTMENTS_ID, data: map as any, updated_at: new Date().toISOString() });
}

/** Departamentos configurados para a loja (null = automático) */
export function usePicDepartments(storeId: string | undefined) {
  const [depts, setDepts] = useState<string[] | null>(null);

  useEffect(() => {
    if (!storeId) {
      setDepts(null);
      return;
    }
    let mounted = true;
    const apply = (map: PicDepartmentsMap) => {
      const list = map[storeId];
      setDepts(list && list.length ? list : null);
    };
    fetchPicDepartmentsMap().then((m) => mounted && apply(m));

    const channel = supabase
      .channel("site_content_pic_departments")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "site_content",
          filter: `id=eq.${PIC_DEPARTMENTS_ID}`,
        },
        (payload: any) => apply((payload.new?.data || {}) as PicDepartmentsMap),
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [storeId]);

  return depts;
}

/** Índices disponíveis no PIC, na ordem de exibição (chaves internas da tela) */
export const ALL_PIC_KPIS = ["faturamento", "arrecadacao", "quantidade", "volume"] as const;

export const PIC_KPI_LABELS: Record<string, string> = {
  faturamento: "Faturamento",
  arrecadacao: "Arrecadação",
  quantidade: "Volume",
  volume: "Mix",
};

/** Mapa loja -> lista de índices ativos no PIC (vazio/ausente = todos) */
export type PicKpisMap = Record<string, string[]>;

export const PIC_KPIS_ID = "pic_kpis";

export async function fetchPicKpisMap(): Promise<PicKpisMap> {
  const { data } = await supabase
    .from("site_content")
    .select("data")
    .eq("id", PIC_KPIS_ID)
    .maybeSingle();
  const raw = ((data?.data as any) || {}) as Record<string, unknown>;
  const map: PicKpisMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) map[k] = v.map((d) => String(d)).filter((d) => (ALL_PIC_KPIS as readonly string[]).includes(d));
  }
  return map;
}

export async function savePicKpisMap(map: PicKpisMap) {
  return supabase
    .from("site_content")
    .upsert({ id: PIC_KPIS_ID, data: map as any, updated_at: new Date().toISOString() });
}

/** Índices ativos para a loja (null = todos) */
export function usePicKpis(storeId: string | undefined) {
  const [kpis, setKpis] = useState<string[] | null>(null);

  useEffect(() => {
    if (!storeId) {
      setKpis(null);
      return;
    }
    let mounted = true;
    const apply = (map: PicKpisMap) => {
      const list = map[storeId];
      setKpis(list && list.length ? list : null);
    };
    fetchPicKpisMap().then((m) => mounted && apply(m));

    const channel = supabase
      .channel(`site_content_pic_kpis_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "site_content",
          filter: `id=eq.${PIC_KPIS_ID}`,
        },
        (payload: any) => apply((payload.new?.data || {}) as PicKpisMap),
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [storeId]);

  return kpis;
}
