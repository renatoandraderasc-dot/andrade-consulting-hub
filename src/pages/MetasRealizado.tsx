import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Legend, CartesianGrid,
} from "recharts";
import { Target, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CartProgressOverlay } from "@/components/CartProgress";
import { useVrRealizado, LOJA } from "@/hooks/useVrRealizado";
import { fmtBRL, fmtNum, fmtPct, MESES, diasNoMes } from "@/lib/metasSugestao";
import { salvarWorkbook } from "@/lib/exportBranding";

interface Store { id: string; name: string }

type Ind = "vendas" | "lucro" | "volume" | "mix" | "margem";

const INDICADORES: { key: Ind; label: string; fmt: (n: number) => string }[] = [
  { key: "vendas", label: "Faturamento", fmt: fmtBRL },
  { key: "lucro", label: "Lucro", fmt: fmtBRL },
  { key: "margem", label: "Margem %", fmt: (n) => `${fmtPct(n)}` },
  { key: "volume", label: "Volume", fmt: fmtNum },
  { key: "mix", label: "Mix", fmt: fmtNum },
];

interface LinhaComp {
  dept: string;
  meta: number;
  realizado: number;
  espelho: number;
}

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const varPct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);
const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const MetasRealizado = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");

  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [ano, setAno] = useState(Number(hojeSP.slice(0, 4)));
  const [mes, setMes] = useState(Number(hojeSP.slice(5, 7)));
  const [ind, setInd] = useState<Ind>("vendas");

  const [metasDia, setMetasDia] = useState<Record<string, { vendas: number; lucro: number; volume: number; mix: number }>>({});
  const [carregandoMetas, setCarregandoMetas] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
    if (user && isAdmin) {
      supabase.from("stores").select("id, name").order("name").then(({ data }) => {
        if (!data?.length) return;
        setStores(data);
        const sid = sessionStorage.getItem("selectedStoreId");
        const p = data.find((s) => s.id === sid) || data[0];
        setStoreId(p.id); setStoreName(p.name);
      });
    }
  }, [user, isAdmin, authLoading]);

  const inicio = iso(ano, mes, 1);
  const fim = iso(ano, mes, diasNoMes(ano, mes));
  const inicioEsp = iso(ano - 1, mes, 1);
  const fimEsp = iso(ano - 1, mes, diasNoMes(ano - 1, mes));

  const atual = useVrRealizado(storeId, inicio, fim);
  const espelho = useVrRealizado(storeId, inicioEsp, fimEsp);

  // Metas gravadas (Sugestao Analitica / Metas) — store_daily_metrics
  const carregarMetas = async () => {
    if (!storeId) return;
    setCarregandoMetas(true);
    const acc: Record<string, { vendas: number; lucro: number; volume: number; mix: number }> = {};
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("store_daily_metrics")
        .select("department, meta_vendas, meta_lucro, meta_volume, meta_mix")
        .eq("store_id", storeId)
        .gte("date", inicio)
        .lte("date", fim)
        .range(from, from + 999);
      if (error || !data?.length) break;
      for (const r of data) {
        const d = (r.department || "OUTROS").toUpperCase();
        const cur = (acc[d] ||= { vendas: 0, lucro: 0, volume: 0, mix: 0 });
        cur.vendas += Number(r.meta_vendas) || 0;
        cur.lucro += Number(r.meta_lucro) || 0;
        cur.volume += Number(r.meta_volume) || 0;
        cur.mix += Number(r.meta_mix) || 0;
      }
      if (data.length < 1000) break;
      from += 1000;
    }
    setMetasDia(acc);
    setCarregandoMetas(false);
  };

  useEffect(() => { carregarMetas(); }, [storeId, inicio, fim]);

  const somar = (dias: { vendas: number; lucro: number; volume: number; mix: number }[] | undefined) => {
    const t = { vendas: 0, lucro: 0, volume: 0, mix: 0 };
    for (const d of dias ?? []) {
      t.vendas += d.vendas; t.lucro += d.lucro; t.volume += d.volume; t.mix += d.mix;
    }
    return t;
  };

  const linhas = useMemo<LinhaComp[]>(() => {
    const deps = new Set<string>([
      ...Object.keys(metasDia),
      ...Object.keys(atual.data ?? {}),
      ...Object.keys(espelho.data ?? {}),
    ]);
    const valorDe = (t: { vendas: number; lucro: number; volume: number; mix: number }) => {
      if (ind === "margem") return t.vendas > 0 ? (t.lucro / t.vendas) * 100 : 0;
      return t[ind];
    };
    const metaDe = (m?: { vendas: number; lucro: number; volume: number; mix: number }) => {
      if (!m) return 0;
      if (ind === "margem") return m.vendas > 0 ? (m.lucro / m.vendas) * 100 : 0;
      return m[ind];
    };
    const out: LinhaComp[] = [];
    for (const dep of deps) {
      out.push({
        dept: dep,
        meta: metaDe(metasDia[dep]),
        realizado: valorDe(somar(atual.data?.[dep])),
        espelho: valorDe(somar(espelho.data?.[dep])),
      });
    }
    return out.sort((a, b) => {
      if (a.dept === LOJA) return -1;
      if (b.dept === LOJA) return 1;
      return b.realizado - a.realizado || a.dept.localeCompare(b.dept);
    });
  }, [metasDia, atual.data, espelho.data, ind]);

  const totalLoja = linhas.find((l) => l.dept === LOJA);
  const config = INDICADORES.find((i) => i.key === ind)!;
  const carregando = atual.loading || espelho.loading || carregandoMetas;

  const grafico = linhas
    .filter((l) => l.dept !== LOJA)
    .slice(0, 12)
    .map((l) => ({ dept: l.dept, Meta: Math.round(l.meta), Realizado: Math.round(l.realizado), Espelho: Math.round(l.espelho) }));

  const exportar = () => {
    const titulo = `Metas vs Realizado - ${storeName} - ${MESES[mes]}/${ano}`;
    const wb = XLSX.utils.book_new();
    for (const i of INDICADORES) {
      const valorDe = (t: { vendas: number; lucro: number; volume: number; mix: number }) =>
        i.key === "margem" ? (t.vendas > 0 ? (t.lucro / t.vendas) * 100 : 0) : t[i.key];
      const deps = new Set<string>([
        ...Object.keys(metasDia), ...Object.keys(atual.data ?? {}), ...Object.keys(espelho.data ?? {}),
      ]);
      const rows = [...deps].map((dep) => {
        const m = metasDia[dep];
        const meta = m ? (i.key === "margem" ? (m.vendas > 0 ? (m.lucro / m.vendas) * 100 : 0) : m[i.key]) : 0;
        const real = valorDe(somar(atual.data?.[dep]));
        const esp = valorDe(somar(espelho.data?.[dep]));
        return {
          Departamento: dep,
          Meta: meta,
          Realizado: real,
          "Atingimento %": pct(real, meta),
          Diferença: real - meta,
          "Mês espelho": esp,
          "Var. vs espelho %": varPct(real, esp),
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), i.label.slice(0, 28));
    }
    salvarWorkbook(wb, titulo, [["Loja", storeName], ["Competência", `${MESES[mes]}/${ano}`]]);
  };

  const recarregar = () => { atual.refresh(); espelho.refresh(); carregarMetas(); };

  const semMetas = Object.keys(metasDia).length === 0;

  return (
    <ClientLayout>
      {carregando && <CartProgressOverlay label="Carregando metas e realizado..." />}
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Target className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Metas vs Realizado</h1>
              <p className="text-sm text-muted-foreground">
                Metas gravadas na Sugestão Analítica × realizado do PIC × mês espelho
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={storeId} onValueChange={(v) => {
              setStoreId(v); setStoreName(stores.find((s) => s.id === v)?.name ?? "");
            }}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Loja" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.slice(1).map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[ano - 2, ano - 1, ano, ano + 1].map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={recarregar}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
            <Button size="sm" onClick={exportar}>
              <Download className="h-4 w-4 mr-1" /> Excel
            </Button>
          </div>
        </div>

        {(atual.offline || espelho.offline) && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Relatório não disponível para esta loja no período consultado.
          </div>
        )}
        {semMetas && !carregando && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            Nenhuma meta gravada para {MESES[mes]}/{ano} nesta loja.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {INDICADORES.map((i) => (
            <Button key={i.key} size="sm" variant={i.key === ind ? "default" : "outline"} onClick={() => setInd(i.key)}>
              {i.label}
            </Button>
          ))}
        </div>

        {/* Cards do total da loja */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Meta do mês", value: config.fmt(totalLoja?.meta ?? 0) },
            { label: "Realizado", value: config.fmt(totalLoja?.realizado ?? 0) },
            {
              label: "Atingimento",
              value: totalLoja && totalLoja.meta > 0 ? `${fmtPct(pct(totalLoja.realizado, totalLoja.meta))}` : "—",
            },
            {
              label: `Espelho ${MESES[mes]}/${ano - 1}`,
              value: config.fmt(totalLoja?.espelho ?? 0),
            },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-xl font-bold">{c.value}</p>
            </div>
          ))}
        </div>

        {grafico.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">{config.label} por departamento</h2>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={grafico} margin={{ top: 20, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="dept" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => config.fmt(Number(v))} />
                <Legend />
                <Bar dataKey="Meta" fill="hsl(var(--primary))">
                  <LabelList dataKey="Meta" position="top" fontSize={10} formatter={(v: number) => config.fmt(Number(v))} />
                </Bar>
                <Bar dataKey="Realizado" fill="#f97316">
                  <LabelList dataKey="Realizado" position="top" fontSize={10} formatter={(v: number) => config.fmt(Number(v))} />
                </Bar>
                <Bar dataKey="Espelho" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Departamento</th>
                <th className="px-3 py-2 text-right">Meta</th>
                <th className="px-3 py-2 text-right">Realizado</th>
                <th className="px-3 py-2 text-right">Atingimento</th>
                <th className="px-3 py-2 text-right">Diferença</th>
                <th className="px-3 py-2 text-right">Espelho {ano - 1}</th>
                <th className="px-3 py-2 text-right">Var. vs espelho</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const at = pct(l.realizado, l.meta);
                const vs = varPct(l.realizado, l.espelho);
                return (
                  <tr key={l.dept} className={`border-t border-border ${l.dept === LOJA ? "font-semibold bg-muted/30" : ""}`}>
                    <td className="px-3 py-2">{l.dept === LOJA ? "TOTAL LOJA" : l.dept}</td>
                    <td className="px-3 py-2 text-right">{l.meta > 0 ? config.fmt(l.meta) : "—"}</td>
                    <td className="px-3 py-2 text-right">{config.fmt(l.realizado)}</td>
                    <td className={`px-3 py-2 text-right ${l.meta > 0 ? (at >= 100 ? "text-emerald-500" : at >= 80 ? "text-blue-500" : "text-red-500") : ""}`}>
                      {l.meta > 0 ? `${fmtPct(at)}` : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right ${l.realizado - l.meta >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {l.meta > 0 ? config.fmt(l.realizado - l.meta) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{config.fmt(l.espelho)}</td>
                    <td className={`px-3 py-2 text-right ${vs >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {l.espelho > 0 ? `${fmtPct(vs)}` : "—"}
                    </td>
                  </tr>
                );
              })}
              {linhas.length === 0 && !carregando && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Sem dados no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ClientLayout>
  );
};

export default MetasRealizado;
