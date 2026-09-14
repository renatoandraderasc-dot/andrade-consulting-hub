import { useMemo, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, pick as col, txt } from "@/lib/vrReport";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { formatBRL } from "@/lib/formatters";

export interface LinhaImport {
  cod: number;
  descricao: string;
  ean: string;
  custo: number | null;
  precoNovo: number;
  margem: number | null;
  status: "ok" | "atencao" | "ignorar";
}

/** Busca custos no VR em lotes de 500 e monta as linhas do preview. */
export async function montarPreview(
  storeId: string,
  codigoLoja: string,
  entradas: { cod: number; precoNovo: number }[],
): Promise<LinhaImport[]> {
  const mapa = new Map<number, { descricao: string; ean: string; custo: number | null }>();
  const codigos = entradas.map((e) => e.cod);
  for (let i = 0; i < codigos.length; i += 120) {
    const lote = codigos.slice(i, i + 120);
    const r = await chamarRelatorio(storeId, "custos_por_produto", {
      codigos: lote.join(","),
      loja: codigoLoja,
    });
    for (const l of r.dados || []) {
      const cod = parseInt(String(col(l, "cod", "codigo", "id_produto", "codigo_produto") ?? "").replace(/\D/g, ""), 10);
      if (isNaN(cod)) continue;
      const custoRaw = Number(col(l, "custo_atual", "custo", "custo_reposicao"));
      mapa.set(cod, {
        descricao: txt(col(l, "descricao", "descricao_completa", "produto"), ""),
        ean: String(col(l, "ean", "codigo_barras", "ean13") ?? ""),
        custo: isFinite(custoRaw) && custoRaw > 0 ? custoRaw : null,
      });
    }
  }

  return entradas.map((e) => {
    const info = mapa.get(e.cod);
    const custo = info?.custo ?? null;
    const margem = custo != null && e.precoNovo > 0 ? ((e.precoNovo - custo) / e.precoNovo) * 100 : null;
    let status: LinhaImport["status"] = "ignorar";
    if (margem != null && margem > 0) {
      status = margem >= 0.5 && margem <= 80 ? "ok" : "atencao";
    }
    return {
      cod: e.cod,
      descricao: info?.descricao || "(não encontrado no sistema da loja)",
      ean: info?.ean || "",
      custo,
      precoNovo: e.precoNovo,
      margem,
      status,
    };
  });
}

const corStatus: Record<LinhaImport["status"], string> = {
  ok: "bg-green-100 text-green-800",
  atencao: "bg-amber-100 text-amber-800",
  ignorar: "bg-red-100 text-red-800",
};
const rotuloStatus: Record<LinhaImport["status"], string> = {
  ok: "OK", atencao: "Atenção", ignorar: "Ignorar",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string;
  linhas: LinhaImport[];
  onImportado: () => void;
}

const ImportarMargensDialog = ({ open, onOpenChange, storeId, linhas, onImportado }: Props) => {
  const [salvando, setSalvando] = useState(false);

  const { ok, atencao, ignoradas, gravaveis } = useMemo(() => {
    const gravaveis = linhas.filter((l) => l.status !== "ignorar");
    return {
      ok: linhas.filter((l) => l.status === "ok").length,
      atencao: linhas.filter((l) => l.status === "atencao").length,
      ignoradas: linhas.filter((l) => l.status === "ignorar").length,
      gravaveis,
    };
  }, [linhas]);

  const confirmar = async () => {
    if (!gravaveis.length) return;
    setSalvando(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const hoje = new Date().toLocaleDateString("pt-BR");
      const { error } = await supabase.from("margens_padrao").upsert(
        gravaveis.map((l) => ({
          store_id: storeId,
          tipo: "produto",
          referencia_id: l.cod,
          referencia_nome: l.descricao || null,
          margem_pct: Math.round((l.margem ?? 0) * 100) / 100,
          observacao: `Importado via Excel em ${hoje}`,
          created_by: auth.user?.id ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "store_id,tipo,referencia_id" },
      );
      if (error) throw error;
      toast({ title: `${gravaveis.length} regra(s) cadastradas/atualizadas.` });
      onOpenChange(false);
      onImportado();
    } catch (e) {
      toast({
        title: "Não foi possível importar",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Conferir importação de margens</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {ok} OK, {atencao} Atenção, {ignoradas} Ignoradas
        </p>
        {atencao > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            Confira as linhas marcadas antes de confirmar.
          </div>
        )}

        <div className="max-h-[420px] overflow-auto border border-border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Cod</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>EAN</TableHead>
                <TableHead className="text-right">Custo atual</TableHead>
                <TableHead className="text-right">Preço novo</TableHead>
                <TableHead className="text-right">Margem %</TableHead>
                <TableHead className="text-right">Preço meta</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.cod}>
                  <TableCell className="font-mono text-xs">{l.cod}</TableCell>
                  <TableCell className="text-sm max-w-[260px] truncate" title={l.descricao}>{l.descricao}</TableCell>
                  <TableCell className="font-mono text-[11px]">{l.ean || "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{l.custo == null ? "—" : formatBRL(l.custo)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums font-semibold">{formatBRL(l.precoNovo)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{l.margem == null ? "—" : `${l.margem.toFixed(2)}%`}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{formatBRL(l.precoNovo)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-[10px] ${corStatus[l.status]}`}>{rotuloStatus[l.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando || gravaveis.length === 0}>
            {salvando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Confirmar ({gravaveis.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportarMargensDialog;
