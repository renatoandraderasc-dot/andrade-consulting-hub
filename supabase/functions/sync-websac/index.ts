import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "http://nascimentoesilva1.websac.net/form";

// Store mapping: WebSac establishment names -> Supabase store IDs
const STORE_MAP: Record<string, string> = {
  // These will be matched by partial name from WebSac
  "embu": "6651db65-8db4-4f2e-989a-27d259170474",    // Supermercado Nascimento Embu
  "osasco": "e3a2a822-a94d-4486-8da0-5152510cd537",  // Supermercado Nascimento Osasco
  // Also try the newer store IDs
  "SM NASCIMENTO EMBU DAS ARTES": "563ad29c-da1e-4de4-b1c5-e1eb6c80ffa8",
};

interface WebSacSession {
  cookie: string;
  establishments: { id: string; name: string }[];
}

interface DailyMetric {
  date: string;
  faturamento: number;
  margem_pct: number;
  lucro: number;
  clientes: number;
  ticket_medio: number;
  itens_vendidos: number;
  tipo_dia: string;
}

interface SyncLog {
  status: "success" | "error" | "partial";
  message: string;
  stores_synced: string[];
  records_inserted: number;
  errors: string[];
  timestamp: string;
  duration_ms: number;
}

// ─── Step 1: Authenticate with WebSac ───
async function websacLogin(username: string, password: string): Promise<WebSacSession> {
  console.log("[WebSac] Initiating login...");

  // Step 1: GET login page to obtain PHPSESSID
  const initRes = await fetch(`${BASE_URL}/index.php`, {
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });

  const cookies: string[] = [];
  const setCookies = initRes.headers.getAll?.("set-cookie") || [];
  // Parse PHPSESSID from headers
  const rawHeaders = [...initRes.headers.entries()];
  for (const [key, val] of rawHeaders) {
    if (key.toLowerCase() === "set-cookie") {
      const match = val.match(/PHPSESSID=([^;]+)/);
      if (match) cookies.push(`PHPSESSID=${match[1]}`);
    }
  }

  if (cookies.length === 0) {
    // Try to extract from redirect response
    const body = await initRes.text();
    throw new Error("Failed to get session cookie from WebSac");
  }

  const sessionCookie = cookies[0];
  console.log("[WebSac] Got session cookie");

  // Step 2: POST login credentials
  const loginPayloads = [
    // Try different field/endpoint combos
    { url: `${BASE_URL}/login.php`, body: `acao=login_entrar&login=${encodeURIComponent(username)}&senha=${encodeURIComponent(password)}` },
    { url: `${BASE_URL}/index.php`, body: `acao=login_entrar&login=${encodeURIComponent(username)}&senha=${encodeURIComponent(password)}` },
    { url: `${BASE_URL}/login.php`, body: `login=${encodeURIComponent(username)}&senha=${encodeURIComponent(password)}` },
  ];

  let loginSuccess = false;
  let finalCookie = sessionCookie;

  for (const payload of loginPayloads) {
    try {
      const loginRes = await fetch(payload.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cookie": sessionCookie,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: payload.body,
        redirect: "manual",
      });

      // Check for updated cookies
      for (const [key, val] of loginRes.headers.entries()) {
        if (key.toLowerCase() === "set-cookie") {
          const match = val.match(/PHPSESSID=([^;]+)/);
          if (match) finalCookie = `PHPSESSID=${match[1]}`;
        }
      }

      // Check if login succeeded by trying to access a protected page
      const testRes = await fetch(`${BASE_URL}/index.php`, {
        headers: {
          "Cookie": finalCookie,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        redirect: "manual",
      });

      const testStatus = testRes.status;
      const testBody = await testRes.text();

      // If we get redirected to login.php, we're NOT authenticated
      // If we get the main dashboard (no "Login de acesso" in title), we ARE authenticated
      if (!testBody.includes("Login de acesso") && testBody.length > 1000) {
        loginSuccess = true;
        console.log(`[WebSac] Login succeeded with payload to ${payload.url}`);
        break;
      }

      // Also check if the response has dashboard content
      if (testBody.includes("menu-") || testBody.includes("Dashboard") || testBody.includes("Relatórios")) {
        loginSuccess = true;
        console.log(`[WebSac] Login succeeded (found dashboard content)`);
        break;
      }
    } catch (e) {
      console.log(`[WebSac] Login attempt failed for ${payload.url}: ${e}`);
    }
  }

  if (!loginSuccess) {
    // Try one more approach: follow redirects on login
    const loginRes = await fetch(`${BASE_URL}/login.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": finalCookie,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: `acao=login_entrar&login=${encodeURIComponent(username)}&senha=${encodeURIComponent(password)}&mantConectado=S`,
      redirect: "follow",
    });

    const loginBody = await loginRes.text();
    for (const [key, val] of loginRes.headers.entries()) {
      if (key.toLowerCase() === "set-cookie") {
        const match = val.match(/PHPSESSID=([^;]+)/);
        if (match) finalCookie = `PHPSESSID=${match[1]}`;
      }
    }

    if (!loginBody.includes("Login de acesso") && loginBody.length > 1000) {
      loginSuccess = true;
      console.log("[WebSac] Login succeeded with follow redirect approach");
    }
  }

  // Parse establishments from dashboard if logged in
  const establishments: { id: string; name: string }[] = [];

  return { cookie: finalCookie, establishments };
}

// ─── Step 2: Fetch reports from WebSac ───
async function fetchReport(
  cookie: string,
  reportPath: string,
  params: Record<string, string> = {}
): Promise<string> {
  const queryStr = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  const url = `${BASE_URL}/${reportPath}${queryStr ? "?" + queryStr : ""}`;
  console.log(`[WebSac] Fetching report: ${url}`);

  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  return await res.text();
}

// ─── Step 3: Parse HTML tables ───
function parseHtmlTable(html: string): Record<string, string>[][] {
  const tables: Record<string, string>[][] = [];

  // Find all <table> elements
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const rows: Record<string, string>[] = [];

    // Extract headers
    const headers: string[] = [];
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let thMatch;
    while ((thMatch = thRegex.exec(tableHtml)) !== null) {
      headers.push(stripHtml(thMatch[1]).trim());
    }

    // Extract data rows
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(tableHtml)) !== null) {
      const rowHtml = trMatch[1];
      if (rowHtml.includes("<th")) continue; // Skip header rows

      const cells: string[] = [];
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
        cells.push(stripHtml(tdMatch[1]).trim());
      }

      if (cells.length > 0) {
        const row: Record<string, string> = {};
        cells.forEach((cell, i) => {
          const key = headers[i] || `col_${i}`;
          row[key] = cell;
        });
        rows.push(row);
      }
    }

    if (rows.length > 0) tables.push(rows);
  }

  return tables;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

// ─── Step 4: Parse currency values ───
function parseBRL(value: string): number {
  if (!value) return 0;
  // Remove R$, spaces, dots (thousands), replace comma with dot
  const cleaned = value
    .replace(/R\$\s*/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "")
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parsePercent(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace("%", "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseInt2(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/\./g, "").replace(/[^\d]/g, "").trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

// ─── Step 5: Try to discover and scrape WebSac reports ───
async function discoverReports(cookie: string): Promise<{
  dailyData: DailyMetric[];
  monthlyData: any;
  reportUrls: string[];
  rawHtml: string;
}> {
  const reportUrls: string[] = [];
  const dailyData: DailyMetric[] = [];
  let monthlyData: any = {};
  let rawHtml = "";

  // WebSac standard report paths to try
  const reportPaths = [
    // Dashboard/main page
    "index.php",
    // Sales reports
    "index.php?modulo=relatorio&tela=vendas",
    "index.php?modulo=relatorio&tela=venda_diaria",
    "index.php?modulo=relatorio&tela=resumo_vendas",
    "index.php?modulo=vendas&tela=resumo",
    // Financial reports
    "index.php?modulo=relatorio&tela=financeiro",
    "index.php?modulo=relatorio&tela=faturamento",
    // Specific ControlWare/WebSac report endpoints
    "index.php?acao=relatorio_vendas_consultar",
    "index.php?acao=dashboard_consultar",
    // Common WebSac AJAX endpoints
    "index.php?acao=vendas_diarias_consultar",
    "index.php?acao=faturamento_consultar",
  ];

  for (const path of reportPaths) {
    try {
      const html = await fetchReport(cookie, path);

      if (html.length > 500 && !html.includes("Login de acesso")) {
        reportUrls.push(path);
        rawHtml += `\n<!-- ${path} -->\n${html}\n`;

        // Try to extract data from tables
        const tables = parseHtmlTable(html);
        for (const table of tables) {
          // Look for daily sales patterns
          for (const row of table) {
            const dateCol = Object.entries(row).find(([k]) =>
              k.toLowerCase().includes("data") || k.toLowerCase().includes("dia")
            );
            const fatCol = Object.entries(row).find(([k]) =>
              k.toLowerCase().includes("faturamento") ||
              k.toLowerCase().includes("venda") ||
              k.toLowerCase().includes("total") ||
              k.toLowerCase().includes("valor")
            );

            if (dateCol && fatCol) {
              const dateStr = dateCol[1];
              const fat = parseBRL(fatCol[1]);

              // Try to parse Brazilian date format
              const dateMatch = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
              if (dateMatch && fat > 0) {
                const isoDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

                const margemCol = Object.entries(row).find(([k]) =>
                  k.toLowerCase().includes("margem")
                );
                const clientCol = Object.entries(row).find(([k]) =>
                  k.toLowerCase().includes("cliente") || k.toLowerCase().includes("qtd")
                );
                const ticketCol = Object.entries(row).find(([k]) =>
                  k.toLowerCase().includes("ticket") || k.toLowerCase().includes("medio")
                );
                const itensCol = Object.entries(row).find(([k]) =>
                  k.toLowerCase().includes("iten") || k.toLowerCase().includes("item") || k.toLowerCase().includes("volume")
                );

                dailyData.push({
                  date: isoDate,
                  faturamento: fat,
                  margem_pct: margemCol ? parsePercent(margemCol[1]) : 0,
                  lucro: margemCol ? fat * (parsePercent(margemCol[1]) / 100) : 0,
                  clientes: clientCol ? parseInt2(clientCol[1]) : 0,
                  ticket_medio: ticketCol ? parseBRL(ticketCol[1]) : 0,
                  itens_vendidos: itensCol ? parseInt2(itensCol[1]) : 0,
                  tipo_dia: "D",
                });
              }
            }
          }
        }

        // Also try to extract from FusionCharts data (WebSac uses FusionCharts)
        const chartDataMatches = html.match(/FusionCharts[\s\S]*?dataSource[\s\S]*?\{[\s\S]*?\}/g);
        if (chartDataMatches) {
          console.log(`[WebSac] Found ${chartDataMatches.length} FusionCharts instances in ${path}`);
        }

        // Extract JSON data embedded in page
        const jsonMatches = html.match(/var\s+\w+\s*=\s*(\[[\s\S]*?\]);/g);
        if (jsonMatches) {
          for (const jsonMatch of jsonMatches) {
            try {
              const jsonStr = jsonMatch.replace(/var\s+\w+\s*=\s*/, "").replace(/;$/, "");
              const data = JSON.parse(jsonStr);
              if (Array.isArray(data) && data.length > 0) {
                console.log(`[WebSac] Found JSON array with ${data.length} items in ${path}`);
              }
            } catch {
              // Not valid JSON
            }
          }
        }
      }
    } catch (e) {
      console.log(`[WebSac] Error fetching ${path}: ${e}`);
    }
  }

  return { dailyData, monthlyData, reportUrls, rawHtml };
}

// ─── Step 6: Save data to Supabase ───
async function saveToSupabase(
  supabase: any,
  storeId: string,
  dailyData: DailyMetric[],
  month: number,
  year: number
) {
  let inserted = 0;

  for (const d of dailyData) {
    const dateObj = new Date(d.date + "T12:00:00Z");
    if (dateObj.getMonth() + 1 !== month || dateObj.getFullYear() !== year) continue;

    // Upsert daily metric
    const { error } = await supabase
      .from("store_daily_metrics")
      .upsert(
        {
          store_id: storeId,
          department: "GERAL",
          date: d.date,
          tipo_dia: d.tipo_dia,
          realizado_vendas: d.faturamento,
          realizado_lucro: d.lucro,
          realizado_margem_pct: d.margem_pct,
          realizado_volume: d.itens_vendidos,
        },
        { onConflict: "store_id,department,date", ignoreDuplicates: false }
      );

    if (error) {
      console.log(`[WebSac] Upsert error for ${d.date}: ${error.message}`);
      // Try update instead
      const { error: updateError } = await supabase
        .from("store_daily_metrics")
        .update({
          realizado_vendas: d.faturamento,
          realizado_lucro: d.lucro,
          realizado_margem_pct: d.margem_pct,
          realizado_volume: d.itens_vendidos,
        })
        .eq("store_id", storeId)
        .eq("department", "GERAL")
        .eq("date", d.date);

      if (!updateError) inserted++;
      else console.log(`[WebSac] Update also failed: ${updateError.message}`);
    } else {
      inserted++;
    }
  }

  // Update store_metrics monthly summary
  const monthlyFat = dailyData
    .filter((d) => {
      const dt = new Date(d.date + "T12:00:00Z");
      return dt.getMonth() + 1 === month && dt.getFullYear() === year;
    })
    .reduce((sum, d) => sum + d.faturamento, 0);

  const monthlyClientes = dailyData
    .filter((d) => {
      const dt = new Date(d.date + "T12:00:00Z");
      return dt.getMonth() + 1 === month && dt.getFullYear() === year;
    })
    .reduce((sum, d) => sum + d.clientes, 0);

  const avgMargem = dailyData.length > 0
    ? dailyData.reduce((sum, d) => sum + d.margem_pct, 0) / dailyData.length
    : 0;

  const avgTicket = monthlyClientes > 0 ? monthlyFat / monthlyClientes : 0;

  if (monthlyFat > 0) {
    const { error } = await supabase
      .from("store_metrics")
      .update({
        faturamento: monthlyFat,
        margem: avgMargem,
        clientes: monthlyClientes,
        ticket_medio: avgTicket,
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", storeId)
      .eq("month", month)
      .eq("year", year);

    if (error) {
      console.log(`[WebSac] store_metrics update error: ${error.message}`);
    }
  }

  return inserted;
}

// ─── Main handler ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const log: SyncLog = {
    status: "success",
    message: "",
    stores_synced: [],
    records_inserted: 0,
    errors: [],
    timestamp: new Date().toISOString(),
    duration_ms: 0,
  };

  try {
    const username = Deno.env.get("WEBSAC_USERNAME");
    const password = Deno.env.get("WEBSAC_PASSWORD");

    if (!username || !password) {
      throw new Error("WEBSAC_USERNAME and WEBSAC_PASSWORD must be configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for options
    let options: { mode?: string; storeFilter?: string; month?: number; year?: number } = {};
    if (req.method === "POST") {
      try {
        options = await req.json();
      } catch { /* empty body is ok */ }
    }

    const now = new Date();
    const month = options.month || now.getMonth() + 1;
    const year = options.year || now.getFullYear();

    console.log(`[WebSac] Starting sync for ${month}/${year}...`);

    // Step 1: Login
    const session = await websacLogin(username, password);
    console.log("[WebSac] Session established");

    // Step 2: Discover and fetch reports
    const { dailyData, reportUrls, rawHtml } = await discoverReports(session.cookie);
    console.log(`[WebSac] Found ${reportUrls.length} report URLs, ${dailyData.length} daily records`);

    // Step 3: Determine target stores
    const targetStores = [
      { id: "563ad29c-da1e-4de4-b1c5-e1eb6c80ffa8", name: "SM NASCIMENTO EMBU DAS ARTES" },
      { id: "e3a2a822-a94d-4486-8da0-5152510cd537", name: "Supermercado Nascimento Osasco" },
    ];

    const filteredStores = options.storeFilter
      ? targetStores.filter((s) => s.id === options.storeFilter || s.name.toLowerCase().includes(options.storeFilter!.toLowerCase()))
      : targetStores;

    // Step 4: Save data
    for (const store of filteredStores) {
      try {
        const inserted = await saveToSupabase(supabase, store.id, dailyData, month, year);
        log.stores_synced.push(store.name);
        log.records_inserted += inserted;
        console.log(`[WebSac] Saved ${inserted} records for ${store.name}`);
      } catch (e) {
        const errMsg = `Error saving ${store.name}: ${e}`;
        log.errors.push(errMsg);
        console.error(`[WebSac] ${errMsg}`);
      }
    }

    // Build response with discovery info
    log.duration_ms = Date.now() - startTime;
    log.message = `Sync completed. Found ${reportUrls.length} report URLs, ${dailyData.length} daily records. Saved ${log.records_inserted} records for ${log.stores_synced.length} stores.`;
    log.status = log.errors.length > 0 ? "partial" : "success";

    return new Response(
      JSON.stringify({
        ...log,
        discovery: {
          reportUrls,
          dailyRecords: dailyData.length,
          sampleData: dailyData.slice(0, 5),
          htmlSize: rawHtml.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.status = "error";
    log.message = error instanceof Error ? error.message : "Unknown error";
    log.duration_ms = Date.now() - startTime;
    log.errors.push(log.message);

    console.error("[WebSac] Fatal error:", error);

    return new Response(JSON.stringify(log), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
