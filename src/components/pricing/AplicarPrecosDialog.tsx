import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio } from "@/lib/vrReport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

export interface ItemAplicar {
  idProduto: number;
  descricao: string;
  ean: string;
  fornecedor?: string;
  precoAtual: number;
  precoMeta: number;
  margemMeta?: number | null;
  custo: number;
}

const brl = (v: number | null | undefined) =>
  v == null || !isFinite(Number(v)) ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  storeId: string;
  codigoLoja: string | null;
  itens: ItemAplicar[];
  propagarInicial?: boolean;
  /** chamado apos aplicar com sucesso (limpar selecao, recarregar) */
  onAplicado?: () => void;
}

const AplicarPrecosDialog = ({
  open, onOpenChange, storeId, codigoLoja, itens, propagarInicial = true, onAplicado,
}: Props) => {
  const [propagar, setPropagar] = useState(propagarInicial);
  const [idUsuario, setIdUsuario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { setPropagar(propagarInicial); }, [propagarInicial, open]);

  useEffect(() => {
    if (!open || !storeId) return;
    setErro(null);
    supabase.from("store_vr_config").select("id_usuario_vr").eq("store_id", storeId).maybeSingle()
      .then(({ data }) => {
        const v = (data as { id_usuario_vr: number | null } | null)?.id_usuario_vr;
        if (v != null) setIdUsuario(String(v));
      });
  }, [open, storeId]);

  const negativos = useMemo(() => itens.filter((i) => i.custo > 0 && i.precoMeta <= i.custo), [itens]);
  const validos = useMemo(() => itens.filter((i) => !(i.custo > 0 && i.precoMeta <= i.custo)), [itens]);
  const delta = (i: ItemAplicar) => (i.precoAtual > 0 ? ((i.precoMeta - i.precoAtual) / i.precoAtual) * 100 : 0);
  const extremos = validos.filter((i) => Math.abs(delta(i)) > 30);

  const confirmar = async () => {
    if (!validos.length || !idUsuario.trim()) return;
    setEnviando(true);
    setErro(null);
    try {
      const payload = validos.map((i) => ({ id_produto: i.idProduto, precovenda: i.precoMeta }));
      // Envia em lotes pequenos: listas grandes estouram o limite da ponte da loja.
      let afetados = 0;
      // 25 itens por chamada mantem a URL curta o bastante para pontes que
      // so aceitam GET (algumas lojas nao expoem POST em /relatorios).
      for (let i = 0; i < payload.length; i += 25) {
        const lote = payload.slice(i, i + 25);
        const r = await chamarRelatorio(storeId, "aplicar_precos", {
          itens: JSON.stringify(lote),
          loja: codigoLoja ?? "",
          id_usuario: idUsuario.trim(),
          propagar_familia: propagar ? "true" : "false",
        });
        const msg = avisoRelatorio(r);
        if (msg) { setErro(msg); return; }
        afetados += (r.dados || []).length || lote.length;
      }
      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("historico_aplicacao_preco").insert(
        validos.map((i) => ({
          store_id: storeId,
          id_produto: i.idProduto,
          descricao: i.descricao,
          ean: i.ean || null,
          fornecedor: i.fornecedor || null,
          preco_anterior: i.precoAtual || null,
          preco_aplicado: i.precoMeta,
          margem_meta: i.margemMeta ?? null,
          custo_referencia: i.custo || null,
          propagou_familia: propagar,
          qtd_produtos_afetados: afetados,
          id_usuario_vr: parseInt(idUsuario, 10) || null,
          applied_by: auth.user?.id ?? null,
        })),
      );

      toast({
        title: "Preços enviados",
        description: `${validos.length} preço(s) enfileirado(s). O sistema da loja aplica em alguns minutos.`,
      });
      onOpenChange(false);
      onAplicado?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao enviar os preços.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !enviando && onOpenChange(o)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Aplicar {validos.length} preços meta no sistema da loja</DialogTitle>
          <DialogDescription>Confira os preços antes de enviar. A alteração é definitiva.</DialogDescription>
        </DialogHeader>

        {extremos.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
            <span>{extremos.length} produto(s) com variação maior que 30%. Confira antes de aplicar.</span>
          </div>
        )}
        {negativos.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
            <span>{negativos.length} produto(s) com margem negativa. Serão ignorados.</span>
          </div>
        )}

        <div className="max-h-[280px] overflow-auto border border-border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-[11px]">EAN</TableHead>
                <TableHead className="text-[11px]">Descrição</TableHead>
                <TableHead className="text-right text-[11px]">Preço atual</TableHead>
                <TableHead className="text-right text-[11px]">Preço meta</TableHead>
                <TableHead className="text-right text-[11px]">Δ%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {validos.map((i) => {
                const d = delta(i);
                return (
                  <TableRow key={`${i.idProduto}-${i.ean}`}>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">{i.ean || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate" title={i.descricao}>{i.descricao}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{brl(i.precoAtual)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{brl(i.precoMeta)}</TableCell>
                    <TableCell className={`text-right text-xs tabular-nums ${d > 0 ? "text-green-600" : d < 0 ? "text-destructive" : ""}`}>
                      {d > 0 ? "+" : ""}{d.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={propagar} onCheckedChange={setPropagar} aria-label="Propagar para a família" />
            Propagar para a família
          </label>
          {propagar && (
            <span className="text-xs text-muted-foreground">Isso pode ampliar a quantidade de produtos alterados.</span>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground">ID do usuário no sistema da loja</span>
            <Input
              className="w-[110px]"
              value={idUsuario}
              onChange={(e) => setIdUsuario(e.target.value.replace(/\D/g, ""))}
              placeholder="obrigatório"
            />
          </div>
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Cancelar</Button>
          <Button onClick={confirmar} disabled={enviando || !idUsuario.trim() || validos.length === 0}>
            {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Confirmar e aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AplicarPrecosDialog;
