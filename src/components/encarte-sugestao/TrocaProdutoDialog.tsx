import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/formatters";
import { Alternativa, pct } from "./types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  alternativas: Alternativa[];
  onEscolher: (alt: Alternativa) => void;
}

const motivoTexto = (m: Record<string, number> | undefined) => {
  if (!m) return "";
  const partes: string[] = [];
  if (m.giro != null) partes.push(`giro ${(m.giro * 100).toFixed(0)}%`);
  if (m.folga_margem != null) partes.push(`folga de margem ${(m.folga_margem * 100).toFixed(0)}%`);
  if (m.competitividade != null) partes.push(`competitividade ${(m.competitividade * 100).toFixed(0)}%`);
  if (m.estoque != null) partes.push(`estoque ${(m.estoque * 100).toFixed(0)}%`);
  return partes.join(" · ");
};

const TrocaProdutoDialog = ({ open, onOpenChange, titulo, alternativas, onEscolher }: Props) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-4xl">
      <DialogHeader>
        <DialogTitle>Trocar produto — {titulo}</DialogTitle>
      </DialogHeader>
      {alternativas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Nenhuma alternativa disponível para esta posição.
        </p>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="py-2 pr-2">Cód</th>
                <th className="py-2 pr-2">Produto</th>
                <th className="py-2 pr-2 text-right">Venda</th>
                <th className="py-2 pr-2 text-right">Oferta</th>
                <th className="py-2 pr-2 text-right">Margem oferta</th>
                <th className="py-2 pr-2 text-right">Score</th>
                <th className="py-2 pr-2">Motivo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {alternativas.map((a) => {
                const margem = a.preco_oferta > 0 ? ((a.preco_oferta - a.pmz) / a.preco_oferta) * 100 : 0;
                return (
                  <tr key={a.codigo} className="border-b border-border/50">
                    <td className="py-2 pr-2 font-mono text-xs">{a.codigo}</td>
                    <td className="py-2 pr-2">
                      {a.descricao}
                      <span className="block text-xs text-muted-foreground">{a.categoria}</span>
                    </td>
                    <td className="py-2 pr-2 text-right">{formatBRL(a.preco_venda)}</td>
                    <td className="py-2 pr-2 text-right">{formatBRL(a.preco_oferta)}</td>
                    <td className="py-2 pr-2 text-right">{pct(margem)}</td>
                    <td className="py-2 pr-2 text-right">{a.score.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">
                      {motivoTexto(a.motivo)}
                      {a.preco_concorrente
                        ? ` · ${a.concorrente ?? "concorrente"} ${formatBRL(a.preco_concorrente)}`
                        : ""}
                    </td>
                    <td className="py-2">
                      <Button size="sm" onClick={() => { onEscolher(a); onOpenChange(false); }}>
                        Usar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DialogContent>
  </Dialog>
);

export default TrocaProdutoDialog;
