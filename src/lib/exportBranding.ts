import * as XLSX from "xlsx";
import logoUrl from "@/assets/andrade-logo.png";

export const EMPRESA = "Andrade Consultoria Ltda";

const dois = (n: number) => String(n).padStart(2, "0");

/** Carimbo legivel: 27/08/2026 22:41 */
export const carimboData = (d = new Date()) =>
  `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;

/** Carimbo para nome de arquivo: 27-08-2026 22h41 */
export const carimboArquivo = (d = new Date()) =>
  `${dois(d.getDate())}-${dois(d.getMonth() + 1)}-${d.getFullYear()} ${dois(d.getHours())}h${dois(d.getMinutes())}`;

/** Nome padrao: "Andrade Consultoria Ltda - Relatorio - 27-08-2026 22h41.xlsx" */
export const nomeArquivo = (base: string, ext: string, d = new Date()) =>
  `${EMPRESA} - ${base} - ${carimboArquivo(d)}.${ext.replace(/^\./, "")}`;

let logoCache: { dataUrl: string; w: number; h: number } | null = null;

/** Logotipo em base64 (para PDF). */
export const carregarLogo = async () => {
  if (logoCache) return logoCache;
  const blob = await fetch(logoUrl).then((r) => r.blob());
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
  const dims = await new Promise<{ w: number; h: number }>((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res({ w: 400, h: 120 });
    img.src = dataUrl;
  });
  logoCache = { dataUrl, ...dims };
  return logoCache;
};

/** Desenha o cabecalho de marca no PDF e devolve o Y inicial do conteudo. */
export const cabecalhoPdf = async (
  doc: any,
  titulo: string,
  subtitulo?: string,
  d = new Date(),
) => {
  const largura = doc.internal.pageSize.getWidth();
  let x = 12;
  try {
    const { dataUrl, w, h } = await carregarLogo();
    const alturaLogo = 12;
    const larguraLogo = Math.max(12, (w / h) * alturaLogo);
    doc.addImage(dataUrl, "PNG", 12, 8, larguraLogo, alturaLogo);
    x = 12 + larguraLogo + 6;
  } catch {
    /* segue sem logo */
  }
  doc.setFontSize(13);
  doc.setTextColor(20, 33, 61);
  doc.text(titulo, x, 14);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(EMPRESA, x, 19.5);
  if (subtitulo) doc.text(subtitulo, x, 24.5);
  doc.text(`Exportado em ${carimboData(d)}`, largura - 12, 14, { align: "right" });
  doc.setTextColor(0);
  doc.setDrawColor(220);
  doc.line(12, 28, largura - 12, 28);
  return 34;
};

/** Aba de identificacao com marca e data/hora, inserida como primeira aba. */
export const adicionarAbaMarca = (
  wb: XLSX.WorkBook,
  titulo: string,
  extras: [string, string][] = [],
  d = new Date(),
) => {
  const ws = XLSX.utils.aoa_to_sheet([
    [EMPRESA],
    ["Relatório", titulo],
    ["Exportado em", carimboData(d)],
    ...extras,
  ]);
  ws["!cols"] = [{ wch: 22 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, ws, "Andrade Consultoria");
  wb.SheetNames = ["Andrade Consultoria", ...wb.SheetNames.filter((n) => n !== "Andrade Consultoria")];
  return wb;
};

/** Salva o workbook com aba de marca e nome padronizado. */
export const salvarWorkbook = (
  wb: XLSX.WorkBook,
  titulo: string,
  extras: [string, string][] = [],
) => {
  const d = new Date();
  adicionarAbaMarca(wb, titulo, extras, d);
  XLSX.writeFile(wb, nomeArquivo(titulo, "xlsx", d));
};

/** Cabecalho de marca para arquivos CSV. */
export const cabecalhoCsv = (titulo: string, d = new Date()) =>
  `${EMPRESA}\n${titulo}\nExportado em ${carimboData(d)}\n\n`;
