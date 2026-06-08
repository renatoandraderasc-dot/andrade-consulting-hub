import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Loader2, Croissant } from "lucide-react";

const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface VendaPadaria {
  id: string;
  data: string;
  ranking_dia_semana: string | null;
  tipo: string | null;
  mes: number | null;
  dia_sem: string | null;
  vendas_realizada: number | null;
  margem_realizada: number | null;
  volume: number | null;
}

const fmtPct = (v: number) =>
  `${(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

type Metric = "vendas_realizada" | "margem_realizada" | "volume";

interface ChartProps {
  title: string;
  rows: VendaPadaria[];
  metric: Metric;
  color: string;
}

const HorizontalBarChart = ({ title, rows, metric, color }: ChartProps) => {
  // build map day -> value (1..31)
  const byDay = new Map<number, number>();
  rows.forEach((r) => {
    const d = new Date(r.data + "T00:00:00").getDate();
    byDay.set(d, Number(r[metric] ?? 0));
  });

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const values = days.map((d) => byDay.get(d) ?? 0);
  const accumulated =
    values.reduce((a, b) => a + b, 0) / Math.max(values.filter((v) => v > 0).length, 1);
  const maxValue = Math.max(accumulated, ...values, 1);

  const Bar = ({ label, value, isAccum }: { label: string; value: number; isAccum?: boolean }) => {
    const widthPct = (value / maxValue) * 100;
    const bg = isAccum ? "bg-emerald-500" : "bg-sky-500";
    return (
      <div className="flex items-center gap-2 text-xs h-5">
        <div className={`w-8 text-right shrink-0 ${isAccum ? "text-emerald-400 font-bold" : "text-slate-400"}`}>
          {label}
        </div>
        <div className="flex-1 relative h-4 bg-slate-800/60 rounded-sm overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 ${bg} transition-all`}
            style={{ width: `${Math.max(widthPct, 0)}%` }}
          />
          <span
            className={`absolute inset-y-0 right-1 flex items-center text-[10px] font-semibold ${
              isAccum ? "text-white" : "text-slate-200"
            }`}
          >
            {fmtPct(value)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <Card className="bg-slate-900/80 border-slate-800 p-4">
      <h3 className="text-center text-slate-200 font-bold tracking-wide text-sm mb-3">{title}</h3>
      <div className="space-y-1">
        <Bar label="ACUM" value={accumulated} isAccum />
        <div className="h-px bg-slate-700 my-1" />
        {days.map((d) => (
          <Bar key={d} label={String(d)} value={values[d - 1]} />
        ))}
      </div>
    </Card>
  );
};

const DashboardPadaria = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<VendaPadaria[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchData();
  }, [user, selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vendas_padaria" as any)
      .select("*")
      .eq("mes", selectedMonth)
      .order("data", { ascending: true });
    if (!error && data) setRows(data as any);
    setLoading(false);
  };

  // Mix progress: count of days with volume > 0 vs 31
  const mixProgress = useMemo(() => {
    const dias = new Set(
      rows.filter((r) => Number(r.volume) > 0).map((r) => new Date(r.data + "T00:00:00").getDate())
    );
    return { current: dias.size, total: 31 };
  }, [rows]);

  return (
    <ClientLayout>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
        <div className="max-w-[1600px] mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                <Croissant className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Dashboard Padaria</h1>
                <p className="text-xs text-slate-400">Indicadores diários — % atingido por dia</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Mês:</span>
              <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                <SelectTrigger className="w-40 bg-slate-900 border-slate-700 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                  {MONTHS.slice(1).map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Charts */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <HorizontalBarChart title="FATURAMENTO" rows={rows} metric="vendas_realizada" color="sky" />
                <HorizontalBarChart title="MARGEM" rows={rows} metric="margem_realizada" color="sky" />
                <HorizontalBarChart title="VOLUME" rows={rows} metric="volume" color="sky" />
              </div>

              {/* Mix progress */}
              <Card className="bg-slate-900/80 border-slate-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-200 tracking-wide">PROGRESSO DE MIX</h3>
                  <span className="text-sm text-slate-300">
                    <span className="text-emerald-400 font-bold text-lg">{mixProgress.current}</span>
                    <span className="text-slate-500"> / {mixProgress.total} dias</span>
                  </span>
                </div>
                <div className="h-4 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all"
                    style={{ width: `${(mixProgress.current / mixProgress.total) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {((mixProgress.current / mixProgress.total) * 100)
                    .toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  % do mês com lançamentos de volume.
                </p>
              </Card>

              {rows.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-sm">
                  Nenhum registro encontrado para {MONTHS[selectedMonth]}.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ClientLayout>
  );
};

export default DashboardPadaria;
