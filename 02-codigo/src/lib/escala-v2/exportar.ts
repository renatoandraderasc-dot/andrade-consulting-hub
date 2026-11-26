import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AVISO_LEGAL } from "./leis";
import { NOMES_DIA, dataNum, diaSemana, diasDoMes, fmtDur, numData, type Contexto, type DiaEscala, type Validacao } from "./motor";

export const SIGLA: Record<string, string> = { F: "F", FR: "FE", FER: "FÉR", AT: "AT", AF: "AF" };
export const NOME_TIPO: Record<string, string> = { T: "Trabalho", F: "Folga", FR: "Feriado", FER: "Férias", AT: "Atestado", AF: "Afastado" };
const LEGENDA = "F = folga (repouso semanal) · FE = feriado · FÉR = férias · AT = atestado · AF = afastado";

function celula(d: DiaEscala | undefined): string {
  if (!d) return "";
  return d.tipo === "T" ? `${d.inicio || ""}-${d.fim || ""}` : SIGLA[d.tipo];
}

function linhas(ctx: Contexto, v: Validacao) {
  const dias = diasDoMes(ctx.ano, ctx.mes).map(numData);
  const mapa = new Map(ctx.dias.map(d => [`${d.pessoa_id}|${d.data}`, d]));
  const pessoas = ctx.pessoas.slice().sort((a, b) => a.setor.localeCompare(b.setor) || a.nome.localeCompare(b.nome));
  return {
    dias,
    pessoas,
    linhaDe: (pid: string) => dias.map(d => celula(mapa.get(`${pid}|${d}`))),
    resumoDe: (pid: string) => v.resumo.find(r => r.pessoa_id === pid),
  };
}

export function exportarExcelV2(ctx: Contexto, v: Validacao, loja: string) {
  const { dias, pessoas, linhaDe, resumoDe } = linhas(ctx, v);
  const cab = ["Setor", "Funcionário", ...dias.map(d => `${d.slice(8)} ${NOMES_DIA[diaSemana(dataNum(d))]}`), "Horas", "Folgas", "Domingos trabalhados"];
  const corpo = pessoas.map(p => {
    const r = resumoDe(p.id);
    return [p.setor, p.nome, ...linhaDe(p.id), fmtDur(r?.minutos || 0), r?.folgas || 0, r?.domingos_trabalhados || 0];
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[`Escala ${String(ctx.mes).padStart(2, "0")}/${ctx.ano} — ${loja}`], [], cab, ...corpo, [], [LEGENDA]]);
  ws["!cols"] = [{ wch: 18 }, { wch: 28 }, ...dias.map(() => ({ wch: 12 })), { wch: 8 }, { wch: 7 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, "Escala");
  const pend = v.violacoes.map(x => ({ Tipo: x.nivel === "erro" ? "Pendência legal" : x.nivel === "alerta" ? "Alerta" : "Informação", Data: x.data || "", Descrição: x.mensagem, "Base legal": x.base_legal }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pend.length ? pend : [{ Tipo: "", Data: "", Descrição: "Nenhuma pendência encontrada na conferência automática.", "Base legal": "" }]), "Conferência");
  XLSX.writeFile(wb, `Escala-${ctx.ano}-${String(ctx.mes).padStart(2, "0")}.xlsx`);
}

/** PDF em paisagem, uma página por setor, para o quadro de avisos. */
export function imprimirMuralV2(ctx: Contexto, v: Validacao, loja: string, mesNome: string, publicada: boolean) {
  const { dias, pessoas, linhaDe, resumoDe } = linhas(ctx, v);
  const pdf = new jsPDF({ orientation: "landscape", format: "a4" });
  const setores = [...new Set(pessoas.map(p => p.setor))];
  setores.forEach((setor, i) => {
    if (i) pdf.addPage();
    pdf.setFontSize(13);
    pdf.text(`Escala de ${mesNome} de ${ctx.ano} — ${setor} — ${loja}`, 10, 12);
    pdf.setFontSize(8);
    pdf.text(publicada ? "Escala publicada" : "RASCUNHO — ainda não publicada", 10, 18);
    autoTable(pdf, {
      startY: 22,
      head: [["Funcionário", ...dias.map(d => `${d.slice(8)}\n${NOMES_DIA[diaSemana(dataNum(d))]}`), "Horas", "F"]],
      body: pessoas.filter(p => p.setor === setor).map(p => {
        const r = resumoDe(p.id);
        return [p.nome, ...linhaDe(p.id).map(c => c.replace("-", "\n")), fmtDur(r?.minutos || 0), String(r?.folgas || 0)];
      }),
      styles: { fontSize: 5.5, cellPadding: 0.8, halign: "center", valign: "middle" },
      headStyles: { fillColor: [202, 49, 85], fontSize: 5.5 },
      columnStyles: { 0: { cellWidth: 32, halign: "left" } },
      margin: 8,
      didParseCell: h => {
        if (h.section !== "body" || h.column.index === 0) return;
        const t = String(h.cell.raw);
        if (t === "F") h.cell.styles.fillColor = [220, 245, 228];
        else if (t === "FE") h.cell.styles.fillColor = [253, 236, 200];
        else if (t === "FÉR" || t === "AT" || t === "AF") h.cell.styles.fillColor = [226, 232, 240];
      },
    });
    pdf.setFontSize(7);
    pdf.text(LEGENDA, 10, 200);
    pdf.text(pdf.splitTextToSize(AVISO_LEGAL, 277), 10, 204);
  });
  pdf.save(`Escala-mural-${ctx.ano}-${String(ctx.mes).padStart(2, "0")}.pdf`);
}
