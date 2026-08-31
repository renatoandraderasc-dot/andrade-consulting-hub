import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, Check, Lock, Unlock, Pin, RefreshCw, Repeat, Save, Sparkles, Trash2,
} from "lucide-react";
import { formatBRL } from "@/lib/formatters";
import {
  Alternativa, CalendarioRow, DiagnosticoEncarte, Face, ItemEncarte, ModeloRow,
  faixaClass, faixaLabel, pct,
} from "./types";
import TrocaProdutoDialog from "./TrocaProdutoDialog";
import DiagnosticoPanel from "./DiagnosticoPanel";

interface Store { id: string; name: string }

interface Props {
  stores: Store[];
  storeId: string;
  onStoreChange: (v: string) => void;
  calendarios: CalendarioRow[];
  calendarioId: string;
  onCalendarioChange: (v: string) => void;
  modelos: ModeloRow[];
  modeloId: string;
  onModeloChange: (v: string) => void;
  dataInicio: string;
  dataFim: string;
  onDataInicio: (v: string) => void;
  onDataFim: (v: string) => void;
  itens: ItemEncarte[];
  setItens: (f: (prev: ItemEncarte[]) => ItemEncarte[]) => void;
  alternativas: Record<string, Alternativa[]>;
  loading: boolean;
  salvando: boolean;
  aviso: string | null;
  status: string;
  lojaVr: boolean;
  isAdmin: boolean;
  diagnostico?: DiagnosticoEncarte | null;
  onGerar: (manterTravados: boolean) => void;
  onSalvar: () => void;
  onAprovar: () => void;
}

const MontagemTab = (p: Props) => {
  const [troca, setTroca] = useState<{ face: Face; posicao: number } | null>(null);

  const cal = p.calendarios.find((c) => c.id === p.calendarioId);

  const recalc = (item: ItemEncarte, preco: number): ItemEncarte => {
    const pmz = item.pmz ?? item.custo ?? 0;
    return {
      ...item,
      preco_oferta: preco,
      margem_oferta: preco > 0 ? ((preco - pmz) / preco) * 100 : 0,
      origem: "manual",
    };
  };

  const atualizar = (face: Face, posicao: number, patch: Partial<ItemEncarte>) =>
    p.setItens((prev) =>
      prev.map((i) => (i.face === face && i.posicao === posicao ? { ...i, ...patch } : i)),
    );

  const escolher = (face: Face, posicao: number, a: Alternativa) =>
    p.setItens((prev) =>
      prev.map((i) =>
        i.face === face && i.posicao === posicao
          ? {
              ...i,
              codigo: a.codigo, descricao: a.descricao, ean: a.ean,
              custo: a.custo, pmz: a.pmz, venda_atual: a.preco_venda,
              margem_atual: a.margem_atual, preco_oferta: a.preco_oferta,
              margem_oferta: a.preco_oferta > 0 ? ((a.preco_oferta - a.pmz) / a.preco_oferta) * 100 : 0,
              categoria: a.categoria, score: a.score, estoque: a.estoque,
              volume_30d: a.volume_30d, origem: "manual", alerta: null, ciente: false,
              motivo: { ...a.motivo, preco_concorrente: a.preco_concorrente, concorrente: a.concorrente },
            }
          : i,
      ),
    );

  const limpar = (face: Face, posicao: number) =>
    atualizar(face, posicao, {
      codigo: null, descricao: null, ean: null, custo: null, pmz: null,
      venda_atual: null, margem_atual: null, preco_oferta: null, margem_oferta: null,
      categoria: null, score: null, motivo: null, alerta: null, ciente: false, origem: "manual",
    });

  const alertasPendentes = p.itens.some((i) => i.alerta && !i.ciente);

  const Tabela = ({ face }: { face: Face }) => {
    const linhas = useMemo(
      () => p.itens.filter((i) => i.face === face).sort((a, b) => a.posicao - b.posicao),
      [face],
    );
    const preenchidos = linhas.filter((i) => i.codigo).length;
    const invest = linhas.reduce(
      (s, i) => s + Math.max(0, (i.venda_atual ?? 0) - (i.preco_oferta ?? 0)) * (i.volume_30d ?? 0),
      0,
    );
    const pesoTotal = linhas.reduce((s, i) => s + (i.preco_oferta ?? 0) * (i.volume_30d ?? 0), 0);
    const margemPond = pesoTotal
      ? linhas.reduce((s, i) => s + (i.margem_oferta ?? 0) * (i.preco_oferta ?? 0) * (i.volume_30d ?? 0), 0) / pesoTotal
      : linhas.filter((i) => i.margem_oferta != null).reduce((s, i, _, arr) => s + (i.margem_oferta ?? 0) / arr.length, 0);

    return (
      <Card className="p-4 space-y-3">
        <h3 className="text-base font-semibold">{face === "capa" ? "Capa" : "Verso"}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="py-2 pr-2 w-10">Nº</th>
                <th className="py-2 pr-2">Faixa</th>
                <th className="py-2 pr-2">Departamento / Categoria</th>
                <th className="py-2 pr-2">Cód</th>
                <th className="py-2 pr-2">Produto</th>
                <th className="py-2 pr-2 text-right">Custo</th>
                <th className="py-2 pr-2 text-right">PMZ</th>
                <th className="py-2 pr-2 text-right">Venda</th>
                <th className="py-2 pr-2 text-right">Margem</th>
                <th className="py-2 pr-2 text-right">Oferta</th>
                <th className="py-2 pr-2 text-right">Margem oferta</th>
                <th className="py-2 pr-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {p.loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={12} className="py-1.5">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))}
              {!p.loading && linhas.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-muted-foreground">
                    Nenhuma posição carregada. Escolha o encarte e clique em Gerar sugestão.
                  </td>
                </tr>
              )}
              {!p.loading &&
                linhas.map((i) => (
                  <tr
                    key={`${i.face}-${i.posicao}`}
                    className={`border-b border-border/50 ${i.alerta ? "bg-amber-500/10" : ""}`}
                  >
                    <td className="py-1.5 pr-2 text-muted-foreground">{i.posicao}</td>
                    <td className="py-1.5 pr-2">
                      <span className={`px-2 py-0.5 rounded border text-xs ${faixaClass(String(i.tipo_faixa))}`}>
                        {faixaLabel(String(i.tipo_faixa))}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2">
                      {i.departamento ?? "—"}
                      {i.categoria && (
                        <span className="block text-xs text-muted-foreground">{i.categoria}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-xs">{i.codigo ?? "—"}</td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        {i.alerta && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>{i.alerta}</TooltipContent>
                          </Tooltip>
                        )}
                        {i.origem === "fixo" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Pin className="w-3.5 h-3.5 text-primary shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>fixado em Capa &amp; Verso</TooltipContent>
                          </Tooltip>
                        )}
                        {!!i.nivel_relaxamento && i.nivel_relaxamento > 0 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={`px-1.5 py-0.5 rounded border text-[10px] shrink-0 ${
                                  i.nivel_relaxamento >= 5
                                    ? "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30"
                                    : "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30"
                                }`}
                              >
                                N{i.nivel_relaxamento}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{i.motivo_escolha ?? "regra relaxada"}</TooltipContent>
                          </Tooltip>
                        )}
                        {i.motivo ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">{i.descricao ?? "—"}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <span className="text-xs">
                                Por que este produto: giro{" "}
                                {((Number(i.motivo.giro) || 0) * 100).toFixed(0)}% · folga de margem{" "}
                                {((Number(i.motivo.folga_margem) || 0) * 100).toFixed(0)}% ·
                                competitividade {((Number(i.motivo.competitividade) || 0) * 100).toFixed(0)}% ·
                                estoque {((Number(i.motivo.estoque) || 0) * 100).toFixed(0)}%
                                {i.motivo.preco_concorrente
                                  ? ` · concorrente ${formatBRL(Number(i.motivo.preco_concorrente))}`
                                  : ""}
                              </span>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          (i.descricao ?? "—")
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-right">{i.custo != null ? formatBRL(i.custo) : "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{i.pmz != null ? formatBRL(i.pmz) : "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{i.venda_atual != null ? formatBRL(i.venda_atual) : "—"}</td>
                    <td className="py-1.5 pr-2 text-right">{pct(i.margem_atual)}</td>
                    <td className="py-1.5 pr-2 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 w-24 text-right ml-auto"
                        disabled={!i.codigo || !p.isAdmin}
                        value={i.preco_oferta ?? ""}
                        onChange={(e) =>
                          p.setItens((prev) =>
                            prev.map((x) =>
                              x.face === i.face && x.posicao === i.posicao
                                ? recalc(x, Number(e.target.value))
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-right font-medium">{pct(i.margem_oferta)}</td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-1 justify-end">
                        {i.alerta && !i.ciente && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon" variant="ghost" className="h-7 w-7"
                                onClick={() => atualizar(i.face, i.posicao, { ciente: true })}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Marcar como ciente</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              disabled={!p.isAdmin}
                              onClick={() => setTroca({ face: i.face, posicao: i.posicao })}
                            >
                              <Repeat className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Trocar produto</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              disabled={!p.isAdmin}
                              onClick={() => atualizar(i.face, i.posicao, { travado: !i.travado })}
                            >
                              {i.travado ? <Lock className="w-4 h-4 text-primary" /> : <Unlock className="w-4 h-4" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{i.travado ? "Destravar" : "Travar item"}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              disabled={!p.isAdmin}
                              onClick={() => limpar(i.face, i.posicao)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Limpar posição</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t border-border pt-2">
          <span>
            Preenchidos: <strong className="text-foreground">{preenchidos}</strong> / {linhas.length} posições
          </span>
          <span>
            Margem média ponderada: <strong className="text-foreground">{pct(margemPond)}</strong>
          </span>
          <span>
            Investimento estimado: <strong className="text-foreground">{formatBRL(invest)}</strong>
          </span>
        </div>
      </Card>
    );
  };

  const itemTroca = troca
    ? p.itens.find((i) => i.face === troca.face && i.posicao === troca.posicao)
    : null;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">Loja</Label>
            <Select value={p.storeId} onValueChange={p.onStoreChange}>
              <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
              <SelectContent>
                {p.stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label className="text-xs">Encarte do mês</Label>
            <Select value={p.calendarioId} onValueChange={p.onCalendarioChange}>
              <SelectTrigger><SelectValue placeholder="Selecione o encarte" /></SelectTrigger>
              <SelectContent>
                {p.calendarios.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} · dias {c.dia_inicio} a {c.dia_fim} · faixa {faixaLabel(c.tipo_faixa)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Início</Label>
            <Input type="date" value={p.dataInicio} onChange={(e) => p.onDataInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fim</Label>
            <Input type="date" value={p.dataFim} onChange={(e) => p.onDataFim(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Modelo de montagem</Label>
            <Select value={p.modeloId} onValueChange={p.onModeloChange}>
              <SelectTrigger><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
              <SelectContent>
                {p.modelos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {cal && (
            <div className="md:col-span-3 flex items-end">
              <p className="text-xs text-muted-foreground">
                {cal.nome} · dias {cal.dia_inicio} a {cal.dia_fim} · faixa {faixaLabel(cal.tipo_faixa)} · AGV{" "}
                {Number(cal.agv_pct).toFixed(1)}%
              </p>
            </div>
          )}
        </div>

        {p.aviso && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            {p.aviso}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={() => p.onGerar(false)}
                  disabled={!p.isAdmin || !p.storeId || !p.modeloId || p.loading || !p.lojaVr}
                >
                  <Sparkles className="w-4 h-4 mr-2" /> Gerar sugestão
                </Button>
              </span>
            </TooltipTrigger>
            {!p.lojaVr && <TooltipContent>Disponível só para lojas VR</TooltipContent>}
          </Tooltip>
          <Button
            variant="outline"
            onClick={() => p.onGerar(true)}
            disabled={!p.isAdmin || p.loading || !p.lojaVr || p.itens.length === 0}
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Regerar não travados
          </Button>
          <Button variant="outline" onClick={p.onSalvar} disabled={!p.isAdmin || p.salvando || !p.itens.length}>
            <Save className="w-4 h-4 mr-2" /> Salvar rascunho
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="default"
                  onClick={p.onAprovar}
                  disabled={!p.isAdmin || p.salvando || !p.itens.length || alertasPendentes || p.status === "aprovado"}
                >
                  <Check className="w-4 h-4 mr-2" />
                  {p.status === "aprovado" ? "Encarte aprovado" : "Aprovar encarte"}
                </Button>
              </span>
            </TooltipTrigger>
            {alertasPendentes && (
              <TooltipContent>Existem itens com alerta não reconhecido</TooltipContent>
            )}
          </Tooltip>
        </div>
      </Card>

      <DiagnosticoPanel diagnostico={p.diagnostico ?? null} />

      <Tabela face="capa" />
      <Tabela face="verso" />

      <TrocaProdutoDialog
        open={!!troca}
        onOpenChange={(v) => !v && setTroca(null)}
        titulo={
          itemTroca
            ? `${itemTroca.face === "capa" ? "Capa" : "Verso"} nº ${itemTroca.posicao} · ${itemTroca.departamento ?? ""}`
            : ""
        }
        alternativas={troca ? (p.alternativas[`${troca.face}|${troca.posicao}`] ?? []) : []}
        onEscolher={(a) => troca && escolher(troca.face, troca.posicao, a)}
      />
    </div>
  );
};

export default MontagemTab;
