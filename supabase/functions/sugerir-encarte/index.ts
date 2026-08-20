// ============================================================
// sugerir-encarte
// Monta a sugestao de produtos para cada slot do modelo de encarte,
// usando dados ao vivo do ERP da loja (relatorio `encarte_base`)
// via a edge function vr-proxy ja existente.
// Body: { store_id, calendario_id, modelo_id, data_inicio, data_fim,
//         manter_travados?: boolean, encarte_id?: string }
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Row = Record<string, unknown>;

const num = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/\s/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return isFinite(n) ? n : 0;
};
const txt = (v: unknown): string => (v == null ? "" : String(v).trim());
const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

const pick = (r: Row, ...keys: string[]): unknown => {
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
  }
  return null;
};

/** normaliza as chaves da linha para minusculo sem acento */
const lower = (r: Row): Row => {
  const o: Row = {};
  for (const [k, v] of Object.entries(r)) {
    o[k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()] = v;
  }
  return o;
};

/** terminacao psicologica */
function arredondar(p: number): number {
  if (p <= 0) return 0;
  // termina em ,99 acima de R$ 10 / ,90 entre R$ 2 e R$ 10 / ,49 ou ,99 abaixo de R$ 2
  const terminacoes = p >= 10 ? [0.99] : p >= 2 ? [0.9] : [0.49, 0.99];
  const inteiro = Math.floor(p);
  const opcoes: number[] = [];
  for (const t of terminacoes) {
    opcoes.push(inteiro + t, inteiro - 1 + t);
  }
  const abaixo = opcoes.filter((v) => v > 0 && v <= p + 0.0001);
  if (abaixo.length) return Math.max(...abaixo);
  return Math.max(0.49, Math.min(...opcoes.filter((v) => v > 0)));
}

const normaliza = (v: number, min: number, max: number) =>
  max <= min ? 0.5 : Math.min(1, Math.max(0, (v - min) / (max - min)));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ erro: "nao autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ erro: "nao autorizado" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const { store_id, calendario_id, modelo_id, data_inicio, data_fim } = body ?? {};
    const manterTravados = !!body?.manter_travados;
    if (!store_id || !modelo_id) return json({ erro: "informe store_id e modelo_id" }, 400);

    const service = createClient(supabaseUrl, serviceKey);

    const { data: roleRows } = await service
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
    if ((roleRows?.length ?? 0) === 0) return json({ erro: "somente administradores podem gerar sugestoes" }, 403);

    // ---------- configuracoes ----------
    const [cfgLoja, cal, slotsRes, catsRes, mapRes, vrCfg] = await Promise.all([
      service.from("encarte_config_loja").select("*").eq("store_id", store_id).maybeSingle(),
      calendario_id
        ? service.from("encarte_calendario").select("*").eq("id", calendario_id).maybeSingle()
        : Promise.resolve({ data: null }),
      service.from("encarte_modelo_slot").select("*").eq("modelo_id", modelo_id).order("face").order("posicao"),
      service.from("encarte_categoria").select("*").order("ordem"),
      service.from("encarte_categoria_map").select("*").eq("store_id", store_id),
      service.from("store_vr_config").select("sistema, codigo_loja").eq("store_id", store_id).maybeSingle(),
    ]);

    const sistema = (vrCfg.data?.sistema ?? "VR").toUpperCase();
    if (sistema === "WEBSAC") {
      return json({ erro: "A sugestao automatica esta disponivel somente para lojas VR/Oracle." }, 200);
    }

    const slots = (slotsRes.data ?? []) as Row[];
    if (slots.length === 0) return json({ erro: "o modelo selecionado nao possui posicoes cadastradas" }, 400);

    const faixaEncarte = txt(cal.data?.tipo_faixa) || "neutro";
    const agvPct = num(cal.data?.agv_pct);
    const { data: regra } = await service
      .from("encarte_regra_faixa").select("*").eq("tipo_faixa", faixaEncarte).maybeSingle();
    const reg = regra ?? {
      margem_minima_pct: 5, desconto_max_pct: 20, janela_giro_dias: 90,
      peso_giro: 0.35, peso_margem: 0.25, peso_concorrente: 0.25, peso_estoque: 0.15,
    };

    const cargaTrib = num(cfgLoja.data?.carga_tributaria_pct);
    const variacaoMax = num(cfgLoja.data?.variacao_max_pct) || 40;
    const janelaSemanas = Number(cfgLoja.data?.janela_nao_repetir_semanas ?? 4);

    // ---------- base do ERP ----------
    // Algumas pontes registram o relatorio com prefixo (ex.: "02-encarte_base")
    // ou com nome alternativo ("candidatos_encarte"). Tentamos em cascata e,
    // se a ponte devolver a lista `disponiveis`, escolhemos o nome compativel.
    const consultarVr = async (nome: string) => {
      const resp = await fetch(`${supabaseUrl}/functions/v1/vr-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: anonKey },
        body: JSON.stringify({ store_id, relatorio: nome, params: {} }),
      });
      const body = await resp.json().catch(() => null) as Row | null;
      return { erro: txt(body?.erro), dados: (body?.dados as Row[]) ?? [] };
    };

    const tentativas = ["encarte_base", "02-encarte_base", "candidatos_encarte"];
    let erroVr = "";
    let baseBruta: Row[] = [];
    const jaTentados = new Set<string>();

    for (const nome of tentativas) {
      if (jaTentados.has(nome)) continue;
      jaTentados.add(nome);
      const r = await consultarVr(nome);
      if (r.dados.length > 0) { baseBruta = r.dados; erroVr = ""; break; }
      erroVr = r.erro;
      // extrai nomes disponiveis do erro e tenta o que casar com encarte
      const m = r.erro.match(/"disponiveis"\s*:\s*\[([^\]]*)/);
      if (m) {
        const nomes = m[1].split(",").map((s) => s.replace(/[\\"\s]/g, "")).filter(Boolean);
        const alvo = nomes.find((n) => /encarte_base$/i.test(n)) ?? nomes.find((n) => /encarte/i.test(n) && !/migration/i.test(n));
        if (alvo && !jaTentados.has(alvo)) {
          jaTentados.add(alvo);
          const r2 = await consultarVr(alvo);
          if (r2.dados.length > 0) { baseBruta = r2.dados; erroVr = ""; break; }
          erroVr = r2.erro || erroVr;
        }
      }
    }

    if (erroVr && baseBruta.length === 0) {
      const faltaRelatorio = /404|nao encontrado|nao existe|nao cadastrado|not found/i.test(erroVr);
      return json({
        erro: faltaRelatorio
          ? "relatorio_ausente"
          : erroVr,
        detalhe: erroVr,
      }, 200);
    }
    if (baseBruta.length === 0) {
      return json({ erro: "a ponte da loja retornou o relatorio encarte_base vazio" }, 200);
    }


    const base = baseBruta.map(lower).map((r) => {
      const preco = num(pick(r, "preco_venda", "preco", "venda", "preco_atual"));
      const custo = num(pick(r, "custo", "custo_medio", "custo_liquido"));
      return {
        codigo: txt(pick(r, "codigo", "cod", "codigo_interno", "cod_reduzido")),
        descricao: txt(pick(r, "descricao", "produto", "nome")),
        ean: txt(pick(r, "ean", "codigo_barras", "cod_barras", "barcode", "gtin")),
        secao: txt(pick(r, "secao", "departamento", "n1")),
        grupo: txt(pick(r, "grupo", "categoria", "n2")),
        subgrupo: txt(pick(r, "subgrupo", "subcategoria", "n3")),
        preco_venda: preco,
        custo,
        custo_medio: num(pick(r, "custo_medio", "custo")),
        margem_atual: num(pick(r, "margem_atual", "margem")),
        estoque: num(pick(r, "estoque", "estoque_atual")),
        venda_7d: num(pick(r, "venda_7d")),
        venda_30d: num(pick(r, "venda_30d")),
        venda_90d: num(pick(r, "venda_90d")),
        venda_365d: num(pick(r, "venda_365d")),
        volume_30d: num(pick(r, "volume_30d", "qtd_30d")),
        volume_90d: num(pick(r, "volume_90d", "qtd_90d")),
        margem_90d: num(pick(r, "margem_90d")),
        cobertura_dias: num(pick(r, "cobertura_dias", "cobertura")),
        ultima_oferta_fim: txt(pick(r, "ultima_oferta_fim")),
        ofertas_90d: num(pick(r, "ofertas_90d")),
      };
    }).filter((p) => p.codigo && p.preco_venda > 0);

    // ---------- concorrencia por EAN ----------
    const eans = Array.from(new Set(base.map((p) => p.ean).filter((e) => e && e.length >= 8)));
    const concorrentePorEan = new Map<string, { preco: number; coletado_em: string; nome: string }>();
    for (let i = 0; i < eans.length; i += 400) {
      const lote = eans.slice(i, i + 400);
      const { data } = await service
        .from("precos_concorrente")
        .select("ean, preco, coletado_em, concorrentes(nome)")
        .in("ean", lote)
        .eq("disponivel", true)
        .not("preco", "is", null)
        .order("coletado_em", { ascending: false })
        .limit(4000);
      for (const r of (data ?? []) as Row[]) {
        const ean = txt(r.ean);
        if (!ean || concorrentePorEan.has(ean)) continue;
        concorrentePorEan.set(ean, {
          preco: num(r.preco),
          coletado_em: txt(r.coletado_em),
          nome: txt((r.concorrentes as Row | null)?.nome),
        });
      }
    }

    // ---------- historico (nao repetir) ----------
    const limite = new Date();
    limite.setDate(limite.getDate() - janelaSemanas * 7);
    const { data: hist } = await service
      .from("encarte_historico_itens")
      .select("codigo, data_fim")
      .eq("store_id", store_id)
      .gte("data_fim", limite.toISOString().slice(0, 10));
    const usadosRecentes = new Set((hist ?? []).map((h: Row) => txt(h.codigo)));

    // ---------- categorias liberadas para a faixa ----------
    const cats = (catsRes.data ?? []) as Row[];
    const mapa = (mapRes.data ?? []) as Row[];
    const catLiberada = (c: Row) => !!c[faixaEncarte as "vermelho" | "amarelo" | "neutro"];
    const catsFaixa = cats.filter(catLiberada);
    const mapaPorCat = new Map<string, Row[]>();
    for (const m of mapa) {
      const k = txt(m.categoria_id);
      mapaPorCat.set(k, [...(mapaPorCat.get(k) ?? []), m]);
    }

    type Prod = typeof base[number];
    const categoriaDoProduto = (p: Prod): Row | null => {
      const alvo = norm(`${p.secao} ${p.grupo} ${p.subgrupo} ${p.descricao}`);
      for (const c of catsFaixa) {
        for (const m of mapaPorCat.get(txt(c.id)) ?? []) {
          const okSecao = !m.secao || norm(p.secao) === norm(txt(m.secao));
          const okGrupo = !m.grupo || norm(p.grupo) === norm(txt(m.grupo));
          const okSub = !m.subgrupo || norm(p.subgrupo) === norm(txt(m.subgrupo));
          if (okSecao && okGrupo && okSub) return c;
        }
      }
      // fallback por texto
      for (const c of catsFaixa) {
        const termos = ((c.termos as string[]) ?? []).map(norm).filter(Boolean);
        if (termos.some((t) => alvo.includes(t))) return c;
      }
      return null;
    };

    const catDe = new Map<string, Row | null>();
    for (const p of base) catDe.set(p.codigo, categoriaDoProduto(p));

    const pmzDe = (custo: number) => (cargaTrib > 0 ? custo / (1 - cargaTrib / 100) : custo);

    // ---------- elegibilidade ----------
    const elegiveis = base.filter((p) => {
      if (p.venda_365d <= 0 && p.venda_90d <= 0 && p.venda_30d <= 0) return false;
      if (p.estoque <= 0) return false;
      if (usadosRecentes.has(p.codigo)) return false;
      const margem = p.preco_venda > 0 ? ((p.preco_venda - pmzDe(p.custo)) / p.preco_venda) * 100 : -1;
      if (margem < 0) return false;
      return true;
    });

    const janelaGiro = Number(reg.janela_giro_dias ?? 90);
    const giroDe = (p: Prod) =>
      janelaGiro <= 30 ? p.venda_30d : janelaGiro <= 90 ? (p.venda_90d || p.venda_30d) : (p.venda_365d || p.venda_90d);

    // ---------- montagem por slot ----------
    const usadosCodigos = new Set<string>();
    const usadosCategoriaFace = new Set<string>();
    const itens: Row[] = [];
    const alternativasPorSlot: Record<string, Row[]> = {};

    const avaliar = (p: Prod, candidatos: Prod[]) => {
      const giros = candidatos.map(giroDe);
      const folgas = candidatos.map((c) => (c.preco_venda - pmzDe(c.custo)) / (c.preco_venda || 1));
      const cobs = candidatos.map((c) => c.cobertura_dias);
      const giro = normaliza(giroDe(p), Math.min(...giros), Math.max(...giros));
      const folga = normaliza(
        (p.preco_venda - pmzDe(p.custo)) / (p.preco_venda || 1),
        Math.min(...folgas), Math.max(...folgas),
      );
      const conc = concorrentePorEan.get(p.ean);
      const competitividade = conc && conc.preco > 0 && p.preco_venda > 0
        ? Math.min(1, Math.max(0, (conc.preco - p.preco_venda) / p.preco_venda / 0.3))
        : 0.5;
      const cobNorm = normaliza(p.cobertura_dias, Math.min(...cobs), Math.max(...cobs));
      const estoque = p.cobertura_dias > 60 ? cobNorm : 1 - cobNorm;
      const score =
        num(reg.peso_giro) * giro +
        num(reg.peso_margem) * folga +
        num(reg.peso_concorrente) * competitividade +
        num(reg.peso_estoque) * estoque;
      return { score, componentes: { giro, folga_margem: folga, competitividade, estoque }, conc };
    };

    const precificar = (p: Prod, concPreco: number | null) => {
      const pmz = pmzDe(p.custo);
      const baseP = p.preco_venda * (1 - agvPct / 100);
      const piso = pmz * (1 + num(reg.margem_minima_pct) / 100);
      const tetoDesc = p.preco_venda * (1 - num(reg.desconto_max_pct) / 100);
      const alvo = concPreco && concPreco > 0 ? concPreco * 0.99 : baseP;
      const preco = Math.max(piso, tetoDesc, Math.min(baseP, alvo));
      return { pmz, preco: arredondar(preco) };
    };

    for (const slot of slots) {
      const face = txt(slot.face);
      const dep = norm(txt(slot.departamento));
      const catFixa = txt(slot.categoria);
      let candidatos = elegiveis.filter((p) => {
        if (usadosCodigos.has(p.codigo)) return false;
        const c = catDe.get(p.codigo);
        if (!c) return false;
        if (catFixa && norm(txt(c.nome)) !== norm(catFixa)) return false;
        if (dep) {
          const bate = norm(p.secao).includes(dep) || dep.includes(norm(p.secao)) ||
            norm(txt(c.departamento)) === dep;
          if (!bate) return false;
        }
        if (usadosCategoriaFace.has(`${face}|${txt(c.nome)}`)) return false;
        return true;
      });
      if (candidatos.length === 0) {
        alternativasPorSlot[`${face}|${slot.posicao}`] = [];
        itens.push({
          face, posicao: slot.posicao, tipo_faixa: txt(slot.tipo_faixa),
          departamento: txt(slot.departamento), categoria: catFixa || null,
          codigo: null, descricao: null, alerta: "sem candidato disponivel para este slot",
        });
        continue;
      }

      const avaliados = candidatos
        .map((p) => ({ p, ...avaliar(p, candidatos) }))
        .sort((a, b) => b.score - a.score);
      const melhor = avaliados[0];
      const p = melhor.p;
      const cat = catDe.get(p.codigo)!;
      const concPreco = melhor.conc?.preco ?? null;
      const { pmz, preco } = precificar(p, concPreco);
      const margemOferta = preco > 0 ? ((preco - pmz) / preco) * 100 : 0;
      const variacao = p.preco_venda > 0 ? ((p.preco_venda - preco) / p.preco_venda) * 100 : 0;

      let alerta: string | null = null;
      if (preco < pmz) alerta = "abaixo do PMZ";
      else if (margemOferta < 0) alerta = "margem negativa";
      else if (Math.abs(variacao) > variacaoMax) alerta = "variação fora da faixa";
      else if (concPreco && p.preco_venda > 0 && Math.abs(concPreco - p.preco_venda) / p.preco_venda > 0.6) {
        alerta = "possível divergência de embalagem — conferir EAN";
      }

      usadosCodigos.add(p.codigo);
      usadosCategoriaFace.add(`${face}|${txt(cat.nome)}`);

      alternativasPorSlot[`${face}|${slot.posicao}`] = avaliados.slice(0, 10).map((a) => {
        const cp = a.conc?.preco ?? null;
        const pr = precificar(a.p, cp);
        return {
          codigo: a.p.codigo, descricao: a.p.descricao, ean: a.p.ean,
          custo: a.p.custo, pmz: pr.pmz, preco_venda: a.p.preco_venda,
          margem_atual: a.p.preco_venda > 0 ? ((a.p.preco_venda - pr.pmz) / a.p.preco_venda) * 100 : 0,
          preco_oferta: pr.preco, score: a.score, motivo: a.componentes,
          categoria: txt(catDe.get(a.p.codigo)?.nome ?? ""),
          volume_30d: a.p.volume_30d, estoque: a.p.estoque,
          preco_concorrente: cp, concorrente: a.conc?.nome ?? null,
        };
      });

      itens.push({
        face, posicao: slot.posicao, tipo_faixa: txt(slot.tipo_faixa),
        departamento: txt(slot.departamento), categoria: txt(cat.nome),
        codigo: p.codigo, descricao: p.descricao, ean: p.ean,
        custo: p.custo, pmz,
        venda_atual: p.preco_venda,
        margem_atual: p.preco_venda > 0 ? ((p.preco_venda - pmz) / p.preco_venda) * 100 : 0,
        preco_oferta: preco, margem_oferta: margemOferta,
        estoque: p.estoque, giro_90d: p.venda_90d, volume_30d: p.volume_30d,
        score: melhor.score,
        origem: "sugerido",
        motivo: {
          ...melhor.componentes,
          preco_concorrente: concPreco,
          concorrente: melhor.conc?.nome ?? null,
          coletado_em: melhor.conc?.coletado_em ?? null,
          agv_pct: agvPct,
          piso_margem_pct: num(reg.margem_minima_pct),
        },
        alerta,
      });
    }

    // ---------- persistencia ----------
    const nome = `${txt(cal.data?.nome) || "Encarte"} — ${data_inicio ?? ""} a ${data_fim ?? ""}`;
    const { data: gerado, error: errG } = await service
      .from("encarte_gerado")
      .insert({
        store_id, nome, data_inicio: data_inicio || null, data_fim: data_fim || null,
        agv_pct: agvPct, criado_por: userId, calendario_id: calendario_id ?? null,
        modelo_id, tipo_faixa: faixaEncarte, status: "rascunho",
      })
      .select("id").single();
    if (errG) return json({ erro: errG.message }, 500);

    const linhas = itens.map((it, idx) => ({
      encarte_id: gerado.id,
      ordem: idx + 1,
      face: it.face, posicao: it.posicao, tipo_faixa: it.tipo_faixa,
      departamento: it.departamento, categoria: it.categoria,
      codigo: it.codigo, descricao: it.descricao, ean: it.ean ?? null,
      custo: it.custo ?? null, pmz: it.pmz ?? null,
      venda_atual: it.venda_atual ?? null, margem_atual: it.margem_atual ?? null,
      preco_oferta: it.preco_oferta ?? null, margem_oferta: it.margem_oferta ?? null,
      estoque: it.estoque ?? null, giro_90d: it.giro_90d ?? null, volume_30d: it.volume_30d ?? null,
      score: it.score ?? null, origem: "sugerido", motivo: it.motivo ?? null,
      alerta: it.alerta ?? null,
    }));
    const { error: errI } = await service.from("encarte_item").insert(linhas);
    if (errI) return json({ erro: errI.message }, 500);

    return json({
      ok: true,
      encarte_id: gerado.id,
      itens: linhas,
      alternativas: alternativasPorSlot,
      resumo: {
        slots: slots.length,
        preenchidos: linhas.filter((l) => l.codigo).length,
        com_alerta: linhas.filter((l) => l.alerta).length,
        produtos_base: base.length,
        com_concorrente: concorrentePorEan.size,
      },
    });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
