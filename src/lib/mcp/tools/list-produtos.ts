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
  name: "list_produtos",
  title: "Listar produtos",
  description:
    "Lista/pesquisa produtos cadastrados da loja pelo nome (descrição), código interno ou EAN. Retorna até 50 produtos com id, código, EAN, descrição, categoria, preço regular.",
  inputSchema: {
    search: z
      .string()
      .optional()
      .describe("Texto para buscar em descrição, código interno ou EAN. Opcional."),
    limit: z.number().int().min(1).max(50).optional().describe("Máximo de resultados (default 20, teto 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Não autenticado" }], isError: true };
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("produtos")
      .select("id, codigo_interno, ean, descricao, categoria, preco_regular")
      .limit(limit ?? 20);
    if (search && search.trim()) {
      const s = search.trim();
      q = q.or(`descricao.ilike.%${s}%,codigo_interno.ilike.%${s}%,ean.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { produtos: data ?? [] },
    };
  },
});
