import { useMemo, useState } from "react";
import { ChevronRight, Download, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/formatters";
import { useHierarquiaVendas, type LinhaHierarquia } from "@/hooks/useHierarquiaVendas";
import * as XLSX from "xlsx";

// ============================================================
// Tabela de vendas com abertura progressiva:
// Nivel 1 (mercadologico) -> Nivel 2 -> Nivel 3 -> Produto.
// Cada clique abre o proximo nivel. Serve para qualquer cliente
// (VR ou WebSac) porque o hook normaliza a origem dos dados.
// ============================================================

interface No {
  chave: string;
  nome: string;
  vendas: number;
  lucro: number;
  volume: number;
  filhos?: No[];
}

const pct = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function agrupar(linhas: LinhaHierarquia[], nivel: 0 | 1 | 2, prefixo: string): No[] {
  const campos: (keyof LinhaHierarquia)[] = ["n1", "n2", "n3"];
  const mapa = new Map<string, { itens: LinhaHierarquia[]; vendas: number; lucro: number; volume: number }>();
  for (const l of linhas) {
    const nome = String(l[campos[nivel]] || "—");
    const cur = mapa.get(nome) ?? { itens: [], vendas: 0, lucro: 0, volume: 0 };
    cur.itens.push(l);
    cur.vendas += l.vendas;
    cur.lucro += l.lucro;
    cur.volume += l.volume;
    mapa.set(nome, cur);
  }
  return [...mapa.entries()]
    .map(([nome, v]) => {
      const chave = `${prefixo}/${nome}`;
      const filhos =
        nivel < 2
          ? agrupar(v.itens, (nivel + 1) as 0 | 1 | 2, chave)
          : v.itens
              .map((i) => ({
                chave: `${chave}/${i.codigo}-${i.produto}`,
                nome: i.codigo ? `${i.codigo} · ${i.produto}` : i.produto,
                vendas: i.vendas,
                lucro: i.lucro,
                volume: i.volume,
              }))
              .sort((a, b) => b.vendas - a.vendas);
      return { chave, nome, vendas: v.vendas, lucro: v.lucro, volume: v.volume, filhos };
    })
    .sort((a, b) => b.vendas - a.vendas);
}

interface Props {
  storeId: string;
  inicio: string;
  fim: string;
  title?: string;
}

export default function HierarquiaVendasTable({ storeId, inicio, fim, title }: Props) {
  const { linhas, total, loading, errorMsg, updatedAt, refresh } = useHierarquiaVendas(storeId, inicio, fim);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const base = linhas ?? [];
    const s = busca.trim().toUpperCase();
    if (!s) return base;
    return base.filter(
      (l) =>
        l.n1.includes(s) || l.n2.includes(s) || l.n3.includes(s) || l.produto.includes(s) || l.codigo.includes(s),
    );
  }, [linhas, busca]);

  const arvore = useMemo(() => agrupar(filtradas, 0, ""), [filtradas]);
  const totalFiltrado = useMemo(() => filtradas.reduce((s, l) => s + l.vendas, 0), [filtradas]);

  const alternar = (chave: string) =>
    setAbertos((prev) => {
      const n = new Set(prev);
      n.has(chave) ? n.delete(chave) : n.add(chave);
      return n;
    });

  const exportar = () => {
    const rows = filtradas.map((l) => ({
      "Nível 1": l.n1,
      "Nível 2": l.n2,
      "Nível 3": l.n3,
      Código: l.codigo,
      Produto: l.produto,
      Venda: l.vendas,
      Lucro: l.lucro,
      "Margem %": l.vendas > 0 ? (l.lucro / l.vendas) * 100 : 0,
      Volume: l.volume,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Vendas");
    XLSX.writeFile(wb, `vendas-mercadologico-${inicio}-a-${fim}.xlsx`);
  };

  const renderNo = (no: No, nivel: number) => {
    const aberto = abertos.has(no.chave);
    const temFilhos = !!no.filhos?.length;
    const margem = no.vendas > 0 ? (no.lucro / no.vendas) * 100 : 0;
    const part = totalFiltrado > 0 ? (no.vendas / totalFiltrado) * 100 : 0;
    return (
      <div key={no.chave}>
        <button
          type="button"
          onClick={() => temFilhos && alternar(no.chave)}
          className={`w-full grid grid-cols-[1fr_repeat(4,minmax(70px,110px))] items-center gap-2 px-3 py-2 text-left border-b border-border/60 hover:bg-muted/40 transition-colors ${
            nivel === 0 ? "font-medium text-foreground" : "text-muted-foreground"
          }`}
        >
          <span className="flex items-center gap-1 min-w-0" style={{ paddingLeft: nivel * 16 }}>
            {temFilhos ? (
              <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`} />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <span className="truncate text-xs sm:text-sm">{no.nome}</span>
          </span>
          <span className="text-right text-xs tabular-nums">{formatBRL(no.vendas)}</span>
          <span className="text-right text-xs tabular-nums">{pct(part)}</span>
          <span className="text-right text-xs tabular-nums">{formatBRL(no.lucro)}</span>
          <span className="text-right text-xs tabular-nums">{pct(margem)}</span>
        </button>
        {aberto && no.filhos?.map((f) => renderNo(f, nivel + 1))}
      </div>
    );
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="text-base">{title ?? "Vendas por mercadológico"}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Clique para abrir Nível 1 › Nível 2 › Nível 3 › Produto
            {updatedAt ? ` · atualizado ${updatedAt.toLocaleTimeString("pt-BR")}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto ou nível..."
              className="pl-8 h-8 w-full sm:w-56 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportar} disabled={!filtradas.length} className="gap-1">
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {errorMsg ? (
          <p className="p-4 text-sm text-muted-foreground">Sem dados no momento: {errorMsg}</p>
        ) : loading && !linhas ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
        ) : !arvore.length ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhuma venda no período.</p>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <div className="grid grid-cols-[1fr_repeat(4,minmax(70px,110px))] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border sticky top-0 bg-card z-10">
              <span>Mercadológico</span>
              <span className="text-right">Venda</span>
              <span className="text-right">Part.</span>
              <span className="text-right">Lucro</span>
              <span className="text-right">Margem</span>
            </div>
            {arvore.map((n) => renderNo(n, 0))}
            <div className="grid grid-cols-[1fr_repeat(4,minmax(70px,110px))] gap-2 px-3 py-2 text-xs font-semibold border-t border-border bg-muted/30">
              <span>Total ({arvore.length} níveis 1)</span>
              <span className="text-right tabular-nums">{formatBRL(totalFiltrado)}</span>
              <span className="text-right tabular-nums">
                {total > 0 ? pct((totalFiltrado / total) * 100) : "100,0%"}
              </span>
              <span className="text-right tabular-nums">
                {formatBRL(filtradas.reduce((s, l) => s + l.lucro, 0))}
              </span>
              <span className="text-right tabular-nums">
                {pct(
                  totalFiltrado > 0
                    ? (filtradas.reduce((s, l) => s + l.lucro, 0) / totalFiltrado) * 100
                    : 0,
                )}
              </span>
            </div>
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              Volume total: {qtd(filtradas.reduce((s, l) => s + l.volume, 0))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
