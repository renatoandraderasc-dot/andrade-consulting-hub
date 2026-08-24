import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

// plataformas que já possuem coletor implementado
const COM_COLETOR = new Set(["vtex", "opencart"]);
const COM_REGIAO = new Set(["vtex", "opencart"]);

interface Resultado {
  plataforma: string;
  provedor: string | null;
  coletor_disponivel: boolean;
  evidencia: string;
  suporta_regiao: boolean;
}

async function pegarHtml(host: string): Promise<string> {
  const resp = await fetch(`https://${host}/`, {
    headers: { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" },
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`a home respondeu HTTP ${resp.status}`);
  return await resp.text();
}

async function testarVtex(host: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://${host}/api/catalog_system/pub/category/tree/2`,
      { headers: { Accept: "application/json", "User-Agent": UA } },
    );
    if (resp.status !== 200) return null;
    const data = await resp.json().catch(() => null);
    if (!Array.isArray(data) || !data.length) return null;
    const first = data[0];
    if (first?.id === undefined || first?.name === undefined) return null;
    return `api/catalog_system respondeu 200 com ${data.length} departamentos (ex.: "${first.name}")`;
  } catch {
    return null;
  }
}

function achar(html: string, termos: string[]): string | null {
  const baixo = html.toLowerCase();
  for (const t of termos) {
    const i = baixo.indexOf(t.toLowerCase());
    if (i >= 0) return html.slice(Math.max(0, i - 40), i + t.length + 40).replace(/\s+/g, " ").trim();
  }
  return null;
}

const OUTRAS: { termo: string; plataforma: string }[] = [
  { termo: "cdn.shopify.com", plataforma: "shopify" },
  { termo: "Mage.Cookies", plataforma: "magento" },
  { termo: "skin/frontend", plataforma: "magento" },
  { termo: "tcdn.com.br", plataforma: "tray" },
  { termo: "tiendanube", plataforma: "nuvemshop" },
  { termo: "woocommerce", plataforma: "woocommerce" },
];

async function detectar(host: string): Promise<Resultado> {
  // 1. VTEX
  const vtex = await testarVtex(host);
  if (vtex) {
    return {
      plataforma: "vtex",
      provedor: null,
      coletor_disponivel: true,
      evidencia: vtex,
      suporta_regiao: true,
    };
  }

  let html = "";
  try {
    html = await pegarHtml(host);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      plataforma: "desconhecida",
      provedor: null,
      coletor_disponivel: false,
      evidencia:
        `não foi possível ler a home para identificar a plataforma (${msg}) — ` +
        `o site provavelmente bloqueia acesso automatizado; informe a plataforma manualmente`,
      suporta_regiao: false,
    };
  }

  // 4. provedor (pode acompanhar qualquer plataforma)
  const provedorTrecho = achar(html, ["big2be.com.br", "big2be.com"]);
  const provedor = provedorTrecho ? "big2be" : null;

  // 2. OpenCart
  const oc = achar(html, [
    "index.php?route=product/category",
    "index.php?route=common/home",
    "catalog/view/theme",
  ]);
  if (oc) {
    return {
      plataforma: "opencart",
      provedor,
      coletor_disponivel: true,
      evidencia: `assinatura OpenCart no HTML: …${oc}…` +
        (provedor ? ` · provedor big2be identificado` : ""),
      suporta_regiao: true,
    };
  }

  // 3. Regex Solutions
  const rx = achar(html, [
    "cdn.regexsolutions.com.br",
    "regexsolutions",
    "Powered by Regex Solutions",
  ]);
  if (rx) {
    return {
      plataforma: "regex_solutions",
      provedor,
      coletor_disponivel: false,
      evidencia: `assinatura Regex Solutions no HTML: …${rx}…`,
      suporta_regiao: false,
    };
  }

  // 5. demais assinaturas
  for (const o of OUTRAS) {
    const t = achar(html, [o.termo]);
    if (t) {
      return {
        plataforma: o.plataforma,
        provedor,
        coletor_disponivel: COM_COLETOR.has(o.plataforma),
        evidencia: `assinatura "${o.termo}" no HTML: …${t}…`,
        suporta_regiao: COM_REGIAO.has(o.plataforma),
      };
    }
  }

  // 6. nada bateu
  const gen = html.match(
    /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i,
  );
  return {
    plataforma: "desconhecida",
    provedor,
    coletor_disponivel: false,
    evidencia: gen
      ? `nenhuma assinatura conhecida; meta generator = "${gen[1]}"`
      : "nenhuma assinatura conhecida e o site não declara meta generator",
    suporta_regiao: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const host = String(body.host || "")
      .replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase();
    if (!host || !host.includes(".")) throw new Error("informe o endereço do site");

    const r = await detectar(host);

    await supabase.from("plataformas_detectadas").insert({
      host,
      plataforma: r.plataforma,
      provedor: r.provedor,
      evidencia: r.evidencia,
      coletor_disponivel: r.coletor_disponivel,
      suporta_regiao: r.suporta_regiao,
      site_concorrente_id: body.site_id ?? null,
    });

    return json({ success: true, ...r });
  } catch (e) {
    return json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      400,
    );
  }
});
