import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { diasDoMes, numParaData, minParaHhmm, validarEscala } from './escala-motor';
import type { DadosEscala } from './carregarContexto';
export const SIGLAS: Record<string, string> = { FOLGA: 'F', FOLGA_COMP: 'FC', FERIAS: 'FÉR', ATESTADO: 'AT', AFASTADO: 'AF', FERIADO: 'FE' };
export function linhasExportacao(dados: DadosEscala) {
  const dias = diasDoMes(dados.ctx.ano, dados.ctx.mes).map(numParaData);
  const valid = validarEscala(dados.ctx);
  const linhas = dados.funcionarios.map(f => {
    const r = valid.resumo.find(x => x.funcionario_id === f.id);
    const row: Record<string, string | number> = { Departamento: f.departamento, Funcionário: f.nome };
    for (const d of dias) {
      const a = dados.ctx.alocacoes?.find(x => x.funcionario_id === f.id && x.data === d);
      row[d.slice(8)] = a ? a.status === 'TRABALHO' ? dados.turnos.find(t => t.id === a.turno_id)?.codigo || `${a.inicio || ''}–${a.fim || ''}` : SIGLAS[a.status] : '—';
    }
    row.Horas = minParaHhmm(r?.minutos_trabalhados || 0); row.Folgas = r?.folgas || 0; row.Domingos = r?.domingos_folga || 0; row.HE = minParaHhmm(r?.minutos_acima_limite || 0);
    return row;
  });
  return { linhas, valid, dias };
}
export function exportarExcel(dados: DadosEscala) {
  const { linhas, valid } = linhasExportacao(dados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Escala');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(valid.violacoes.map(v => ({ Nível: v.nivel, Regra: v.regra, Funcionário: dados.funcionarios.find(f => f.id === v.funcionario_id)?.nome || '', Data: v.data || '', Mensagem: v.mensagem, 'Base legal': v.base_legal || '' }))), 'Pendências');
  XLSX.writeFile(wb, `Escala-${dados.ctx.ano}-${dados.ctx.mes}.xlsx`);
}
export function imprimirMural(dados: DadosEscala, loja: string, mes: string) {
  const { linhas, dias } = linhasExportacao(dados);
  const pdf = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const departamentos = [...new Set(dados.funcionarios.map(f => f.departamento))];
  departamentos.forEach((dep, index) => {
    if (index) pdf.addPage();
    pdf.setFontSize(13); pdf.text(`Escala ${dep} — ${mes}/${dados.ctx.ano} — ${loja}`, 10, 12);
    pdf.setFontSize(8); pdf.text(dados.periodo?.status === 'publicada' ? `Publicada em ${dados.periodo.publicado_em?.slice(0, 10)} · versão ${dados.periodo.versao}` : `RASCUNHO · versão ${dados.periodo?.versao || 1}`, 10, 19);
    autoTable(pdf, { startY: 25, head: [['Funcionário', ...dias.map(d => d.slice(8)), 'Horas','F','Dom','HE']], body: linhas.filter(r => r.Departamento === dep).map(r => [String(r.Funcionário), ...dias.map(d => String(r[d.slice(8)])), String(r.Horas), String(r.Folgas), String(r.Domingos), String(r.HE)]), styles: { fontSize: 6, cellPadding: 1.2 }, columnStyles: { 0: { cellWidth: 35 } }, margin: 10 });
    pdf.text('F = Folga · FC = Folga compensatória · FÉR = Férias · AT = Atestado · AF = Afastado · FE = Feriado', 10, 199);
    if (dados.periodo?.status !== 'publicada') { pdf.setFontSize(35); pdf.text('RASCUNHO', 95, 120, { angle: 20 }); }
  });
  pdf.save(`Escala-mural-${dados.ctx.ano}-${dados.ctx.mes}.pdf`);
}