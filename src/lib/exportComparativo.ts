import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { cabecalhoPdf, nomeArquivo, EMPRESA, carimboData } from "@/lib/exportBranding";

export interface BlocoExport {
  titulo: string;
  subtitulo?: string;
  el: HTMLElement;
}

/** Converte um bloco da tela em imagem PNG. */
async function capturar(el: HTMLElement) {
  const fundo = getComputedStyle(document.body).backgroundColor || "#ffffff";
  const canvas = await html2canvas(el, {
    backgroundColor: fundo,
    scale: 2,
    useCORS: true,
    logging: false,
  });
  return { dataUrl: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height };
}

/** Um gráfico por página, com o cabeçalho de marca do app. */
export async function exportarPdf(titulo: string, subtitulo: string, blocos: BlocoExport[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();

  for (let i = 0; i < blocos.length; i++) {
    if (i > 0) doc.addPage();
    const b = blocos[i];
    const topo = await cabecalhoPdf(doc, b.titulo, `${titulo} · ${subtitulo}`, "mm");
    const img = await capturar(b.el);
    const maxW = largura - 24;
    const maxH = altura - topo - 14;
    const escala = Math.min(maxW / img.w, maxH / img.h);
    const w = img.w * escala;
    const h = img.h * escala;
    doc.addImage(img.dataUrl, "PNG", (largura - w) / 2, topo, w, h);
  }

  doc.save(nomeArquivo(titulo, "pdf"));
}

/** Um gráfico por slide (16:9). */
export async function exportarPptx(titulo: string, subtitulo: string, blocos: BlocoExport[]) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = EMPRESA;
  pptx.company = EMPRESA;
  pptx.title = titulo;

  const capa = pptx.addSlide();
  capa.addText(titulo, { x: 0.6, y: 1.9, w: 8.8, h: 1, fontSize: 40, bold: true, color: "14213D" });
  capa.addText(subtitulo, { x: 0.6, y: 2.9, w: 8.8, h: 0.6, fontSize: 20, color: "5B6472" });
  capa.addText(`${EMPRESA} · ${carimboData()}`, { x: 0.6, y: 4.6, w: 8.8, h: 0.4, fontSize: 12, color: "8A929E" });

  for (const b of blocos) {
    const s = pptx.addSlide();
    s.addText(b.titulo, { x: 0.4, y: 0.25, w: 9.2, h: 0.5, fontSize: 22, bold: true, color: "14213D" });
    if (b.subtitulo) {
      s.addText(b.subtitulo, { x: 0.4, y: 0.72, w: 9.2, h: 0.35, fontSize: 12, color: "5B6472" });
    }
    const img = await capturar(b.el);
    const maxW = 9.2;
    const maxH = 4.0;
    const escala = Math.min(maxW / img.w, maxH / img.h);
    const w = img.w * escala;
    const h = img.h * escala;
    s.addImage({ data: img.dataUrl, x: (10 - w) / 2, y: 1.15, w, h });
    s.addText(`${EMPRESA} · ${subtitulo}`, { x: 0.4, y: 5.2, w: 9.2, h: 0.3, fontSize: 9, color: "8A929E" });
  }

  await pptx.writeFile({ fileName: nomeArquivo(titulo, "pptx") });
}
