import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ============================================================
// Leitura AO VIVO do realizado do VR (nada e gravado no banco).
// Consulta a edge function vr-proxy com o relatorio
// vendas_secao_periodo e agrega no front por departamento
// usando o mapeamento de vr_secao_departamento.
// Secoes sem mapeamento somam apenas no total da loja (LOJA).
// Cache leve de 60s por (loja + periodo).
// ============================================================

export const LOJA = "LOJA";

export interface VrDia {
  date: string;
  day: number;
  vendas: number;
  lucro: number;
  volume: number;
  margemPct: number;
}

export type VrRealizado = Record<string, VrDia[]>;

interface CacheEntry {
  at: number;
  promise: Promise<VrRealizado>;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

const norm = (s: string) =>
  (s || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

async function loadRealizado(storeId: string, inicio: string, fim: string): Promise<VrRealizado> {
  const [{ data: mapas }, { data: proxy, error }] = await Promise.all([
    supabase.from("vr_secao_departamento").select("secao_vr, department").eq("store_id", storeId),
    supabase.functions.invoke("vr-proxy", {
      body: { store_id: storeId, relatorio: "vendas_secao_periodo", params: { inicio, fim } },
    }),
  ]);

  if (error) throw new Error(error.message);
  if (!proxy || (proxy as any).erro) throw new Error((proxy as any)?.erro || "Sem resposta do VR");

  const mapa = new Map<string, string>();
  for (const m of mapas ?? []) mapa.set(norm(m.secao_vr), m.department);

  const linhas: any[] = Array.isArray((proxy as any).dados) ? (proxy as any).dados : [];

  // acumula por departamento + data
  const acc = new Map<string, { date: string; vendas: number; lucro: number; volume: number }>();
  const add = (dep: string, date: string, vendas: number, lucro: number, volume: number) => {
    const k = `${dep}|${date}`;
    const cur = acc.get(k) ?? { date, vendas: 0, lucro: 0, volume: 0 };
    cur.vendas += vendas;
    cur.lucro += lucro;
    cur.volume += volume;
    acc.set(k, cur);
  };

  for (const l of linhas) {
    const date = String(l.data ?? "").slice(0, 10);
    if (!date) continue;
    const vendas = parseFloat(String(l.total_vendido)) || 0;
    const lucro = parseFloat(String(l.lucro)) || 0;
    const volume = parseFloat(String(l.volume)) || 0;
    const dep = mapa.get(norm(String(l.secao ?? "")));
    // total da loja sempre recebe a linha
    add(LOJA, date, vendas, lucro, volume);
    // secoes sem mapeamento nao criam departamento proprio
    if (dep && dep !== LOJA) add(dep, date, vendas, lucro, volume);
  }

  const out: VrRealizado = {};
  for (const [k, v] of acc) {
    const dep = k.split("|")[0];
    (out[dep] ||= []).push({
      date: v.date,
      day: Number(v.date.slice(8, 10)),
      vendas: v.vendas,
      lucro: v.lucro,
      volume: v.volume,
      margemPct: v.vendas > 0 ? (v.lucro / v.vendas) * 100 : 0,
    });
  }
  for (const dep of Object.keys(out)) out[dep].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export function useVrRealizado(storeId: string, inicio: string, fim: string) {
  const [data, setData] = useState<VrRealizado | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const reqRef = useRef(0);

  const run = useCallback(
    async (force: boolean) => {
      if (!storeId || !inicio || !fim) return;
      const key = `${storeId}|${inicio}|${fim}`;
      const cached = cache.get(key);
      const fresh = cached && Date.now() - cached.at < TTL_MS && !force;
      const entry: CacheEntry = fresh
        ? cached!
        : { at: Date.now(), promise: loadRealizado(storeId, inicio, fim) };
      cache.set(key, entry);

      const id = ++reqRef.current;
      setLoading(true);
      try {
        const result = await entry.promise;
        if (id !== reqRef.current) return;
        setData(result);
        setOffline(false);
        setErrorMsg(null);
        setUpdatedAt(new Date(entry.at));
      } catch (e) {
        cache.delete(key);
        if (id !== reqRef.current) return;
        setData(null);
        setOffline(true);
        setErrorMsg(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    },
    [storeId, inicio, fim],
  );

  useEffect(() => {
    run(false);
  }, [run]);

  const refresh = useCallback(() => run(true), [run]);

  return { data, loading, offline, errorMsg, updatedAt, refresh };
}

export function VrOfflineMessage(): string {
  return "Sem conexão com o VR";
}
