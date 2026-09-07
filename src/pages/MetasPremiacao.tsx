import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, RefreshCw, Save, Settings2, CheckCircle2, XCircle, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CartProgressOverlay } from "@/components/CartProgress";
import { useVrRealizado, LOJA } from "@/hooks/useVrRealizado";
import { fmtBRL, fmtPct, MESES, diasNoMes } from "@/lib/metasSugestao";
import { toast } from "@/hooks/use-toast";
import logo from "@/assets/andrade-logo.png";

interface Store { id: string; name: string }

interface Config {
  valor_premiacao: number;
  peso_faturamento: number;
  peso_arrecadacao: number;
  peso_volume: number;
  peso_mix: number;
  atingimento_minimo: number;
  foto_cabecalho: string | null;
  foto_rodape: string | null;
  foto_faturamento: string | null;
  foto_arrecadacao: string | null;
  foto_volume: string | null;
  foto_mix: string | null;
  mostrar_valores: boolean;
}

const PADRAO: Config = {
  valor_premiacao: 0,
  peso_faturamento: 25,
  peso_arrecadacao: 40,
  peso_volume: 20,
  peso_mix: 15,
  atingimento_minimo: 99,
  foto_cabecalho: null,
  foto_rodape: null,
  foto_faturamento: null,
  foto_arrecadacao: null,
  foto_volume: null,
  foto_mix: null,
  mostrar_valores: true,
};

type FotoKey = "foto_cabecalho" | "foto_rodape" | "foto_faturamento" | "foto_arrecadacao" | "foto_volume" | "foto_mix";

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

  const [cfg, setCfg] = useState<Config>(PADRAO);
  const [salvando, setSalvando] = useState(false);
  const [mostrarParam, setMostrarParam] = useState(false);

  const [metas, setMetas] = useState({ vendas: 0, lucro: 0, volume: 0, mix: 0 });
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

  // Parametrizacao da loja
  useEffect(() => {
    if (!storeId) return;
    supabase.from("premiacao_config").select("*").eq("store_id", storeId).maybeSingle()
      .then(({ data }) => {
        setCfg(data ? {
          valor_premiacao: Number(data.valor_premiacao) || 0,
          peso_faturamento: Number(data.peso_faturamento) || 0,
          peso_arrecadacao: Number(data.peso_arrecadacao) || 0,
          peso_volume: Number(data.peso_volume) || 0,
          peso_mix: Number(data.peso_mix) || 0,
          atingimento_minimo: Number(data.atingimento_minimo) || 99,
        } : PADRAO);
      });
  }, [storeId]);

  const salvarConfig = async () => {
    if (!storeId) return;
    setSalvando(true);
    const { error } = await supabase.from("premiacao_config")
      .upsert({ store_id: storeId, ...cfg }, { onConflict: "store_id" });
    setSalvando(false);
    toast(error
      ? { title: "Não foi possível salvar", description: error.message, variant: "destructive" }
      : { title: "Parametrização salva" });
  };

  // Metas gravadas do mes (soma da loja)
  const carregarMetas = async () => {
    if (!storeId) return;
    setCarregandoMetas(true);
    const acc = { vendas: 0, lucro: 0, volume: 0, mix: 0 };
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
      }
      if (data.length < 1000) break;
      from += 1000;
    }
    setMetas(acc);
    setCarregandoMetas(false);
  };

  useEffect(() => { carregarMetas(); }, [storeId, inicio, fim]);

  const realizado = useMemo(() => {
    const t = { vendas: 0, lucro: 0, volume: 0, mix: 0 };
    for (const d of atual.data?.[LOJA] ?? []) {
      t.vendas += d.vendas; t.lucro += d.lucro; t.volume += d.volume; t.mix += d.mix;
    }
    return t;
  }, [atual.data]);

  const kpis = useMemo(() => {
    const min = cfg.atingimento_minimo || 99;
    const base: { key: KpiKey; label: string; sub?: string; meta: number; real: number; peso: number }[] = [
      { key: "faturamento", label: "FATURAMENTO", meta: metas.vendas, real: realizado.vendas, peso: cfg.peso_faturamento },
      { key: "arrecadacao", label: "MARGEM", sub: "(ARRECADAÇÃO)", meta: metas.lucro, real: realizado.lucro, peso: cfg.peso_arrecadacao },
      { key: "volume", label: "VOLUME", meta: metas.volume, real: realizado.volume, peso: cfg.peso_volume },
      { key: "mix", label: "MIX", meta: metas.mix, real: realizado.mix, peso: cfg.peso_mix },
    ];
    const calc = base.map((k) => ({ ...k, atingimento: pct(k.real, k.meta), atingiu: k.meta > 0 && pct(k.real, k.meta) >= min }));
    const gatilho = calc.some((k) => (k.key === "faturamento" || k.key === "arrecadacao") && k.atingiu);
    return calc.map((k) => ({
      ...k,
      pago: k.key === "volume" || k.key === "mix" ? k.atingiu && gatilho : k.atingiu,
      bloqueado: (k.key === "volume" || k.key === "mix") && k.atingiu && !gatilho,
    }));
  }, [metas, realizado, cfg]);

  const pesoTotal = kpis.reduce((s, k) => s + (k.peso || 0), 0);
  const pctPago = kpis.reduce((s, k) => s + (k.pago ? k.peso || 0 : 0), 0);
  const valorPago = (cfg.valor_premiacao * pctPago) / 100;
  const todas = kpis.length > 0 && kpis.every((k) => k.pago);
  const carregando = atual.loading || carregandoMetas;

  return (
    <ClientLayout>
      {carregando && <CartProgressOverlay label="Carregando demonstrativo..." />}
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Award className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Demonstrativo de Pagamento de Metas</h1>
              <p className="text-sm text-muted-foreground">
                Apuração por indicador, gatilhos e valor da premiação da loja
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
            <Button variant="outline" size="sm" onClick={() => setMostrarParam((v) => !v)}>
              <Settings2 className="h-4 w-4 mr-1" /> Parametrização
            </Button>
          </div>
        </div>

        {mostrarParam && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <h2 className="text-sm font-semibold">Parametrização — {storeName}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {[
                { k: "valor_premiacao" as const, label: "Valor da premiação (R$)" },
                { k: "peso_faturamento" as const, label: "Faturamento (%)" },
                { k: "peso_arrecadacao" as const, label: "Arrecadação (%)" },
                { k: "peso_volume" as const, label: "Volume (%)" },
                { k: "peso_mix" as const, label: "Mix (%)" },
                { k: "atingimento_minimo" as const, label: "Atingimento mínimo (%)" },
              ].map((f) => (
                <div key={f.k} className="space-y-1">
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    type="number"
                    value={cfg[f.k]}
                    onChange={(e) => setCfg({ ...cfg, [f.k]: Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={salvarConfig} disabled={salvando}>
                <Save className="h-4 w-4 mr-1" /> Salvar
              </Button>
              <span className={`text-xs ${pesoTotal === 100 ? "text-muted-foreground" : "text-amber-500"}`}>
                Soma das ponderações: {fmtPct(pesoTotal)}
              </span>
            </div>
          </div>
        )}

        {/* Demonstrativo — layout de cartaz */}
        <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          <div className="flex items-center gap-4 bg-background p-5">
            <img src={logo} alt="Andrade Assessoria Comercial" className="h-16 w-auto" />
            <div className="ml-auto text-right">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Competência</p>
              <p className="text-lg font-bold">{MESES[mes - 1]}/{ano}</p>
            </div>
          </div>

          <div className="bg-foreground px-5 py-4">
            <div className="flex items-center justify-center gap-4 rounded-xl border-2 border-primary px-4 py-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Award className="h-6 w-6" />
              </span>
              <span className="text-3xl font-extrabold uppercase tracking-wide text-background">
                {storeName || "LOJA"}
              </span>
            </div>
          </div>

          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {kpis.map((k) => (
              <div key={k.key} className="rounded-xl border border-border bg-muted/30 p-4 text-center">
                <p className="text-lg font-extrabold uppercase">{k.label}</p>
                {k.sub && <p className="text-xs font-bold uppercase text-muted-foreground">{k.sub}</p>}
                <div className="my-3 h-px bg-border" />
                <p className={`text-4xl font-extrabold ${k.pago ? "text-emerald-600" : "text-red-600"}`}>
                  {k.meta > 0 ? fmtPct(k.atingimento, 2) : "—"}
                </p>
                <p className={`mt-2 flex items-center justify-center gap-2 text-sm font-bold uppercase ${k.pago ? "text-emerald-600" : "text-red-600"}`}>
                  {k.pago ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {k.pago ? "Atingido" : k.bloqueado ? "Sem gatilho" : "Não atingido"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Peso {fmtPct(k.peso)} · {k.pago ? fmtBRL((cfg.valor_premiacao * (k.peso || 0)) / 100) : fmtBRL(0)}
                </p>
              </div>
            ))}
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

          <div className="m-5 flex items-center justify-center gap-6 rounded-xl bg-foreground px-5 py-4">
            <Gift className="h-9 w-9 text-background" />
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-wide text-background">Valor premiação</p>
              <p className="text-4xl font-extrabold text-primary">{fmtBRL(valorPago)}</p>
              {valorPago < cfg.valor_premiacao && (
                <p className="text-xs text-background/70">de {fmtBRL(cfg.valor_premiacao)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Detalhamento */}
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Indicador</th>
                <th className="px-3 py-2 text-right">Meta</th>
                <th className="px-3 py-2 text-right">Realizado</th>
                <th className="px-3 py-2 text-right">Atingimento</th>
                <th className="px-3 py-2 text-right">Peso</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-left">Situação</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => {
                const money = k.key === "faturamento" || k.key === "arrecadacao";
                const f = (n: number) => (money ? fmtBRL(n) : n.toLocaleString("pt-BR"));
                return (
                  <tr key={k.key} className="border-t border-border">
                    <td className="px-3 py-2">{k.label}{k.sub ? ` ${k.sub}` : ""}</td>
                    <td className="px-3 py-2 text-right">{k.meta > 0 ? f(k.meta) : "—"}</td>
                    <td className="px-3 py-2 text-right">{f(k.real)}</td>
                    <td className={`px-3 py-2 text-right ${k.atingiu ? "text-emerald-500" : "text-red-500"}`}>
                      {k.meta > 0 ? fmtPct(k.atingimento, 2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtPct(k.peso)}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(k.pago ? (cfg.valor_premiacao * (k.peso || 0)) / 100 : 0)}</td>
                    <td className="px-3 py-2">
                      {k.pago ? "Pago" : k.bloqueado ? "Bloqueado (sem gatilho)" : "Não pago"}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-muted/30 font-semibold">
                <td className="px-3 py-2">TOTAL</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right">{fmtPct(pctPago)}</td>
                <td className="px-3 py-2 text-right">{fmtPct(pesoTotal)}</td>
                <td className="px-3 py-2 text-right">{fmtBRL(valorPago)}</td>
                <td className="px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ClientLayout>
  );
};

export default MetasPremiacao;
