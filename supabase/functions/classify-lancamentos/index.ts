import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUBCONTAS: Record<string, string[]> = {
  "Vendas": ["Venda Bruta", "Devoluções", "Cancelamentos", "Descontos concedidos"],
  "Impostos": ["ICMS", "PIS", "COFINS", "Simples", "Outros impostos"],
  "CMV": ["Custo de mercadoria vendida", "Perdas", "Quebras", "Ajustes de estoque"],
  "Despesas": ["Folha", "Aluguel", "Energia", "Água", "Internet", "Manutenção", "Marketing", "Serviços de terceiros", "Despesas administrativas", "Outras despesas"],
  "Recebíveis": ["Cartão crédito", "Cartão débito", "Pix", "Convênio", "Carteira", "Outros recebíveis"],
  "Outras Receitas": ["Bonificação", "Receita financeira", "Comissões", "Outras entradas"],
  "Despesas Financeiras": ["Juros", "Taxas bancárias", "Tarifas de cartão", "Multas", "Encargos"],
  "Ajustes": ["Ajuste contábil", "Reclassificação", "Provisões", "Estornos"],
  "Resultado Operacional": ["Resultado operacional"],
  "EBITDA": ["EBITDA"],
  "Lucro / Prejuízo": ["Lucro / Prejuízo"],
};

const TIPOS = Object.keys(SUBCONTAS);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { items } = await req.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "items array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const itemsList = items.map((item: any, i: number) =>
      `${i + 1}. Descrição/Beneficiário: "${item.descricao}", Valor: R$ ${item.valor}, Tipo informado: "${item.tipo || ""}"`
    ).join("\n");

    const tiposJson = JSON.stringify(
      Object.entries(SUBCONTAS).map(([tipo, subs]) => ({ tipo, subtipos: subs })),
      null, 2
    );

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um expert em finanças e contabilidade de supermercados/varejo. Classifique lançamentos financeiros nas categorias corretas do DRE.

Categorias disponíveis:
${tiposJson}

Regras:
- Se o "tipo" já foi informado e é válido, mantenha-o e apenas classifique o subtipo.
- Se o tipo estiver vazio ou inválido, classifique baseado na descrição/beneficiário.
- Fornecedores de mercadoria = CMV > Custo de mercadoria vendida
- Salários, encargos, funcionários = Despesas > Folha
- Aluguel, locação = Despesas > Aluguel
- Energia, luz, eletricidade = Despesas > Energia
- Água, saneamento = Despesas > Água
- Telefone, internet = Despesas > Internet
- Manutenção, conserto = Despesas > Manutenção
- Propaganda, publicidade = Despesas > Marketing
- Contador, consultoria, advocacia = Despesas > Serviços de terceiros
- Impostos (ICMS, PIS, COFINS, etc) = Impostos > subconta específica
- Juros, multas, taxas bancárias = Despesas Financeiras > subconta específica
- Vendas, faturamento, receita de vendas = Vendas > Venda Bruta
- Devoluções de clientes = Vendas > Devoluções
- Bonificações de fornecedores = Outras Receitas > Bonificação
- Recebimentos cartão = Recebíveis > subconta específica
- Se não souber classificar, use Despesas > Outras despesas`
          },
          {
            role: "user",
            content: `Classifique os seguintes lançamentos:\n\n${itemsList}`
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_items",
            description: "Retorna a classificação de cada lançamento",
            parameters: {
              type: "object",
              properties: {
                classifications: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: { type: "number", description: "Índice do item (começando em 1)" },
                      tipo: { type: "string", enum: TIPOS },
                      subtipo: { type: "string" },
                    },
                    required: ["index", "tipo", "subtipo"],
                  }
                }
              },
              required: ["classifications"],
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "classify_items" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido, tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI classification failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);
    
    // Validate subtipo belongs to tipo
    const validated = result.classifications.map((c: any) => {
      const validSubs = SUBCONTAS[c.tipo] || [];
      const subtipo = validSubs.includes(c.subtipo) ? c.subtipo : (validSubs[validSubs.length - 1] || c.subtipo);
      return { ...c, subtipo };
    });

    return new Response(JSON.stringify({ classifications: validated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("classify error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
