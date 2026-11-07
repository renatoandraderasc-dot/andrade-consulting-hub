import { pick } from "@/lib/vrReport";

interface RespostaVendas {
  data: any;
  error: any;
}

type Consultar = (relatorio: string, params: Record<string, string>) => Promise<RespostaVendas>;

const dataLinha = (linha: unknown) => String(pick(linha, "data", "dia") ?? "").slice(0, 10);

/** DIRECTOR precisa da quebra diária; totais sem data nunca representam o primeiro dia. */
export async function consultarVendasDiarias(
  sistema: string | null | undefined,
  inicio: string,
  fim: string,
  consultar: Consultar,
): Promise<RespostaVendas> {
  if (sistema?.toUpperCase() !== "DIRECTOR") {
    return consultar("vendas_secao_periodo", { inicio, fim });
  }

  const resposta = await consultar("vendas_secao_dia", { inicio, fim });
  if (resposta.error || resposta.data?.erro) return resposta;
  const linhas = Array.isArray(resposta.data?.dados) ? resposta.data.dados : [];
  if (linhas.every((linha: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(dataLinha(linha)))) {
    return resposta;
  }

  // Pontes antigas aceitam apenas `data`: consultas sequenciais, sem disputar a fila.
  const dados: any[] = [];
  let aviso: string | undefined;
  let cacheEm: string | undefined;
  const dia = new Date(`${inicio}T00:00:00Z`);
  const ultimo = new Date(`${fim}T00:00:00Z`);
  while (dia <= ultimo) {
    const data = dia.toISOString().slice(0, 10);
    const diaria = await consultar("vendas_secao_dia", { data });
    if (diaria.error || diaria.data?.erro) return diaria;
    for (const linha of diaria.data?.dados ?? []) {
      dados.push({ ...linha, data });
    }
    if (diaria.data?.origem === "cache" && diaria.data?.aviso) {
      aviso = diaria.data.aviso;
      cacheEm = diaria.data.cache_em;
    }
    dia.setUTCDate(dia.getUTCDate() + 1);
  }
  return {
    data: { ...resposta.data, dados, ...(aviso ? { origem: "cache", aviso, cache_em: cacheEm } : {}) },
    error: null,
  };
}