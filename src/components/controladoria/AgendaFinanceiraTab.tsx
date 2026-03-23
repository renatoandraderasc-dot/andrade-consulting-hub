import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle, TrendingUp, TrendingDown, Banknote, Wallet } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Lancamento } from "./lancamentosTypes";

interface AgendaFinanceiraTabProps {
  storeId: string;
}

interface DaySummary {
  date: string;
  day: number;
  pagamentos: number;
  recebimentos: number;
  saldo: number;
  lancamentos: Lancamento[];
  is5thBizDay: boolean;
  isDay20: boolean;
}

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function get5thBusinessDay(year: number, month: number): number {
  let bizDays = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    if (date.getMonth() !== month) break;
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) {
      bizDays++;
      if (bizDays === 5) return d;
    }
  }
  return 5;
}

function formatCurrency(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Classify lancamentos into pagamentos/recebimentos
function classifyLancamento(l: Lancamento): "pagamento" | "recebimento" {
  const tiposPagamento = ["CMV", "Despesas", "Impostos", "Despesas Financeiras", "Ajustes", "Pagamento Fornecedores", "IRPJ e CSLL", "Investimento"];
  const tiposRecebimento = ["Vendas", "Recebíveis", "Outras Receitas", "Recebimento"];
  if (tiposRecebimento.some(t => l.tipo.toLowerCase().includes(t.toLowerCase()))) return "recebimento";
  if (tiposPagamento.some(t => l.tipo.toLowerCase().includes(t.toLowerCase()))) return "pagamento";
  return Number(l.valor) >= 0 ? "recebimento" : "pagamento";
}

export function AgendaFinanceiraTab({ storeId }: AgendaFinanceiraTabProps) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DaySummary | null>(null);

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

  const calendarData = useMemo(() => {
    const daysInMonth = new Date(ano, mes + 1, 0).getDate();
    const firstDow = new Date(ano, mes, 1).getDay();
    const days: (DaySummary | null)[] = [];

    // pad start
    for (let i = 0; i < firstDow; i++) days.push(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayLancamentos = lancamentos.filter(l => {
        const lDate = new Date(l.data);
        return lDate.getDate() === d;
      });

      let pagamentos = 0;
      let recebimentos = 0;
      dayLancamentos.forEach(l => {
        const val = Math.abs(Number(l.valor));
        if (classifyLancamento(l) === "pagamento") pagamentos += val;
        else recebimentos += val;
      });

      days.push({
        date: dateStr,
        day: d,
        pagamentos,
        recebimentos,
        saldo: recebimentos - pagamentos,
        lancamentos: dayLancamentos,
        is5thBizDay: d === fifthBizDay,
        isDay20: d === 20,
      });
    }
    return days;
  }, [lancamentos, mes, ano, fifthBizDay]);

  const monthTotals = useMemo(() => {
    const valid = calendarData.filter(Boolean) as DaySummary[];
    return {
      pagamentos: valid.reduce((s, d) => s + d.pagamentos, 0),
      recebimentos: valid.reduce((s, d) => s + d.recebimentos, 0),
      saldo: valid.reduce((s, d) => s + d.saldo, 0),
      diasNegativos: valid.filter(d => d.saldo < 0 && d.lancamentos.length > 0).length,
    };
  }, [calendarData]);

  const navigate = (dir: -1 | 1) => {
    let m = mes + dir;
    let y = ano;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMes(m);
    setAno(y);
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium mb-1">
                <TrendingUp className="w-4 h-4" /> Recebimentos
              </div>
              <p className="text-lg font-bold text-emerald-400">{formatCurrency(monthTotals.recebimentos)}</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-400 text-xs font-medium mb-1">
                <TrendingDown className="w-4 h-4" /> Pagamentos
              </div>
              <p className="text-lg font-bold text-red-400">{formatCurrency(monthTotals.pagamentos)}</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className={`border-${monthTotals.saldo >= 0 ? "emerald" : "red"}-500/30 bg-${monthTotals.saldo >= 0 ? "emerald" : "red"}-500/5`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs font-medium mb-1" style={{ color: monthTotals.saldo >= 0 ? "#34d399" : "#f87171" }}>
                <Wallet className="w-4 h-4" /> Saldo do Mês
              </div>
              <p className="text-lg font-bold" style={{ color: monthTotals.saldo >= 0 ? "#34d399" : "#f87171" }}>
                {formatCurrency(monthTotals.saldo)}
              </p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-medium mb-1">
                <AlertTriangle className="w-4 h-4" /> Dias Negativos
              </div>
              <p className="text-lg font-bold text-amber-400">{monthTotals.diasNegativos}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Month Navigation */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg font-bold">
                {MESES[mes]} {ano}
              </CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-4">
          {loading ? (
            <p className="text-center text-muted-foreground py-12">Carregando...</p>
          ) : (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DIAS_SEMANA.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarData.map((day, i) => {
                  if (!day) return <div key={`empty-${i}`} className="min-h-[80px]" />;
                  const isHighlighted = day.is5thBizDay || day.isDay20;
                  const hasData = day.lancamentos.length > 0;
                  const saldoColor = day.saldo > 0 ? "text-emerald-400" : day.saldo < 0 ? "text-red-400" : "text-muted-foreground";

                  return (
                    <motion.div
                      key={day.day}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => hasData && setSelectedDay(day)}
                      className={`min-h-[80px] rounded-lg p-1.5 cursor-pointer transition-colors border ${
                        isHighlighted
                          ? "border-red-500/60 bg-red-500/10"
                          : hasData
                          ? "border-border bg-muted/30 hover:bg-muted/50"
                          : "border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold ${isHighlighted ? "text-red-400" : ""}`}>
                          {day.day}
                        </span>
                        {day.is5thBizDay && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">Folha</Badge>
                        )}
                        {day.isDay20 && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">Impostos</Badge>
                        )}
                      </div>
                      {hasData && (
                        <div className="space-y-0.5">
                          {day.recebimentos > 0 && (
                            <div className="text-[10px] text-emerald-400 truncate">
                              +{(day.recebimentos / 1000).toFixed(1)}k
                            </div>
                          )}
                          {day.pagamentos > 0 && (
                            <div className="text-[10px] text-red-400 truncate">
                              -{(day.pagamentos / 1000).toFixed(1)}k
                            </div>
                          )}
                          <div className={`text-[10px] font-bold ${saldoColor} truncate`}>
                            {day.saldo >= 0 ? "+" : ""}{(day.saldo / 1000).toFixed(1)}k
                          </div>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/30 border border-red-500/60" /> 5º dia útil / Dia 20</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400" /> Saldo positivo</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400" /> Saldo negativo</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Day Detail Modal */}
      <Dialog open={!!selectedDay} onOpenChange={() => setSelectedDay(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedDay && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Banknote className="w-5 h-5 text-primary" />
                  Detalhes — Dia {selectedDay.day} de {MESES[mes]}
                  {selectedDay.is5thBizDay && <Badge variant="destructive">Folha</Badge>}
                  {selectedDay.isDay20 && <Badge variant="destructive">Impostos</Badge>}
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-3 my-4">
                <Card className="bg-emerald-500/10 border-emerald-500/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-emerald-400">Recebimentos</p>
                    <p className="text-sm font-bold text-emerald-400">{formatCurrency(selectedDay.recebimentos)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-red-500/10 border-red-500/30">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-red-400">Pagamentos</p>
                    <p className="text-sm font-bold text-red-400">{formatCurrency(selectedDay.pagamentos)}</p>
                  </CardContent>
                </Card>
                <Card className={`${selectedDay.saldo >= 0 ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                  <CardContent className="p-3 text-center">
                    <p className="text-xs" style={{ color: selectedDay.saldo >= 0 ? "#34d399" : "#f87171" }}>Saldo</p>
                    <p className="text-sm font-bold" style={{ color: selectedDay.saldo >= 0 ? "#34d399" : "#f87171" }}>
                      {formatCurrency(selectedDay.saldo)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Subcategoria</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Obs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedDay.lancamentos.map(l => {
                    const isPag = classifyLancamento(l) === "pagamento";
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <Badge variant={isPag ? "destructive" : "default"} className={!isPag ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : ""}>
                            {isPag ? "Pagamento" : "Recebimento"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{l.tipo}</TableCell>
                        <TableCell className="text-xs">{l.subtipo}</TableCell>
                        <TableCell className="text-xs">{l.descricao || "—"}</TableCell>
                        <TableCell className={`text-right text-xs font-medium ${isPag ? "text-red-400" : "text-emerald-400"}`}>
                          {formatCurrency(Math.abs(Number(l.valor)))}
                        </TableCell>
                        <TableCell className="text-xs">{l.status}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{l.observacao || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
