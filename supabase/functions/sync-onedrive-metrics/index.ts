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

function getTipoDia(tipo: string): string {
  if (!tipo) return "D";
  const upper = tipo.toUpperCase();
  if (upper.includes("F") || upper.includes("SÁB") || upper.includes("DOM") || upper.includes("FERIADO")) return "F";
  return "D";
}

// Detect if this is an FMA spreadsheet format by checking for "Gestão da Meta" or "Meta de Vendas" headers
function detectFMAFormat(workbook: any): { isFMA: boolean; metaSheetIdx: number; histSheetIdx: number; headerSheetIdx: number } {
  const result = { isFMA: false, metaSheetIdx: -1, histSheetIdx: -1, headerSheetIdx: -1 };
  
  for (let i = 0; i < workbook.SheetNames.length; i++) {
    const sheet = workbook.Sheets[workbook.SheetNames[i]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    
    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const rowStr = (rows[r] || []).map((c: any) => String(c || "")).join(" ").toUpperCase();
      if (rowStr.includes("META DE VENDAS E MARGEM") || rowStr.includes("GESTÃO DA META")) {
        result.isFMA = true;
      }
      if (rowStr.includes("GESTÃO DA META")) {
        result.metaSheetIdx = i;
      }
      if (rowStr.includes("META DE VENDAS E MARGEM")) {
        result.headerSheetIdx = i;
      }
    }
    
    // Check for historical data sheet (has Data, Venda Total columns)
    if (rows.length > 1) {
      const headerRow = (rows[0] || []).map((c: any) => String(c || "").toUpperCase());
      if (headerRow.includes("DATA") && headerRow.some((h: string) => h.includes("VENDA"))) {
        result.histSheetIdx = i;
      }
    }
  }
  
  return result;
}

// Parse FMA format - extract store name and target month from header sheet
function parseFMAHeader(workbook: any, sheetIdx: number): { storeName: string; targetMonth: number; targetYear: number } {
  const sheet = workbook.Sheets[workbook.SheetNames[sheetIdx]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  
  let storeName = "";
  let targetMonth = 0;
  let targetYear = 0;
  
  const monthMap: Record<string, number> = {
    "JANEIRO": 1, "FEVEREIRO": 2, "MARÇO": 3, "MARCO": 3, "ABRIL": 4,
    "MAIO": 5, "JUNHO": 6, "JULHO": 7, "AGOSTO": 8, "SETEMBRO": 9,
    "OUTUBRO": 10, "NOVEMBRO": 11, "DEZEMBRO": 12
  };
  
  for (let r = 0; r < Math.min(30, rows.length); r++) {
    const row = rows[r] || [];
    const rowStr = row.map((c: any) => String(c || "")).join("|");
    
    // Find store name (after "Qual o nome" question, usually in the answer row)
    if (rowStr.toUpperCase().includes("SM ") && !rowStr.toUpperCase().includes("PERGUNTA")) {
      for (const cell of row) {
        const cellStr = String(cell || "").trim();
        if (cellStr.toUpperCase().startsWith("SM ") && cellStr.length > 5) {
          storeName = cellStr;
          break;
        }
      }
    }
    
    // Find target month
    for (const cell of row) {
      const cellStr = String(cell || "").toUpperCase().trim();
      if (monthMap[cellStr]) {
        targetMonth = monthMap[cellStr];
      }
    }
    
    // Find target year
    for (const cell of row) {
      const num = Number(cell);
      if (num >= 2024 && num <= 2030) {
        targetYear = num;
      }
    }
  }
  
  return { storeName, targetMonth, targetYear };
}

// Parse FMA meta sheet ("Gestão da Meta") for daily targets
function parseFMAMetaSheet(workbook: any, sheetIdx: number): Array<{
  dateStr: string; tipoDia: string; metaVendas: number; metaLucro: number; metaMargemPct: number;
}> {
  const sheet = workbook.Sheets[workbook.SheetNames[sheetIdx]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  
  const records: any[] = [];
  
  // Find the row with DATA, TIPO DIAS, Meta headers
  let headerRow = -1;
  let dateCol = -1;
  let tipoCol = -1;
  let metaVendasCol = -1;
  let metaLucroCol = -1;
  let metaMargemCol = -1;
  
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const headers = row.map((c: any) => String(c || "").toUpperCase().trim());
    
    const dataIdx = headers.indexOf("DATA");
    const tipoIdx = headers.findIndex((h: string) => h.includes("TIPO"));
    
    if (dataIdx >= 0 && tipoIdx >= 0) {
      headerRow = r;
      dateCol = dataIdx;
      tipoCol = tipoIdx;
      
      // Meta vendas is usually the next column after TIPO
      // Look for "Meta" headers
      let metaCount = 0;
      for (let c = tipoIdx + 1; c < headers.length; c++) {
        if (headers[c] === "META" || headers[c].includes("META")) {
          metaCount++;
          if (metaCount === 1) metaVendasCol = c;
          if (metaCount === 2) metaLucroCol = c;
          if (metaCount === 3) metaMargemCol = c;
        }
      }
      
      // If we didn't find labeled Meta columns, use positional approach
      // Format: DATA | TIPO | Meta(vendas) | Realizado | Projeção | | Meta(lucro) | Realizado | Projeção | | Meta(margem) | Realizado | Projeção
      if (metaVendasCol === -1) {
        metaVendasCol = tipoCol + 1;
        metaLucroCol = tipoCol + 5;
        metaMargemCol = tipoCol + 9;
      }
      
      break;
    }
  }
  
  if (headerRow === -1) {
    console.log("Could not find meta header row in Gestão da Meta sheet");
    return [];
  }
  
  console.log(`FMA Meta: headerRow=${headerRow}, dateCol=${dateCol}, tipoCol=${tipoCol}, metaV=${metaVendasCol}, metaL=${metaLucroCol}, metaM=${metaMargemCol}`);
  
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row[dateCol]) continue;
    
    const dateStr = parseDate(row[dateCol]);
    if (!dateStr) continue;
    
    const tipo = String(row[tipoCol] || "D").trim();
    const metaVendas = parseMoneyValue(row[metaVendasCol]);
    const metaLucro = metaLucroCol >= 0 ? parseMoneyValue(row[metaLucroCol]) : 0;
    const metaMargem = metaMargemCol >= 0 ? parsePercentValue(row[metaMargemCol]) : 0;
    
    if (metaVendas > 0) {
      records.push({
        dateStr,
        tipoDia: getTipoDia(tipo),
        metaVendas,
        metaLucro,
        metaMargemPct: metaMargem,
      });
    }
  }
  
  return records;
}

// Parse historical data from Page 2 format (Data, Venda Total, Custo Total, Lucro, Quant, Margem)
function parseFMAHistoricalSheet(workbook: any, sheetIdx: number): Array<{
  dateStr: string; vendas: number; lucro: number; volume: number; margem: number;
}> {
  const sheet = workbook.Sheets[workbook.SheetNames[sheetIdx]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  
  const records: any[] = [];
  let headerRow = -1;
  let colMap = { date: -1, vendas: -1, lucro: -1, volume: -1, margem: -1 };
  
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const headers = (rows[r] || []).map((c: any) => String(c || "").toUpperCase().trim());
    const dateIdx = headers.indexOf("DATA");
    if (dateIdx >= 0) {
      headerRow = r;
      colMap.date = dateIdx;
      colMap.vendas = headers.findIndex((h: string) => h.includes("VENDA"));
      colMap.lucro = headers.indexOf("LUCRO");
      colMap.volume = headers.findIndex((h: string) => h === "QUANT" || h.includes("QUANT"));
      colMap.margem = headers.findIndex((h: string) => h.includes("MARGEM"));
      break;
    }
  }
  
  if (headerRow === -1) return [];
  
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row[colMap.date]) continue;
    const dateStr = parseDate(row[colMap.date]);
    if (!dateStr) continue;
    
    const vendas = parseMoneyValue(row[colMap.vendas]);
    if (vendas <= 0) continue;
    
    records.push({
      dateStr,
      vendas,
      lucro: colMap.lucro >= 0 ? parseMoneyValue(row[colMap.lucro]) : 0,
      volume: colMap.volume >= 0 ? parseMoneyValue(row[colMap.volume]) : 0,
      margem: colMap.margem >= 0 ? parsePercentValue(row[colMap.margem]) : 0,
    });
  }
  
  return records;
}

// Legacy format parser (original SM column-based format)
function parseLegacyFormat(workbook: any): { records: any[]; storeNames: Set<string> } {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (rows.length < 2) throw new Error("Spreadsheet has no data rows");

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
    vendas: headers.findIndex((h: string) => h === "VENDAS" || h.includes("VENDA TOTAL")),
    margem: headers.findIndex((h: string) => h.includes("MARGEM")),
    arrecadacao: headers.findIndex((h: string) => h.includes("ARRECADA") || h === "LUCRO"),
    quantidade: headers.findIndex((h: string) => h.includes("QUANTIDADE") || h === "QUANT"),
    volume: headers.findIndex((h: string) => h === "VOLUME"),
    clientes: headers.findIndex((h: string) => h === "CLIENTES"),
    storeName: headers.findIndex((h: string) => h === "SM"),
  };

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

  return { records, storeNames };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    console.log("Sheets found:", workbook.SheetNames);

    // Detect format
    const fmaInfo = detectFMAFormat(workbook);
    console.log("FMA detection:", JSON.stringify(fmaInfo));

    if (fmaInfo.isFMA) {
      return await handleFMAFormat(supabase, workbook, fmaInfo);
    } else {
      return await handleLegacyFormat(supabase, workbook);
    }
  } catch (error: unknown) {
    console.error("Sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleFMAFormat(supabase: any, workbook: any, fmaInfo: any) {
  // Extract store info from header sheet
  const headerIdx = fmaInfo.headerSheetIdx >= 0 ? fmaInfo.headerSheetIdx : 0;
  const { storeName, targetMonth, targetYear } = parseFMAHeader(workbook, headerIdx);
  console.log(`FMA Store: ${storeName}, Target: ${targetMonth}/${targetYear}`);

  if (!storeName) throw new Error("Não foi possível identificar o nome da loja na planilha FMA");

  // Ensure store exists
  const { data: existing } = await supabase.from("stores").select("id").eq("name", storeName).single();
  let storeId: string;
  if (existing) {
    storeId = existing.id;
  } else {
    const { data: created } = await supabase.from("stores").insert({ name: storeName }).select("id").single();
    if (!created) throw new Error("Failed to create store");
    storeId = created.id;
  }

  let upserted = 0;
  let errors = 0;

  // Process meta sheet (daily targets)
  if (fmaInfo.metaSheetIdx >= 0) {
    const metaRecords = parseFMAMetaSheet(workbook, fmaInfo.metaSheetIdx);
    console.log(`FMA: ${metaRecords.length} daily meta records found`);

    for (const rec of metaRecords) {
      await supabase.from("store_daily_metrics").delete()
        .eq("store_id", storeId).eq("date", rec.dateStr).eq("department", "GERAL");

      const { error } = await supabase.from("store_daily_metrics").insert({
        store_id: storeId,
        date: rec.dateStr,
        department: "GERAL",
        tipo_dia: rec.tipoDia,
        meta_vendas: rec.metaVendas,
        meta_lucro: rec.metaLucro,
        meta_margem_pct: rec.metaMargemPct,
        projecao_vendas: rec.metaVendas,
      });
      if (error) { console.error(error); errors++; } else { upserted++; }
    }

    // Calculate total monthly meta
    if (targetMonth > 0 && targetYear > 0) {
      const totalMeta = metaRecords.reduce((sum, r) => sum + r.metaVendas, 0);
      const avgMargem = metaRecords.length > 0 
        ? metaRecords.reduce((sum, r) => sum + r.metaMargemPct, 0) / metaRecords.length 
        : 0;

      await supabase.from("store_metrics").delete()
        .eq("store_id", storeId).eq("month", targetMonth).eq("year", targetYear);
      await supabase.from("store_metrics").insert({
        store_id: storeId,
        month: targetMonth,
        year: targetYear,
        meta_faturamento: totalMeta,
        margem: avgMargem,
      });
    }
  }

  // Process historical data if available
  if (fmaInfo.histSheetIdx >= 0) {
    const histRecords = parseFMAHistoricalSheet(workbook, fmaInfo.histSheetIdx);
    console.log(`FMA: ${histRecords.length} historical records found`);

    for (const rec of histRecords) {
      // Check if a record already exists with meta data - if so, update instead of replace
      const { data: existingRec } = await supabase.from("store_daily_metrics")
        .select("id, meta_vendas")
        .eq("store_id", storeId).eq("date", rec.dateStr).eq("department", "GERAL")
        .single();

      if (existingRec) {
        // Update with realized values, keep meta
        const { error } = await supabase.from("store_daily_metrics")
          .update({
            realizado_vendas: rec.vendas,
            realizado_lucro: rec.lucro,
            realizado_margem_pct: rec.margem,
            realizado_volume: rec.volume,
          })
          .eq("id", existingRec.id);
        if (error) { console.error(error); errors++; } else { upserted++; }
      } else {
        const { error } = await supabase.from("store_daily_metrics").insert({
          store_id: storeId,
          date: rec.dateStr,
          department: "GERAL",
          tipo_dia: rec.vendas > 0 ? "D" : "F",
          realizado_vendas: rec.vendas,
          realizado_lucro: rec.lucro,
          realizado_margem_pct: rec.margem,
          realizado_volume: rec.volume,
        });
        if (error) { console.error(error); errors++; } else { upserted++; }
      }
    }

    // Aggregate monthly from historical
    const monthlyAgg = new Map<string, any>();
    for (const rec of histRecords) {
      const [year, month] = rec.dateStr.split("-").map(Number);
      const key = `${year}-${month}`;
      if (!monthlyAgg.has(key)) {
        monthlyAgg.set(key, { month, year, faturamento: 0, margem_sum: 0, margem_count: 0 });
      }
      const agg = monthlyAgg.get(key);
      agg.faturamento += rec.vendas;
      if (rec.vendas > 0) { agg.margem_sum += rec.margem; agg.margem_count++; }
    }

    for (const [, agg] of monthlyAgg) {
      // Don't overwrite monthly records that have meta_faturamento set
      const { data: existingMonthly } = await supabase.from("store_metrics")
        .select("id, meta_faturamento")
        .eq("store_id", storeId).eq("month", agg.month).eq("year", agg.year)
        .single();

      if (existingMonthly) {
        await supabase.from("store_metrics").update({
          faturamento: agg.faturamento,
          margem: agg.margem_count > 0 ? agg.margem_sum / agg.margem_count : 0,
        }).eq("id", existingMonthly.id);
      } else {
        await supabase.from("store_metrics").insert({
          store_id: storeId,
          month: agg.month,
          year: agg.year,
          faturamento: agg.faturamento,
          margem: agg.margem_count > 0 ? agg.margem_sum / agg.margem_count : 0,
        });
      }
    }
  }

  return new Response(JSON.stringify({
    success: true,
    format: "FMA",
    records_upserted: upserted,
    errors,
    stores: [storeName],
    target_month: targetMonth,
    target_year: targetYear,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleLegacyFormat(supabase: any, workbook: any) {
  const { records, storeNames } = parseLegacyFormat(workbook);
  console.log(`Legacy: ${records.length} records for: ${[...storeNames].join(", ")}`);

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
    success: true, format: "legacy", records_parsed: records.length, records_upserted: upserted,
    errors, stores: [...storeNames],
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
