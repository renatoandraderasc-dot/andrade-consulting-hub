import type { RelatorioWhatsapp } from "@/lib/whatsappRelatorios";

/** Corte e formato do print de cada tela (aba Configurar prints). */
export interface ConfigPrint { largura: number; corte_topo: number; corte_base: number; altura_pagina: number; formato: "png" | "jpeg"; qualidade: number; corte_esq?: number; corte_dir?: number }
export const CONFIG_PRINT_PADRAO: ConfigPrint = { largura: 1400, corte_topo: 0, corte_base: 0, altura_pagina: 0, formato: "png", qualidade: 0.9, corte_esq: 0, corte_dir: 0 };

/** Corta topo/base (em px da tela) e divide em páginas da altura escolhida. */
export async function cortarPrint(dataUrl: string, cfg: ConfigPrint, escala: number): Promise<Blob[]> {
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = dataUrl; });
  const topo = Math.max(0, cfg.corte_topo * escala);
  const util = Math.max(1, img.height - topo - Math.max(0, cfg.corte_base * escala));
  const esq = Math.max(0, (cfg.corte_esq || 0) * escala);
  const larg = Math.max(1, img.width - esq - Math.max(0, (cfg.corte_dir || 0) * escala));
  const pag = cfg.altura_pagina > 0 ? cfg.altura_pagina * escala : util;
  const blobs: Blob[] = [];
  for (let y = 0; y < util && blobs.length < 10; y += pag) {
    const h = Math.min(pag, util - y);
    const c = document.createElement("canvas");
    c.width = larg; c.height = h;
    const ctx = c.getContext("2d")!;
    if (cfg.formato === "jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, h); }
    ctx.drawImage(img, esq, topo + y, larg, h, 0, 0, larg, h);
    blobs.push(await new Promise<Blob>((r) => c.toBlob((b) => r(b!), `image/${cfg.formato}`, cfg.qualidade)));
  }
  return blobs;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Espera a tela terminar de carregar (sem indicadores de carregamento por alguns segundos). */
async function esperarPronto(doc: Document, limiteMs: number) {
  const fim = Date.now() + limiteMs;
  let estavelDesde = 0;
  while (Date.now() < fim) {
    const area = doc.getElementById("area-print");
    const texto = area?.innerText ?? "";
    const carregando = !area || !!area.querySelector(".animate-pulse, .animate-spin") || /Buscando|Carregando|Atualizando/i.test(texto);
    if (carregando) estavelDesde = 0;
    else if (!estavelDesde) estavelDesde = Date.now();
    else if (Date.now() - estavelDesde > 2500) return;
    await sleep(500);
  }
}

/**
 * Abre a tela num quadro escondido com a loja indicada, espera carregar e devolve o print (PNG).
 * A loja escolhida pelo usuário é restaurada ao final.
 */
export async function capturarTela(rel: RelatorioWhatsapp, storeId: string, userId: string, cfg: ConfigPrint = CONFIG_PRINT_PADRAO): Promise<Blob[]> {
  const chaveLocal = `selectedStoreId:${userId}`;
  const antesSessao = sessionStorage.getItem("selectedStoreId");
  const antesLocal = localStorage.getItem(chaveLocal);
  sessionStorage.setItem("selectedStoreId", storeId);
  localStorage.setItem(chaveLocal, storeId);
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${cfg.largura}px;height:1800px;border:0;`;
  frame.src = `${rel.rota}?whatsapp_print=1`;
  document.body.appendChild(frame);
  try {
    await new Promise((r) => frame.addEventListener("load", r, { once: true }));
    const doc = frame.contentDocument!;
    await esperarPronto(doc, 90000);
    if (rel.aba) {
      const aba = [...doc.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.innerText.includes(rel.aba!));
      aba?.click();
      await sleep(800);
      await esperarPronto(doc, 90000);
    }
    // Telas que só mostram dados após clicar em Atualizar/Comparar: carrega antes do print.
    const botao = [...doc.querySelectorAll<HTMLButtonElement>("#area-print button, main button")].find(
      (b) => !b.disabled && /^\s*(Atualizar|Comparar|Buscar|Consultar|Carregar|Gerar)/i.test(b.innerText),
    );
    if (botao) {
      botao.click();
      await sleep(1500);
      await esperarPronto(doc, 240000);
    }
    const capturar = (frame.contentWindow as any)?.__capturarArea as (() => Promise<string>) | undefined;
    if (!capturar) throw new Error(`Não foi possível abrir a tela ${rel.nome}`);
    const url = await capturar();
    return await cortarPrint(url, cfg, 1.5);
  } finally {
    frame.remove();
    if (antesSessao) sessionStorage.setItem("selectedStoreId", antesSessao); else sessionStorage.removeItem("selectedStoreId");
    if (antesLocal) localStorage.setItem(chaveLocal, antesLocal); else localStorage.removeItem(chaveLocal);
  }
}
