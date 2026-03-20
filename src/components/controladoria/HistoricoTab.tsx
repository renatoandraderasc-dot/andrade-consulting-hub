import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { Lancamento } from "./lancamentosTypes";

const mesesNome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmtK = (v: number) => {
  if (v === 0) return "R$ 0";
  const abs = Math.abs(v);
  if (abs >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `R$ ${(v / 1000).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};

interface Props {
  storeId: string;
}

export const HistoricoTab = ({ storeId }: Props) => {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [filterCategoria, setFilterCategoria] = useState("Todos");
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    supabase
      .from("lancamentos")
      .select("*")
      .eq("store_id", storeId)
      .eq("competencia_ano", ano)
      .eq("status", "ativo")
      .then(({ data }) => {
        setLancamentos((data as any[]) || []);
        setLoading(false);
      });
  }, [storeId, ano]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const categorias = useMemo(() => {
    const set = new Set(lancamentos.map(l => l.tipo));
    return Array.from(set).sort();
  }, [lancamentos]);

  // Monthly data for charts
  const monthlyData = useMemo(() => {
    const filtered = filterCategoria !== "Todos"
      ? lancamentos.filter(l => l.tipo === filterCategoria)
      : lancamentos;

    return Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      const mesLancs = filtered.filter(l => l.competencia_mes === mes);
      const faturamento = mesLancs.filter(l => l.tipo === "Faturamento").reduce((s, l) => s + Number(l.valor), 0);
      const cmv = mesLancs.filter(l => l.tipo === "CMV").reduce((s, l) => s + Number(l.valor), 0);
      const despesas = mesLancs.filter(l => l.tipo === "Despesas").reduce((s, l) => s + Number(l.valor), 0);
      const impostos = mesLancs.filter(l => l.tipo === "Impostos").reduce((s, l) => s + Number(l.valor), 0);
      const resultado = faturamento - Math.abs(cmv) - Math.abs(despesas) - Math.abs(impostos);

      return {
        mes: mesesNome[i],
        faturamento,
        cmv: Math.abs(cmv),
        despesas: Math.abs(despesas),
        resultado,
      };
    });
  }, [lancamentos, filterCategoria]);

  // Despesas por grupo (para o ano)
  const despesasPorGrupo = useMemo(() => {
    const map: Record<string, number> = {};
    lancamentos.filter(l => l.tipo === "Despesas").forEach(l => {
      map[l.subtipo] = (map[l.subtipo] || 0) + Math.abs(Number(l.valor));
    });
    return Object.entries(map)
      .map(([name, valor]) => ({ name, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 15);
  }, [lancamentos]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-foreground">Histórico</h2>
        <p className="text-sm text-muted-foreground">Evolução financeira ao longo do tempo</p>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <Label className="text-xs text-muted-foreground">Ano</Label>
            <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Categoria</Label>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos</SelectItem>
                {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading && <p className="text-muted-foreground text-sm">Carregando dados...</p>}

      {/* Faturamento vs CMV */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Faturamento vs CMV</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmtK(v)} />
              <Legend />
              <Bar dataKey="faturamento" name="Faturamento" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cmv" name="CMV" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Despesas por grupo */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Despesas por Grupo</CardTitle>
          </CardHeader>
          <CardContent>
            {despesasPorGrupo.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={despesasPorGrupo} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => fmtK(v)} />
                  <Bar dataKey="valor" name="Valor" fill="hsl(var(--secondary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                Sem dados de despesas para este período
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resultado ao longo do tempo */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Resultado ao Longo do Tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtK(v)} />
                <Legend />
                <Line type="monotone" dataKey="resultado" name="Resultado" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="despesas" name="Despesas" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
