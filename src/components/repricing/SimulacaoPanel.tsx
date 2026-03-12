import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "./mockData";

interface Props {
  product: Product | null;
  onClose: () => void;
}

const fmt = (v: number) => `R$ ${v.toFixed(2)}`;

const SimulacaoPanel = ({ product, onClose }: Props) => {
  const [novoPreco, setNovoPreco] = useState<number | "">("");

  useEffect(() => {
    setNovoPreco(product?.simulacao ?? "");
  }, [product]);

  if (!product) return null;

  const novoPrecoNum = typeof novoPreco === "number" ? novoPreco : null;
  const novaMargem = novoPrecoNum != null ? ((novoPrecoNum - product.custo) / novoPrecoNum) * 100 : null;
  const diferencaAtual = novoPrecoNum != null ? novoPrecoNum - product.precoAtual : null;

  const menorConcorrencia = Math.min(
    ...[product.amplaConcorrente, product.baixaConcorrencia, product.direto].filter((v): v is number => v != null)
  );

  const novoStatus = novoPrecoNum != null
    ? novoPrecoNum > menorConcorrencia ? "maior" : novoPrecoNum < menorConcorrencia ? "menor" : "igual"
    : null;

  const statusConf = {
    maior: { label: "Acima da Concorrência", icon: ArrowUp, className: "bg-destructive/10 text-destructive" },
    menor: { label: "Abaixo da Concorrência", icon: ArrowDown, className: "bg-green-500/10 text-green-700" },
    igual: { label: "Igual à Concorrência", icon: Minus, className: "bg-muted text-muted-foreground" },
  };

  return (
    <Card className="border-primary/20 bg-card">
      <CardHeader className="pb-3 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Simulação de Preço</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{product.descricao}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="w-4 h-4" /></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Custo</span>
            <p className="font-semibold">{fmt(product.custo)}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Preço Atual</span>
            <p className="font-semibold">{fmt(product.precoAtual)}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Margem Atual</span>
            <p className="font-semibold">{product.margem.toFixed(1)}%</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Menor Concorrência</span>
            <p className="font-semibold">{fmt(menorConcorrencia)}</p>
          </div>
        </div>

        <div className="flex items-end gap-4">
          <div className="flex-1">
            <Label className="text-xs">Novo Preço Sugerido</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="Digite o novo preço"
              value={novoPreco}
              onChange={e => setNovoPreco(e.target.value ? parseFloat(e.target.value) : "")}
              className="mt-1"
            />
          </div>
          {novaMargem != null && (
            <div className="text-center min-w-[100px]">
              <span className="text-xs text-muted-foreground block">Nova Margem</span>
              <p className={`text-lg font-bold ${novaMargem < 20 ? "text-destructive" : novaMargem > 40 ? "text-green-600" : "text-foreground"}`}>
                {novaMargem.toFixed(1)}%
              </p>
            </div>
          )}
          {diferencaAtual != null && (
            <div className="text-center min-w-[100px]">
              <span className="text-xs text-muted-foreground block">Diferença</span>
              <p className={`text-lg font-bold ${diferencaAtual > 0 ? "text-destructive" : diferencaAtual < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                {diferencaAtual > 0 ? "+" : ""}{fmt(diferencaAtual)}
              </p>
            </div>
          )}
          {novoStatus && (
            <div className="text-center min-w-[140px]">
              {(() => {
                const conf = statusConf[novoStatus];
                const Icon = conf.icon;
                return (
                  <Badge variant="outline" className={`text-xs gap-1 px-3 py-1 ${conf.className}`}>
                    <Icon className="w-3 h-3" /> {conf.label}
                  </Badge>
                );
              })()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SimulacaoPanel;
