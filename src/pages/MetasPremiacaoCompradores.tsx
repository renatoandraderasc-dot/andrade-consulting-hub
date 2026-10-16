import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingBag, RefreshCw, Save, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { carregarLojaLogin } from "@/lib/lojasPermitidas";
import ClientLayout from "@/components/ClientLayout";
import BotaoFotoTela from "@/components/BotaoFotoTela";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CartProgressOverlay } from "@/components/CartProgress";
import { useVrRealizado, LOJA, canonDept } from "@/hooks/useVrRealizado";
import { fmtBRL, fmtPct, MESES, diasNoMes } from "@/lib/metasSugestao";
import { chamarRelatorio, pick as col, num } from "@/lib/vrReport";
import { toast } from "@/hooks/use-toast";
import {
  calcularComprador, lerComprador, COMPRADOR_PADRAO, type ValoresComprador, type DadosComprador,
} from "@/lib/premiacaoComprador";

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const CAMPOS: { k: keyof ValoresComprador; label: string }[] = [
  { k: "valor_premiacao", label: "Valor da premiação (R$)" },
  { k: "peso_faturamento", label: "Faturamento (%)" },
  { k: "peso_arrecadacao", label: "Arrecadação (%)" },
  { k: "peso_compras", label: "Compras x Vendas (%)" },
  { k: "peso_pagamentos", label: "Pagamentos a Fornecedores (%)" },
  { k: "atingimento_minimo", label: "Ating. mínimo (%)" },
];

const MetasPremiacaoCompradores = () => {
  const { user, isAdmin, isGlobalAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [ano, setAno] = useState(Number(hojeSP.slice(0, 4)));
  const [mes, setMes] = useState(Number(hojeSP.slice(5, 7)));
  const [cfg, setCfg] = useState<ValoresComprador>(COMPRADOR_PADRAO);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [extra, setExtra] = useState({ metaVendas: 0, metaLucro: 0, metaCompra: 0, compra: 0, pagamentos: 0 });

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
    if (user && isAdmin) {
      carregarLojaLogin(user.id, isGlobalAdmin).then((data) => {
        if (!data?.length) return;
        const sid = sessionStorage.getItem("selectedStoreId");
        const p = data.find((s) => s.id === sid) || data[0];
        setStoreId(p.id); setStoreName(p.name);
      });
    }
  }, [user, isAdmin, isGlobalAdmin, authLoading]);

  const inicio = iso(ano, mes, 1);
  const fim = iso(ano, mes, diasNoMes(ano, mes));
  const atual = useVrRealizado(storeId, inicio, fim);

  useEffect(() => {
    if (!storeId) return;
    supabase.from("premiacao_config").select("comprador").eq("store_id", storeId).maybeSingle()
      .then(({ data }) => setCfg(lerComprador((data as any)?.comprador)));
  }, [storeId]);

  const carregar = async () => {
    if (!storeId) return;
    setCarregando(true);
    try {
      // Metas de venda/lucro da loja
      const porDep: Record<string, { v: number; l: number }> = {};
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from("store_daily_metrics")
          .select("department, meta_vendas, meta_lucro").eq("store_id", storeId)
          .gte("date", inicio).lte("date", fim).range(from, from + 999);
        if (!data?.length) break;
        for (const r of data) {
          const d = canonDept(r.department || "OUTROS") || "OUTROS";
          const t = porDep[d] ?? (porDep[d] = { v: 0, l: 0 });
          t.v += Number(r.meta_vendas) || 0; t.l += Number(r.meta_lucro) || 0;
        }
        if (data.length < 1000) break;
      }
      const cons = porDep[LOJA] ?? porDep["GERAL"];
      let metaVendas = 0, metaLucro = 0;
      if (cons && cons.v > 0) { metaVendas = cons.v; metaLucro = cons.l; }
      else for (const [k, t] of Object.entries(porDep)) {
        if (k === LOJA || k === "GERAL") continue;
        metaVendas += t.v; metaLucro += t.l;
      }

      // Meta de compra do mês
      const { data: cm } = await supabase.from("compras_meta").select("departamento, meta_compra")
        .eq("store_id", storeId).eq("ano", ano).eq("mes", mes);
      const metaCompra = (cm ?? []).filter((r) => !["LOJA", "GERAL"].includes(String(r.departamento).toUpperCase()))
        .reduce((s, r) => s + (Number(r.meta_compra) || 0), 0);

      // Compras realizadas
      const r = await chamarRelatorio(storeId, "compras_vendas_periodo", { inicio, fim });
      const compra = (r.dados ?? []).reduce((s: number, l: any) => s + num(col(l, "compra", "compras", "total_compra", "valor_comprado")), 0);

      // Pagamentos a fornecedores (lançamentos "Compra do Mês")
      let pagamentos = 0;
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from("lancamentos").select("valor")
          .eq("store_id", storeId).eq("tipo", "Compra do Mês")
          .gte("data", inicio).lte("data", fim).range(from, from + 999);
        if (!data?.length) break;
        pagamentos += data.reduce((s, x) => s + Math.abs(Number(x.valor) || 0), 0);
        if (data.length < 1000) break;
      }
      setExtra({ metaVendas, metaLucro, metaCompra, compra, pagamentos });
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [storeId, inicio, fim]);

  const real = useMemo(() => {
    let vendas = 0, lucro = 0;
    for (const d of atual.data?.[LOJA] ?? []) { vendas += d.vendas; lucro += d.lucro; }
    return { vendas, lucro };
  }, [atual.data]);

  const dados: DadosComprador = { ...extra, ...real, cmv: Math.max(0, real.vendas - real.lucro) };
  const res = calcularComprador(cfg, dados);
  const soma = cfg.peso_faturamento + cfg.peso_arrecadacao + cfg.peso_compras + cfg.peso_pagamentos;

  const detalhe: Record<string, string> = {
    faturamento: `${fmtBRL(dados.vendas)} de ${fmtBRL(dados.metaVendas)}`,
    arrecadacao: `${fmtBRL(dados.lucro)} de ${fmtBRL(dados.metaLucro)}`,
    compras: `Comprado ${fmtBRL(dados.compra)} · teto ${fmtBRL(dados.metaCompra)}`,
    pagamentos: `Pago ${fmtBRL(dados.pagamentos)} · CMV ${fmtBRL(dados.cmv)}`,
  };

  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase.from("premiacao_config")
      .upsert({ store_id: storeId, comprador: cfg } as any, { onConflict: "store_id" });
    setSalvando(false);
    toast(error ? { title: "Não foi possível salvar", description: error.message, variant: "destructive" } : { title: "Parametrização salva" });
  };

  return (
    <ClientLayout>
      {(carregando || atual.loading) && <CartProgressOverlay label="Carregando premiação dos compradores..." />}
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShoppingBag className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Pagamento de Compradores</h1>
              <p className="text-sm text-muted-foreground">Premiação da loja toda por Faturamento, Arrecadação, Compras x Vendas e Pagamentos</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-10 items-center rounded-md border border-border bg-secondary px-3 text-sm font-medium">{storeName}</div>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{MESES.slice(1).map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{[ano - 2, ano - 1, ano, ano + 1].map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => { atual.refresh(); carregar(); }}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
            <BotaoFotoTela alvoId="print-premiacao-compradores" nome={`Premiacao-Compradores-${MESES[mes]}-${ano}`} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">Parametrização — {storeName}</h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {CAMPOS.map((f) => (
              <label key={f.k} className="space-y-1 text-xs text-muted-foreground">
                <span>{f.label}</span>
                <Input type="number" step={f.k === "valor_premiacao" ? "0.01" : "1"} value={cfg[f.k]}
                  onChange={(e) => setCfg({ ...cfg, [f.k]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={salvar} disabled={salvando || !storeId}><Save className="h-4 w-4 mr-1" /> Salvar</Button>
            <span className={`text-xs ${soma === 100 ? "text-muted-foreground" : "text-destructive"}`}>Soma dos pesos: {fmtPct(soma)}</span>
          </div>
        </div>

        <div id="print-premiacao-compradores" className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h2 className="font-display text-lg font-bold">{storeName} — {MESES[mes]}/{ano}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {res.kpis.map((k) => (
              <div key={k.key} className="rounded-lg border border-border bg-background p-4 text-center">
                <p className="text-sm font-bold uppercase">{k.label}</p>
                <p className={`my-2 text-4xl font-black ${k.pago ? "text-success" : "text-danger"}`}>
                  {k.valido ? fmtPct(k.atingimento, 2) : "—"}
                </p>
                <p className={`flex items-center justify-center gap-1 text-sm font-bold ${k.pago ? "text-success" : "text-danger"}`}>
                  {k.pago ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {k.pago ? "Atingido" : k.valido ? "Não atingido" : "Sem meta"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{detalhe[k.key]}</p>
                <p className="mt-1 text-xs font-semibold">Peso {fmtPct(k.peso || 0)} · paga {fmtPct(k.pago ? k.peso || 0 : 0)}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 rounded-lg bg-secondary p-4 text-center sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">Percentual atingido</p>
              <p className="text-3xl font-black text-primary">{fmtPct(res.pctPago)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">Valor da premiação</p>
              <p className="text-3xl font-black text-primary">{fmtBRL(res.valorPago)}</p>
              <p className="text-xs text-muted-foreground">de {fmtBRL(cfg.valor_premiacao)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Regra: menos de {cfg.atingimento_minimo || 99}% é não atingido. Compras x Vendas é atingido comprando até a meta de compra;
            Pagamentos a Fornecedores é atingido pagando até o valor do CMV.
          </p>
        </div>
      </div>
    </ClientLayout>
  );
};

export default MetasPremiacaoCompradores;
