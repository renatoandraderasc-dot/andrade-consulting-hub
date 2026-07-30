import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface Row {
  store_id: string;
  loja: string;
  ano: number;
  mes: number;
  total: number;
}

interface Props {
  storeId?: string;
  onSelect?: (mes: number, ano: number) => void;
}

export const CompetenciasDisponiveis = ({ storeId, onSelect }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: lanc }, { data: stores }] = await Promise.all([
      supabase
        .from("lancamentos")
        .select("store_id, competencia_mes, competencia_ano")
        .eq("status", "ativo")
        .limit(50000),
      supabase.from("stores").select("id, name"),
    ]);

    const nomes = new Map((stores || []).map((s: any) => [s.id, s.name as string]));
    const map = new Map<string, Row>();
    (lanc || []).forEach((l: any) => {
      const key = `${l.store_id}-${l.competencia_ano}-${l.competencia_mes}`;
      const cur = map.get(key);
      if (cur) cur.total += 1;
      else
        map.set(key, {
          store_id: l.store_id,
          loja: nomes.get(l.store_id) || "Loja desconhecida",
          ano: l.competencia_ano,
          mes: l.competencia_mes,
          total: 1,
        });
    });

    const list = Array.from(map.values()).sort(
      (a, b) => a.loja.localeCompare(b.loja) || b.ano - a.ano || b.mes - a.mes,
    );
    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    if (open && rows.length === 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <button
            className="flex items-center gap-2 text-left"
            onClick={() => setOpen(o => !o)}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <CardTitle className="text-base font-semibold">Competências disponíveis no banco</CardTitle>
          </button>
          {open && (
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Lançamentos ativos por loja e competência — útil para saber exatamente o que existe no banco.
        </p>
      </CardHeader>

      {open && (
        <CardContent className="p-0">
          {loading && <p className="px-4 pb-4 text-sm text-muted-foreground">Carregando...</p>}
          {!loading && rows.length === 0 && (
            <p className="px-4 pb-4 text-sm text-muted-foreground">Nenhum lançamento encontrado.</p>
          )}
          {!loading && rows.length > 0 && (
            <div className="max-h-[360px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>Competência</TableHead>
                    <TableHead className="text-right">Lançamentos</TableHead>
                    <TableHead className="w-[90px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow
                      key={`${r.store_id}-${r.ano}-${r.mes}`}
                      className={storeId && r.store_id === storeId ? "bg-primary/5" : ""}
                    >
                      <TableCell className="text-sm">{r.loja}</TableCell>
                      <TableCell className="text-sm">{MESES[r.mes - 1]}/{r.ano}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.total}</TableCell>
                      <TableCell className="text-right">
                        {onSelect && storeId && r.store_id === storeId && (
                          <Button size="sm" variant="ghost" onClick={() => onSelect(r.mes, r.ano)}>
                            Ver
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};
