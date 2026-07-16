import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_vendas_padaria",
  title: "Listar vendas da padaria",
  description:
    "Consulta linhas da tabela de vendas da padaria, filtrando opcionalmente por ano, mês e loja. Retorna até 100 registros com data, loja, vendas/meta, margem/meta, volume, lucro e part_percent.",
  inputSchema: {
    ano: z.number().int().min(2000).max(2100).optional().describe("Filtrar pelo ano (ex: 2026)."),
    mes: z.number().int().min(1).max(12).optional().describe("Filtrar pelo mês (1-12)."),
    loja: z.string().optional().describe("Filtrar pela loja (match exato)."),
    limit: z.number().int().min(1).max(100).optional().describe("Máximo de resultados (default 31)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ ano, mes, loja, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const sb = supabaseForUser(ctx);
    let q = sb.from("vendas_padaria").select("*").order("data", { ascending: true }).limit(limit ?? 31);
    if (ano !== undefined) q = q.eq("ano", ano);
    if (mes !== undefined) q = q.eq("mes", mes);
    if (loja) q = q.eq("loja", loja);
    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { vendas: data ?? [] },
    };
  },
});
