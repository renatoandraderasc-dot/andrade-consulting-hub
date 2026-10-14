import { toBlob } from "html-to-image";

interface FotoOptions {
  pixelRatio?: number;
  backgroundColor?: string;
  cacheBust?: boolean;
  style?: Partial<CSSStyleDeclaration>;
}

/**
 * Captura um elemento como PNG. Renderiza pelo próprio navegador (SVG foreignObject),
 * então texto, fontes e alinhamento ficam idênticos à tela — sem o deslocamento
 * vertical que o html2canvas causa em rótulos e números.
 */
export async function gerarFotoElemento(el: HTMLElement, opts: FotoOptions = {}): Promise<Blob> {
  const { pixelRatio = 2, backgroundColor, cacheBust = false, style } = opts;
  const opcoes = { pixelRatio, backgroundColor, cacheBust, style };
  // A primeira passada embute fontes e imagens no clone; é descartada.
  await toBlob(el, opcoes);
  const blob = await toBlob(el, opcoes);
  if (!blob) throw new Error("Falha ao gerar a foto.");
  return blob;
}

/** Versão que devolve data URL + dimensões, para compor PDF/PPT. */
export async function gerarFotoDataUrl(
  el: HTMLElement,
  opts: FotoOptions = {}
): Promise<{ dataUrl: string; w: number; h: number }> {
  const blob = await gerarFotoElemento(el, opts);
  const bmp = await createImageBitmap(blob);
  const out = { dataUrl: await blobToDataUrl(blob), w: bmp.width, h: bmp.height };
  bmp.close();
  return out;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("Falha ao ler a imagem."));
    fr.readAsDataURL(blob);
  });
}
