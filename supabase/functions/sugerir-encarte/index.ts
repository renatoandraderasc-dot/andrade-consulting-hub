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
    const janelaDias = janelaSemanas * 7;
    const limite = new Date();
    limite.setDate(limite.getDate() - janelaDias);
    const { data: hist } = await service
      .from("encarte_historico_itens")
      .select("codigo, data_fim")
      .eq("store_id", store_id)
      .gte("data_fim", limite.toISOString().slice(0, 10));
    const hoje = new Date();
    const diasDesde = (d: string) => {
      const t = Date.parse(d);
      return isFinite(t) ? Math.floor((hoje.getTime() - t) / 86400000) : 9999;
    };
    const usadosRecentes = new Set((hist ?? []).map((h: Row) => txt(h.codigo)));
    const usadosMetadeJanela = new Set(
      (hist ?? [])
        .filter((h: Row) => diasDesde(txt(h.data_fim)) <= janelaDias / 2)
        .map((h: Row) => txt(h.codigo)),
    );

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

    // ---------- regras de capa & verso ----------
    const { data: regrasPos } = await service
      .from("encarte_posicao_efetiva").select("*").eq("store_id", store_id).order("prioridade");
    const regras = (regrasPos ?? []) as Row[];
    const regraPorCodigo = new Map<string, Row>();
    const regraPorEan = new Map<string, Row>();
    const regraPorCategoria = new Map<string, Row>();
    const regraPorDep = new Map<string, Row>();
    for (const r of regras) {
      const tipo = txt(r.tipo_alvo);
      if (tipo === "produto") {
        if (txt(r.codigo)) regraPorCodigo.set(txt(r.codigo), r);
        if (txt(r.ean)) regraPorEan.set(txt(r.ean), r);
      } else if (tipo === "categoria" && txt(r.categoria_id)) {
        regraPorCategoria.set(txt(r.categoria_id), r);
      } else if (tipo === "departamento" && txt(r.departamento)) {
        regraPorDep.set(norm(txt(r.departamento)), r);
      }
    }

    type Prod2 = typeof base[number];
    /** produto (peso 1) > categoria (2) > departamento (3) */
    const regraDoProduto = (p: Prod2): Row | null => {
      const c = catDe.get(p.codigo);
      return regraPorCodigo.get(p.codigo)
        ?? (p.ean ? regraPorEan.get(p.ean) ?? null : null)
        ?? (c ? regraPorCategoria.get(txt(c.id)) ?? null : null)
        ?? regraPorDep.get(norm(p.secao))
        ?? (c ? regraPorDep.get(norm(txt(c.departamento))) ?? null : null)
        ?? null;
    };
    const posicaoDoProduto = (p: Prod2): string => txt(regraDoProduto(p)?.posicao) || "ambos";
    const aceitaFace = (p: Prod2, face: string) => {
      const pos = posicaoDoProduto(p);
      if (pos === "excluir") return false;
      if (pos === "capa" || pos === "verso") return pos === face;
      return true;
    };

    // ---------- cortes configuraveis ----------
    const vendaMinima = num(cfgLoja.data?.venda_minima_periodo);
    const margemMinimaCfg = num(cfgLoja.data?.margem_minima_pct);
    const margemMinima = margemMinimaCfg > 0 ? margemMinimaCfg : 0;

    const margemDe = (p: Prod2) =>
      p.preco_venda > 0 ? ((p.preco_venda - pmzDe(p.custo)) / p.preco_venda) * 100 : -1;
    const teveVenda = (p: Prod2) =>
      (p.venda_365d > vendaMinima) || (p.venda_90d > vendaMinima) || (p.venda_30d > vendaMinima);

    const semEanOuPreco = base.filter((p) => !p.ean || p.preco_venda <= 0).length;
    const poolBase = base.filter((p) => p.ean && p.preco_venda > 0 && posicaoDoProduto(p) !== "excluir");
    const excluidos = base.length - poolBase.length - semEanOuPreco;
    console.log(`[sugerir-encarte] loja=${store_id} linhas_ponte=${baseBruta.length} pool=${poolBase.length} sem_ean_ou_preco=${semEanOuPreco} excluidos_por_regra=${excluidos}`);

    const janelaGiro = Number(reg.janela_giro_dias ?? 90);
    const giroDe = (p: Prod2) =>
      janelaGiro <= 30 ? p.venda_30d : janelaGiro <= 90 ? (p.venda_90d || p.venda_30d) : (p.venda_365d || p.venda_90d);

    // ---------- montagem por slot ----------
    const usadosCodigos = new Set<string>();
    const usadosCategoriaFace = new Set<string>();
    const itens: Row[] = [];
    const alternativasPorSlot: Record<string, Row[]> = {};
    const diagnostico: Row[] = [];

    const avaliar = (p: Prod2, candidatos: Prod2[]) => {
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

    const precificar = (p: Prod2, concPreco: number | null) => {
      const pmz = pmzDe(p.custo);
      const baseP = p.preco_venda * (1 - agvPct / 100);
      const piso = pmz * (1 + num(reg.margem_minima_pct) / 100);
      const tetoDesc = p.preco_venda * (1 - num(reg.desconto_max_pct) / 100);
      const alvo = concPreco && concPreco > 0 ? concPreco * 0.99 : baseP;
      const preco = Math.max(piso, tetoDesc, Math.min(baseP, alvo));
      return { pmz, preco: arredondar(preco) };
    };

    const grupoDaCategoria = (nomeCat: string): Set<string> => {
      const g = new Set<string>();
      for (const p of poolBase) {
        const c = catDe.get(p.codigo);
        if (c && norm(txt(c.nome)) === norm(nomeCat) && p.grupo) g.add(norm(p.grupo));
      }
      return g;
    };

    const NIVEIS = [
      "todos os filtros",
      "janela de repeticao reduzida pela metade",
      "ignorando a janela de repeticao",
      "margem minima reduzida em 3 pontos",
      "ignorando estoque",
      "subindo da categoria para o grupo mercadologico",
      "qualquer categoria do mesmo departamento e faixa",
      "qualquer produto do departamento com venda no periodo",
    ];

    const montarSlot = (slot: Row) => {
      const face = txt(slot.face);
      const dep = norm(txt(slot.departamento));
      const catFixa = txt(slot.categoria);
      const gruposDaCat = catFixa ? grupoDaCategoria(catFixa) : new Set<string>();

      const bateDepartamento = (p: Prod2, c: Row | null) => {
        if (!dep) return true;
        return norm(p.secao).includes(dep) || dep.includes(norm(p.secao)) ||
          (!!c && norm(txt(c.departamento)) === dep);
      };

      const funil = {
        candidatos_brutos: 0, apos_filtro_venda: 0, apos_filtro_margem: 0,
        apos_filtro_historico: 0, apos_filtro_estoque: 0, apos_dedupe: 0,
      };

      const filtrar = (nivel: number, registrar: boolean): Prod2[] => {
        const saida: Prod2[] = [];
        for (const p of poolBase) {
          const c = catDe.get(p.codigo) ?? null;
          // escopo da categoria conforme o nivel
          let noEscopo: boolean;
          if (nivel <= 4) {
            noEscopo = !!c && (!catFixa || norm(txt(c.nome)) === norm(catFixa)) && bateDepartamento(p, c);
          } else if (nivel === 5) {
            noEscopo = bateDepartamento(p, c) && (!catFixa || (!!p.grupo && gruposDaCat.has(norm(p.grupo))));
          } else if (nivel === 6) {
            noEscopo = !!c && bateDepartamento(p, c);
          } else {
            noEscopo = bateDepartamento(p, c);
          }
          if (!noEscopo) continue;
          if (registrar) funil.candidatos_brutos++;

          if (!teveVenda(p)) continue;
          if (registrar) funil.apos_filtro_venda++;

          const margemMin = nivel >= 3 ? margemMinima - 3 : margemMinima;
          if (margemDe(p) < margemMin) continue;
          if (registrar) funil.apos_filtro_margem++;

          const bloqueio = nivel === 0 ? usadosRecentes : nivel === 1 ? usadosMetadeJanela : null;
          if (bloqueio?.has(p.codigo)) continue;
          if (registrar) funil.apos_filtro_historico++;

          if (nivel < 4 && p.estoque <= 0) continue;
          if (registrar) funil.apos_filtro_estoque++;

          if (usadosCodigos.has(p.codigo)) continue;
          if (!aceitaFace(p, face)) continue;
          if (nivel <= 2 && c && usadosCategoriaFace.has(`${face}|${txt(c.nome)}`)) continue;
          if (registrar) funil.apos_dedupe++;

          saida.push(p);
        }
        return saida;
      };

      let candidatos: Prod2[] = [];
      let nivel = 0;
      for (; nivel < NIVEIS.length; nivel++) {
        candidatos = filtrar(nivel, nivel === 0);
        if (candidatos.length) break;
      }

      const chave = `${face}|${slot.posicao}`;
      if (!candidatos.length) {
        alternativasPorSlot[chave] = [];
        const motivo = funil.candidatos_brutos === 0
          ? "nenhum produto da loja casa com a categoria/departamento do slot"
          : funil.apos_filtro_venda === 0
            ? "os produtos da categoria nao tiveram venda no periodo"
            : funil.apos_filtro_margem === 0
              ? "os produtos da categoria estao abaixo da margem minima"
              : "todos os candidatos ja foram usados em outro slot";
        diagnostico.push({
          slot: chave, posicao: slot.posicao, face,
          departamento: txt(slot.departamento), faixa: txt(slot.tipo_faixa),
          categoria: catFixa || null, ...funil,
          escolhido: null, nivel_relaxamento: null, motivo, status: "pendente",
        });
        itens.push({
          face, posicao: slot.posicao, tipo_faixa: txt(slot.tipo_faixa),
          departamento: txt(slot.departamento), categoria: catFixa || null,
          codigo: null, descricao: null, nivel_relaxamento: 0,
          motivo_escolha: motivo, alerta: `PENDENTE — ${motivo}`,
        });
        return;
      }

      const avaliados = candidatos
        .map((p) => ({ p, ...avaliar(p, candidatos) }))
        .sort((a, b) => b.score - a.score);
      const melhor = avaliados[0];
      const p = melhor.p;
      const cat = catDe.get(p.codigo) ?? null;
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
      if (cat) usadosCategoriaFace.add(`${face}|${txt(cat.nome)}`);

      alternativasPorSlot[chave] = avaliados.slice(0, 10).map((a) => {
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

      const motivoEscolha = nivel === 0
        ? "preenchido com todos os filtros"
        : `preenchido ${NIVEIS[nivel]}`;

      diagnostico.push({
        slot: chave, posicao: slot.posicao, face,
        departamento: txt(slot.departamento), faixa: txt(slot.tipo_faixa),
        categoria: txt(cat?.nome ?? catFixa), ...funil,
        escolhido: p.codigo, nivel_relaxamento: nivel, motivo: motivoEscolha,
        status: nivel === 0 ? "ok" : "relaxado",
      });

      itens.push({
        face, posicao: slot.posicao, tipo_faixa: txt(slot.tipo_faixa),
        departamento: txt(slot.departamento), categoria: txt(cat?.nome ?? catFixa),
        codigo: p.codigo, descricao: p.descricao, ean: p.ean,
        custo: p.custo, pmz,
        venda_atual: p.preco_venda,
        margem_atual: p.preco_venda > 0 ? ((p.preco_venda - pmz) / p.preco_venda) * 100 : 0,
        preco_oferta: preco, margem_oferta: margemOferta,
        estoque: p.estoque, giro_90d: p.venda_90d, volume_30d: p.volume_30d,
        score: melhor.score,
        origem: "sugerido",
        nivel_relaxamento: nivel,
        motivo_escolha: motivoEscolha,
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
    };

    // ---------- 1) produtos fixos ----------
    const slotsLivres = [...slots];
    const fixos = regras
      .filter((r) => txt(r.tipo_alvo) === "produto" && r.fixo === true && txt(r.posicao) !== "excluir")
      .sort((a, b) => num(a.prioridade) - num(b.prioridade));
    const pendenciasFixos: Row[] = [];

    for (const r of fixos) {
      const cod = txt(r.codigo);
      const prod = poolBase.find((p) => p.codigo === cod || (txt(r.ean) && p.ean === txt(r.ean)));
      if (!prod) {
        pendenciasFixos.push({ regra: cod, motivo: "produto nao encontrado na base da loja" });
        continue;
      }
      const posRegra = txt(r.posicao);
      const faixaRegra = txt(r.tipo_faixa);
      const compativel = (s: Row) => {
        const face = txt(s.face);
        if (posRegra === "capa" || posRegra === "verso") { if (face !== posRegra) return false; }
        if (faixaRegra && norm(txt(s.tipo_faixa)) !== norm(faixaRegra)) return false;
        const dep = norm(txt(s.departamento));
        if (dep && !(norm(prod.secao).includes(dep) || dep.includes(norm(prod.secao)))) return false;
        return true;
      };
      const preferido = r.slot_preferido != null
        ? slotsLivres.find((s) => num(s.posicao) === num(r.slot_preferido) && compativel(s))
        : null;
      const slot = preferido ?? slotsLivres.find(compativel);
      if (!slot) {
        pendenciasFixos.push({
          regra: cod,
          motivo: `${txt(r.descricao) || cod} esta fixado como ${posRegra}, mas nao ha slot compativel livre`,
        });
        continue;
      }
      slotsLivres.splice(slotsLivres.indexOf(slot), 1);

      const conc = concorrentePorEan.get(prod.ean);
      const { pmz, preco } = precificar(prod, conc?.preco ?? null);
      usadosCodigos.add(prod.codigo);
      const cat = catDe.get(prod.codigo) ?? null;
      if (cat) usadosCategoriaFace.add(`${txt(slot.face)}|${txt(cat.nome)}`);
      const chave = `${txt(slot.face)}|${slot.posicao}`;
      alternativasPorSlot[chave] = [];
      diagnostico.push({
        slot: chave, posicao: slot.posicao, face: txt(slot.face),
        departamento: txt(slot.departamento), faixa: txt(slot.tipo_faixa),
        categoria: txt(cat?.nome ?? ""), candidatos_brutos: 1, apos_filtro_venda: 1,
        apos_filtro_margem: 1, apos_filtro_historico: 1, apos_filtro_estoque: 1, apos_dedupe: 1,
        escolhido: prod.codigo, nivel_relaxamento: 0,
        motivo: "fixado na aba Capa & Verso", status: "fixo",
      });
      itens.push({
        face: txt(slot.face), posicao: slot.posicao, tipo_faixa: txt(slot.tipo_faixa),
        departamento: txt(slot.departamento), categoria: txt(cat?.nome ?? ""),
        codigo: prod.codigo, descricao: prod.descricao, ean: prod.ean,
        custo: prod.custo, pmz, venda_atual: prod.preco_venda,
        margem_atual: prod.preco_venda > 0 ? ((prod.preco_venda - pmz) / prod.preco_venda) * 100 : 0,
        preco_oferta: preco, margem_oferta: preco > 0 ? ((preco - pmz) / preco) * 100 : 0,
        estoque: prod.estoque, giro_90d: prod.venda_90d, volume_30d: prod.volume_30d,
        score: null, origem: "fixo", travado: true, regra_posicao_id: r.id,
        nivel_relaxamento: 0, motivo_escolha: "fixado na aba Capa & Verso",
        motivo: { fixo: true }, alerta: null,
      });
    }

    // ---------- 2) sugestao normal nos slots restantes ----------
    for (const slot of slotsLivres) montarSlot(slot);

    itens.sort((a, b) =>
      txt(a.face) === txt(b.face) ? num(a.posicao) - num(b.posicao) : txt(a.face) === "capa" ? -1 : 1);

    const totalItensCfg = Number(cfgLoja.data?.total_itens ?? 0);
    const avisosConfig: string[] = [];
    if (totalItensCfg && totalItensCfg !== slots.length) {
      avisosConfig.push(`o modelo tem ${slots.length} slots e a configuração da loja pede ${totalItensCfg} itens`);
    }
    for (const p of pendenciasFixos) avisosConfig.push(txt(p.motivo));
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
