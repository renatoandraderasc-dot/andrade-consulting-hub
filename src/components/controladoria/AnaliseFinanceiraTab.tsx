import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio, pick } from "@/lib/vrReport";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  RefreshCw, Search, FileSpreadsheet, AlertTriangle, CalendarClock,
  Wallet, Users, ClipboardCheck, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Props {
  storeId: string;
  storeName?: string;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const dataBr = (s?: string | null) => {
  if (!s) return "-";
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString("pt-BR");
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const hoje = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const numero = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^\d.,-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};

const SITUACOES = ["A negociar", "Programado", "Em negociação", "Contestado", "Renegociado", "Pago"];
const PRIORIDADES = ["Alta", "Media", "Baixa"];

const FAIXAS = [
  { id: "v90", label: "Vencido +90d", min: -99999, max: -91 },
  { id: "v61", label: "Vencido 61-90d", min: -90, max: -61 },
  { id: "v31", label: "Vencido 31-60d", min: -60, max: -31 },
  { id: "v1", label: "Vencido 1-30d", min: -30, max: -1 },
  { id: "hoje", label: "Vence hoje", min: 0, max: 0 },
  { id: "a7", label: "Vence em 7d", min: 1, max: 7 },
  { id: "a15", label: "8 a 15 dias", min: 8, max: 15 },
  { id: "a30", label: "16 a 30 dias", min: 16, max: 30 },
  { id: "a30m", label: "Acima de 30d", min: 31, max: 99999 },
];
const faixaDe = (dias: number) => FAIXAS.find((f) => dias >= f.min && dias <= f.max) ?? FAIXAS[FAIXAS.length - 1];

interface Titulo {
  ref: string;
  vencimento: string;
  fornecedor: string;
  documento: string;
  observacao: string;
  idTipo: number | null;
  classificacao: string;
  valor: number;
  aberto: number;
  dias: number;
  faixa: string;
}

/** Data de pagamento do titulo (vazio = nao pago). */
const dataPagamentoDe = (r: any) => {
  const v = pick(
    r,
    "data_pagamento", "dt_pagamento", "datapagamento", "dtpagamento",
    "data_baixa", "dt_baixa", "databaixa", "pagamento", "data_pgto", "dt_pgto",
  );
  const s = String(v ?? "").trim();
  if (!s || /^(0000-00-00|null|-|00\/00\/0000)$/i.test(s)) return "";
  return s.slice(0, 10);
};

/** Valor liquido do titulo (com fallback para o valor bruto). */
const valorLiquidoDe = (r: any) => {
  const liq = pick(r, "valor_liquido", "vlr_liquido", "valorliquido", "vl_liquido", "liquido");
  const n = numero(liq);
  if (n) return n;
  return numero(pick(r, "valor", "valor_titulo", "vlr_titulo", "valor_bruto"));
};


interface Plano {
  titulo_ref: string;
  situacao: string;
  data_prevista: string | null;
  categoria: string | null;
  responsavel: string | null;
  prioridade: string;
  observacao: string | null;
}

export const AnaliseFinanceiraTab = ({ storeId, storeName }: Props) => {
  const { user } = useAuth();
  const anoAtual = new Date().getFullYear();
  const [inicio, setInicio] = useState(`${anoAtual - 1}-01-01`);
  const [fim, setFim] = useState(iso(new Date(anoAtual + 1, 11, 31)));
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [planos, setPlanos] = useState<Record<string, Plano>>({});

  // filtros
  const [busca, setBusca] = useState("");
  const [fClass, setFClass] = useState("todas");
  const [fSituacao, setFSituacao] = useState("todas");
  const [fFaixa, setFFaixa] = useState("todas");
  const [fStatus, setFStatus] = useState("todos");
  const [fFornecedor, setFFornecedor] = useState("todos");
  const [valorMin, setValorMin] = useState("");

  // dialog de planejamento
  const [edit, setEdit] = useState<Titulo | null>(null);
  const [form, setForm] = useState<Plano | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregarPlanos = useCallback(async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("titulo_planejamento")
      .select("titulo_ref, situacao, data_prevista, categoria, responsavel, prioridade, observacao")
      .eq("store_id", storeId);
    const map: Record<string, Plano> = {};
    (data ?? []).forEach((p: any) => { map[p.titulo_ref] = p as Plano; });
    setPlanos(map);
  }, [storeId]);

  const carregar = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setAviso(null);

    const [cap, pag, mapRes] = await Promise.all([
      chamarRelatorio(storeId, "contas_a_pagar", { inicio, fim }),
      chamarRelatorio(storeId, "pagamentos_periodo", { inicio, fim }),
      supabase.from("vr_lancamento_map").select("id_tipo, tipo, subtipo, store_id"),
    ]);

    const msg = avisoRelatorio(cap);
    if (msg) {
      setAviso(msg);
      setTitulos([]);
      setLoading(false);
      return;
    }

    // classificacao por id_tipo (especifica da loja tem prioridade)
    const classMap = new Map<number, string>();
    (mapRes.data ?? []).forEach((m: any) => {
      if (m.store_id && m.store_id !== storeId) return;
      const atual = classMap.get(m.id_tipo);
      if (!atual || m.store_id === storeId) {
        classMap.set(m.id_tipo, [m.tipo, m.subtipo].filter(Boolean).join(" · "));
      }
    });

    // pagamentos ja realizados por (fornecedor|documento) — abate FIFO
    const pagos = new Map<string, number>();
    (pag.dados ?? []).forEach((r: any) => {
      const k = `${String(pick(r, "fornecedor") ?? "").trim()}|${String(pick(r, "documento") ?? "").trim()}`;
      pagos.set(k, (pagos.get(k) ?? 0) + numero(pick(r, "valor_pago", "valor")));
    });

    const hj = hoje().getTime();
    const contagem = new Map<string, number>();
    const lista: Titulo[] = [];

    (cap.dados ?? [])
      .slice()
      .sort((a: any, b: any) =>
        String(pick(a, "vencimento") ?? "").localeCompare(String(pick(b, "vencimento") ?? "")))
      .forEach((r: any) => {
        const fornecedor = String(pick(r, "fornecedor") ?? "").trim() || "SEM FORNECEDOR";
        const documento = String(pick(r, "documento") ?? "").trim();
        const vencimento = String(pick(r, "vencimento") ?? "").slice(0, 10);
        const valor = numero(pick(r, "valor", "valor_titulo"));
        const k = `${String(pick(r, "fornecedor") ?? "").trim()}|${documento}`;
        const disponivel = pagos.get(k) ?? 0;
        const abatido = Math.min(disponivel, valor);
        pagos.set(k, disponivel - abatido);
        const aberto = Math.round((valor - abatido) * 100) / 100;
        if (aberto <= 0.005) return;

        const base = `${vencimento}|${documento}|${fornecedor}`;
        const seq = (contagem.get(base) ?? 0) + 1;
        contagem.set(base, seq);

        const idTipoRaw = pick(r, "id_tipo");
        const idTipo = idTipoRaw === undefined || idTipoRaw === null || idTipoRaw === ""
          ? null : Number(idTipoRaw);
        const dias = Math.round(
          (new Date(`${vencimento}T00:00:00`).getTime() - hj) / 86400000,
        );

        lista.push({
          ref: `${base}|${seq}`,
          vencimento,
          fornecedor,
          documento,
          observacao: String(pick(r, "observacao") ?? ""),
          idTipo,
          classificacao: (idTipo !== null && classMap.get(idTipo)) || "Não classificado",
          valor,
          aberto,
          dias,
          faixa: faixaDe(isNaN(dias) ? 0 : dias).id,
        });
      });

    setTitulos(lista);
    setLoading(false);
    await carregarPlanos();
  }, [storeId, inicio, fim, carregarPlanos]);

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [storeId]);

  const fornecedores = useMemo(
    () => Array.from(new Set(titulos.map((t) => t.fornecedor))).sort(),
    [titulos],
  );
  const classificacoes = useMemo(
    () => Array.from(new Set(titulos.map((t) => t.classificacao))).sort(),
    [titulos],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const min = numero(valorMin);
    return titulos.filter((t) => {
      const p = planos[t.ref];
      if (q && !`${t.fornecedor} ${t.documento} ${t.observacao} ${t.classificacao}`.toLowerCase().includes(q))
        return false;
      if (fClass !== "todas" && t.classificacao !== fClass) return false;
      if (fFornecedor !== "todos" && t.fornecedor !== fFornecedor) return false;
      if (fFaixa !== "todas" && t.faixa !== fFaixa) return false;
      if (fStatus === "vencidos" && t.dias >= 0) return false;
      if (fStatus === "avencer" && t.dias < 0) return false;
      if (fSituacao === "sem" && p) return false;
      if (fSituacao !== "todas" && fSituacao !== "sem" && (p?.situacao ?? "") !== fSituacao) return false;
      if (min > 0 && t.aberto < min) return false;
      return true;
    });
  }, [titulos, planos, busca, fClass, fFornecedor, fFaixa, fStatus, fSituacao, valorMin]);

  const kpis = useMemo(() => {
    const total = filtrados.reduce((s, t) => s + t.aberto, 0);
    const vencido = filtrados.filter((t) => t.dias < 0).reduce((s, t) => s + t.aberto, 0);
    const sete = filtrados.filter((t) => t.dias >= 0 && t.dias <= 7).reduce((s, t) => s + t.aberto, 0);
    const trinta = filtrados.filter((t) => t.dias >= 0 && t.dias <= 30).reduce((s, t) => s + t.aberto, 0);
    const planejado = filtrados.filter((t) => planos[t.ref]).reduce((s, t) => s + t.aberto, 0);
    return {
      total, vencido, sete, trinta, planejado,
      qtd: filtrados.length,
      fornecedores: new Set(filtrados.map((t) => t.fornecedor)).size,
      semPlano: filtrados.filter((t) => !planos[t.ref]).length,
    };
  }, [filtrados, planos]);

  const aging = useMemo(
    () => FAIXAS.map((f) => ({
      faixa: f.label,
      id: f.id,
      valor: filtrados.filter((t) => t.faixa === f.id).reduce((s, t) => s + t.aberto, 0),
      titulos: filtrados.filter((t) => t.faixa === f.id).length,
      vencido: f.max < 0,
    })).filter((f) => f.valor > 0),
    [filtrados],
  );

  const topFornecedores = useMemo(() => {
    const m = new Map<string, { valor: number; titulos: number; vencido: number }>();
    filtrados.forEach((t) => {
      const a = m.get(t.fornecedor) ?? { valor: 0, titulos: 0, vencido: 0 };
      a.valor += t.aberto; a.titulos += 1; if (t.dias < 0) a.vencido += t.aberto;
      m.set(t.fornecedor, a);
    });
    return Array.from(m.entries())
      .map(([fornecedor, v]) => ({ fornecedor, ...v }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [filtrados]);

  const porClassificacao = useMemo(() => {
    const m = new Map<string, { valor: number; titulos: number }>();
    filtrados.forEach((t) => {
      const a = m.get(t.classificacao) ?? { valor: 0, titulos: 0 };
      a.valor += t.aberto; a.titulos += 1;
      m.set(t.classificacao, a);
    });
    return Array.from(m.entries())
      .map(([classificacao, v]) => ({ classificacao, ...v }))
      .sort((a, b) => b.valor - a.valor);
  }, [filtrados]);

  const abrirPlano = (t: Titulo) => {
    setEdit(t);
    setForm(planos[t.ref] ?? {
      titulo_ref: t.ref,
      situacao: "A negociar",
      data_prevista: t.dias < 0 ? iso(hoje()) : t.vencimento,
      categoria: t.classificacao === "Não classificado" ? "" : t.classificacao,
      responsavel: "",
      prioridade: t.dias < 0 ? "Alta" : "Media",
      observacao: "",
    });
  };

  const salvarPlano = async () => {
    if (!edit || !form) return;
    setSalvando(true);
    const { error } = await supabase.from("titulo_planejamento").upsert({
      store_id: storeId,
      titulo_ref: edit.ref,
      fornecedor: edit.fornecedor,
      documento: edit.documento,
      vencimento: edit.vencimento || null,
      valor: edit.aberto,
      situacao: form.situacao,
      data_prevista: form.data_prevista || null,
      categoria: form.categoria || null,
      responsavel: form.responsavel || null,
      prioridade: form.prioridade,
      observacao: form.observacao || null,
      updated_by: user?.id ?? null,
    }, { onConflict: "store_id,titulo_ref" });
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Planejamento salvo");
    setEdit(null);
    carregarPlanos();
  };

  const exportar = () => {
    const linhas = filtrados.map((t) => {
      const p = planos[t.ref];
      return {
        Vencimento: dataBr(t.vencimento),
        "Dias p/ vencer": t.dias,
        Status: t.dias < 0 ? "VENCIDO" : "A VENCER",
        Faixa: FAIXAS.find((f) => f.id === t.faixa)?.label ?? "",
        Fornecedor: t.fornecedor,
        Documento: t.documento,
        Classificação: t.classificacao,
        "Valor do título": t.valor,
        "Em aberto": t.aberto,
        Situação: p?.situacao ?? "Sem planejamento",
        Prioridade: p?.prioridade ?? "",
        "Pagamento previsto": p?.data_prevista ? dataBr(p.data_prevista) : "",
        Responsável: p?.responsavel ?? "",
        Categoria: p?.categoria ?? "",
        Observação: p?.observacao ?? t.observacao,
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Títulos em aberto");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(aging.map((a) => ({ Faixa: a.faixa, Títulos: a.titulos, Valor: a.valor }))),
      "Aging",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(topFornecedores.map((f) => ({
        Fornecedor: f.fornecedor, Títulos: f.titulos, "Em aberto": f.valor, Vencido: f.vencido,
      }))),
      "Fornecedores",
    );
    XLSX.writeFile(wb, `analise-financeira-${(storeName ?? "loja").replace(/\s+/g, "-").toLowerCase()}.xlsx`);
  };

  const limparFiltros = () => {
    setBusca(""); setFClass("todas"); setFSituacao("todas");
    setFFaixa("todas"); setFStatus("todos"); setFFornecedor("todos"); setValorMin("");
  };

  return (
    <div className="space-y-5">
      {/* Barra de periodo */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Vencimentos de</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-[150px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">até</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-[150px]" />
          </div>
          <Button onClick={carregar} disabled={loading || !storeId}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Atualizar
          </Button>
          <Button variant="outline" onClick={exportar} disabled={!filtrados.length}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Exportar Excel
          </Button>
          <p className="text-xs text-muted-foreground ml-auto max-w-[420px]">
            Títulos em aberto = contas a pagar do sistema da loja menos os pagamentos já
            registrados no período (inclui pagamentos parciais).
          </p>
        </CardContent>
      </Card>

      {aviso && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-500 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {aviso}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { t: "Total em aberto", v: brl(kpis.total), s: `${kpis.qtd} título(s)`, i: Wallet, c: "text-primary" },
          { t: "Vencido", v: brl(kpis.vencido), s: `${((kpis.vencido / (kpis.total || 1)) * 100).toFixed(1)}% da carteira`, i: AlertTriangle, c: "text-red-500" },
          { t: "Vence em 7 dias", v: brl(kpis.sete), s: "compromisso imediato", i: CalendarClock, c: "text-amber-500" },
          { t: "Próximos 30 dias", v: brl(kpis.trinta), s: "necessidade de caixa", i: CalendarClock, c: "text-sky-500" },
          { t: "Sem planejamento", v: String(kpis.semPlano), s: `${kpis.fornecedores} fornecedor(es)`, i: ClipboardCheck, c: "text-muted-foreground" },
        ].map((k) => (
          <Card key={k.t} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{k.t}</p>
                <k.i className={`h-4 w-4 ${k.c}`} />
              </div>
              <p className={`text-lg font-bold mt-1 ${k.c}`}>{k.v}</p>
              <p className="text-[11px] text-muted-foreground">{k.s}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Graficos */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Aging da carteira (vencidos x a vencer)</CardTitle>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aging} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="faixa" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                  {aging.map((a) => (
                    <Cell key={a.id} fill={a.vencido ? "hsl(var(--destructive))" : "hsl(var(--primary))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Top 10 fornecedores em aberto
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-[260px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Fornecedor</TableHead>
                  <TableHead className="text-xs text-right">Títulos</TableHead>
                  <TableHead className="text-xs text-right">Em aberto</TableHead>
                  <TableHead className="text-xs text-right">Vencido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topFornecedores.map((f) => (
                  <TableRow
                    key={f.fornecedor}
                    className="cursor-pointer"
                    onClick={() => setFFornecedor(f.fornecedor)}
                  >
                    <TableCell className="text-xs">{f.fornecedor}</TableCell>
                    <TableCell className="text-xs text-right">{f.titulos}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{brl(f.valor)}</TableCell>
                    <TableCell className={`text-xs text-right ${f.vencido > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {brl(f.vencido)}
                    </TableCell>
                  </TableRow>
                ))}
                {!topFornecedores.length && (
                  <TableRow><TableCell colSpan={4} className="text-xs text-center text-muted-foreground py-6">Sem títulos em aberto no período.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Classificacao */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Composição por classificação do lançamento</CardTitle>
        </CardHeader>
        <CardContent className="p-0 max-h-[240px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Classificação</TableHead>
                <TableHead className="text-xs text-right">Títulos</TableHead>
                <TableHead className="text-xs text-right">Em aberto</TableHead>
                <TableHead className="text-xs text-right">% da carteira</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porClassificacao.map((c) => (
                <TableRow key={c.classificacao} className="cursor-pointer" onClick={() => setFClass(c.classificacao)}>
                  <TableCell className="text-xs">{c.classificacao}</TableCell>
                  <TableCell className="text-xs text-right">{c.titulos}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{brl(c.valor)}</TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground">
                    {((c.valor / (kpis.total || 1)) * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Filtros + tabela */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Títulos em aberto e planejamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-3 lg:grid-cols-7 gap-2">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Fornecedor, documento, observação..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <Select value={fFornecedor} onValueChange={setFFornecedor}>
              <SelectTrigger><SelectValue placeholder="Fornecedor" /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="todos">Todos fornecedores</SelectItem>
                {fornecedores.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fClass} onValueChange={setFClass}>
              <SelectTrigger><SelectValue placeholder="Classificação" /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="todas">Todas classificações</SelectItem>
                {classificacoes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Vencidos e a vencer</SelectItem>
                <SelectItem value="vencidos">Somente vencidos</SelectItem>
                <SelectItem value="avencer">Somente a vencer</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fFaixa} onValueChange={setFFaixa}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as faixas</SelectItem>
                {FAIXAS.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fSituacao} onValueChange={setFSituacao}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todo planejamento</SelectItem>
                <SelectItem value="sem">Sem planejamento</SelectItem>
                {SITUACOES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Valor mínimo"
              value={valorMin}
              onChange={(e) => setValorMin(e.target.value)}
            />
            <Button variant="ghost" onClick={limparFiltros}>Limpar filtros</Button>
          </div>

          <div className="max-h-[560px] overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="text-xs">Vencimento</TableHead>
                  <TableHead className="text-xs">Situação</TableHead>
                  <TableHead className="text-xs">Fornecedor</TableHead>
                  <TableHead className="text-xs">Doc.</TableHead>
                  <TableHead className="text-xs">Classificação</TableHead>
                  <TableHead className="text-xs text-right">Título</TableHead>
                  <TableHead className="text-xs text-right">Em aberto</TableHead>
                  <TableHead className="text-xs">Planejamento</TableHead>
                  <TableHead className="text-xs text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.slice(0, 400).map((t) => {
                  const p = planos[t.ref];
                  return (
                    <TableRow key={t.ref}>
                      <TableCell className="text-xs whitespace-nowrap">{dataBr(t.vencimento)}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className={t.dias < 0 ? "border-red-500/50 text-red-500" : t.dias <= 7 ? "border-amber-500/50 text-amber-500" : "border-border text-muted-foreground"}>
                          {t.dias < 0 ? `${Math.abs(t.dias)}d vencido` : t.dias === 0 ? "vence hoje" : `em ${t.dias}d`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[240px] truncate" title={t.fornecedor}>{t.fornecedor}</TableCell>
                      <TableCell className="text-xs">{t.documento || "-"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.classificacao}</TableCell>
                      <TableCell className="text-xs text-right text-muted-foreground">{brl(t.valor)}</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{brl(t.aberto)}</TableCell>
                      <TableCell className="text-xs">
                        {p ? (
                          <div className="leading-tight">
                            <span className="font-medium">{p.situacao}</span>
                            {p.data_prevista && (
                              <span className="text-muted-foreground"> · previsto {dataBr(p.data_prevista)}</span>
                            )}
                            {p.responsavel && <div className="text-[11px] text-muted-foreground">{p.responsavel}</div>}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => abrirPlano(t)}>
                          {p ? "Editar" : "Planejar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filtrados.length && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                      {loading ? "Consultando o sistema da loja..." : "Nenhum título em aberto com os filtros atuais."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filtrados.length > 400 && (
            <p className="text-[11px] text-muted-foreground">
              Exibindo os 400 primeiros de {filtrados.length} títulos — refine os filtros ou exporte para Excel.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dialog planejamento */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Planejamento do título</DialogTitle>
          </DialogHeader>
          {edit && form && (
            <div className="space-y-3">
              <div className="rounded-md border border-border p-3 text-xs space-y-1">
                <p className="font-medium">{edit.fornecedor}</p>
                <p className="text-muted-foreground">
                  Doc {edit.documento || "-"} · vencimento {dataBr(edit.vencimento)} · em aberto{" "}
                  <span className="font-semibold text-foreground">{brl(edit.aberto)}</span>
                </p>
                {edit.observacao && <p className="text-muted-foreground">{edit.observacao}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Situação</Label>
                  <Select value={form.situacao} onValueChange={(v) => setForm({ ...form, situacao: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SITUACOES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Prioridade</Label>
                  <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORIDADES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Pagamento previsto</Label>
                  <Input
                    type="date"
                    value={form.data_prevista ?? ""}
                    onChange={(e) => setForm({ ...form, data_prevista: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Responsável</Label>
                  <Input
                    value={form.responsavel ?? ""}
                    onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                    placeholder="Quem vai tratar"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Classificação / categoria</Label>
                <Input
                  value={form.categoria ?? ""}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  placeholder="Ex.: Fornecedor mercadoria, Despesa fixa..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Observações do planejamento</Label>
                <Textarea
                  rows={3}
                  value={form.observacao ?? ""}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  placeholder="Acordo, parcelamento, contato do fornecedor..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={salvarPlano} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar planejamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
