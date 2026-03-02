import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function convertOneDriveShareLink(shareUrl: string): string {
  // Convert OneDrive share link to direct download URL
  // Method: base64url encode the share URL with "u!" prefix
  const base64 = btoa(shareUrl)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const encodedUrl = `u!${base64}`;
  return `https://api.onedrive.com/v1.0/shares/${encodedUrl}/root/content`;
}

function parseMoneyValue(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const str = String(val)
    .replace("R$", "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function parsePercentValue(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val * 100; // Excel stores percentages as decimals
  const str = String(val).replace("%", "").replace(",", ".").trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function parseDate(val: any): string | null {
  if (!val) return null;
  // Excel serial date number
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, "0");
      const d = String(date.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  // String date like "2/1/26" or "2026-02-01"
  const str = String(val).trim();
  if (!str) return null;

  // Try MM/DD/YY format
  const parts = str.split("/");
  if (parts.length === 3) {
    let [month, day, year] = parts.map(Number);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Try ISO format
  if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
    return str.substring(0, 10);
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ONEDRIVE_SHARE_URL = Deno.env.get("ONEDRIVE_SHARE_URL");
    if (!ONEDRIVE_SHARE_URL) {
      throw new Error("ONEDRIVE_SHARE_URL is not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Download Excel from OneDrive
    const downloadUrl = convertOneDriveShareLink(ONEDRIVE_SHARE_URL);
    console.log("Fetching from OneDrive...");
    const response = await fetch(downloadUrl, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rows.length < 2) {
      throw new Error("Spreadsheet has no data rows");
    }

    // Find header row (first row with "DATA" in it)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i];
      if (row && row.some((cell: any) => String(cell).toUpperCase().includes("DATA"))) {
        headerIdx = i;
        break;
      }
    }

    const headers = (rows[headerIdx] || []).map((h: any) =>
      String(h || "").toUpperCase().trim()
    );

    // Find column indices
    const colMap = {
      date: headers.findIndex((h: string) => h === "DATA"),
      vendas: headers.findIndex((h: string) => h === "VENDAS"),
      margem: headers.findIndex((h: string) => h.includes("MARGEM")),
      arrecadacao: headers.findIndex((h: string) => h.includes("ARRECADA")),
      volume: headers.findIndex((h: string) => h === "VOLUME"),
      clientes: headers.findIndex((h: string) => h === "CLIENTES"),
      quantidade: headers.findIndex((h: string) => h.includes("QUANTIDADE")),
      storeName: headers.findIndex((h: string) => h === "SM"),
    };

    console.log("Column mapping:", JSON.stringify(colMap));

    if (colMap.date === -1) {
      throw new Error("Could not find DATA column in spreadsheet");
    }

    // Process data rows
    const records: any[] = [];
    const storeNames = new Set<string>();

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[colMap.date]) continue;

      const dateStr = parseDate(row[colMap.date]);
      if (!dateStr) continue;

      const storeName = colMap.storeName >= 0
        ? String(row[colMap.storeName] || "").trim()
        : "";
      if (!storeName) continue;

      storeNames.add(storeName);

      const vendas = parseMoneyValue(row[colMap.vendas]);
      const margem = parsePercentValue(row[colMap.margem]);
      const arrecadacao = parseMoneyValue(row[colMap.arrecadacao]);
      const volume = colMap.quantidade >= 0
        ? parseMoneyValue(row[colMap.quantidade])
        : colMap.volume >= 0
          ? parseMoneyValue(row[colMap.volume])
          : 0;
      const clientes = colMap.clientes >= 0 ? Number(row[colMap.clientes]) || 0 : 0;

      // Determine tipo_dia (D = weekday with sales, F = closed/no sales)
      const tipoDia = vendas > 0 ? "D" : "F";

      records.push({
        dateStr,
        storeName,
        vendas,
        margem,
        arrecadacao,
        volume,
        clientes,
        tipoDia,
      });
    }

    console.log(`Parsed ${records.length} records for stores: ${[...storeNames].join(", ")}`);

    // Ensure stores exist
    const storeMap = new Map<string, string>();
    for (const name of storeNames) {
      const { data: existing } = await supabase
        .from("stores")
        .select("id")
        .eq("name", name)
        .single();

      if (existing) {
        storeMap.set(name, existing.id);
      } else {
        const { data: created, error } = await supabase
          .from("stores")
          .insert({ name })
          .select("id")
          .single();
        if (error) {
          console.error(`Error creating store ${name}:`, error);
          continue;
        }
        if (created) storeMap.set(name, created.id);
      }
    }

    // Upsert daily metrics (using "GERAL" as department for the overall store data)
    let upserted = 0;
    let errors = 0;

    for (const rec of records) {
      const storeId = storeMap.get(rec.storeName);
      if (!storeId) continue;

      // Delete existing record for this date/store/department
      await supabase
        .from("store_daily_metrics")
        .delete()
        .eq("store_id", storeId)
        .eq("date", rec.dateStr)
        .eq("department", "GERAL");

      const { error } = await supabase.from("store_daily_metrics").insert({
        store_id: storeId,
        date: rec.dateStr,
        department: "GERAL",
        tipo_dia: rec.tipoDia,
        realizado_vendas: rec.vendas,
        realizado_margem_pct: rec.margem,
        realizado_lucro: rec.arrecadacao,
        realizado_volume: rec.volume,
      });

      if (error) {
        console.error(`Error upserting ${rec.dateStr}:`, error);
        errors++;
      } else {
        upserted++;
      }
    }

    // Also update store_metrics (monthly aggregated)
    const monthlyAgg = new Map<string, any>();
    for (const rec of records) {
      const storeId = storeMap.get(rec.storeName);
      if (!storeId) continue;
      const [year, month] = rec.dateStr.split("-").map(Number);
      const key = `${storeId}-${year}-${month}`;
      if (!monthlyAgg.has(key)) {
        monthlyAgg.set(key, {
          storeId,
          month,
          year,
          faturamento: 0,
          margem_sum: 0,
          margem_count: 0,
          clientes: 0,
          dias_com_venda: 0,
        });
      }
      const agg = monthlyAgg.get(key);
      agg.faturamento += rec.vendas;
      if (rec.vendas > 0) {
        agg.margem_sum += rec.margem;
        agg.margem_count++;
        agg.dias_com_venda++;
      }
      agg.clientes += rec.clientes;
    }

    for (const [, agg] of monthlyAgg) {
      const avgMargem = agg.margem_count > 0 ? agg.margem_sum / agg.margem_count : 0;
      const ticketMedio = agg.clientes > 0 ? agg.faturamento / agg.clientes : 0;

      // Delete then insert
      await supabase
        .from("store_metrics")
        .delete()
        .eq("store_id", agg.storeId)
        .eq("month", agg.month)
        .eq("year", agg.year);

      await supabase.from("store_metrics").insert({
        store_id: agg.storeId,
        month: agg.month,
        year: agg.year,
        faturamento: agg.faturamento,
        margem: avgMargem,
        clientes: agg.clientes,
        ticket_medio: ticketMedio,
      });
    }

    const result = {
      success: true,
      records_parsed: records.length,
      records_upserted: upserted,
      errors,
      stores: [...storeNames],
    };
    console.log("Sync complete:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
