import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, RefreshCw, Wallet, Receipt, Truck, Percent, ShoppingCart, PiggyBank, TrendingUp,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import KpiCard, { KpiTone } from "@/components/dashboard-financeiro/KpiCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { chamarRelatorio, num, pick } from "@/lib/vrReport";
import { formatBRL } from "@/lib/formatters";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const TIPOS_PAGAMENTO = ["Despesas", "CMV", "Compra do Mês", "Impostos", "Pagamentos"];
const TIPOS_FORNECEDOR = ["CMV", "Compra do Mês"];

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

const monthRange = (ano: number, mes: number) => {
  const ultimo = new Date(ano, mes, 0).getDate();
  const mm = String(mes).padStart(2, "0");
  return { inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimo).padStart(2, "0")}`, dias: ultimo };
};

const variacao = (atual: number, anterior: number) =>
  anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;

const ctxVariacao = (v: number | null) =>
  v == null ? "Sem base no mês anterior" : `${pct(Math.abs(v))} vs mês anterior`;

interface LancRow { data: string; tipo: string; subtipo: string; valor: number }

const DashboardFinanceiro = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const hoje = new Date();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const carregado = useRef(false);

  const [lanc, setLanc] = useState<LancRow[]>([]);
  const [lancAnt, setLancAnt] = useState<LancRow[]>([]);
  const [comprado, setComprado] = useState(0);
  const [compradoAnt, setCompradoAnt] = useState(0);
  const [vendido, setVendido] = useState(0);
  const [metaCompra, setMetaCompra] = useState(0);
  const [recebido, setRecebido] = useState<number | null>(null);
  const [recebidoAnt, setRecebidoAnt] = useState(0);
  const [recebDia, setRecebDia] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
    if (user) carregarLoja();
  }, [user, authLoading]);

  const carregarLoja = async () => {
    const sid = sessionStorage.getItem("selectedStoreId");
    if (sid) {
      const { data } = await supabase.from("stores").select("id, name").eq("id", sid).maybeSingle();
      if (data) { setStoreId(data.id); setStoreName(data.name); return; }
    }
    const { data } = await supabase
      .from("user_store_access").select("stores(id, name)")
      .eq("user_id", user!.id).eq("approved", true).limit(1);
    const store = (data?.[0] as any)?.stores;
    if (store) { setStoreId(store.id); setStoreName(store.name); }
  };

  const somaLanc = useCallback(async (a: number, m: number): Promise<LancRow[]> => {
    const { inicio, fim } = monthRange(a, m);
    const { data } = await supabase
      .from("lancamentos")
      .select("data, tipo, subtipo, valor")
      .eq("store_id", storeId)
      .eq("status", "ativo")
      .gte("data", inicio)
      .lte("data", fim);
    return ((data as any[]) || []).map((r) => ({
      data: String(r.data), tipo: String(r.tipo ?? ""), subtipo: String(r.subtipo ?? ""), valor: Number(r.valor) || 0,
    }));
  }, [storeId]);

  const carregar = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const mesAnt = mes === 1 ? 12 : mes - 1;
    const anoAnt = mes === 1 ? ano - 1 : ano;
    const atual = monthRange(ano, mes);
    const anterior = monthRange(anoAnt, mesAnt);

    try {
      const [l, la, meta, cv, cvAnt, vs, rec, recAnt] = await Promise.all([
        somaLanc(ano, mes),
        somaLanc(anoAnt, mesAnt),
        supabase.from("compras_meta").select("meta_compra").eq("store_id", storeId).eq("ano", ano).eq("mes", mes),
        chamarRelatorio(storeId, "compras_vendas_periodo", { inicio: atual.inicio, fim: atual.fim }),
        chamarRelatorio(storeId, "compras_vendas_periodo", { inicio: anterior.inicio, fim: anterior.fim }),
        chamarRelatorio(storeId, "vendas_secao_periodo", { inicio: atual.inicio, fim: atual.fim }),
        chamarRelatorio(storeId, "receber_periodo", { inicio: atual.inicio, fim: atual.fim }),
        chamarRelatorio(storeId, "receber_periodo", { inicio: anterior.inicio, fim: anterior.fim }),
      ]);

      setLanc(l);
      setLancAnt(la);
      setMetaCompra(((meta.data as any[]) || []).reduce((s, r) => s + (Number(r.meta_compra) || 0), 0));

      const somaCompra = (r: any) =>
        (r.dados || []).reduce((s: number, x: any) => s + num(pick(x, "valor_compra", "total_compra", "compra")), 0);
      setComprado(somaCompra(cv));
      setCompradoAnt(somaCompra(cvAnt));

      setVendido((vs.dados || []).reduce((s: number, x: any) =>
        s + num(pick(x, "total_vendido", "venda", "vendas", "faturamento")), 0));

      const somaReceb = (r: any) =>
        (r.dados || []).reduce((s: number, x: any) => s + num(pick(x, "valor_recebido", "valor", "total_recebido")), 0);

      if (rec.dados.length === 0 && (rec.indisponivel || rec.offline || rec.erro)) {
        setRecebido(null);
        setRecebDia({});
      } else {
        setRecebido(somaReceb(rec));
        const acc: Record<string, number> = {};
        for (const x of rec.dados || []) {
          const d = String(pick(x, "data", "data_recebimento", "data_pagamento", "dia") ?? "").slice(0, 10);
          if (d) acc[d] = (acc[d] || 0) + num(pick(x, "valor_recebido", "valor", "total_recebido"));
        }
        setRecebDia(acc);
      }
      setRecebidoAnt(somaReceb(recAnt));
    } finally {
      setLoading(false);
    }
  }, [storeId, mes, ano, somaLanc]);

  // Regra do Hub: 1 fetch na primeira carga; depois só pelo botão Atualizar.
  useEffect(() => {
    if (!storeId) return;
    if (carregado.current && tick === 0) return;
    carregado.current = true;
    carregar();
  }, [storeId, tick]);

  const soma = (rows: LancRow[], tipos: string[]) =>
    rows.filter((r) => tipos.includes(r.tipo)).reduce((s, r) => s + Math.abs(r.valor), 0);

  const pagamentos = soma(lanc, TIPOS_PAGAMENTO);
  const pagamentosAnt = soma(lancAnt, TIPOS_PAGAMENTO);
  const despesas = soma(lanc, ["Despesas"]);
  const despesasAnt = soma(lancAnt, ["Despesas"]);
  const fornecedores = soma(lanc, TIPOS_FORNECEDOR);
  const fornecedoresAnt = soma(lancAnt, TIPOS_FORNECEDOR);

  const topSubconta = useMemo(() => {
    const acc = new Map<string, number>();
    for (const r of lanc.filter((x) => x.tipo === "Despesas")) {
      acc.set(r.subtipo || "Sem conta", (acc.get(r.subtipo || "Sem conta") || 0) + Math.abs(r.valor));
    }
    return [...acc.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [lanc]);

  const comprasVendasPct = vendido > 0 ? (comprado / vendido) * 100 : 0;
  const limitePct = metaCompra > 0 ? (comprado / metaCompra) * 100 : 0;
  const saldoLimite = metaCompra - comprado;

  const projecao = useMemo(() => {
    const { dias } = monthRange(ano, mes);
    const agora = new Date();
    const mesmoMes = agora.getFullYear() === ano && agora.getMonth() + 1 === mes;
    const diaAtual = mesmoMes ? Math.min(agora.getDate(), dias) : dias;
    const restantes = dias - diaAtual;

    const fat = soma(lanc, ["Faturamento", "Vendas"]);
    const cmv = soma(lanc, TIPOS_FORNECEDOR);
    const desp = soma(lanc, ["Despesas"]);
    const imp = soma(lanc, ["Impostos"]);
    const run = (x: number) => (diaAtual > 0 ? x + (x / diaAtual) * restantes : x);

    const projFat = run(fat);
    const lucro = projFat - run(cmv) - run(desp) - run(imp);
    const realizado = fat - cmv - desp - imp;
    return { fechado: restantes === 0, lucro, margem: projFat > 0 ? (lucro / projFat) * 100 : 0, realizado };
  }, [lanc, ano, mes]);

  const porCategoria = useMemo(() => {
    const acc = new Map<string, number>();
    for (const r of lanc.filter((x) => TIPOS_PAGAMENTO.includes(x.tipo))) {
      acc.set(r.tipo, (acc.get(r.tipo) || 0) + Math.abs(r.valor));
    }
    return [...acc.entries()].map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor);
  }, [lanc]);

  const evolucaoDiaria = useMemo(() => {
    const { dias } = monthRange(ano, mes);
    const pagDia: Record<string, number> = {};
    for (const r of lanc.filter((x) => TIPOS_PAGAMENTO.includes(x.tipo))) {
      const d = r.data.slice(0, 10);
      pagDia[d] = (pagDia[d] || 0) + Math.abs(r.valor);
    }
    return Array.from({ length: dias }, (_, i) => {
      const dia = String(i + 1).padStart(2, "0");
      const iso = `${ano}-${String(mes).padStart(2, "0")}-${dia}`;
      return { dia, pagamentos: pagDia[iso] || 0, recebimentos: recebDia[iso] || 0 };
    });
  }, [lanc, recebDia, ano, mes]);

  const toneFaixa = (v: number, bom: number, medio: number): KpiTone =>
    v <= bom ? "good" : v <= medio ? "warn" : "bad";

  const anos = [hoje.getFullYear(), hoje.getFullYear() - 1, hoje.getFullYear() - 2];

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <ClientLayout storeName={storeName}>
      <div className="container mx-auto px-6 py-6 max-w-[1400px]">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary text-primary flex items-center justify-center border border-border">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold leading-tight">Dashboard Financeiro</h1>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {storeName} · {MESES[mes - 1]}/{ano}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                <SelectTrigger className="w-[100px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => { setTick((t) => t + 1); carregar(); }} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <KpiCard
            loading={loading} icon={<Wallet className="w-4 h-4" />} title="Pagamentos do mês"
            value={formatBRL(pagamentos)}
            trend={variacao(pagamentos, pagamentosAnt)}
            context={ctxVariacao(variacao(pagamentos, pagamentosAnt))}
            tone={(variacao(pagamentos, pagamentosAnt) ?? 0) > 0 ? "bad" : "good"}
          />
          <KpiCard
            loading={loading} icon={<Receipt className="w-4 h-4" />} title="Despesas"
            value={formatBRL(despesas)}
            trend={variacao(despesas, despesasAnt)}
            context={`${ctxVariacao(variacao(despesas, despesasAnt))}${topSubconta ? ` · Maior: ${topSubconta[0]} (${formatBRL(topSubconta[1])})` : ""}`}
            tone={(variacao(despesas, despesasAnt) ?? 0) > 0 ? "bad" : "good"}
          />
          <KpiCard
            loading={loading} icon={<Truck className="w-4 h-4" />} title="Pagamentos a fornecedores"
            value={formatBRL(fornecedores)}
            trend={variacao(fornecedores, fornecedoresAnt)}
            context={ctxVariacao(variacao(fornecedores, fornecedoresAnt))}
            tone={(variacao(fornecedores, fornecedoresAnt) ?? 0) > 0 ? "warn" : "good"}
          />
          <KpiCard
            loading={loading} icon={<Percent className="w-4 h-4" />} title="Compras x Vendas"
            value={vendido > 0 ? pct(comprasVendasPct) : "—"}
            context={`Comprado ${formatBRL(comprado)} · Vendido ${formatBRL(vendido)}`}
            tone={vendido > 0 ? toneFaixa(comprasVendasPct, 70, 85) : "neutral"}
          />
          <KpiCard
            loading={loading} icon={<ShoppingCart className="w-4 h-4" />} title="Limite de compras"
            value={metaCompra > 0 ? pct(limitePct) : "—"}
            context={
              metaCompra > 0
                ? `${formatBRL(comprado)} de ${formatBRL(metaCompra)} · ${saldoLimite >= 0 ? `Saldo ${formatBRL(saldoLimite)}` : `Excedeu em ${formatBRL(Math.abs(saldoLimite))}`}`
                : "Sem meta de compra cadastrada no mês"
            }
            tone={metaCompra > 0 ? toneFaixa(limitePct, 85, 100) : "neutral"}
          />
          <KpiCard
            loading={loading} icon={<PiggyBank className="w-4 h-4" />} title="Recebimento do mês"
            value={recebido == null ? "—" : formatBRL(recebido)}
            trend={recebido == null ? null : variacao(recebido, recebidoAnt)}
            context={recebido == null ? "Relatório não disponível para esta loja" : ctxVariacao(variacao(recebido, recebidoAnt))}
            tone={recebido == null ? "neutral" : (variacao(recebido, recebidoAnt) ?? 0) >= 0 ? "good" : "warn"}
          />
          <KpiCard
            loading={loading} icon={<TrendingUp className="w-4 h-4" />} title={projecao.fechado ? "Resultado do mês" : "Projeção de resultado"}
            value={`${projecao.fechado ? "Realizado: " : "Projeção: "}${formatBRL(projecao.lucro)}`}
            context={`Margem ${pct(projecao.margem)} · Realizado até hoje ${formatBRL(projecao.realizado)}`}
            tone={projecao.lucro >= 0 ? "good" : "bad"}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">Pagamentos por categoria</h2>
            {porCategoria.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem lançamentos no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={40 + porCategoria.length * 44}>
                <BarChart data={porCategoria} layout="vertical" margin={{ left: 20, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => formatBRL(v)} fontSize={11} />
                  <YAxis type="category" dataKey="categoria" width={140} fontSize={11} />
                  <Tooltip formatter={(v: number) => formatBRL(v)} />
                  <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4">Evolução diária: recebimentos x pagamentos</h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={evolucaoDiaria}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="dia" fontSize={11} />
                <YAxis tickFormatter={(v) => formatBRL(v)} fontSize={11} width={90} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Legend />
                <Bar name="Recebimentos" dataKey="recebimentos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar name="Pagamentos" dataKey="pagamentos" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
};

export default DashboardFinanceiro;
