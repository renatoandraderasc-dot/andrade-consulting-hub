import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, AlertTriangle, Wand2 } from "lucide-react";
import { DiagnosticoEncarte, DiagnosticoSlot } from "./types";

interface Props {
  diagnostico: DiagnosticoEncarte | null;
  onEscolherManual?: (slot: DiagnosticoSlot) => void;
}

const DiagnosticoPanel = ({ diagnostico, onEscolherManual }: Props) => {
  const [aberto, setAberto] = useState(true);
  const [funil, setFunil] = useState(false);
  if (!diagnostico) return null;

  const r = diagnostico.resumo;
  const pendentes = diagnostico.slots.filter((s) => s.status === "pendente");

  return (
    <Card className="p-4 space-y-3">
      <button className="flex w-full items-center gap-2 text-left" onClick={() => setAberto((v) => !v)}>
        {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <span className="font-medium">Diagnóstico da sugestão</span>
        <span className="text-sm text-muted-foreground">
          {r.slots} slots · {r.preenchidos} preenchidos · {r.relaxados} com regra relaxada · {r.pendentes} pendentes
          {r.fixos ? ` · ${r.fixos} fixos` : ""}
        </span>
      </button>

      {aberto && (
        <div className="space-y-3">
          {(r.avisos ?? []).map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600" />
              <span>{a}</span>
            </div>
          ))}

          {pendentes.length > 0 && (
            <div className="space-y-1">
              {pendentes.map((s) => (
                <div key={s.slot} className="flex flex-wrap items-center gap-2 border-b border-border/50 py-1.5 text-sm">
                  <Badge variant="destructive">{s.face === "capa" ? "Capa" : "Verso"} #{s.posicao}</Badge>
                  <span>{s.departamento || "—"}</span>
                  <span className="text-muted-foreground">{s.faixa}</span>
                  <span className="text-muted-foreground flex-1">{s.motivo}</span>
                  {onEscolherManual && (
                    <Button size="sm" variant="outline" onClick={() => onEscolherManual(s)}>
                      <Wand2 className="w-4 h-4 mr-2" /> Escolher manualmente
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button size="sm" variant="ghost" onClick={() => setFunil((v) => !v)}>
            {funil ? "Ocultar funil" : "Ver funil completo"}
          </Button>

          {funil && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left uppercase text-muted-foreground border-b border-border">
                    <th className="py-1.5 pr-2">Slot</th>
                    <th className="py-1.5 pr-2">Departamento</th>
                    <th className="py-1.5 pr-2">Faixa</th>
                    <th className="py-1.5 pr-2">Categoria</th>
                    <th className="py-1.5 pr-2 text-right">Brutos</th>
                    <th className="py-1.5 pr-2 text-right">Venda</th>
                    <th className="py-1.5 pr-2 text-right">Margem</th>
                    <th className="py-1.5 pr-2 text-right">Histórico</th>
                    <th className="py-1.5 pr-2 text-right">Estoque</th>
                    <th className="py-1.5 pr-2 text-right">Dedupe</th>
                    <th className="py-1.5 pr-2">Escolhido</th>
                    <th className="py-1.5 pr-2 text-right">Nível</th>
                    <th className="py-1.5 pr-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {diagnostico.slots.map((s) => (
                    <tr key={s.slot} className="border-b border-border/40">
                      <td className="py-1 pr-2">{s.face === "capa" ? "Capa" : "Verso"} #{s.posicao}</td>
                      <td className="py-1 pr-2">{s.departamento || "—"}</td>
                      <td className="py-1 pr-2">{s.faixa}</td>
                      <td className="py-1 pr-2">{s.categoria ?? "—"}</td>
                      <td className="py-1 pr-2 text-right">{s.candidatos_brutos}</td>
                      <td className="py-1 pr-2 text-right">{s.apos_filtro_venda}</td>
                      <td className="py-1 pr-2 text-right">{s.apos_filtro_margem}</td>
                      <td className="py-1 pr-2 text-right">{s.apos_filtro_historico}</td>
                      <td className="py-1 pr-2 text-right">{s.apos_filtro_estoque}</td>
                      <td className="py-1 pr-2 text-right">{s.apos_dedupe}</td>
                      <td className="py-1 pr-2 font-mono">{s.escolhido ?? "—"}</td>
                      <td className="py-1 pr-2 text-right">{s.nivel_relaxamento ?? "—"}</td>
                      <td className="py-1 pr-2 text-muted-foreground">{s.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default DiagnosticoPanel;
