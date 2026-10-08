import { supabase } from "@/integrations/supabase/client";

export type TvTipo = "foto" | "video" | "precos" | "pic" | "texto";

export const TV_TIPOS: { value: TvTipo; label: string }[] = [
  { value: "foto", label: "Foto" },
  { value: "video", label: "Vídeo" },
  { value: "precos", label: "Tabela de preços" },
  { value: "pic", label: "PIC (resultados)" },
  { value: "texto", label: "Aviso / texto" },
];

export interface TvItem {
  id: string;
  tela_id: string;
  ordem: number;
  tipo: TvTipo;
  titulo: string | null;
  midia_path: string | null;
  duracao_seg: number;
  config: { codigos?: string[]; texto?: string };
  ativo: boolean;
}

export interface TvTela {
  id: string;
  store_id: string;
  nome: string;
  ativa: boolean;
}

const db = supabase as any;

export async function listarTelas(storeId?: string): Promise<TvTela[]> {
  let q = db.from("tv_telas").select("*").order("nome");
  if (storeId) q = q.eq("store_id", storeId);
  const { data } = await q;
  return data || [];
}

export async function listarItens(telaId: string): Promise<TvItem[]> {
  const { data } = await db.from("tv_itens").select("*").eq("tela_id", telaId).order("ordem");
  return data || [];
}

export async function urlMidia(path: string, segundos = 60 * 60 * 24) {
  const { data } = await supabase.storage.from("tv-midia").createSignedUrl(path, segundos);
  return data?.signedUrl || "";
}

export const tvDb = db;
