import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listProdutosTool from "./tools/list-produtos";
import listEncartesTool from "./tools/list-encartes";
import listVendasPadariaTool from "./tools/list-vendas-padaria";

// The OAuth issuer must be the direct Supabase host built from the project ref
// (not from SUPABASE_URL, which may be a proxy). Vite inlines the ref at build
// time so this stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "andrade-consultoria-mcp",
  title: "Andrade Consultoria MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas para o painel comercial da Andrade Consultoria. Use `whoami` para verificar a conexão, `list_produtos` para consultar o cadastro de produtos, `list_encartes` para listar encartes salvos do usuário e `list_vendas_padaria` para consultar as vendas diárias da padaria (filtre por ano, mês ou loja). Todas as consultas respeitam as permissões do usuário autenticado.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listProdutosTool, listEncartesTool, listVendasPadariaTool],
});
