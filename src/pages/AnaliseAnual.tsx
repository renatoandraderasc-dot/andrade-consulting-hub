import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio, pick, num } from "@/lib/vrReport";
import ClientLayout from "@/components/ClientLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, RefreshCw, ChevronsUpDown } from "lucide-react";
import { motion } from "framer-motion";

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const ANOS = [2022, 2023, 2024, 2025, 2026];

type Turno = "manha" | "tarde" | "";

type Row = {
  ano: number; mes: number; faturamento: number; lucro: number; volume: number;
  departamento: string; secao: string; categoria: string; turno: Turno;
};

/** Extrai o turno (manhã 00:00–12:59:59 / tarde 13:00–23:59:59) de qualquer coluna de hora. */
const extrairTurno = (l: any): Turno => {
  const bruto = String(
    pick(l, "hora", "horario", "hora_venda", "data_hora", "datahora", "emissao", "data") ?? "",
  );
  const m = bruto.match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = Number(m[1]);
  if (!isFinite(h)) return "";
  return h < 13 ? "manha" : "tarde";
};

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
  const [cats, setCats] = useState<string[]>([]);

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
    const hoje0 = new Date();
    const fim = `${hoje0.getFullYear()}-${String(hoje0.getMonth() + 1).padStart(2, "0")}-${String(hoje0.getDate()).padStart(2, "0")}`;
    try {
      // 1) DRE mensal (quando o conector publica)
      const r = await chamarRelatorio(sid, "dre_periodo", { inicio: `${ANOS[0]}-01-01`, fim });
      const aviso = avisoRelatorio(r);
      if (aviso) throw new Error(aviso);
      const mapeado: Row[] = r.dados
        .map((l) => {
          const ref = String(pick(l, "mes", "competencia", "data") ?? "");
          const [a, m] = ref.split("-");
          const dep = String(pick(l, "departamento", "department", "secao", "nivel1") ?? "TOTAL").toUpperCase();
          return {
            ano: Number(a),
            mes: Number(m),
            faturamento: num(pick(l, "receita_bruta", "faturamento", "total_vendido")),
            lucro: num(pick(l, "lucro_bruto", "lucro")),
            volume: num(pick(l, "volume", "quantidade", "qtde")),
            departamento: dep,
            secao: String(pick(l, "secao", "nivel1") ?? dep).toUpperCase(),
            categoria: String(pick(l, "categoria", "nivel2") ?? dep).toUpperCase(),
          };
        })
        .filter((x) => x.ano && x.mes);
      if (!mapeado.length) throw new Error("sem dados no periodo");
      setRows(mapeado);
    } catch (e: any) {
      // 2) fallback ao vivo: vendas por seção/dia (ano a ano, em paralelo)
      try {
        const anosBusca: number[] = [];
        for (let a = ANOS[0]; a <= hoje0.getFullYear(); a++) anosBusca.push(a);
        const partes = await Promise.all(
          anosBusca.map((a) =>
            chamarRelatorio(sid, "vendas_secao_periodo", {
              inicio: `${a}-01-01`,
              fim: a === hoje0.getFullYear() ? fim : `${a}-12-31`,
            }),
          ),
        );
        const acc = new Map<string, Row>();
        for (const p of partes) {
          for (const l of p.dados) {
            const dia = String(pick(l, "dia", "data") ?? "");
            const ano = Number(dia.slice(0, 4));
            const mes = Number(dia.slice(5, 7));
            if (!ano || !mes) continue;
            const secao = String(pick(l, "secao", "departamento", "nivel1") ?? "TOTAL").toUpperCase();
            const categoria = String(pick(l, "categoria", "nivel2") ?? secao).toUpperCase();
            const k = `${ano}-${mes}-${secao}-${categoria}`;
            const cur = acc.get(k) ?? {
              ano, mes, faturamento: 0, lucro: 0, volume: 0,
              departamento: secao, secao, categoria,
            };
            cur.faturamento += num(pick(l, "total_vendido", "faturamento", "venda"));
            cur.lucro += num(pick(l, "lucro", "lucro_bruto"));
            cur.volume += num(pick(l, "volume", "quantidade", "qtde"));
            acc.set(k, cur);
          }
        }
        const vivos = Array.from(acc.values());
        if (vivos.length) {
          setRows(vivos);
          return;
        }
        throw new Error("sem dados");
      } catch {
        // 3) fallback: histórico gravado no banco
        const { data } = await supabase
          .from("analise_anual").select("ano, mes, faturamento, lucro, volume").eq("store_id", sid);
        const salvos: Row[] = ((data as any[]) || []).map(r => ({
          ano: r.ano, mes: r.mes,
          faturamento: Number(r.faturamento), lucro: Number(r.lucro), volume: Number(r.volume),
          departamento: "TOTAL", secao: "TOTAL", categoria: "TOTAL",
        }));
        setRows(salvos);
        if (!salvos.length) setErro(e?.message || "Não foi possível obter os dados da loja.");
      }
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
  const categorias = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter(r => (deptos.length === 0 ? true : deptos.includes(r.departamento)))
            .map(r => r.categoria)
            .filter(Boolean),
        ),
      ).sort(),
    [rows, deptos],
  );
  const anosDisponiveis = useMemo(() => {
    const a = Array.from(new Set(rows.map(r => r.ano))).sort((x, y) => x - y);
    return a.length ? a : ANOS;
  }, [rows]);

  const anosSel = useMemo(
    () => anosDisponiveis.filter(a => a >= anoIni && a <= anoFim),
    [anosDisponiveis, anoIni, anoFim],
  );

  // Mês vigente (e futuros) são sempre excluídos da análise
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

  const rowsFiltradas = useMemo(
    () =>
      rows
        .filter(r => r.ano < anoAtual || (r.ano === anoAtual && r.mes < mesAtual))
        .filter(r => (deptos.length === 0 ? true : deptos.includes(r.departamento)))
        .filter(r => (cats.length === 0 ? true : cats.includes(r.categoria))),
    [rows, deptos, cats, anoAtual, mesAtual],
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
                Faturamento, lucro, margem e volume de {anoIni} a {anoFim} — dados da loja logada
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={loading || !storeId} onClick={() => storeId && carregar(storeId)}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </motion.div>

        <Card className="mb-6">
          <CardContent className="p-4 flex flex-wrap items-end gap-4">
            <div className="flex items-end gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Período de</label>
                <Select value={String(anoIni)} onValueChange={(v) => setAnoIni(Number(v))}>
                  <SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">até</label>
                <Select value={String(anoFim)} onValueChange={(v) => setAnoFim(Number(v))}>
                  <SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {anosDisponiveis.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex-1 min-w-[260px]">
              <label className="text-[11px] text-muted-foreground block mb-1">
                Departamentos / Seções {deptos.length ? `(${deptos.length})` : "(todos)"}
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 w-full justify-between font-normal">
                    <span className="truncate">
                      {deptos.length === 0 ? "Todos os departamentos" : deptos.join(", ")}
                    </span>
                    <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[280px] p-0">
                  <div className="max-h-[280px] overflow-y-auto p-2 space-y-1">
                    <button
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                      onClick={() => setDeptos([])}
                    >
                      Todos os departamentos
                    </button>
                    {departamentos.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-1.5">Nenhum departamento disponível</p>
                    )}
                    {departamentos.map(d => (
                      <label key={d} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                        <Checkbox
                          checked={deptos.includes(d)}
                          onCheckedChange={() =>
                            setDeptos(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
                          }
                        />
                        <span className="text-xs">{d}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex-1 min-w-[260px]">
              <label className="text-[11px] text-muted-foreground block mb-1">
                Categorias {cats.length ? `(${cats.length})` : "(todas)"}
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 w-full justify-between font-normal">
                    <span className="truncate">
                      {cats.length === 0 ? "Todas as categorias" : cats.join(", ")}
                    </span>
                    <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[280px] p-0">
                  <div className="max-h-[280px] overflow-y-auto p-2 space-y-1">
                    <button
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted"
                      onClick={() => setCats([])}
                    >
                      Todas as categorias
                    </button>
                    {categorias.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-1.5">Nenhuma categoria disponível</p>
                    )}
                    {categorias.map(c => (
                      <label key={c} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                        <Checkbox
                          checked={cats.includes(c)}
                          onCheckedChange={() =>
                            setCats(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
                          }
                        />
                        <span className="text-xs">{c}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>



          </CardContent>
        </Card>


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
