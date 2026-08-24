// Modo de diagnóstico: tenta endpoints alternativos para descobrir sellers/praças
// de um site VTEX e explica em português por que nenhum seller foi encontrado.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface Tentativa {
  endpoint: string;
  descricao: string;
  status: number | null;
  ok: boolean;
  sellers: string[];
  regionId: string | null;
  detalhe: string;
}

async function pegar(url: string, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/html;q=0.9" },
      signal: ctrl.signal,
    });
    const texto = await res.text();
    return { status: res.status, texto };
  } catch (e) {
    return { status: null as number | null, texto: `falha de rede: ${(e as Error).message}` };
  } finally {
    clearTimeout(t);
  }
}

function tentarJson(texto: string): any {
  try { return JSON.parse(texto); } catch { return null; }
}

function resumo(texto: string) {
  return texto.replace(/\s+/g, " ").slice(0, 220);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const host = String(body.host || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
    const cep = String(body.cep || "").replace(/\D/g, "");
    const sc = Number(body.sc) || 1;
    if (!host) return json({ success: false, error: "Informe o endereço do site" }, 400);

    const tentativas: Tentativa[] = [];
    const push = (t: Tentativa) => tentativas.push(t);

    // 1. regions por CEP (endpoint padrão)
    if (cep.length === 8) {
      for (const path of [
        `/api/checkout/pub/regions?country=BRA&postalCode=${cep}`,
        `/api/checkout/pub/regions?country=BRA&postalCode=${cep}&sc=${sc}`,
        `/api/checkout/pub/regions?country=BRA&postalCode=${cep}&sellerId=1`,
      ]) {
        const r = await pegar(`https://${host}${path}`);
        const j = tentarJson(r.texto);
        const first = Array.isArray(j) ? j[0] : null;
        const sellers = (first?.sellers || []).map((s: any) => String(s.id ?? s.name)).filter(Boolean);
        push({
          endpoint: path,
          descricao: "Regionalização por CEP (checkout)",
          status: r.status,
          ok: !!first,
          sellers,
          regionId: first?.id ? String(first.id) : null,
          detalhe: first
            ? sellers.length
              ? `região ${first.id} com ${sellers.length} seller(s)`
              : `região ${first.id} devolvida, porém sem lista de sellers`
            : resumo(r.texto),
        });
      }
    }

    // 2. pickup points (lojas físicas)
    if (cep.length === 8) {
      const path = `/api/checkout/pub/pickup-points?postalCode=${cep}&countryCode=BRA`;
      const r = await pegar(`https://${host}${path}`);
      const j = tentarJson(r.texto);
      const items = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
      push({
        endpoint: path,
        descricao: "Pontos de retirada (lojas físicas)",
        status: r.status,
        ok: items.length > 0,
        sellers: items.map((i: any) => String(i?.pickupPoint?.id ?? i?.id ?? "")).filter(Boolean).slice(0, 20),
        regionId: null,
        detalhe: items.length ? `${items.length} ponto(s) de retirada` : resumo(r.texto),
      });
    }

    // 3. sellers declarados no catálogo (produto real)
    {
      const path = `/api/catalog_system/pub/products/search?_from=0&_to=0&sc=${sc}`;
      const r = await pegar(`https://${host}${path}`);
      const j = tentarJson(r.texto);
      const prod = Array.isArray(j) ? j[0] : null;
      const sellers: string[] = [];
      for (const sku of prod?.items || []) {
        for (const s of sku?.sellers || []) if (s?.sellerId) sellers.push(String(s.sellerId));
      }
      const unicos = [...new Set(sellers)];
      push({
        endpoint: path,
        descricao: "Sellers declarados no catálogo (primeiro produto)",
        status: r.status,
        ok: unicos.length > 0,
        sellers: unicos,
        regionId: null,
        detalhe: unicos.length
          ? `sellers no SKU: ${unicos.join(", ")}`
          : prod ? "produto sem seller declarado" : resumo(r.texto),
      });
    }

    // 4. canais de venda (sales channels)
    {
      const path = `/api/catalog_system/pub/saleschannel/list`;
      const r = await pegar(`https://${host}${path}`);
      const j = tentarJson(r.texto);
      const canais = Array.isArray(j) ? j : [];
      push({
        endpoint: path,
        descricao: "Canais de venda publicados",
        status: r.status,
        ok: canais.length > 0,
        sellers: canais.map((c: any) => `sc ${c.Id}: ${c.Name}`).slice(0, 20),
        regionId: null,
        detalhe: canais.length ? `${canais.length} canal(is)` : resumo(r.texto),
      });
    }

    // 5. conta/tenant VTEX confirmando a plataforma
    {
      const path = `/api/catalog_system/pub/portal/pagetype/`;
      const r = await pegar(`https://${host}${path}`);
      push({
        endpoint: path,
        descricao: "Confirmação de tenant VTEX",
        status: r.status,
        ok: r.status === 200,
        sellers: [],
        regionId: null,
        detalhe: r.status === 200 ? "endpoint VTEX respondeu" : resumo(r.texto),
      });
    }

    const comSellers = tentativas.filter((t) => t.sellers.length && !t.endpoint.includes("saleschannel"));
    const regiao = tentativas.find((t) => t.regionId)?.regionId ?? null;
    const catalogoOk = tentativas.some((t) => t.descricao.startsWith("Sellers declarados") && t.status === 200);
    const bloqueado = tentativas.some((t) => t.status === 403 || t.status === 401);

    let conclusao: string;
    let recomendacao: string;

    if (comSellers.length) {
      conclusao = `Sellers encontrados: ${[...new Set(comSellers.flatMap((t) => t.sellers))].join(", ")}.`;
      recomendacao = "Cadastre o site usando um desses identificadores como loja/praça.";
    } else if (bloqueado) {
      conclusao = "O site bloqueou as consultas automáticas (403/401), então não é possível ler a regionalização.";
      recomendacao = "Informe a praça manualmente e rode a coleta — o coletor usa cabeçalhos de navegador e pode passar.";
    } else if (regiao && !comSellers.length) {
      conclusao = `A regionalização respondeu (região ${regiao}), mas o site não devolve lista de sellers: o catálogo é atendido por um único vendedor.`;
      recomendacao = "Não há praça a escolher. Cadastre com o CEP de referência e deixe a praça em branco — a coleta usa o seller padrão.";
    } else if (catalogoOk) {
      conclusao = "O catálogo responde normalmente, mas o site não usa regionalização por CEP (sem multi-seller e sem entrega por praça).";
      recomendacao = "Cadastre sem CEP/praça: os preços são iguais para todo o site.";
    } else {
      conclusao = "Nenhum endpoint conhecido respondeu com dados úteis — o site pode não ser VTEX ou usar uma camada própria de frente de loja.";
      recomendacao = "Rode a detecção de plataforma novamente ou informe a plataforma manualmente.";
    }

    return json({ success: true, host, cep: cep || null, sc, tentativas, conclusao, recomendacao });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
