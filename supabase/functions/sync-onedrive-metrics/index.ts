import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseMoneyValue(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const str = String(val).replace("R$", "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function parsePercentValue(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val < 1 ? val * 100 : val;
  const str = String(val).replace("%", "").replace(",", ".").trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function parseDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  const str = String(val).trim();
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length === 3) {
    let [month, day, year] = parts.map(Number);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (str.match(/^\d{4}-\d{2}-\d{2}/)) return str.substring(0, 10);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Accept file upload via multipart form data or base64 in JSON
    let fileBytes: Uint8Array;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) throw new Error("No file uploaded");
      fileBytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const body = await req.json();
      if (body.fileBase64) {
        const binary = atob(body.fileBase64);
        fileBytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          fileBytes[i] = binary.charCodeAt(i);
        }
      } else {
        throw new Error("No file data provided. Send multipart form-data with 'file' field or JSON with 'fileBase64'.");
      }
    }

    console.log("Parsing Excel file...");
    const workbook = XLSX.read(fileBytes, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rows.length < 2) throw new Error("Spreadsheet has no data rows");

    // Find header row
    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      if (rows[i]?.some((cell: any) => String(cell).toUpperCase().includes("DATA"))) {
        headerIdx = i;
        break;
      }
    }

    const headers = (rows[headerIdx] || []).map((h: any) => String(h || "").toUpperCase().trim());
    const colMap = {
      date: headers.findIndex((h: string) => h === "DATA"),
      vendas: headers.findIndex((h: string) => h === "VENDAS"),
      margem: headers.findIndex((h: string) => h.includes("MARGEM")),
      arrecadacao: headers.findIndex((h: string) => h.includes("ARRECADA")),
      quantidade: headers.findIndex((h: string) => h.includes("QUANTIDADE")),
      volume: headers.findIndex((h: string) => h === "VOLUME"),
      clientes: headers.findIndex((h: string) => h === "CLIENTES"),
      storeName: headers.findIndex((h: string) => h === "SM"),
    };

    console.log("Column mapping:", JSON.stringify(colMap));
    if (colMap.date === -1) throw new Error("Could not find DATA column");

    const records: any[] = [];
    const storeNames = new Set<string>();

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[colMap.date]) continue;
      const dateStr = parseDate(row[colMap.date]);
      if (!dateStr) continue;
      const storeName = colMap.storeName >= 0 ? String(row[colMap.storeName] || "").trim() : "";
      if (!storeName) continue;
      storeNames.add(storeName);

      records.push({
        dateStr,
        storeName,
        vendas: parseMoneyValue(row[colMap.vendas]),
        margem: parsePercentValue(row[colMap.margem]),
        arrecadacao: parseMoneyValue(row[colMap.arrecadacao]),
        volume: colMap.quantidade >= 0 ? parseMoneyValue(row[colMap.quantidade]) : colMap.volume >= 0 ? parseMoneyValue(row[colMap.volume]) : 0,
        clientes: colMap.clientes >= 0 ? Number(row[colMap.clientes]) || 0 : 0,
        tipoDia: parseMoneyValue(row[colMap.vendas]) > 0 ? "D" : "F",
      });
    }

    console.log(`Parsed ${records.length} records for: ${[...storeNames].join(", ")}`);

    // Ensure stores exist
    const storeMap = new Map<string, string>();
    for (const name of storeNames) {
      const { data: existing } = await supabase.from("stores").select("id").eq("name", name).single();
      if (existing) {
        storeMap.set(name, existing.id);
      } else {
        const { data: created } = await supabase.from("stores").insert({ name }).select("id").single();
        if (created) storeMap.set(name, created.id);
      }
    }

    let upserted = 0, errors = 0;
    for (const rec of records) {
      const storeId = storeMap.get(rec.storeName);
      if (!storeId) continue;
      await supabase.from("store_daily_metrics").delete()
        .eq("store_id", storeId).eq("date", rec.dateStr).eq("department", "GERAL");
      const { error } = await supabase.from("store_daily_metrics").insert({
        store_id: storeId, date: rec.dateStr, department: "GERAL", tipo_dia: rec.tipoDia,
        realizado_vendas: rec.vendas, realizado_margem_pct: rec.margem,
        realizado_lucro: rec.arrecadacao, realizado_volume: rec.volume,
      });
      if (error) { console.error(error); errors++; } else { upserted++; }
    }

    // Aggregate monthly
    const monthlyAgg = new Map<string, any>();
    for (const rec of records) {
      const storeId = storeMap.get(rec.storeName);
      if (!storeId) continue;
      const [year, month] = rec.dateStr.split("-").map(Number);
      const key = `${storeId}-${year}-${month}`;
      if (!monthlyAgg.has(key)) {
        monthlyAgg.set(key, { storeId, month, year, faturamento: 0, margem_sum: 0, margem_count: 0, clientes: 0 });
      }
      const agg = monthlyAgg.get(key);
      agg.faturamento += rec.vendas;
      if (rec.vendas > 0) { agg.margem_sum += rec.margem; agg.margem_count++; }
      agg.clientes += rec.clientes;
    }

    for (const [, agg] of monthlyAgg) {
      await supabase.from("store_metrics").delete()
        .eq("store_id", agg.storeId).eq("month", agg.month).eq("year", agg.year);
      await supabase.from("store_metrics").insert({
        store_id: agg.storeId, month: agg.month, year: agg.year,
        faturamento: agg.faturamento,
        margem: agg.margem_count > 0 ? agg.margem_sum / agg.margem_count : 0,
        clientes: agg.clientes,
        ticket_medio: agg.clientes > 0 ? agg.faturamento / agg.clientes : 0,
      });
    }

    return new Response(JSON.stringify({
      success: true, records_parsed: records.length, records_upserted: upserted,
      errors, stores: [...storeNames],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("Sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
