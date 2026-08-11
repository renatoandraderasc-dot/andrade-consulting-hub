import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio, pick } from "@/lib/vrReport";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { RefreshCw, Lock, ArrowUpDown, Search } from "lucide-react";

const n = (v: unknown) => {
  const p = parseFloat(String(v ?? "").replace(",", "."));
  return isNaN(p) ? 0 : p;
};
const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const num = (v: number, d = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const dataBr = (s: string) => {
  if (!s) return "-";
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString("pt-BR");
};
const mesBr = (s: string) => {
  const m = String(s ?? "");
  if (/^\d{4}-\d{2}/.test(m)) {
    const [a, b] = m.split("-");
    return `${b}/${a}`;
  }
  return m || "-";
};

const hojeISO = () => new Date().toISOString().slice(0, 10);
const inicioMesISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

interface Props {
  storeId: string;
}

interface DreRow {
  mes: string;
  receita_bruta: number;
  cmv: number;
  lucro_bruto: number;
  margem_bruta_pct: number;
  volume: number;
}
interface FluxoRow {
  vencimento: string;
  parcelas: number;
  valor_total: number;
  em_aberto: number;
  pago: number;
}
interface FornRow {
  fornecedor: string;
  parcelas: number;
  valor_total: number;
  em_aberto: number;
  proximo_vencimento: string;
}

export const DadosVrTab = ({ storeId }: Props) => {
  const [inicio, setInicio] = useState(inicioMesISO());
  const [fim, setFim] = useState(hojeISO());
  const [loading, setLoading] = useState(false);
  const [dre, setDre] = useState<DreRow[]>([]);
  const [fluxo, setFluxo] = useState<FluxoRow[]>([]);
  const [fornecedores, setFornecedores] = useState<FornRow[]>([]);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<{ campo: keyof FornRow; dir: "asc" | "desc" }>({
    campo: "em_aberto",
    dir: "desc",
  });

  const [aviso, setAviso] = useState<string | null>(null);

  const chamar = useCallback(
    async (relatorio: string) => {
      const r = await chamarRelatorio(storeId, relatorio, { inicio, fim });
      return { linhas: r.dados as any[], aviso: avisoRelatorio(r) };
    },
    [storeId, inicio, fim]
  );

  const buscar = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const [a, b, c] = await Promise.all([
        chamar("dre_periodo"),
        chamar("pagar_fluxo"),
        chamar("pagar_por_fornecedor"),
      ]);
      setAviso([a, b, c].map((r) => r.aviso).find(Boolean) ?? null);
      setDre(
        a.linhas.map((r) => ({
          mes: String(pick(r, "mes", "competencia", "data") ?? ""),
          receita_bruta: n(pick(r, "receita_bruta", "faturamento", "total_vendido")),
          cmv: n(pick(r, "cmv", "custo")),
          lucro_bruto: n(pick(r, "lucro_bruto", "lucro")),
          margem_bruta_pct: n(pick(r, "margem_bruta_pct", "margem_pct", "margem")),
          volume: n(pick(r, "volume", "quantidade", "qtde")),
        }))
      );
      setFluxo(
        b.linhas.map((r) => ({
          vencimento: String(pick(r, "vencimento", "data") ?? ""),
          parcelas: n(pick(r, "parcelas")),
          valor_total: n(pick(r, "valor_total", "valor")),
          em_aberto: n(pick(r, "em_aberto", "aberto")),
          pago: n(pick(r, "pago")),
        }))
      );
      setFornecedores(
        c.linhas.map((r) => ({
          fornecedor: String(pick(r, "fornecedor", "nome") ?? "-"),
          parcelas: n(pick(r, "parcelas")),
          valor_total: n(pick(r, "valor_total", "valor")),
          em_aberto: n(pick(r, "em_aberto", "aberto")),
          proximo_vencimento: String(pick(r, "proximo_vencimento", "vencimento") ?? ""),
        }))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao consultar o sistema da loja");
    } finally {
      setLoading(false);
    }
  }, [storeId, chamar]);

  useEffect(() => {
    if (storeId) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const totDre = useMemo(
    () =>
      dre.reduce(
        (acc, r) => ({
          receita_bruta: acc.receita_bruta + r.receita_bruta,
          cmv: acc.cmv + r.cmv,
          lucro_bruto: acc.lucro_bruto + r.lucro_bruto,
          volume: acc.volume + r.volume,
        }),
        { receita_bruta: 0, cmv: 0, lucro_bruto: 0, volume: 0 }
      ),
    [dre]
  );
  const margemTotal = totDre.receita_bruta ? (totDre.lucro_bruto / totDre.receita_bruta) * 100 : 0;

  const totFluxo = useMemo(
    () =>
      fluxo.reduce(
        (acc, r) => ({
          em_aberto: acc.em_aberto + r.em_aberto,
          pago: acc.pago + r.pago,
          parcelas: acc.parcelas + r.parcelas,
        }),
        { em_aberto: 0, pago: 0, parcelas: 0 }
      ),
    [fluxo]
  );

  // agrupamento por semana de vencimento
  const semanas = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const map = new Map<string, { semana: string; em_aberto: number; pago: number; vencido: boolean }>();
    for (const r of fluxo) {
      const d = new Date(`${r.vencimento.slice(0, 10)}T00:00:00`);
      if (isNaN(d.getTime())) continue;
      const ini = new Date(d);
      ini.setDate(d.getDate() - d.getDay());
      const key = ini.toISOString().slice(0, 10);
      const atual =
        map.get(key) ?? { semana: `Sem. ${ini.toLocaleDateString("pt-BR")}`, em_aberto: 0, pago: 0, vencido: false };
      atual.em_aberto += r.em_aberto;
      atual.pago += r.pago;
      if (d < hoje && r.em_aberto > 0) atual.vencido = true;
      map.set(key, atual);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);
  }, [fluxo]);

  const top10 = useMemo(
    () =>
      new Set(
        [...fornecedores]
          .sort((a, b) => b.em_aberto - a.em_aberto)
          .slice(0, 10)
          .map((f) => f.fornecedor)
      ),
    [fornecedores]
  );

  const fornFiltrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = t ? fornecedores.filter((f) => f.fornecedor.toLowerCase().includes(t)) : fornecedores;
    return [...lista].sort((a, b) => {
      const va = a[ordem.campo];
      const vb = b[ordem.campo];
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "pt-BR");
      return ordem.dir === "asc" ? cmp : -cmp;
    });
  }, [fornecedores, busca, ordem]);

  const ordenar = (campo: keyof FornRow) =>
    setOrdem((o) => ({ campo, dir: o.campo === campo && o.dir === "desc" ? "asc" : "desc" }));

  const Th = ({ campo, children, right }: { campo: keyof FornRow; children: React.ReactNode; right?: boolean }) => (
    <th className={`px-3 py-2 ${right ? "text-right" : "text-left"}`}>
      <button
        onClick={() => ordenar(campo)}
        className="inline-flex items-center gap-1 hover:text-foreground text-muted-foreground"
      >
        {children}
        <ArrowUpDown className="w-3 h-3" />
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      {aviso && (
        <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
          {aviso}
        </div>
      )}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Início</label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Fim</label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-40" />
            </div>
            <Button onClick={buscar} disabled={loading || !storeId} className="mt-5">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
          <div className="md:ml-auto flex items-start gap-2 text-xs text-muted-foreground max-w-md">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Dados lidos <strong>direto do VR</strong>, em tempo real e <strong>somente leitura</strong>. Não se
              confundem com os lançamentos manuais da Controladoria.
            </span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Período: {dataBr(inicio)} a {dataBr(fim)}
        </p>
      </Card>

      {/* DRE */}
      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold">DRE do período (VR)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { l: "Receita bruta", v: brl(totDre.receita_bruta) },
            { l: "CMV", v: brl(totDre.cmv) },
            { l: "Lucro bruto", v: brl(totDre.lucro_bruto) },
            { l: "Margem bruta", v: pct(margemTotal) },
            { l: "Volume", v: num(totDre.volume, 0) },
          ].map((c) => (
            <Card key={c.l} className="p-4">
              <p className="text-xs text-muted-foreground">{c.l}</p>
              <p className="text-lg font-semibold mt-1">{c.v}</p>
            </Card>
          ))}
        </div>

        <Card className="p-4">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dre.map((d) => ({ ...d, mesBr: mesBr(d.mes) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mesBr" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => num(Number(v) / 1000) + "k"} />
                <Tooltip formatter={(v: any) => brl(Number(v))} />
                <Legend />
                <Bar dataKey="receita_bruta" name="Receita bruta" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="lucro_bruto" name="Lucro bruto" fill="hsl(var(--chart-2, var(--secondary)))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left">Mês</th>
                <th className="px-3 py-2 text-right">Receita bruta</th>
                <th className="px-3 py-2 text-right">CMV</th>
                <th className="px-3 py-2 text-right">Lucro bruto</th>
                <th className="px-3 py-2 text-right">Margem %</th>
                <th className="px-3 py-2 text-right">Volume</th>
              </tr>
            </thead>
            <tbody>
              {dre.map((r) => (
                <tr key={r.mes} className="border-b border-border/50">
                  <td className="px-3 py-2">{mesBr(r.mes)}</td>
                  <td className="px-3 py-2 text-right">{brl(r.receita_bruta)}</td>
                  <td className="px-3 py-2 text-right">{brl(r.cmv)}</td>
                  <td className="px-3 py-2 text-right">{brl(r.lucro_bruto)}</td>
                  <td className="px-3 py-2 text-right">{pct(r.margem_bruta_pct)}</td>
                  <td className="px-3 py-2 text-right">{num(r.volume)}</td>
                </tr>
              ))}
              {dre.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    {loading ? "Carregando..." : "Sem dados no período"}
                  </td>
                </tr>
              )}
            </tbody>
            {dre.length > 0 && (
              <tfoot>
                <tr className="font-semibold bg-muted/40">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{brl(totDre.receita_bruta)}</td>
                  <td className="px-3 py-2 text-right">{brl(totDre.cmv)}</td>
                  <td className="px-3 py-2 text-right">{brl(totDre.lucro_bruto)}</td>
                  <td className="px-3 py-2 text-right">{pct(margemTotal)}</td>
                  <td className="px-3 py-2 text-right">{num(totDre.volume)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </Card>
      </div>

      {/* Fluxo a pagar */}
      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Contas a pagar (VR)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">A pagar no período</p>
            <p className="text-lg font-semibold mt-1">{brl(totFluxo.em_aberto)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Já pago</p>
            <p className="text-lg font-semibold mt-1">{brl(totFluxo.pago)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Parcelas</p>
            <p className="text-lg font-semibold mt-1">{num(totFluxo.parcelas)}</p>
          </Card>
        </div>

        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-2">
            Em aberto por semana de vencimento — barras em vermelho indicam semanas com parcelas vencidas.
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={semanas}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => num(Number(v) / 1000) + "k"} />
                <Tooltip formatter={(v: any) => brl(Number(v))} />
                <Bar dataKey="em_aberto" name="Em aberto" radius={[3, 3, 0, 0]}>
                  {semanas.map((s, i) => (
                    <Cell key={i} fill={s.vencido ? "hsl(var(--destructive))" : "hsl(var(--primary))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Fornecedores */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display text-lg font-semibold">A pagar por fornecedor (VR)</h2>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Buscar fornecedor"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 w-64"
            />
          </div>
        </div>
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <Th campo="fornecedor">Fornecedor</Th>
                <Th campo="parcelas" right>Parcelas</Th>
                <Th campo="valor_total" right>Valor total</Th>
                <Th campo="em_aberto" right>Em aberto</Th>
                <Th campo="proximo_vencimento" right>Próx. vencimento</Th>
              </tr>
            </thead>
            <tbody>
              {fornFiltrados.map((f, i) => (
                <tr
                  key={`${f.fornecedor}-${i}`}
                  className={`border-b border-border/50 ${top10.has(f.fornecedor) ? "bg-primary/5" : ""}`}
                >
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      {f.fornecedor}
                      {top10.has(f.fornecedor) && (
                        <Badge variant="secondary" className="text-[10px]">Top 10</Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{num(f.parcelas)}</td>
                  <td className="px-3 py-2 text-right">{brl(f.valor_total)}</td>
                  <td className="px-3 py-2 text-right">{brl(f.em_aberto)}</td>
                  <td className="px-3 py-2 text-right">{dataBr(f.proximo_vencimento)}</td>
                </tr>
              ))}
              {fornFiltrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    {loading ? "Carregando..." : "Sem dados no período"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
};
