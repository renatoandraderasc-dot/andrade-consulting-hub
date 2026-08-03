import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- HTML -> JSON -------------------------------------------------
function decodeEnt(s: string): string {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function tabelaParaJson(html: string): Record<string, string | null>[] {
  const linhas = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map((c) => decodeEnt(c[1].replace(/<[^>]*>/g, "")))
  );
  if (linhas.length < 1) return [];
  const cab = linhas[0];
  return linhas.slice(1)
    .filter((l) => l.length === cab.length)
    .map((l) => {
      const o: Record<string, string | null> = {};
      cab.forEach((c, i) => { o[c] = l[i] === "" ? null : l[i]; });
      return o;
    });
}

// --- substitui {{param}} com escape ------------------------------
function montarSql(tpl: string, params: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, nome) => {
    const v = params?.[nome];
    if (v === undefined || v === null) throw new Error(`parametro ausente: ${nome}`);
    if (typeof v === "number") return String(v);
    const s = String(v);
    if (/^-?\d+(\.\d+)?$/.test(s)) return s;              // numero
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `'${s}'`;   // data
    return `'${s.replace(/'/g, "''")}'`;                  // texto
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const { store_id, relatorio, params, sql } = body;
    if (!store_id) return json({ erro: "informe store_id" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await supabase.from("store_vr_config")
      .select("api_url, api_key, codigo_loja, sistema").eq("store_id", store_id).single();
    if (!cfg) return json({ erro: "loja sem conexao cadastrada" }, 400);
    if ((cfg.sistema ?? "VR") !== "WEBSAC") return json({ erro: "esta loja nao e WebSac" }, 400);

    // monta o SQL
    let consulta: string;
    if (sql) {
      consulta = String(sql);
    } else if (relatorio) {
      const { data: rel } = await supabase.from("websac_relatorios")
        .select("sql").eq("nome", relatorio).single();
      if (!rel) return json({ erro: `relatorio "${relatorio}" nao cadastrado` }, 404);
      consulta = montarSql(rel.sql, { loja: cfg.codigo_loja, ...(params ?? {}) });
    } else {
      return json({ erro: "informe relatorio ou sql" }, 400);
    }

    // seguranca: somente leitura, uma instrucao
    if (!/^\s*(select|with)\b/i.test(consulta) || /;\s*\S/.test(consulta)) {
      return json({ erro: "apenas uma instrucao SELECT e permitida" }, 400);
    }

    const base = cfg.api_url.replace(/\/+$/, "");

    // ---- login para obter PHPSESSID ------------------------------
    let usuario = Deno.env.get("WEBSAC_USERNAME") ?? "";
    let senha = Deno.env.get("WEBSAC_PASSWORD") ?? "";
    if (cfg.api_key && cfg.api_key.includes(":")) {
      const [u, ...rest] = cfg.api_key.split(":");
      usuario = u; senha = rest.join(":");
    }

    const ua = "Mozilla/5.0 (compatible; AndradeHub/1.0)";
    let cookie = "";
    if (usuario && senha) {
      // 1) abre a tela de login para receber o PHPSESSID
      const pre = await fetch(`${base}/v3/login`, {
        headers: { "User-Agent": ua },
        redirect: "follow",
        signal: AbortSignal.timeout(60000),
      });
      const preCookie = pre.headers.get("set-cookie") ?? "";
      cookie = preCookie.split(",").map((c) => c.split(";")[0].trim())
        .filter((c) => c.includes("=")).join("; ");
      await pre.text();

      // 2) autentica reutilizando a mesma sessao
      const form = new URLSearchParams({ login: usuario, senha });
      const loginResp = await fetch(`${base}/v3/ajax/view/login/entrar.php`, {
        method: "POST",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": ua,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: form.toString(),
        signal: AbortSignal.timeout(60000),
      });
      const novoCookie = (loginResp.headers.get("set-cookie") ?? "")
        .split(",").map((c) => c.split(";")[0].trim())
        .filter((c) => c.includes("=")).join("; ");
      if (novoCookie) cookie = novoCookie;
      const loginTxt = (await loginResp.text()).slice(0, 300);
      if (!/"status"\s*:\s*"?0/.test(loginTxt)) {
        return json({ erro: `falha no login WebSac: ${loginTxt}` }, 401);
      }
      if (!cookie) return json({ erro: "WebSac nao devolveu sessao" }, 401);
    }

    const url = `${base}/ajax/pgadmin_executar.php?query=${encodeURIComponent(consulta)}`;
    const headers: Record<string, string> = {
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": ua,
    };
    if (cookie) headers["Cookie"] = cookie;

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(120000) });
    if (!resp.ok) {
      return json({ erro: `WebSac respondeu ${resp.status}` }, 502);
    }

    const html = await resp.text();

    // o console devolve o erro do Postgres em texto, sem tabela
    if (!/<t[rd]/i.test(html)) {
      return json({ erro: decodeEnt(html.replace(/<[^>]*>/g, "")).slice(0, 500) }, 500);
    }

    const linhas = tabelaParaJson(html);
    return json(linhas);
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
