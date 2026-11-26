import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, LockKeyhole } from "lucide-react";
import { SIGLA, NOME_TIPO } from "@/lib/escala-v2/exportar";
import { idCelula } from "./celula";
import { NOMES_DIA, diaSemana, diasDoMes, fmtDur, numData, type Contexto, type DiaEscala, type Validacao } from "@/lib/escala-v2/motor";

interface Props {
  ctx: Contexto;
  validacao: Validacao;
  /** undefined = somente leitura */
  aoEditar?: (pessoaId: string, data: string, atual: DiaEscala | undefined) => void;
}

const COR: Record<string, string> = {
  T: "bg-card hover:bg-muted",
  F: "bg-success/15 text-success hover:bg-success/25 font-semibold",
  FR: "bg-warning/15 text-warning hover:bg-warning/25 font-semibold",
  FER: "bg-muted text-muted-foreground",
  AT: "bg-muted text-muted-foreground",
  AF: "bg-muted text-muted-foreground",
};

export default function GradeEscala({ ctx, validacao, aoEditar }: Props) {
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const dias = useMemo(() => diasDoMes(ctx.ano, ctx.mes).map(n => ({ n, data: numData(n), dsem: diaSemana(n) })), [ctx.ano, ctx.mes]);
  const mapa = useMemo(() => new Map(ctx.dias.map(d => [`${d.pessoa_id}|${d.data}`, d])), [ctx.dias]);
  const feriados = useMemo(() => new Map(ctx.feriados.map(f => [f.data, f.nome])), [ctx.feriados]);
  const porCelula = useMemo(() => {
    const m = new Map<string, { erro: boolean; textos: string[] }>();
    for (const v of validacao.violacoes) {
      if (!v.pessoa_id || !v.data || v.nivel === "info") continue;
      const k = `${v.pessoa_id}|${v.data}`;
      const atual = m.get(k) || { erro: false, textos: [] };
      atual.erro = atual.erro || v.nivel === "erro";
      atual.textos.push(v.mensagem);
      m.set(k, atual);
    }
    return m;
  }, [validacao]);
  const furos = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of validacao.violacoes) if (v.regra === "cobertura" && v.setor && v.data) m.set(`${v.setor}|${v.data}`, v.mensagem);
    return m;
  }, [validacao]);
  const resumo = useMemo(() => new Map(validacao.resumo.map(r => [r.pessoa_id, r])), [validacao]);
  const setores = useMemo(() => [...new Set(ctx.pessoas.map(p => p.setor))].sort((a, b) => a.localeCompare(b)), [ctx.pessoas]);
  const alternar = (setor: string) => setFechados(old => { const n = new Set(old); if (n.has(setor)) n.delete(setor); else n.add(setor); return n; });

  return (
    <div className="overflow-auto border rounded-md max-h-[70vh]">
      <table className="text-xs border-separate border-spacing-0 w-full">
        <thead className="sticky top-0 z-20">
          <tr>
            <th className="sticky left-0 z-30 bg-card text-left p-3 min-w-44 border-b border-r font-medium">Funcionário</th>
            {dias.map(d => {
              const feriado = feriados.get(d.data);
              return (
                <th key={d.data} title={feriado} className={`px-1 py-2 min-w-[3.4rem] border-b font-medium ${feriado ? "bg-warning/20" : d.dsem === 0 ? "bg-muted" : "bg-card"}`}>
                  <span className="tabular-nums">{d.data.slice(8)}</span>
                  <span className={`block font-normal ${feriado ? "text-warning" : "text-muted-foreground"}`}>{feriado ? "Feriado" : NOMES_DIA[d.dsem]}</span>
                </th>
              );
            })}
            {["Horas", "Folgas", "Dom."].map(t => <th key={t} className="bg-card px-2 py-2 min-w-14 border-b border-l font-medium" title={t === "Dom." ? "Domingos trabalhados no mês" : undefined}>{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {setores.map(setor => {
            const equipe = ctx.pessoas.filter(p => p.setor === setor).sort((a, b) => a.nome.localeCompare(b.nome));
            const fechado = fechados.has(setor);
            return [
              <tr key={`s-${setor}`}>
                <td colSpan={dias.length + 4} className="bg-muted/60 border-b p-0">
                  <button type="button" onClick={() => alternar(setor)} className="sticky left-0 flex items-center gap-2 px-3 py-2 font-medium text-sm">
                    {fechado ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                    {setor}
                    <span className="font-normal text-muted-foreground">{equipe.length} {equipe.length === 1 ? "pessoa" : "pessoas"}</span>
                  </button>
                </td>
              </tr>,
              ...(fechado ? [] : equipe.map(p => {
                const r = resumo.get(p.id);
                return (
                  <tr key={p.id}>
                    <th className="sticky left-0 z-10 bg-card text-left px-3 py-1.5 border-b border-r font-medium whitespace-nowrap max-w-56 truncate" title={p.nome}>{p.nome}</th>
                    {dias.map(d => {
                      const dia = mapa.get(`${p.id}|${d.data}`);
                      const pend = porCelula.get(`${p.id}|${d.data}`);
                      const rotulo = `${p.nome}, dia ${d.data.slice(8)}: ${dia ? (dia.tipo === "T" ? `${dia.inicio} às ${dia.fim}` : NOME_TIPO[dia.tipo]) : "sem definição"}`;
                      const conteudo = !dia ? <span className="text-muted-foreground">·</span> : dia.tipo === "T"
                        ? <span className="tabular-nums leading-tight block">{dia.inicio}<span className="block text-muted-foreground">{dia.fim}</span></span>
                        : SIGLA[dia.tipo];
                      const classes = `relative w-full h-10 rounded-sm px-0.5 ${dia ? COR[dia.tipo] : "bg-card"} ${pend ? (pend.erro ? "ring-2 ring-inset ring-destructive" : "ring-2 ring-inset ring-warning") : ""}`;
                      return (
                        <td key={d.data} id={idCelula(p.id, d.data)} className="p-0.5 border-b text-center scroll-mt-24">
                          {aoEditar
                            ? <button type="button" className={classes} aria-label={rotulo} title={pend?.textos.join("\n")} onClick={() => aoEditar(p.id, d.data, dia)}>{conteudo}{dia?.travado && <LockKeyhole size={9} className="absolute right-0.5 top-0.5 opacity-70" />}</button>
                            : <div className={`${classes} flex items-center justify-center`} aria-label={rotulo} title={pend?.textos.join("\n")}>{conteudo}</div>}
                        </td>
                      );
                    })}
                    <td className="px-2 border-b border-l text-center tabular-nums">{fmtDur(r?.minutos || 0)}</td>
                    <td className="px-2 border-b text-center tabular-nums">{r?.folgas ?? 0}</td>
                    <td className="px-2 border-b text-center tabular-nums">{r?.domingos_trabalhados ?? 0}</td>
                  </tr>
                );
              })),
              ...(fechado ? [] : [
                <tr key={`c-${setor}`}>
                  <th className="sticky left-0 z-10 bg-card text-left px-3 py-1.5 border-b border-r font-normal text-muted-foreground">Trabalhando no dia</th>
                  {dias.map(d => {
                    const n = equipe.filter(p => mapa.get(`${p.id}|${d.data}`)?.tipo === "T").length;
                    const furo = furos.get(`${setor}|${d.data}`);
                    return <td key={d.data} title={furo} className={`border-b text-center tabular-nums py-1.5 ${furo ? "text-warning font-semibold" : "text-muted-foreground"}`}>{n}{furo ? " !" : ""}</td>;
                  })}
                  <td colSpan={3} className="border-b border-l" />
                </tr>,
              ]),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
