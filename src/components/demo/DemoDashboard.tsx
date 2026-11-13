import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from "recharts";
import { Button } from "@/components/ui/button";
import { DataTable, EditDialog, Kpis, type FormField } from "./DemoUI";
import { useDemoWorkspace } from "@/hooks/useDemoWorkspace";
import { DEPARTMENTS, MONTHS, cents, demoTotals, departmentMetrics, money, number, type DemoFilters } from "@/lib/demo/model";
import { exportDemoRows } from "@/lib/demo/export";
import { Download, Pencil, Target } from "lucide-react";
import { toast } from "sonner";

export default function DemoDashboard({ filters, path }: { filters: DemoFilters; path: string }) {
  const { state, update } = useDemoWorkspace();
  const totals = demoTotals(state, filters);
  const rows = departmentMetrics(state, filters).map(r => ({ ...r, id: r.department }));
  const goalView = /metas/.test(path);
  const annual = /anual|comparativo|analitico/.test(path);
  const [goal, setGoal] = useState<Record<string, string> | null>(null);
  const chartData = annual ? MONTHS.map((name, i) => ({ name: name.slice(0, 3), Atual: demoTotals(state, { ...filters, month: i + 1 }).sales, Anterior: demoTotals(state, { ...filters, month: i + 1, year: filters.year - 1 }).sales })) : rows.map(r => ({ name: r.department, Atual: r.sales, Anterior: cents(r.sales / 1.09) }));
  const fields: FormField[] = [{ key: "department", label: "Departamento", options: DEPARTMENTS, required: true }, { key: "value", label: "Meta mensal de faturamento (R$)", type: "number", required: true }];
  const exportRows = () => exportDemoRows("Indicadores comerciais", ["Departamento", "Meta", "Faturamento", "Lucro", "Margem %", "Volume"], rows.map(r => [r.department, r.goal, r.sales, r.profit, cents(r.margin), r.quantity]));
  return <>
    <Kpis items={[{ label: "Meta de faturamento do mês", value: money(totals.goal) }, { label: "Faturamento realizado", value: money(totals.sales), sub: `${number(totals.goal ? totals.sales / totals.goal * 100 : 0, 2)}% da meta` }, { label: "Lucro bruto", value: money(totals.profit) }, { label: "Volume vendido", value: number(totals.quantity, 2) }]} />
    <div className="flex flex-wrap justify-between items-center gap-3 py-4"><h2 className="font-semibold">{goalView ? "Metas por departamento" : annual ? "Evolução dos indicadores" : "Vendas por departamento"}</h2><div className="flex gap-2"><Button variant="outline" size="sm" onClick={exportRows}><Download /> Excel</Button>{goalView && <Button size="sm" onClick={() => setGoal({ department: filters.department || DEPARTMENTS[0], value: String(state.goals[filters.department || DEPARTMENTS[0]]) })}><Target /> Editar meta</Button>}</div></div>
    <div className="h-72 w-full py-2" aria-label="Gráfico comparativo de vendas"><ResponsiveContainer width="100%" height="100%">{annual ? <LineChart data={chartData}><CartesianGrid stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${number(v / 1000)} mil`} /><Tooltip formatter={v => money(Number(v))} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} /><Legend /><Line type="monotone" dataKey="Atual" stroke="hsl(var(--primary))" strokeWidth={3} /><Line type="monotone" dataKey="Anterior" stroke="hsl(var(--chart-5))" strokeWidth={2} /></LineChart> : <BarChart data={chartData}><CartesianGrid stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={0} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${number(v / 1000)} mil`} /><Tooltip formatter={v => money(Number(v))} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} /><Legend /><Bar dataKey="Atual" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} /><Bar dataKey="Anterior" fill="hsl(var(--chart-5))" radius={[3, 3, 0, 0]} /></BarChart>}</ResponsiveContainer></div>
    <DataTable rows={rows} columns={[{ label: "Departamento", render: r => r.department }, { label: "Meta mensal", render: r => money(r.goal), numeric: true }, { label: "Faturamento", render: r => money(r.sales), numeric: true }, { label: "Lucro bruto", render: r => money(r.profit), numeric: true }, { label: "Margem", render: r => `${number(r.margin, 2)}%`, numeric: true }, { label: "Volume", render: r => number(r.quantity, 2), numeric: true }, ...(path.includes("premiacao") ? [{ label: "Premiação", render: (r: typeof rows[number]) => money(r.sales >= r.goal ? 500 : 0), numeric: true }] : [])]} onEdit={goalView ? row => setGoal({ department: row.department, value: String(row.goal) }) : undefined} />
    {goal && <EditDialog title="Meta mensal" fields={fields} values={goal} setValues={setGoal} onClose={() => setGoal(null)} onSave={() => { const amount = Number(goal.value); if (!Number.isFinite(amount) || amount < 0) { toast.error("Informe uma meta válida."); return; } update(s => ({ ...s, goals: { ...s.goals, [goal.department]: cents(amount) } })); setGoal(null); toast.success("Meta atualizada na demonstração."); }} />}
  </>;
}