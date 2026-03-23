import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from "recharts";
import { Brain, AlertTriangle, TrendingUp, ChevronLeft, ChevronRight, BarChart3, PieChart as PieIcon } from "lucide-react";
import { motion } from "framer-motion";
import type { Lancamento } from "./lancamentosTypes";

interface AgendaAnaliseTabProps {
  storeId: string;
}

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const COLORS = ["#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#84cc16"];

function formatCurrency(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function get5thBusinessDay(year: number, month: number): number {
  let bizDays = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    if (date.getMonth() !== month) break;
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      bizDays++;
      if (bizDays === 5) return d;
    }
  }
  return 5;
}

function classifyLancamento(l: Lancamento): "pagamento" | "recebimento" {
  const tiposRecebimento = ["Vendas", "Recebíveis", "Outras Receitas", "Recebimento"];
  if (tiposRecebimento.some(t => l.tipo.toLowerCase().includes(t.toLowerCase()))) return "recebimento";
  return "pagamento";
}

export function AgendaAnaliseTab({ storeId }: AgendaAnaliseTabProps) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const { data } = await supabase
      .from("lancamentos")
      .select("*")
      .eq("store_id", storeId)
      .eq("competencia_mes", mes + 1)
      .eq("competencia_ano", ano)
      .eq("status", "ativo");
    setLancamentos((data as any[]) || []);
    setLoading(false);
  }, [storeId, mes, ano]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fifthBizDay = useMemo(() => get5thBusinessDay(ano, mes), [ano, mes]);

  // Daily saldo chart
  const dailyData = useMemo(() => {
    const daysInMonth = new Date(ano, mes + 1, 0).getDate();
    const result = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayLancs = lancamentos.filter(l => new Date(l.data).getDate() === d);
      let pag = 0, rec = 0;
      dayLancs.forEach(l => {
        const val = Math.abs(Number(l.valor));
        if (classifyLancamento(l) === "pagamento") pag += val;
        else rec += val;
      });
      result.push({ day: d, pagamentos: pag, recebimentos: rec, saldo: rec - pag, isCritical: d === fifthBizDay || d === 20 });
    }
    return result;
  }, [lancamentos, mes, ano, fifthBizDay]);

  // Weekly data
  const weeklyData = useMemo(() => {
    const weeks: { name: string; pagamentos: number; recebimentos: number; saldo: number }[] = [];
    for (let w = 0; w < 5; w++) {
      const start = w * 7 + 1;
      const end = Math.min((w + 1) * 7, dailyData.length);
      if (start > dailyData.length) break;
      const slice = dailyData.slice(start - 1, end);
      weeks.push({
        name: `Sem ${w + 1}`,
        pagamentos: slice.reduce((s, d) => s + d.pagamentos, 0),
        recebimentos: slice.reduce((s, d) => s + d.recebimentos, 0),
        saldo: slice.reduce((s, d) => s + d.saldo, 0),
      });
    }
    return weeks;
  }, [dailyData]);

  // By category
  const categoryData = useMemo(() => {
    const map: Record<string, { pagamentos: number; recebimentos: number }> = {};
    lancamentos.forEach(l => {
      const cat = l.tipo;
      if (!map[cat]) map[cat] = { pagamentos: 0, recebimentos: 0 };
      const val = Math.abs(Number(l.valor));
      if (classifyLancamento(l) === "pagamento") map[cat].pagamentos += val;
      else map[cat].recebimentos += val;
    });
    return Object.entries(map).map(([name, v]) => ({ name, ...v, total: v.pagamentos + v.recebimentos })).sort((a, b) => b.total - a.total);
  }, [lancamentos]);

  // By subtipo (fornecedor/cliente proxy)
  const fornecedorData = useMemo(() => {
    const map: Record<string, number> = {};
    lancamentos.filter(l => classifyLancamento(l) === "pagamento").forEach(l => {
      const key = l.subtipo || l.tipo;
      map[key] = (map[key] || 0) + Math.abs(Number(l.valor));
    });
    return Object.entries(map).map(([name, valor]) => ({ name, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);
  }, [lancamentos]);

  const clienteData = useMemo(() => {
    const map: Record<string, number> = {};
    lancamentos.filter(l => classifyLancamento(l) === "recebimento").forEach(l => {
      const key = l.subtipo || l.tipo;
      map[key] = (map[key] || 0) + Math.abs(Number(l.valor));
    });
    return Object.entries(map).map(([name, valor]) => ({ name, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);
  }, [lancamentos]);

  // Critical days
  const criticalDays = useMemo(() =>
    dailyData.filter(d => d.saldo < 0 && (d.pagamentos > 0 || d.recebimentos > 0)),
    [dailyData]
  );

  // AI Insights
  const generateInsights = useCallback(async () => {
    if (lancamentos.length === 0) return;
    setAiLoading(true);
    try {
      const summary = {
        mes: MESES[mes],
        ano,
        totalPagamentos: dailyData.reduce((s, d) => s + d.pagamentos, 0),
        totalRecebimentos: dailyData.reduce((s, d) => s + d.recebimentos, 0),
        saldoMes: dailyData.reduce((s, d) => s + d.saldo, 0),
        diasNegativos: criticalDays.length,
        diasCriticos: criticalDays.map(d => d.day),
        dia5util: fifthBizDay,
        categorias: categoryData.slice(0, 5),
        semanas: weeklyData,
      };

      const { data, error } = await supabase.functions.invoke("agenda-financeira-ai", {
        body: { summary },
      });

      if (error) throw error;
      setAiInsights(data?.insights || "Não foi possível gerar insights.");
    } catch {
      setAiInsights("Erro ao gerar insights. Tente novamente.");
    }
    setAiLoading(false);
  }, [lancamentos, dailyData, criticalDays, categoryData, weeklyData, mes, ano, fifthBizDay]);

  const navigate = (dir: -1 | 1) => {
    let m = mes + dir;
    let y = ano;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMes(m);
    setAno(y);
  };

  const customTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs font-bold mb-1">Dia {label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="text-xs" style={{ color: p.color }}>
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="w-5 h-5" /></Button>
        <h2 className="text-lg font-bold">{MESES[mes]} {ano}</h2>
        <Button variant="ghost" size="icon" onClick={() => navigate(1)}><ChevronRight className="w-5 h-5" /></Button>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-12">Carregando...</p>
      ) : lancamentos.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Nenhum lançamento encontrado para este período.</p>
      ) : (
        <>
          {/* Saldo Diário */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" /> Saldo Diário</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={customTooltip} />
                  <Legend />
                  <Bar dataKey="recebimentos" name="Recebimentos" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="pagamentos" name="Pagamentos" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Saldo Acumulado */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Saldo Acumulado</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailyData.reduce((acc, d, i) => {
                  const prev = i > 0 ? acc[i - 1].acumulado : 0;
                  acc.push({ ...d, acumulado: prev + d.saldo });
                  return acc;
                }, [] as any[])}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={customTooltip} />
                  <Line type="monotone" dataKey="acumulado" name="Saldo Acumulado" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Por Semana */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Por Semana</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={customTooltip} />
                    <Bar dataKey="recebimentos" name="Recebimentos" fill="#10b981" />
                    <Bar dataKey="pagamentos" name="Pagamentos" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Por Categoria */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><PieIcon className="w-4 h-4" /> Por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={categoryData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Fornecedores (Pagamentos) */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Pagamentos (Subcategoria)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={fornecedorData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="valor" name="Valor" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Clientes (Recebimentos) */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Recebimentos (Subcategoria)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={clienteData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="valor" name="Valor" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Dias Críticos */}
          {criticalDays.length > 0 && (
            <Card className="bg-card border-red-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                  <AlertTriangle className="w-4 h-4" /> Dias Críticos (Saldo Negativo)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dia</TableHead>
                      <TableHead>Recebimentos</TableHead>
                      <TableHead>Pagamentos</TableHead>
                      <TableHead>Saldo</TableHead>
                      <TableHead>Alerta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {criticalDays.map(d => (
                      <TableRow key={d.day}>
                        <TableCell className="font-bold">{d.day}</TableCell>
                        <TableCell className="text-emerald-400">{formatCurrency(d.recebimentos)}</TableCell>
                        <TableCell className="text-red-400">{formatCurrency(d.pagamentos)}</TableCell>
                        <TableCell className="text-red-400 font-bold">{formatCurrency(d.saldo)}</TableCell>
                        <TableCell>
                          {d.isCritical && d.day === fifthBizDay && <Badge variant="destructive">Folha</Badge>}
                          {d.isCritical && d.day === 20 && <Badge variant="destructive">Impostos</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* AI Insights */}
          <Card className="bg-card border-primary/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" /> Insights da IA
                </CardTitle>
                <Button size="sm" onClick={generateInsights} disabled={aiLoading}>
                  {aiLoading ? "Analisando..." : "Gerar Análise"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {aiInsights ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose prose-sm prose-invert max-w-none">
                  <div className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">{aiInsights}</div>
                </motion.div>
              ) : (
                <p className="text-xs text-muted-foreground">Clique em "Gerar Análise" para obter insights da IA sobre a agenda financeira.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
