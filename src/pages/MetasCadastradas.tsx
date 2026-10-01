import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { carregarLojaLogin } from "@/lib/lojasPermitidas";
import ClientLayout from "@/components/ClientLayout";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDepartamentosPermitidos } from "@/hooks/useDepartamentosPermitidos";
import { fmtBRL, fmtNum, fmtPct, MESES, diasNoMes } from "@/lib/metasSugestao";

interface LinhaMeta {
  dept: string;
  dias: number;
  vendas: number;
  lucro: number;
  margemPct: number; // lucro/vendas
  volume: number;
  mix: number;
}

interface LinhaCompra {
  departamento: string;
  meta_venda: number;
  meta_compra: number;
  cmv_pct: number;
  parcela_excesso: number;
}

const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const MetasCadastradas = () => {
  const { user, isAdmin, isGlobalAdmin, loading: authLoading } = useAuth();
  const { permiteDept } = useDepartamentosPermitidos();
  const navigate = useNavigate();

  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");

  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [ano, setAno] = useState(Number(hojeSP.slice(0, 4)));
  const [mes, setMes] = useState(Number(hojeSP.slice(5, 7)));

  const [linhas, setLinhas] = useState<LinhaMeta[]>([]);
  const [compras, setCompras] = useState<LinhaCompra[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
    if (user && isAdmin) {
      carregarLojaLogin(user.id, isGlobalAdmin).then((data) => {
        if (!data?.length) return;
        const sid = sessionStorage.getItem("selectedStoreId");
        const p = data.find((s) => s.id === sid) || data[0];
        setStoreId(p.id);
        setStoreName(p.name);
      });
    }
  }, [user, isAdmin, isGlobalAdmin, authLoading]);

  const inicio = iso(ano, mes, 1);
  const fim = iso(ano, mes, diasNoMes(ano, mes));

  const carregar = async () => {
    if (!storeId) return;
    setCarregando(true);
    try {
      const acc = new Map<string, LinhaMeta>();
      let from = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("store_daily_metrics")
          .select("department, meta_vendas, meta_lucro, meta_volume, meta_mix, dia_ativo")
          .eq("store_id", storeId)
          .gte("date", inicio)
          .lte("date", fim)
          .range(from, from + 999);
        if (error) throw error;
        if (!data?.length) break;
        for (const r of data) {
          const d = (r.department || "").toUpperCase().trim();
          if (!d || d === "OUTROS" || !permiteDept(d)) continue;
          const cur = acc.get(d) || { dept: d, dias: 0, vendas: 0, lucro: 0, margemPct: 0, volume: 0, mix: 0 };
          cur.dias += r.dia_ativo === false ? 0 : 1;
          cur.vendas += Number(r.meta_vendas) || 0;
          cur.lucro += Number(r.meta_lucro) || 0;
          cur.volume += Number(r.meta_volume) || 0;
          cur.mix += Number(r.meta_mix) || 0;
          acc.set(d, cur);
        }
        if (data.length < 1000) break;
        from += 1000;
      }
      const ordenado = [...acc.values()]
        .map((l) => ({ ...l, margemPct: l.vendas > 0 ? (l.lucro / l.vendas) * 100 : 0 }))
        .sort((a, b) => b.vendas - a.vendas);
      setLinhas(ordenado);

      const { data: cm } = await supabase
        .from("compras_meta")
        .select("departamento, meta_venda, meta_compra, cmv_pct, parcela_excesso")
        .eq("store_id", storeId)
        .eq("ano", ano)
        .eq("mes", mes);
      setCompras(
        (cm || [])
          .filter((c: any) => permiteDept(String(c.departamento || "").toUpperCase()))
          .map((c: any) => ({
            departamento: String(c.departamento || "").toUpperCase(),
            meta_venda: Number(c.meta_venda) || 0,
            meta_compra: Number(c.meta_compra) || 0,
            cmv_pct: Number(c.cmv_pct) || 0,
            parcela_excesso: Number(c.parcela_excesso) || 0,
          }))
          .sort((a, b) => b.meta_compra - a.meta_compra),
      );
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [storeId, inicio, fim]);

  const totais = useMemo(
    () => linhas.reduce(
      (a, l) => ({
        vendas: a.vendas + l.vendas,
        lucro: a.lucro + l.lucro,
        volume: a.volume + l.volume,
        mix: a.mix + l.mix,
      }),
      { vendas: 0, lucro: 0, volume: 0, mix: 0 },
    ),
    [linhas],
  );

  const totalCompra = useMemo(
    () => compras.reduce((a, c) => a + c.meta_compra, 0),
    [compras],
  );

  const anos = useMemo(() => {
    const atual = Number(hojeSP.slice(0, 4));
    return [atual - 1, atual, atual + 1];
  }, []);

  return (
    <ClientLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-primary" />
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">Metas Cadastradas</h1>
              <p className="font-body text-sm text-muted-foreground">
                {storeName ? `Loja: ${storeName}` : "Carregando loja..."} · somente leitura
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anos.map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={carregar}
              disabled={carregando}
              className="flex items-center gap-2 border border-border bg-card px-3 py-2 rounded-xl font-body font-semibold text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 overflow-x-auto">
          <h2 className="font-display font-bold text-foreground mb-4">Metas de venda por departamento</h2>
          {linhas.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground">
              {carregando ? "Carregando..." : "Nenhuma meta cadastrada para este mês."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-body text-xs uppercase">
                  <th className="text-left py-3 pr-2">Departamento</th>
                  <th className="text-right py-3 px-2">Dias</th>
                  <th className="text-right py-3 px-2">Faturamento</th>
                  <th className="text-right py-3 px-2">Lucro</th>
                  <th className="text-right py-3 px-2">Margem</th>
                  <th className="text-right py-3 px-2">Volume</th>
                  <th className="text-right py-3 pl-2">Mix</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.dept} className="border-b border-border/50">
                    <td className="py-2.5 pr-2 font-body font-medium text-foreground">{l.dept}</td>
                    <td className="py-2.5 px-2 text-right font-body">{l.dias}</td>
                    <td className="py-2.5 px-2 text-right font-body">{fmtBRL(l.vendas)}</td>
                    <td className="py-2.5 px-2 text-right font-body">{fmtBRL(l.lucro)}</td>
                    <td className="py-2.5 px-2 text-right font-body">{fmtPct(l.margemPct)}</td>
                    <td className="py-2.5 px-2 text-right font-body">{fmtNum(l.volume)}</td>
                    <td className="py-2.5 pl-2 text-right font-body">{fmtNum(l.mix)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-3 pr-2 font-body">Total</td>
                  <td />
                  <td className="py-3 px-2 text-right font-body">{fmtBRL(totais.vendas)}</td>
                  <td className="py-3 px-2 text-right font-body">{fmtBRL(totais.lucro)}</td>
                  <td className="py-3 px-2 text-right font-body">
                    {fmtPct(totais.vendas > 0 ? (totais.lucro / totais.vendas) * 100 : 0)}
                  </td>
                  <td className="py-3 px-2 text-right font-body">{fmtNum(totais.volume)}</td>
                  <td className="py-3 pl-2 text-right font-body">{fmtNum(totais.mix)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 overflow-x-auto">
          <h2 className="font-display font-bold text-foreground mb-4">Metas de compra por departamento</h2>
          {compras.length === 0 ? (
            <p className="font-body text-sm text-muted-foreground">
              {carregando ? "Carregando..." : "Nenhuma meta de compra cadastrada para este mês."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-body text-xs uppercase">
                  <th className="text-left py-3 pr-2">Departamento</th>
                  <th className="text-right py-3 px-2">Meta de venda</th>
                  <th className="text-right py-3 px-2">CMV</th>
                  <th className="text-right py-3 px-2">Parcela excesso</th>
                  <th className="text-right py-3 pl-2">Meta de compra</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => (
                  <tr key={c.departamento} className="border-b border-border/50">
                    <td className="py-2.5 pr-2 font-body font-medium text-foreground">{c.departamento}</td>
                    <td className="py-2.5 px-2 text-right font-body">{fmtBRL(c.meta_venda)}</td>
                    <td className="py-2.5 px-2 text-right font-body">{fmtPct(c.cmv_pct * 100)}</td>
                    <td className="py-2.5 px-2 text-right font-body">{fmtBRL(c.parcela_excesso)}</td>
                    <td className="py-2.5 pl-2 text-right font-body font-semibold">{fmtBRL(c.meta_compra)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-3 pr-2 font-body">Total</td>
                  <td colSpan={3} />
                  <td className="py-3 pl-2 text-right font-body">{fmtBRL(totalCompra)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ClientLayout>
  );
};

export default MetasCadastradas;
