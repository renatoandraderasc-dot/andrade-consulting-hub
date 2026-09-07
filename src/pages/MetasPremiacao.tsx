import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, RefreshCw, Settings2, CheckCircle2, XCircle, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CartProgressOverlay } from "@/components/CartProgress";
import { useVrRealizado, LOJA } from "@/hooks/useVrRealizado";
import { fmtBRL, fmtPct, MESES, diasNoMes } from "@/lib/metasSugestao";
import {
  carregarPremiacaoConfig, PREMIACAO_PADRAO, type PremiacaoConfig, type FotoKey,
} from "@/pages/MetasPremiacaoConfig";
import logo from "@/assets/andrade-logo.png";

interface Store { id: string; name: string }

type KpiKey = "faturamento" | "arrecadacao" | "volume" | "mix";

const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

const MetasPremiacao = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");

  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [ano, setAno] = useState(Number(hojeSP.slice(0, 4)));
  const [mes, setMes] = useState(Number(hojeSP.slice(5, 7)));

  const [cfg, setCfg] = useState<PremiacaoConfig>(PREMIACAO_PADRAO);
  const [metas, setMetas] = useState({ vendas: 0, lucro: 0, volume: 0, mix: 0 });
  const [metasDep, setMetasDep] = useState<Record<string, { vendas: number; lucro: number; volume: number; mix: number }>>({});
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

  const atual = useVrRealizado(storeId, inicio, fim);

  useEffect(() => {
    if (!storeId) return;
    carregarPremiacaoConfig(storeId).then(setCfg);
  }, [storeId]);

  const carregarMetas = async () => {
    if (!storeId) return;
    setCarregandoMetas(true);
    const acc = { vendas: 0, lucro: 0, volume: 0, mix: 0 };
    const porDep: Record<string, { vendas: number; lucro: number; volume: number; mix: number }> = {};
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
        acc.vendas += Number(r.meta_vendas) || 0;
        acc.lucro += Number(r.meta_lucro) || 0;
        acc.volume += Number(r.meta_volume) || 0;
        acc.mix += Number(r.meta_mix) || 0;
        const dep = (r.department || "OUTROS").toUpperCase();
        const d = porDep[dep] ?? (porDep[dep] = { vendas: 0, lucro: 0, volume: 0, mix: 0 });
        d.vendas += Number(r.meta_vendas) || 0;
        d.lucro += Number(r.meta_lucro) || 0;
        d.volume += Number(r.meta_volume) || 0;
        d.mix += Number(r.meta_mix) || 0;
      }
      if (data.length < 1000) break;
      from += 1000;
    }
    setMetas(acc);
    setMetasDep(porDep);
    setCarregandoMetas(false);
  };

  useEffect(() => { carregarMetas(); }, [storeId, inicio, fim]);

  const realizadoDep = useMemo(() => {
    const out: Record<string, { vendas: number; lucro: number; volume: number; mix: number }> = {};
    for (const k of Object.keys(atual.data ?? {})) {
      const key = k === LOJA ? LOJA : k.toUpperCase();
      const t = out[key] ?? (out[key] = { vendas: 0, lucro: 0, volume: 0, mix: 0 });
      for (const d of atual.data![k]) {
        t.vendas += d.vendas; t.lucro += d.lucro; t.volume += d.volume; t.mix += d.mix;
      }
    }
    return out;
  }, [atual.data]);

  const departamentosDisponiveis = useMemo(() => {
    const nomes = new Set<string>();
    Object.keys(metasDep).forEach((d) => nomes.add(d));
    Object.keys(realizadoDep).forEach((d) => { if (d !== LOJA) nomes.add(d); });
    return Array.from(nomes).sort();
  }, [metasDep, realizadoDep]);

  const metasSel = dep === LOJA ? metas : (metasDep[dep] ?? { vendas: 0, lucro: 0, volume: 0, mix: 0 });
  const realizado = realizadoDep[dep] ?? { vendas: 0, lucro: 0, volume: 0, mix: 0 };

  const kpis = useMemo(() => {
    const min = cfg.atingimento_minimo || 99;
    const base: { key: KpiKey; label: string; sub?: string; meta: number; real: number; peso: number }[] = [
      { key: "faturamento", label: "FATURAMENTO", meta: metasSel.vendas, real: realizado.vendas, peso: cfg.peso_faturamento },
      { key: "arrecadacao", label: "MARGEM", sub: "(ARRECADAÇÃO)", meta: metasSel.lucro, real: realizado.lucro, peso: cfg.peso_arrecadacao },
      { key: "volume", label: "VOLUME", meta: metasSel.volume, real: realizado.volume, peso: cfg.peso_volume },
      { key: "mix", label: "MIX", meta: metasSel.mix, real: realizado.mix, peso: cfg.peso_mix },
    ];
    const calc = base.map((k) => ({ ...k, atingimento: pct(k.real, k.meta), atingiu: k.meta > 0 && pct(k.real, k.meta) >= min }));
    const gatilho = calc.some((k) => (k.key === "faturamento" || k.key === "arrecadacao") && k.atingiu);
    return calc.map((k) => ({
      ...k,
      pago: k.key === "volume" || k.key === "mix" ? k.atingiu && gatilho : k.atingiu,
      bloqueado: (k.key === "volume" || k.key === "mix") && k.atingiu && !gatilho,
    }));
  }, [metasSel, realizado, cfg]);

  const fotoTopo = dep === LOJA ? cfg.foto_cabecalho : (cfg.fotos_departamentos?.[dep] || cfg.foto_cabecalho);
  const titulo = dep === LOJA ? (storeName || "LOJA") : dep;


  const pctPago = kpis.reduce((s, k) => s + (k.pago ? k.peso || 0 : 0), 0);
  const valorPago = (cfg.valor_premiacao * pctPago) / 100;
  const todas = kpis.length > 0 && kpis.every((k) => k.pago);
  const carregando = atual.loading || carregandoMetas;

  return (
    <ClientLayout>
      {carregando && <CartProgressOverlay label="Carregando demonstrativo..." />}
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <Award className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Demonstrativo de Pagamento de Metas</h1>
              <p className="text-sm text-muted-foreground">Layout pronto para enviar ao time</p>
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
                {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
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
            <Button variant="outline" size="sm" onClick={() => { atual.refresh(); carregarMetas(); }}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/metas/premiacao/config")}>
              <Settings2 className="h-4 w-4 mr-1" /> Parametrização
            </Button>
          </div>
        </div>

        {/* Demonstrativo — layout de cartaz */}
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="relative overflow-hidden">
            {cfg.foto_cabecalho ? (
              <img src={cfg.foto_cabecalho} alt="Cabeçalho" className="h-48 w-full object-cover" />
            ) : (
              <div className="h-48 w-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/70 to-foreground/20" />
            <div className="absolute inset-0 flex flex-col justify-between p-5">
              <div className="flex items-start justify-between gap-4">
                <span className="rounded-xl bg-background/90 px-3 py-2 shadow">
                  <img src={logo} alt="Andrade Assessoria Comercial" className="h-10 w-auto" />
                </span>
                <div className="rounded-xl bg-background/90 px-3 py-2 text-right shadow">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Competência</p>
                  <p className="text-sm font-bold">{MESES[mes - 1]}/{ano}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                  <Award className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-primary">
                    Demonstrativo de premiação
                  </p>
                  <p className="text-2xl font-extrabold uppercase leading-tight tracking-wide text-background sm:text-3xl">
                    {storeName || "LOJA"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {kpis.map((k) => {
              const foto = cfg[`foto_${k.key}` as FotoKey];
              const money = k.key === "faturamento" || k.key === "arrecadacao";
              const f = (n: number) => (money ? fmtBRL(n) : Math.round(n).toLocaleString("pt-BR"));
              return (
                <div
                  key={k.key}
                  className={`overflow-hidden rounded-2xl border-2 bg-card text-center shadow-sm transition ${
                    k.pago ? "border-emerald-600/60" : "border-border"
                  }`}
                >
                  <div className="relative h-24 w-full">
                    {foto ? (
                      <img src={foto} alt={k.label} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-muted to-muted/40" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 to-foreground/20" />
                    <div className="absolute inset-x-0 bottom-2">
                      <p className="text-base font-extrabold uppercase text-background">{k.label}</p>
                      {k.sub && <p className="text-[10px] font-bold uppercase text-background/70">{k.sub}</p>}
                    </div>
                  </div>
                  <div className="p-4">
                    <p className={`text-4xl font-extrabold ${k.pago ? "text-emerald-600" : "text-red-600"}`}>
                      {k.meta > 0 ? fmtPct(k.atingimento, 2) : "—"}
                    </p>
                    {cfg.mostrar_valores && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {k.meta > 0 ? `${f(k.real)} de ${f(k.meta)}` : "Meta não cadastrada"}
                      </p>
                    )}
                    <p className={`mt-2 flex items-center justify-center gap-2 text-sm font-bold uppercase ${k.pago ? "text-emerald-600" : "text-red-600"}`}>
                      {k.pago ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                      {k.pago ? "Atingido" : k.bloqueado ? "Sem gatilho" : "Não atingido"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Peso {fmtPct(k.peso)}
                      {cfg.mostrar_valores
                        ? ` · ${fmtBRL(k.pago ? (cfg.valor_premiacao * (k.peso || 0)) / 100 : 0)}`
                        : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5">
            <div className={`rounded-xl border-2 p-3 text-center ${todas ? "border-emerald-600 text-emerald-600" : "border-border text-muted-foreground"}`}>
              <p className="text-base font-extrabold uppercase">
                {todas ? "Todas as metas atingidas!" : `${fmtPct(pctPago)} da premiação liberada`}
              </p>
              <p className="text-xs font-semibold uppercase">
                {todas ? "Parabéns à equipe pelo excelente resultado!" : "Volume e Mix só são pagos com Faturamento e/ou Arrecadação atingidos"}
              </p>
            </div>
          </div>




          <div className="relative m-5 overflow-hidden rounded-2xl">
            {cfg.foto_rodape ? (
              <img src={cfg.foto_rodape} alt="Rodapé" className="h-40 w-full object-cover" />
            ) : (
              <div className="h-40 w-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent" />
            )}
            <div className="absolute inset-0 bg-foreground/80" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-5 text-center">
              <Gift className="h-8 w-8 text-primary" />
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-background/80">Valor premiação</p>
              {cfg.mostrar_valores ? (
                <>
                  <p className="text-4xl font-extrabold text-primary">{fmtBRL(valorPago)}</p>
                  {valorPago < cfg.valor_premiacao && (
                    <p className="text-xs text-background/70">de {fmtBRL(cfg.valor_premiacao)}</p>
                  )}
                </>
              ) : (
                <p className="text-4xl font-extrabold text-primary">{fmtPct(pctPago)}</p>
              )}
              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-background/60">
                Andrade Assessoria Comercial
              </p>
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
};

export default MetasPremiacao;
