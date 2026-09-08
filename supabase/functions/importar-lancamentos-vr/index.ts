// ============================================================
// importar-lancamentos-vr
// Le os PAGAMENTOS REALIZADOS no VR (por data de pagamento) e grava
// em public.lancamentos ja classificados no tipo/subtipo da Cont Rede,
// usando o de-para vr_lancamento_map.
//
// Body: { store_id, user_id, inicio: "AAAA-MM-DD", fim: "AAAA-MM-DD" }
//   ou  { store_id, user_id, meses_atras: 3 }
//
// Reimportar o mesmo periodo ATUALIZA os lancamentos (nao duplica),
// gracas ao indice unico (store_id, origem, origem_ref).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarRelatorioLoja } from "../_shared/consultaLoja.ts";
import { classificarAuto } from "../_shared/classificarAuto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmt(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function blocosMensais(inicio: string, fim: string) {
  const out: { ini: string; fim: string }[] = [];
  const dIni = new Date(inicio + "T00:00:00Z");
  const dFim = new Date(fim + "T00:00:00Z");
  let cur = new Date(Date.UTC(dIni.getUTCFullYear(), dIni.getUTCMonth(), 1));
  while (cur <= dFim) {
    const ultimo = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0));
    const ini = cur < dIni ? dIni : cur;
    const f = ultimo > dFim ? dFim : ultimo;
    out.push({ ini: fmt(ini), fim: fmt(f) });
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

interface LinhaVr {
  data_pagamento: string;
  vencimento: string;
  valor: string;
  acrescimo: string;
  valor_pago: string;
  fornecedor: string | null;
  documento: number | null;
  id_tipo: number | null;
  observacao: string | null;
  origem: string;
  ref: number;
  nome_tipo_entrada?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json();
    const { store_id, user_id } = body;
    if (!store_id || !user_id) return json({ erro: "informe store_id e user_id" }, 400);

    let inicio = body.inicio;
    let fim = body.fim;
    if (body.meses_atras) {
      const hoje = new Date();
      fim = fmt(hoje);
      inicio = fmt(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - Number(body.meses_atras) + 1, 1)));
    }
    if (!inicio || !fim) return json({ erro: "informe inicio e fim, ou meses_atras" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: cfg } = await supabase.from("store_vr_config")
      .select("api_url, api_key, sistema, codigo_loja").eq("store_id", store_id).single();
    if (!cfg) return json({ erro: "loja sem conexao VR cadastrada" }, 400);

    // de-para: excecao da loja tem prioridade sobre o padrao (store_id NULL)
    const { data: mapas } = await supabase.from("vr_lancamento_map")
      .select("store_id, id_tipo, tipo, subtipo, descricao_vr")
      .or(`store_id.eq.${store_id},store_id.is.null`);
    type Classificacao = { tipo: string; subtipo: string; descricao_vr: string | null };
    const padrao = new Map<number, Classificacao>();
    const daLoja = new Map<number, Classificacao>();
    for (const m of mapas ?? []) {
      (m.store_id ? daLoja : padrao).set(m.id_tipo, {
        tipo: m.tipo,
        subtipo: m.subtipo,
        descricao_vr: m.descricao_vr,
      });
    }
    const classificar = (idTipo: number | string | null) => {
      const n = idTipo === null || idTipo === "" ? NaN : Number(idTipo);
      if (Number.isNaN(n)) return undefined;
      return daLoja.get(n) ?? padrao.get(n);
    };

    const blocos = blocosMensais(inicio, fim);
    const detalhe: Record<string, unknown>[] = [];
    const naoClassificados = new Map<number, { qtd: number; valor: number; exemplo: string }>();
    let gravadosTotal = 0;
    // Contas (subtipos) que precisam existir no cadastro do cliente.
    const contasUsadas = new Map<string, string>();

    let duplicadosIgnorados = 0;

    for (const b of blocos) {
      const base = {
        supabaseUrl: Deno.env.get("SUPABASE_URL")!,
        serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        storeId: store_id,
        params: { inicio: b.ini, fim: b.fim },
        cfg,
        timeoutMs: 90000,
      };
      let r = await consultarRelatorioLoja({ ...base, relatorio: "pagamentos_periodo" });

      // Conectores que nao publicam pagamentos_periodo (ex.: SM Araujo)
      // caem para contas_a_pagar (titulos de fornecedor por vencimento).
      let viaContasAPagar = false;
      if (!r.ok || r.dados.length === 0) {
        const alt = await consultarRelatorioLoja({ ...base, relatorio: "contas_a_pagar" });
        if (alt.ok && alt.dados.length) {
          r = alt;
          viaContasAPagar = true;
        }
      }
      if (!r.ok) {
        detalhe.push({ periodo: b.ini, erro: r.erro });
        continue;
      }
      // Le um campo aceitando variacao de caixa/acentos no nome.
      const pick = (x: Record<string, unknown>, nomes: string[]) => {
        const mapa = new Map<string, unknown>();
        for (const k of Object.keys(x)) mapa.set(k.toLowerCase().trim(), x[k]);
        for (const n of nomes) {
          const v = mapa.get(n);
          if (v !== undefined && v !== null && String(v).trim() !== "") return v;
        }
        return null;
      };
      const NOMES_TIPO = ["tipo", "tipo_entrada", "tipoentrada", "descricao_tipo", "nome_tipo", "tipo_de_entrada", "desc_tipo"];
      const NOMES_ID_TIPO = ["id_tipo", "id_tipo_entrada", "tipo_entrada_id", "cod_tipo_entrada", "codigo_tipo"];

      const linhas = (viaContasAPagar
        ? (r.dados as Record<string, unknown>[]).map((x, i) => ({
            ref: `CAP-${x.documento ?? i}-${x.parcela ?? 0}-${String(x.vencimento ?? "").slice(0, 10)}`,
            data_pagamento: String(x.vencimento ?? ""),
            vencimento: String(x.vencimento ?? ""),
            valor_pago: x.valor,
            fornecedor: x.fornecedor,
            documento: x.documento,
            observacao: x.observacao ?? (x.situacao ? `Situacao ${x.situacao}` : null),
            // Classificacao sempre pelo Tipo de Entrada informado pelo ERP.
            id_tipo: pick(x, NOMES_ID_TIPO),
            nome_tipo_entrada: pick(x, NOMES_TIPO) ? String(pick(x, NOMES_TIPO)).trim() : null,
          }))
        : (r.dados as Record<string, unknown>[]).map((x, i) => ({
            ...x,
            id_tipo: pick(x, NOMES_ID_TIPO),
            nome_tipo_entrada: pick(x, NOMES_TIPO) ? String(pick(x, NOMES_TIPO)).trim() : null,
            // varios conectores VR nao devolvem "ref" em pagamentos_periodo:
            // gera uma chave estavel para nao perder o lancamento nem duplicar.
            ref: x.ref ??
              `PG-${String(x.vencimento ?? x.data_pagamento ?? "").slice(0, 10)}-${x.documento ?? i}-${
                String(x.fornecedor ?? "").slice(0, 20)
              }-${x.valor_pago ?? x.valor ?? 0}-${pick(x, NOMES_ID_TIPO) ?? ""}`,
          }))) as unknown as LinhaVr[];



      const registros = [];
      const vistos = new Set<string>();
      // Duplicados = mesmo valor + mesma data de pagamento + mesmo beneficiario
      // + mesmo numero de documento. Só o primeiro é considerado.
      const chavesDuplicidade = new Set<string>();
      for (const l of linhas) {
        const ref = String(l.ref ?? "");
        if (!ref || vistos.has(ref)) continue;
        vistos.add(ref);
        // transferencias entre lojas nao sao despesa nem compra
        if (l.origem === "TRANSFERENCIA") continue;

        const cls = classificar(l.id_tipo);

        // A data do lancamento e sempre o VENCIMENTO do titulo
        const data = String(l.vencimento || l.data_pagamento || "").slice(0, 10);
        const [ano, mes] = data.split("-").map(Number);
        const valor = parseFloat(String(l.valor_pago)) || 0;
        if (!data || !ano || !mes) continue;

        const chaveDup = [
          Math.round(valor * 100),
          String(l.data_pagamento || l.vencimento || "").slice(0, 10),
          String(l.fornecedor ?? "").trim().toUpperCase(),
          String(l.documento ?? "").trim(),
        ].join("|");
        if (chavesDuplicidade.has(chaveDup)) {
          duplicadosIgnorados++;
          continue;
        }
        chavesDuplicidade.add(chaveDup);

        if (!cls) {
          const at = naoClassificados.get(Number(l.id_tipo ?? -1)) ??
            { qtd: 0, valor: 0, exemplo: l.fornecedor ?? "" };
          at.qtd++; at.valor += valor;
          naoClassificados.set(Number(l.id_tipo ?? -1), at);
        }

        const partes = [l.fornecedor, l.documento ? `Doc ${l.documento}` : null, l.observacao]
          .filter(Boolean).join(" · ");

        // Tipo de entrada (codigo do tipo no ERP) sempre registrado, para classificacao
        const idTipoTxt = l.id_tipo === null || l.id_tipo === undefined || l.id_tipo === ""
          ? (viaContasAPagar ? "CAP" : "SEM TIPO")
          : String(l.id_tipo);
        const nomeTipo = l.nome_tipo_entrada || cls?.descricao_vr || null;
        const obsBase = `Tipo de Entrada: ${nomeTipo || "NÃO CADASTRADO"} (ID ${idTipoTxt})`;

        // Sem de-para cadastrado: classifica automaticamente por palavras-chave
        // (o usuario pode corrigir depois na tela de classificacao).
        const auto = cls ? null : classificarAuto({
          nomeTipo,
          somenteTipo: true,
        });

        // A conta do lancamento e o proprio Tipo de entrada quando o ERP informa.
        const conta = nomeTipo || cls?.subtipo || auto?.subtipo || "OUTROS";
        const grupo = cls?.tipo ?? auto?.tipo ?? "Despesas";
        if (nomeTipo) contasUsadas.set(nomeTipo, grupo);

        registros.push({
          store_id,
          user_id,
          data,
          competencia_mes: mes,
          competencia_ano: ano,
          tipo: grupo,
          subtipo: conta,
          tipo_entrada: nomeTipo,
          id_tipo: Number.isFinite(Number(l.id_tipo)) && l.id_tipo !== null ? Number(l.id_tipo) : null,
          descricao: partes.slice(0, 300) || "Pagamento VR",
          valor: Math.round(valor * 100) / 100,
          observacao: obsBase,

          status: "ativo",
          origem: "VR",
          origem_ref: ref,
        });


      }

      // Respeita edicoes manuais: se o usuario ja trocou a conta do lancamento,
      // a reimportacao mantem a classificacao dele.
      const { data: manuais } = await supabase
        .from("lancamentos")
        .select("origem_ref, tipo, subtipo")
        .eq("store_id", store_id)
        .eq("origem", "VR")
        .eq("classificacao_manual", true)
        .gte("data", b.ini)
        .lte("data", b.fim);
      const mapaManual = new Map<string, { tipo: string; subtipo: string }>();
      for (const m of manuais ?? []) mapaManual.set(String(m.origem_ref), { tipo: m.tipo, subtipo: m.subtipo });
      for (const reg of registros) {
        const man = mapaManual.get(String(reg.origem_ref));
        if (man) {
          reg.tipo = man.tipo;
          reg.subtipo = man.subtipo;
          (reg as Record<string, unknown>).classificacao_manual = true;
        }
      }

      let gravados = 0;

      let falhouGravacao = false;
      for (let i = 0; i < registros.length; i += 500) {
        const lote = registros.slice(i, i + 500);
        const { error } = await supabase.from("lancamentos")
          .upsert(lote, { onConflict: "store_id,origem,origem_ref" });
        if (error) {
          detalhe.push({ periodo: b.ini, erro: error.message, gravados });
          falhouGravacao = true;
          break;
        }
        gravados += lote.length;
      }

      // O conector pode passar a filtrar corretamente uma loja depois de um
      // período em que devolvia todas as filiais juntas. O upsert sozinho não
      // remove esses pagamentos antigos. Após uma leitura e gravação completas,
      // reconciliamos somente os registros VR desta loja e deste bloco mensal.
      if (!falhouGravacao) {
        const refsAtuais = new Set(registros.map((r) => String(r.origem_ref)));
        const { data: existentes, error: erroLeitura } = await supabase
          .from("lancamentos")
          .select("id, origem_ref")
          .eq("store_id", store_id)
          .eq("origem", "VR")
          .gte("data", b.ini)
          .lte("data", b.fim);

        if (erroLeitura) {
          detalhe.push({ periodo: b.ini, erro: `falha ao reconciliar loja: ${erroLeitura.message}`, gravados });
        } else {
          const obsoletos = (existentes ?? [])
            .filter((item) => !refsAtuais.has(String(item.origem_ref ?? "")))
            .map((item) => item.id);

          for (let i = 0; i < obsoletos.length; i += 100) {
            const { error } = await supabase.from("lancamentos").delete().in("id", obsoletos.slice(i, i + 100));
            if (error) {
              detalhe.push({ periodo: b.ini, erro: `falha ao remover pagamentos de outra loja: ${error.message}`, gravados });
              break;
            }
          }
        }
      }
      gravadosTotal += gravados;
      detalhe.push({ periodo: b.ini, linhas_api: linhas.length, gravados });
    }

    // Cria as contas que ainda nao existem no cadastro do cliente.
    if (contasUsadas.size) {
      const linhasConta = [...contasUsadas.entries()].map(([nome, tipo]) => ({ store_id, nome, tipo }));
      for (let i = 0; i < linhasConta.length; i += 200) {
        await supabase.from("controladoria_conta")
          .upsert(linhasConta.slice(i, i + 200), { onConflict: "store_id,nome", ignoreDuplicates: true });
      }
    }


    const pendentes = [...naoClassificados.entries()]
      .map(([id_tipo, v]) => ({ id_tipo, lancamentos: v.qtd, valor: Math.round(v.valor * 100) / 100, exemplo: v.exemplo }))
      .sort((a, b) => b.valor - a.valor);

    return json({ ok: true, inicio, fim, meses: blocos.length, gravados: gravadosTotal, duplicados_ignorados: duplicadosIgnorados, detalhe, pendentes });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
