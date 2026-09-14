import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Registro {
  id: string;
  applied_at: string;
  id_produto: number;
  descricao: string | null;
  ean: string | null;
  fornecedor: string | null;
  preco_anterior: number | null;
  preco_aplicado: number;
  margem_meta: number | null;
  propagou_familia: boolean;
  qtd_produtos_afetados: number | null;
  applied_by: string | null;
}

const brl = (v: number | null) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (s: string) => new Date(s).toLocaleString("pt-BR");
const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

interface Props { storeId: string }

const HistoricoPrecosTab = ({ storeId }: Props) => {
  const [inicio, setInicio] = useState(isoDaysAgo(30));
  const [fim, setFim] = useState(new Date().toISOString().slice(0, 10));
  const [busca, setBusca] = useState("");
  const [linhas, setLinhas] = useState<Registro[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const carregar = async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      let q = supabase
        .from("historico_aplicacao_preco")
        .select("id, applied_at, id_produto, descricao, ean, fornecedor, preco_anterior, preco_aplicado, margem_meta, propagou_familia, qtd_produtos_afetados, applied_by")
        .eq("store_id", storeId)
        .gte("applied_at", `${inicio}T00:00:00`)
        .lte("applied_at", `${fim}T23:59:59`)
        .order("applied_at", { ascending: false })
        .limit(1000);
      if (busca.trim()) q = q.or(`descricao.ilike.%${busca.trim()}%,ean.ilike.%${busca.trim()}%`);
      const { data } = await q;
      const regs = (data || []) as Registro[];
      setLinhas(regs);

      const ids = [...new Set(regs.map((r) => r.applied_by).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
        const mapa: Record<string, string> = {};
        for (const p of profs || []) mapa[p.user_id] = p.full_name || "—";
        setNomes(mapa);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLinhas([]); }, [storeId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 bg-card border border-border rounded-lg p-3">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground uppercase">De</label>
          <Input type="date" className="w-[150px]" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground uppercase">até</label>
          <Input type="date" className="w-[150px]" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground uppercase">Produto</label>
          <Input className="w-[240px]" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Descrição ou EAN" />
        </div>
        <Button onClick={carregar} disabled={!storeId || loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Carregar
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">{linhas.length} aplicação(ões)</span>
      </div>

      <div className="border border-border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Data/hora</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>EAN</TableHead>
              <TableHead className="text-right">Preço anterior</TableHead>
              <TableHead className="text-right">Preço aplicado</TableHead>
              <TableHead className="text-right">Margem meta</TableHead>
              <TableHead className="text-center">Família</TableHead>
              <TableHead className="text-right">Afetados</TableHead>
              <TableHead>Aplicado por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                Nenhuma aplicação no período. Clique em Carregar.
              </TableCell></TableRow>
            )}
            {linhas.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{dataHora(r.applied_at)}</TableCell>
                <TableCell className="text-sm max-w-[260px] truncate" title={r.descricao || ""}>{r.descricao || r.id_produto}</TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{r.ean || "—"}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{brl(r.preco_anterior)}</TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">{brl(r.preco_aplicado)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.margem_meta == null ? "—" : `${Number(r.margem_meta).toFixed(2)}%`}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="text-[10px]">{r.propagou_familia ? "Sim" : "Não"}</Badge>
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">{r.qtd_produtos_afetados ?? "—"}</TableCell>
                <TableCell className="text-xs">{(r.applied_by && nomes[r.applied_by]) || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default HistoricoPrecosTab;
