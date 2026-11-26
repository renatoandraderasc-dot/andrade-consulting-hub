/**
 * Escala V2 — o que acontece quando o usuário aperta "Gerar escala com IA".
 *
 *   1. a IA lê os pedidos escritos pelo gestor e devolve restrições;
 *   2. o aplicativo confere essas restrições (nada da IA entra sem conferência);
 *   3. o motor monta a escala testando várias combinações;
 *   4. o validador confere cada regra legal;
 *   5. a IA escreve o parecer em linguagem simples.
 *
 * Se a IA estiver fora do ar, os passos 3 e 4 rodam do mesmo jeito: a
 * escala sai, só sem a leitura dos pedidos e sem o parecer.
 */
import { supabase } from "@/integrations/supabase/client";
import { aplicarPedidos, resumoParaParecer, type PedidosAplicados, type PedidosIA } from "./contexto";
import type { DadosEscalaV2 } from "./dados";
import { gerar, type DiaEscala, type Geracao } from "./motor";

async function chamar<T>(corpo: Record<string, unknown>): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke("escala-ia", { body: corpo });
    if (error || !data || (data as { erro?: string }).erro) return null;
    return data as T;
  } catch {
    return null;
  }
}

export type EtapaIA = "pedidos" | "montando" | "parecer";

export interface ResultadoIA {
  geracao: Geracao;
  /** dias prontos para gravar (folgas pedidas deixam de ser "travadas") */
  dias: DiaEscala[];
  pedidos: PedidosAplicados;
  parecer: string | null;
  /** false quando a função de IA não respondeu em alguma etapa */
  iaRespondeu: boolean;
}

const respirar = () => new Promise<void>(r => setTimeout(r, 30));

export async function gerarComIA(d: DadosEscalaV2, instrucoes: string, aoMudarEtapa: (e: EtapaIA) => void): Promise<ResultadoIA> {
  let iaRespondeu = true;
  let bruto: PedidosIA | null = null;
  if (instrucoes.trim()) {
    aoMudarEtapa("pedidos");
    bruto = await chamar<PedidosIA>({
      modo: "interpretar", store_id: d.storeId, mes: `${d.ano}-${String(d.mes).padStart(2, "0")}`, instrucoes,
      pessoas: d.pessoas.filter(p => p.ativo).map(p => ({ id: p.id, nome: p.nome, setor: p.setor })),
    });
    if (!bruto) iaRespondeu = false;
  }
  const pedidos = aplicarPedidos(d, bruto);
  aoMudarEtapa("montando");
  await respirar();
  const geracao = gerar(pedidos.ctx);
  const dias = geracao.dias.map(x => (pedidos.folgasPedidas.has(`${x.pessoa_id}|${x.data}`) ? { ...x, travado: false } : x));
  aoMudarEtapa("parecer");
  const resposta = await chamar<{ parecer: string }>({ modo: "parecer", store_id: d.storeId, resumo: resumoParaParecer(d, pedidos.ctx, geracao, pedidos) });
  if (!resposta?.parecer) iaRespondeu = false;
  return { geracao, dias, pedidos, parecer: resposta?.parecer || null, iaRespondeu };
}
