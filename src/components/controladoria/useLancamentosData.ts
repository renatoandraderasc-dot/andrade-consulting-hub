import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Lancamento } from "./lancamentosTypes";
import type { DRELine } from "./mockData";

export function useLancamentosData(storeId: string, mes: number, ano: number) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    supabase
      .from("lancamentos")
      .select("*")
      .eq("store_id", storeId)
      .eq("competencia_mes", mes)
      .eq("competencia_ano", ano)
      .eq("status", "ativo")
      .then(({ data }) => {
        setLancamentos((data as any[]) || []);
        setLoading(false);
      });
  }, [storeId, mes, ano]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sumByTipo = (tipo: string) =>
    lancamentos.filter(l => l.tipo === tipo).reduce((s, l) => s + Number(l.valor), 0);

  const sumBySubtipo = (tipo: string, subtipo: string) =>
    lancamentos.filter(l => l.tipo === tipo && l.subtipo === subtipo).reduce((s, l) => s + Number(l.valor), 0);

  const subtiposOf = (tipo: string) => {
    const set = new Set<string>();
    lancamentos.filter(l => l.tipo === tipo).forEach(l => set.add(l.subtipo));
    return Array.from(set);
  };

  const kpis = useMemo(() => {
    const vendas = sumByTipo("Vendas");
    const impostos = sumByTipo("Impostos");
    const cmv = sumByTipo("CMV");
    const despesas = sumByTipo("Despesas");
    const outrasReceitas = sumByTipo("Outras Receitas");
    const despFinanceiras = sumByTipo("Despesas Financeiras");
    const ajustes = sumByTipo("Ajustes");

    const receitaLiquida = vendas - Math.abs(impostos);
    const ebitda = receitaLiquida - Math.abs(cmv) - Math.abs(despesas) + outrasReceitas;
    const resultado = ebitda - Math.abs(despFinanceiras) + ajustes;

    return { vendas, impostos, cmv, despesas, outrasReceitas, despFinanceiras, ajustes, receitaLiquida, ebitda, resultado };
  }, [lancamentos]);

  const dreData: DRELine[] = useMemo(() => {
    const { vendas, impostos, cmv, despesas, receitaLiquida, ebitda, resultado } = kpis;
    const rv = vendas || 1;

    const makeChildren = (tipo: string): DRELine[] =>
      subtiposOf(tipo).map(sub => ({
        id: `${tipo}_${sub}`,
        name: sub,
        level: 1,
        isGroup: false,
        valor: sumBySubtipo(tipo, sub),
        percentual: vendas ? (sumBySubtipo(tipo, sub) / rv) * 100 : 0,
        variacao: 0,
      }));

    return [
      { id: "receita", name: "Receita Líquida", level: 0, isGroup: false, valor: receitaLiquida, percentual: vendas ? (receitaLiquida / rv) * 100 : 0, variacao: 0 },
      {
        id: "impostos", name: "Impostos", level: 0, isGroup: true,
        valor: impostos, percentual: vendas ? (impostos / rv) * 100 : 0, variacao: 0,
        children: makeChildren("Impostos"),
      },
      {
        id: "cmv", name: "CMV", level: 0, isGroup: true,
        valor: cmv, percentual: vendas ? (cmv / rv) * 100 : 0, variacao: 0,
        children: makeChildren("CMV"),
      },
      {
        id: "despesas", name: "Despesas", level: 0, isGroup: true,
        valor: despesas, percentual: vendas ? (despesas / rv) * 100 : 0, variacao: 0,
        children: makeChildren("Despesas"),
      },
      { id: "ebitda", name: "EBITDA", level: 0, isGroup: false, valor: ebitda, percentual: vendas ? (ebitda / rv) * 100 : 0, variacao: 0 },
      { id: "resultado", name: "Resultado (Lucro / Prejuízo)", level: 0, isGroup: false, valor: resultado, percentual: vendas ? (resultado / rv) * 100 : 0, variacao: 0 },
    ];
  }, [kpis, lancamentos]);

  const composicaoDespesas = useMemo(() =>
    subtiposOf("Despesas").map(sub => ({
      name: sub,
      valor: Math.abs(sumBySubtipo("Despesas", sub)),
    })).sort((a, b) => b.valor - a.valor),
    [lancamentos]
  );

  return { lancamentos, loading, kpis, dreData, composicaoDespesas, refetch: fetchData };
}
