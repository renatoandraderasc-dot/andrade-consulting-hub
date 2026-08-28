import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown, History, Search, Trash2 } from "lucide-react";
import { formatBRL, formatBRDate } from "@/lib/formatters";
import { pct } from "@/components/encarte-sugestao/types";
import {
  LinhaManual, PosicaoManual, corMargem, margemEncarte, pmzDe,
} from "@/components/encarte-sugestao/manualTypes";

interface Props {
  itens: LinhaManual[];
  onChange: (uid: string, patch: Partial<LinhaManual>) => void;
  onRemove: (uid: string) => void;
  cargaTributariaPct: number;
  modo?: "manual" | "sugestao";
}

type Ordem = { campo: keyof LinhaManual | "margem_encarte"; asc: boolean };

const TabelaItensEncarte = ({ itens, onChange, onRemove, cargaTributariaPct }: Props) => {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>({ campo: "ordem", asc: true });

  const ordenar = (campo: Ordem["campo"]) =>
    setOrdem((o) => ({ campo, asc: o.campo === campo ? !o.asc : true }));

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = termo
      ? itens.filter(
          (i) =>
            i.descricao.toLowerCase().includes(termo) ||
            i.codigo.toLowerCase().includes(termo) ||
            i.ean.toLowerCase().includes(termo),
        )
      : itens;
    const valor = (i: LinhaManual) =>
      ordem.campo === "margem_encarte"
        ? margemEncarte(i.preco_encarte, i.custo) ?? -999
        : (i[ordem.campo] as number | string);
    return [...filtradas].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "pt-BR");
      return ordem.asc ? cmp : -cmp;
    });
  }, [itens, busca, ordem]);

  const totais = useMemo(() => {
    const validos = itens.filter((i) => i.encontrado);
    const capa = validos.filter((i) => i.posicao === "capa").length;
    const peso = validos.reduce((s, i) => s + (i.preco_encarte ?? 0), 0);
    const margem = peso
      ? validos.reduce((s, i) => s + (margemEncarte(i.preco_encarte, i.custo) ?? 0) * (i.preco_encarte ?? 0), 0) / peso
      : 0;
    return { total: validos.length, capa, verso: validos.length - capa, margem };
  }, [itens]);

  const Th = ({ campo, children, right }: { campo: Ordem["campo"]; children: React.ReactNode; right?: boolean }) => (
    <th className={`py-2 pr-2 ${right ? "text-right" : "text-left"}`}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => ordenar(campo)}>
        {children}
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          className="pl-8 h-9"
          placeholder="Buscar por descrição, código ou EAN"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
              <Th campo="codigo">Código</Th>
              <Th campo="ean">EAN</Th>
              <Th campo="descricao">Descrição</Th>
              <Th campo="secao">Seção</Th>
              <Th campo="custo" right>Último custo</Th>
              <Th campo="preco_venda" right>Preço atual</Th>
              <Th campo="margem_pct" right>Margem atual</Th>
              <th className="py-2 pr-2 text-right">Última promoção</th>
              {[1, 2, 3, 4].map((n) => (
                <th key={n} className="py-2 pr-2 text-right">S-{n}</th>
              ))}
              <Th campo="qtd_4sem" right>Total 4 sem</Th>
              <Th campo="media_semanal_qtd" right>Média/sem</Th>
              <th className="py-2 pr-2 text-right">Preço do encarte</th>
              <Th campo="margem_encarte" right>Margem no encarte</Th>
              <th className="py-2 pr-2">Posição</th>
              <th className="py-2 pr-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={18} className="py-10 text-center text-muted-foreground">
                  Nenhum item na lista. Cole os códigos e clique em Buscar dados.
                </td>
              </tr>
            )}
            {linhas.map((i) => {
              const m = margemEncarte(i.preco_encarte, i.custo);
              return (
                <tr
                  key={i.uid}
                  className={`border-b border-border/50 ${i.encontrado ? "" : "bg-destructive/10"}`}
                >
                  {!i.encontrado ? (
                    <>
                      <td className="py-1.5 pr-2 font-mono text-xs">{i.codigo_digitado}</td>
                      <td colSpan={16} className="py-1.5 pr-2 text-destructive text-xs">
                        código não localizado
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 pr-2 font-mono text-xs">{i.codigo}</td>
                      <td className="py-1.5 pr-2 font-mono text-xs">{i.ean || "—"}</td>
                      <td className="py-1.5 pr-2 min-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          {i.ja_saiu_recente && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent>Já saiu em encarte recentemente</TooltipContent>
                            </Tooltip>
                          )}
                          <Input
                            className="h-8"
                            value={i.descricao_encarte}
                            onChange={(e) => onChange(i.uid, { descricao_encarte: e.target.value })}
                          />
                        </div>
                        {i.em_oferta_hoje && (
                          <Badge variant="secondary" className="mt-1 text-[10px]">Em oferta hoje</Badge>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-xs text-muted-foreground">{i.secao || "—"}</td>
                      <td className="py-1.5 pr-2 text-right">{formatBRL(i.custo)}</td>
                      <td className="py-1.5 pr-2 text-right">{formatBRL(i.preco_venda)}</td>
                      <td className="py-1.5 pr-2 text-right">{pct(i.margem_pct)}</td>
                      <td className="py-1.5 pr-2 text-right">
                        {i.preco_ultima_oferta != null ? formatBRL(i.preco_ultima_oferta) : "—"}
                        {i.data_fim_ultima_oferta && (
                          <span className="block text-[10px] text-muted-foreground">
                            {formatBRDate(i.data_fim_ultima_oferta)}
                            {i.dias_desde_ultima_oferta != null && ` · há ${i.dias_desde_ultima_oferta} dias`}
                          </span>
                        )}
                      </td>
                      {i.semanas.map((s, idx) => (
                        <td
                          key={idx}
                          className={`py-1.5 pr-2 text-right ${s.oferta ? "bg-amber-500/20" : ""}`}
                        >
                          {s.qtd.toLocaleString("pt-BR")}
                          {s.oferta && <span className="ml-1 text-[9px] font-semibold text-amber-700">OF</span>}
                        </td>
                      ))}
                      <td className="py-1.5 pr-2 text-right">{i.qtd_4sem.toLocaleString("pt-BR")}</td>
                      <td className="py-1.5 pr-2 text-right">
                        {i.media_semanal_qtd.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Input
                              className="h-8 w-24 text-right"
                              inputMode="decimal"
                              value={i.preco_encarte ?? ""}
                              onChange={(e) => {
                                const v = e.target.value.replace(",", ".");
                                onChange(i.uid, { preco_encarte: v === "" ? null : Number(v) });
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            PMZ: {formatBRL(pmzDe(i.custo, cargaTributariaPct))}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className={`py-1.5 pr-2 text-right font-medium ${corMargem(m)}`}>{pct(m)}</td>
                      <td className="py-1.5 pr-2">
                        <Select
                          value={i.posicao}
                          onValueChange={(v) => onChange(i.uid, { posicao: v as PosicaoManual })}
                        >
                          <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="capa">Capa</SelectItem>
                            <SelectItem value="verso">Verso</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </>
                  )}
                  <td className="py-1.5 pr-2 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRemove(i.uid)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 flex flex-wrap gap-4 border-t border-border bg-card/95 px-1 py-2 text-sm">
        <span><strong>{totais.total}</strong> itens</span>
        <span>Capa: <strong>{totais.capa}</strong></span>
        <span>Verso: <strong>{totais.verso}</strong></span>
        <span className={corMargem(totais.margem)}>
          Margem média ponderada: <strong>{pct(totais.margem)}</strong>
        </span>
      </div>
    </div>
  );
};

export default TabelaItensEncarte;
