import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ClientLayout from "@/components/ClientLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const ANOS = [2022, 2023, 2024, 2025, 2026];

type Row = { ano: number; mes: number; faturamento: number; lucro: number; volume: number; departamento: string };

const nfInt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const fmtNum = (v: number | null) => (v == null || !isFinite(v) ? "" : nfInt.format(Math.round(v)));
const fmtPct = (v: number | null) =>
  v == null || !isFinite(v) ? "" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const AnaliseAnual = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [anoIni, setAnoIni] = useState(ANOS[0]);
  const [anoFim, setAnoFim] = useState(ANOS[ANOS.length - 1]);
  const [deptos, setDeptos] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !user) { navigate("/login"); return; }
    if (!user) return;
    (async () => {
      const sid = sessionStorage.getItem("selectedStoreId");
      if (sid) {
        const { data } = await supabase.from("stores").select("id, name").eq("id", sid).maybeSingle();
        if (data) { setStoreId(data.id); setStoreName(data.name); return; }
      }
      const { data } = await supabase
        .from("user_store_access").select("stores(id, name)")
        .eq("user_id", user.id).eq("approved", true).limit(1);
      const store = (data?.[0] as any)?.stores;
      if (store) { setStoreId(store.id); setStoreName(store.name); }
    })();
  }, [user, authLoading]);

  const carregar = async (sid: string) => {
    setLoading(true);
    setErro("");
    try {
      const hoje = new Date();
      const fim = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
      const { data, error } = await supabase.functions.invoke("vr-proxy", {
        body: { store_id: sid, relatorio: "dre_periodo", params: { inicio: `${ANOS[0]}-01-01`, fim } },
      });
      if (error) throw new Error(error.message);
      if (data?.erro) throw new Error(data.erro);
      const d = data?.dados;
      const lista: any[] = Array.isArray(d) ? d : Array.isArray(d?.dados) ? d.dados : [];
      const mapeado: Row[] = lista
        .map((r) => {
          const ref = String(r.mes ?? r.competencia ?? "");
          const [a, m] = ref.split("-");
          return {
            ano: Number(a),
            mes: Number(m),
            faturamento: Number(r.receita_bruta ?? r.faturamento ?? 0),
            lucro: Number(r.lucro_bruto ?? r.lucro ?? 0),
            volume: Number(r.volume ?? 0),
            departamento: String(r.departamento ?? r.department ?? r.secao ?? r.nivel1 ?? "TOTAL").toUpperCase(),
          };
        })
        .filter((r) => r.ano && r.mes);
      if (mapeado.length) {
        setRows(mapeado);
      } else {
        throw new Error("sem dados no periodo");
      }
    } catch (e: any) {
      // fallback: histórico gravado no banco
      const { data } = await supabase
        .from("analise_anual").select("ano, mes, faturamento, lucro, volume").eq("store_id", sid);
      const salvos: Row[] = ((data as any[]) || []).map(r => ({
        ano: r.ano, mes: r.mes,
        faturamento: Number(r.faturamento), lucro: Number(r.lucro), volume: Number(r.volume),
        departamento: "TOTAL",
      }));
      setRows(salvos);
      if (!salvos.length) setErro(e?.message || "Não foi possível obter os dados da loja.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (storeId) carregar(storeId);
  }, [storeId]);

  // ---- filtros ----
  const departamentos = useMemo(
    () => Array.from(new Set(rows.map(r => r.departamento).filter(Boolean))).sort(),
    [rows],
  );
  const anosDisponiveis = useMemo(() => {
    const a = Array.from(new Set(rows.map(r => r.ano))).sort((x, y) => x - y);
    return a.length ? a : ANOS;
  }, [rows]);

  const anosSel = useMemo(
    () => anosDisponiveis.filter(a => a >= anoIni && a <= anoFim),
    [anosDisponiveis, anoIni, anoFim],
  );

  const rowsFiltradas = useMemo(
    () => rows.filter(r => (deptos.length === 0 ? true : deptos.includes(r.departamento))),
    [rows, deptos],
  );

  const val = (ano: number, mes: number, campo: "faturamento" | "lucro" | "volume") =>
    rowsFiltradas
      .filter(x => x.ano === ano && x.mes === mes)
      .reduce((s, x) => s + Number(x[campo] || 0), 0);

  const blocos = useMemo(() => {
    const build = (campo: "faturamento" | "lucro" | "volume") =>
      anosSel.map(ano => ({ ano, meses: MESES.map((_, i) => val(ano, i + 1, campo)) }));
    return { faturamento: build("faturamento"), lucro: build("lucro"), volume: build("volume") };
  }, [rowsFiltradas, anosSel]);

  // Último mês com dado no ano mais recente selecionado (para acumulados comparáveis)
  const mesCorte = useMemo(() => {
    const ultimo = anosSel[anosSel.length - 1];
    const m = rowsFiltradas.filter(r => r.ano === ultimo && r.faturamento > 0).map(r => r.mes);
    return m.length ? Math.max(...m) : 12;
  }, [rowsFiltradas, anosSel]);

  const soma = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
  const acum = (arr: number[]) => soma(arr.slice(0, mesCorte));

  const varPct = (atual: number, ant: number) => (ant ? ((atual - ant) / ant) * 100 : null);

  const renderBloco = (
    titulo: string,
    matriz: { ano: number; meses: number[] }[],
    tipo: "valor" | "margem",
  ) => {
    const totalDe = (linha: { meses: number[] }) => soma(linha.meses);
    const acumDe = (linha: { meses: number[] }) => acum(linha.meses);
    const l = (ano: number) =>
      matriz.find(m => m.ano === ano) ?? { ano, meses: MESES.map(() => 0) };

    const linhasComp = tipo === "valor"
      ? matriz
          .slice(1)
          .map(m => ({
            label: `YTD ${String(m.ano).slice(2)} x ${String(m.ano - 1).slice(2)}`,
            a: m.ano,
            b: m.ano - 1,
          }))
          .filter(c => matriz.some(m => m.ano === c.b))
      : [];

    return (
      <div className="min-w-[1100px]">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-muted/60 text-muted-foreground">
              <th className="text-left px-2 py-1.5 border border-border w-[150px]">{titulo}</th>
              <th className="text-left px-2 py-1.5 border border-border w-[110px]">ANO</th>
              {MESES.map(m => <th key={m} className="text-right px-2 py-1.5 border border-border">{m}</th>)}
              <th className="text-right px-2 py-1.5 border border-border font-semibold">TOTAL</th>
              <th className="text-right px-2 py-1.5 border border-border font-semibold">TOTAL ACUM.</th>
            </tr>
          </thead>
          <tbody>
            {matriz.map((linha, idx) => (
              <tr key={linha.ano} className="hover:bg-muted/30">
                {idx === 0 && (
                  <td rowSpan={matriz.length + linhasComp.length + 1}
                      className="px-2 py-1.5 border border-border font-semibold align-middle bg-muted/40">
                    {titulo}
                  </td>
                )}
                <td className="px-2 py-1.5 border border-border font-medium">{linha.ano}</td>
                {linha.meses.map((v, i) => (
                  <td key={i} className="px-2 py-1.5 border border-border text-right tabular-nums">
                    {tipo === "margem"
                      ? fmtPct(v || null)
                      : (v ? fmtNum(v) : "")}
                  </td>
                ))}
                <td className="px-2 py-1.5 border border-border text-right font-semibold tabular-nums">
                  {tipo === "margem"
                    ? fmtPct(linha.meses.filter(Boolean).length ? soma(linha.meses) / linha.meses.filter(Boolean).length : null)
                    : fmtNum(totalDe(linha))}
                </td>
                <td className="px-2 py-1.5 border border-border text-right font-semibold tabular-nums bg-muted/30">
                  {tipo === "margem"
                    ? fmtPct(linha.meses.slice(0, mesCorte).filter(Boolean).length
                        ? soma(linha.meses.slice(0, mesCorte)) / linha.meses.slice(0, mesCorte).filter(Boolean).length
                        : null)
                    : fmtNum(acumDe(linha))}
                </td>
              </tr>
            ))}

            {linhasComp.map(({ label, a, b }) => (
              <tr key={label} className="bg-muted/20">
                <td className="px-2 py-1.5 border border-border text-muted-foreground">{label}</td>
                {MESES.map((_, i) => {
                  const v = varPct(l(a).meses[i], l(b).meses[i]);
                  return (
                    <td key={i} className={`px-2 py-1.5 border border-border text-right tabular-nums ${v != null && v < 0 ? "text-destructive" : ""}`}>
                      {l(a).meses[i] && l(b).meses[i] ? fmtPct(v) : ""}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 border border-border text-right tabular-nums font-medium">
                  {fmtPct(varPct(soma(l(a).meses), soma(l(b).meses)))}
                </td>
                <td className="px-2 py-1.5 border border-border text-right tabular-nums font-medium bg-muted/30">
                  {fmtPct(varPct(acum(l(a).meses), acum(l(b).meses)))}
                </td>
              </tr>
            ))}

            <tr className="bg-muted/20">
              <td className="px-2 py-1.5 border border-border text-muted-foreground">Mês Atual x Anterior</td>
              {MESES.map((_, i) => {
                const ultima = [...matriz].reverse().find(m => m.meses.some(Boolean)) ?? matriz[matriz.length - 1];
                const serie = ultima?.meses ?? MESES.map(() => 0);
                const atual = serie[i];
                const ant = i === 0 ? 0 : serie[i - 1];
                const v = varPct(atual, ant);
                return (
                  <td key={i} className={`px-2 py-1.5 border border-border text-right tabular-nums ${v != null && v < 0 ? "text-destructive" : ""}`}>
                    {atual && ant ? fmtPct(v) : ""}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 border border-border" />
              <td className="px-2 py-1.5 border border-border bg-muted/30" />
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const margemMatriz = useMemo(() =>
    anosSel.map(ano => ({
      ano,
      meses: MESES.map((_, i) => {
        const f = val(ano, i + 1, "faturamento");
        const lu = val(ano, i + 1, "lucro");
        return f ? (lu / f) * 100 : 0;
      }),
    })), [rowsFiltradas, anosSel]);

  return (
    <ClientLayout storeName={storeName}>
      <div className="container mx-auto px-4 py-6 max-w-[1600px]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-7 h-7 text-primary" />
            <div className="flex-1">
              <h1 className="font-display text-2xl font-bold">
                Análise Anual <span className="text-gradient-gold">{storeName}</span>
              </h1>
              <p className="text-muted-foreground font-body text-xs">
                Faturamento, lucro, margem e volume de {ANOS[0]} a {ANOS[ANOS.length - 1]} — dados da loja logada
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={loading || !storeId} onClick={() => storeId && carregar(storeId)}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </motion.div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando dados da loja...</p>
        ) : rows.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">
            {erro || "Sem dados disponíveis para esta loja."}
          </CardContent></Card>

        ) : (
          <div className="space-y-6">
            <Card><CardContent className="p-0 overflow-x-auto">{renderBloco("FATURAMENTO", blocos.faturamento, "valor")}</CardContent></Card>
            <Card><CardContent className="p-0 overflow-x-auto">{renderBloco("LUCRO", blocos.lucro, "valor")}</CardContent></Card>
            <Card><CardContent className="p-0 overflow-x-auto">{renderBloco("MARGEM", margemMatriz, "margem")}</CardContent></Card>
            <Card><CardContent className="p-0 overflow-x-auto">{renderBloco("VOLUME", blocos.volume, "valor")}</CardContent></Card>
          </div>
        )}
      </div>
    </ClientLayout>
  );
};

export default AnaliseAnual;
