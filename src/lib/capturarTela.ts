import type { RelatorioWhatsapp } from "@/lib/whatsappRelatorios";

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
export async function capturarTela(rel: RelatorioWhatsapp, storeId: string, userId: string): Promise<Blob> {
  const chaveLocal = `selectedStoreId:${userId}`;
  const antesSessao = sessionStorage.getItem("selectedStoreId");
  const antesLocal = localStorage.getItem(chaveLocal);
  sessionStorage.setItem("selectedStoreId", storeId);
  localStorage.setItem(chaveLocal, storeId);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-20000px;top:0;width:1400px;height:1800px;border:0;";
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
    return await (await fetch(url)).blob();
  } finally {
    frame.remove();
    if (antesSessao) sessionStorage.setItem("selectedStoreId", antesSessao); else sessionStorage.removeItem("selectedStoreId");
    if (antesLocal) localStorage.setItem(chaveLocal, antesLocal); else localStorage.removeItem(chaveLocal);
  }
}
