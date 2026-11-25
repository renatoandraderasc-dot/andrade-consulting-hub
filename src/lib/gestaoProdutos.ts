import type { LinhaHierarquia } from "@/hooks/useHierarquiaVendas";

export interface ProdutoGestao {
  chave: string;
  codigo: string;
  ean: string;
  produto: string;
  categoria: string;
  atualVol: number;
  mediaVol: number;
  queda: number;
  tipo: "sem_giro" | "em_queda";
}

// Same comparison as PIC, kept isolated so checklist state never affects PIC.
export function analisarProdutosGestao(atual: LinhaHierarquia[], anteriores: LinhaHierarquia[][]): ProdutoGestao[] {
  const somar = (linhas: LinhaHierarquia[]) => {
    const mapa = new Map<string, { linha: LinhaHierarquia; volume: number }>();
    for (const linha of linhas) {
      const chave = `${linha.codigo || linha.produto}`;
      const existente = mapa.get(chave);
      if (existente) existente.volume += linha.volume;
      else mapa.set(chave, { linha, volume: linha.volume });
    }
    return mapa;
  };
  const corrente = somar(atual);
  const bases = anteriores.map(somar);
  const chaves = new Set(bases.flatMap((base) => [...base.keys()]));
  const itens: ProdutoGestao[] = [];
  for (const chave of chaves) {
    const historicos = bases.map((b) => b.get(chave)).filter((h): h is { linha: LinhaHierarquia; volume: number } => !!h && h.volume > 0);
    if (!historicos.length) continue;
    const mediaVol = historicos.reduce((s, h) => s + h.volume, 0) / historicos.length;
    const itemAtual = corrente.get(chave);
    const ref = itemAtual?.linha ?? historicos[0].linha;
    const atualVol = itemAtual?.volume ?? 0;
    const queda = ((mediaVol - atualVol) / mediaVol) * 100;
    if (atualVol > 0 && queda < 10) continue;
    itens.push({ chave, codigo: ref.codigo || "", ean: ref.ean || "", produto: ref.produto, categoria: ref.n1 || "SEM DEPARTAMENTO", atualVol, mediaVol, queda, tipo: atualVol <= 0 ? "sem_giro" : "em_queda" });
  }
  return itens.sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR") || b.queda - a.queda || b.mediaVol - a.mediaVol);
}

export function pendenciasGestao<T extends { chave: string }>(itens: T[], cientes: { store_id: string; mes: string; produto_chave: string }[], storeId: string, mes: string): T[] {
  const marcados = new Set(cientes.filter((c) => c.store_id === storeId && c.mes === mes).map((c) => c.produto_chave));
  return itens.filter((p) => !marcados.has(p.chave));
}

export function periodosGestao(ano: number, mes: number, hoje = new Date()) {
  const pad = (v: number) => String(v).padStart(2, "0");
  const dias = (a: number, m: number) => new Date(a, m, 0).getDate();
  const diaLimite = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes ? Math.max(1, hoje.getDate() - 1) : dias(ano, mes);
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date(ano, mes - 1 - i, 1);
    const a = d.getFullYear(), m = d.getMonth() + 1;
    return { inicio: `${a}-${pad(m)}-01`, fim: `${a}-${pad(m)}-${pad(Math.min(diaLimite, dias(a, m)))}` };
  });
}