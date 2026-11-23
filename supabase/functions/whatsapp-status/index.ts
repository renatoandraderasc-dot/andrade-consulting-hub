import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { carregarConfigLoja } from "../_shared/consultaLoja.ts";
import { consultarComCache } from "../_shared/cacheRelatorio.ts";
import { authenticateCronRequest } from "../_shared/cron-auth.ts";
import { brl, custoMaior, margemNegativa, naoVendidos, num, pct, produtosFrequentes } from "./resumo.ts";

const Body = z.object({
  modo: z.enum(["diario", "nota", "frequentes"]),
  recebimento_id: z.string().uuid().optional(),
  contato_id: z.string().uuid().optional(), // envio de teste para um contato
  store_id: z.string().uuid().optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ITENS = ["meta_dia", "meta_mes", "compras", "compras_vendas", "margem_negativa", "nao_vendidos"] as const;

const ontemSP = () => { const d = new Date(Date.now() - 3 * 3600e3 - 86400e3); return d.toISOString().slice(0, 10); };
const addDias = (s: string, n: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dataBR = (s: string) => s.split("-").reverse().join("/");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, service);
    const auth = req.headers.get("Authorization") || "";
    const cronOk = auth === `Bearer ${service}` || (!!Deno.env.get("LOVABLE_CRON_SECRET") && authenticateCronRequest(req) === null);
    if (!cronOk) {
      const uc = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: u } = await uc.auth.getUser();
      if (!u.user) return json({ error: "Não autenticado" }, 401);
      const { data: adm } = await db.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      if (!adm) return json({ error: "Sem permissão" }, 403);
    }
    const p = Body.safeParse(await req.json().catch(() => ({})));
    if (!p.success) return json({ error: p.error.flatten().fieldErrors }, 400);
    const { modo, recebimento_id, contato_id } = p.data;

    const canal = Deno.env.get("ZAPI_INSTANCE_ID")?.trim();
    const secret = (Deno.env.get("ZAPI_OMNI_SECRET") || Deno.env.get("STRIPE_LIVE_API_KEY"))?.trim();
    if (!canal || !secret) return json({ error: "Credenciais da Z-API Omni não configuradas" }, 500);
    const enviarTexto = async (phone: string, message: string) => {
      const r = await fetch(`https://api.omni.z-api.io/v1/channels/${canal}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` }, body: JSON.stringify({ recipient: { identifier: phone.includes("@") || phone.endsWith("-group") ? phone.trim() : phone.replace(/\D/g, "") }, content: { type: "TEXT", body: { message } } }) });
      if (!r.ok) throw new Error(`[${r.status}] ${(await r.text()).slice(0, 300)}`);
    };
    const registrar = async (chave: string, tipo: string, contato: string, mensagem: string, teste: boolean) => {
      if (!teste) {
        const { error } = await db.from("whatsapp_status_envios").insert({ chave, tipo, contato_id: contato, mensagem });
        if (error) return false; // já enviado
      }
      return true;
    };
    const lojaNome = async (id: string) => (await db.from("stores").select("name").eq("id", id).single()).data?.name ?? "Loja";
    const cache = async (store: string, relatorio: string, inicio: string, fim: string) => {
      const { data } = await db.from("relatorio_cache").select("dados,params,atualizado_em").eq("store_id", store).eq("relatorio", relatorio).gte("fim", inicio).lte("fim", fim).order("atualizado_em", { ascending: false }).limit(200);
      const porDia = new Map<string, Record<string, unknown>[]>();
      for (const r of data || []) {
        const pr = (r.params || {}) as Record<string, string>;
        if (pr.inicio !== pr.fim || porDia.has(pr.fim)) continue; // só consultas de um dia, a mais recente
        porDia.set(pr.fim, (r.dados as Record<string, unknown>[]) || []);
      }
      return porDia;
    };
    // Produtos que venderam em >= 85% dos últimos 60 dias salvos no Hub (antes de `ate`).
    const frequentes = async (store: string, ate: string) => {
      const ini = addDias(ate, -60), fim = addDias(ate, -1);
      const { data } = await db.from("relatorio_cache").select("dados,params,atualizado_em").eq("store_id", store).eq("relatorio", "ranking_produtos").gte("fim", ini).lte("fim", fim).order("atualizado_em", { ascending: false }).limit(1000);
      const porDia = new Map<string, Record<string, unknown>[]>();
      for (const r of data || []) {
        const pr = (r.params || {}) as Record<string, string>;
        if (pr.inicio !== pr.fim || porDia.has(pr.fim)) continue;
        porDia.set(pr.fim, (r.dados as Record<string, unknown>[]) || []);
      }
      return { dias: porDia.size, produtos: produtosFrequentes([...porDia.values()], 0.85) };
    };

    if (modo === "frequentes") {
      if (!p.data.store_id) return json({ error: "store_id obrigatório" }, 400);
      return json({ ok: true, ...(await frequentes(p.data.store_id, p.data.data || addDias(ontemSP(), 1))) });
    }

    if (modo === "nota") {
      if (!recebimento_id) return json({ error: "recebimento_id obrigatório" }, 400);
      const { data: rec } = await db.from("recebimentos").select("*").eq("id", recebimento_id).single();
      if (!rec) return json({ error: "Nota não encontrada" }, 404);
      const { data: cts } = await db.from("whatsapp_contatos").select("id,telefone").eq("ativo", true).eq("aviso_nota", true).eq("store_id", rec.store_id);
      if (!cts?.length) return json({ ok: true, enviados: 0 });
      const { data: itens } = await db.from("recebimento_itens").select("codproduto,descricao_xml,descricao_produto,preco_xml,fator").eq("recebimento_id", recebimento_id);
      const { data: crit } = await db.from("recebimento_criterios").select("nome,resultado").eq("recebimento_id", recebimento_id);
      const hoje = new Date().toISOString().slice(0, 10);
      const compras = await cache(rec.store_id, "analise_compras", addDias(hoje, -180), hoje);
      const ultimo = new Map<number, number>();
      [...compras.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).forEach(([, linhas]) => linhas.forEach((l) => {
        const c = num(l.codigo); if (c && num(l.numero_nota) !== rec.numero_nf && !ultimo.has(c) && num(l.custo_unit) > 0) ultimo.set(c, num(l.custo_unit));
      }));
      const altas = custoMaior((itens || []).map((i) => ({ codproduto: i.codproduto, descricao: i.descricao_produto || i.descricao_xml, custo: num(i.preco_xml) / (num(i.fator) || 1) })), ultimo);
      const avisos = (crit || []).filter((c) => c.resultado !== "OK").map((c) => `${c.nome}: ${c.resultado}`);
      let msg = `📦 *Entrada de nota — ${await lojaNome(rec.store_id)}*\nFornecedor: ${rec.nome_emitente ?? "-"}\nNF ${rec.numero_nf ?? "-"} • ${brl(num(rec.total_nf))} • ${(itens || []).length} itens`;
      msg += avisos.length ? `\nConferência: ${avisos.join(" • ")}` : "\nConferência: sem divergências";
      if (altas.length) msg += `\n\n🔺 *Chegaram mais caros que a última compra:*\n` + altas.slice(0, 15).map((a) => `• ${a.descricao}: ${brl(a.anterior)} → ${brl(a.custo)} (+${pct(a.alta)})`).join("\n");
      else msg += "\n\nNenhum item mais caro que a última compra.";
      let n = 0;
      for (const c of cts.filter((c) => !contato_id || c.id === contato_id)) {
        if (!(await registrar(`nota:${recebimento_id}:${c.id}`, "nota", c.id, msg, !!contato_id))) continue;
        try { await enviarTexto(c.telefone, msg); n++; } catch (e) { await db.from("whatsapp_status_envios").update({ status: "erro", erro: String((e as Error).message) }).eq("chave", `nota:${recebimento_id}:${c.id}`); }
        await sleep(1500);
      }
      return json({ ok: true, enviados: n });
    }

    // ---- Resumo diário (dia anterior fechado) ----
    const dia = p.data.data || ontemSP();
    const inicioMes = dia.slice(0, 8) + "01";
    const dow = new Date(dia + "T12:00:00Z").getUTCDay();
    const inicioSemana = addDias(dia, -((dow + 6) % 7)); // segunda-feira
    let q = db.from("whatsapp_contatos").select("id,telefone,store_id,status_itens").eq("ativo", true).not("store_id", "is", null);
    if (contato_id) q = q.eq("id", contato_id);
    const { data: contatos } = await q;
    const alvo = (contatos || []).filter((c) => (c.status_itens || []).length);
    const textos = new Map<string, Record<string, string>>();
    const blocos = async (store: string) => {
      if (textos.has(store)) return textos.get(store)!;
      const b: Record<string, string> = {};
      const diasDoMes: string[] = []; for (let x = inicioMes; x <= dia; x = addDias(x, 1)) diasDoMes.push(x);
      // Compras × Vendas: consulta a loja antes de enviar os dias do mês que ainda estão vazios no Hub.
      let cv = await cache(store, "compras_vendas_periodo", inicioMes, dia);
      const vazios = diasDoMes.filter((x) => !(cv.get(x) || []).length).slice(-2);
      if (vazios.length) {
        const cfg = await carregarConfigLoja(url, service, store).catch(() => null);
        if (cfg) {
          for (const x of vazios) {
            try { await consultarComCache({ supabaseUrl: url, serviceKey: service, storeId: store, relatorio: "compras_vendas_periodo", params: { inicio: x, fim: x }, cfg, forcar: true, origem: "job", timeoutMs: 60000 }); } catch (e) { console.error("consulta", x, e); }
          }
          cv = await cache(store, "compras_vendas_periodo", inicioMes, dia);
        }
      }
      const soma = (dias: string[], k: string) => dias.reduce((s, x) => s + (cv.get(x) || []).reduce((t, l) => t + num(l[k]), 0), 0);
      const todos = [...cv.keys()];
      const { data: met } = await db.from("store_daily_metrics").select("date,meta_vendas,realizado_vendas").eq("store_id", store).eq("department", "LOJA").gte("date", inicioMes).lte("date", addDias(inicioMes, 31));
      const doMes = (met || []).filter((m) => m.date.slice(0, 7) === dia.slice(0, 7));
      // Realizado do dia: métrica salva ou, se zerada, a venda do Compras × Vendas.
      const realDe = (x: string) => { const r = num(doMes.find((m) => m.date === x)?.realizado_vendas); return r > 0 ? r : soma([x], "venda"); };
      const metaDe = (x: string) => num(doMes.find((m) => m.date === x)?.meta_vendas);
      const comVenda = diasDoMes.filter((x) => realDe(x) > 0);
      b.__sem_venda = realDe(dia) > 0 ? "" : "1";
      const rDia = realDe(dia), mDia = metaDe(dia);
      b.meta_dia = mDia > 0 && rDia > 0
        ? `${rDia >= mDia ? "✅ *Bateu a meta do dia*" : "❌ *Não bateu a meta do dia*"}\nVendido ${brl(rDia)} de ${brl(mDia)} (${pct(rDia / mDia)})`
        : "Meta do dia: sem meta ou venda registrada.";
      const metaMes = doMes.reduce((s, m) => s + num(m.meta_vendas), 0);
      const ultimo = comVenda[comVenda.length - 1];
      const metaAte = ultimo ? diasDoMes.filter((x) => x <= ultimo).reduce((s, x) => s + metaDe(x), 0) : 0;
      const realMes = comVenda.reduce((s, x) => s + realDe(x), 0);
      b.meta_mes = metaMes > 0
        ? `🎯 *Meta do mês*\nRealizado ${brl(realMes)} de ${brl(metaMes)} (${pct(realMes / metaMes)})\nMeta acumulada até ${ultimo ? dataBR(ultimo) : "-"}: ${brl(metaAte)} → ${realMes >= metaAte ? "à frente" : "atrás"} em ${brl(Math.abs(realMes - metaAte))}`
        : "Meta do mês: não cadastrada.";
      const cDia = soma([dia], "compra"), vDia = soma([dia], "venda");
      b.compras = cv.has(dia)
        ? `🛒 *Compras*\nDia: ${brl(cDia)}\nSemana: ${brl(soma(todos.filter((x) => x >= inicioSemana), "compra"))}\nMês: ${brl(soma(todos, "compra"))}`
        : "Compras: dados do dia ainda não salvos no Hub.";
      b.compras_vendas = cv.has(dia) && vDia > 0
        ? `⚖️ *Compras × Vendas do dia*\nCompras ${brl(cDia)} × Vendas ${brl(vDia)} = ${pct(cDia / vDia)}`
        : "Compras × Vendas: dados do dia ainda não salvos no Hub.";
      const rk = (await cache(store, "ranking_produtos", dia, dia)).get(dia);
      if (rk) {
        const neg = margemNegativa(rk);
        b.margem_negativa = neg.length
          ? `📉 *Vendidos com prejuízo (${neg.length})*\n` + neg.slice(0, 15).map((x) => `• ${x.produto}: margem ${pct(x.margem)} (${brl(x.lucro)})`).join("\n") + (neg.length > 15 ? `\n…e mais ${neg.length - 15}` : "")
          : "📉 Nenhum produto vendido com prejuízo.";
        const { data: manual } = await db.from("whatsapp_produtos_diarios").select("codigo,descricao").eq("store_id", store);
        const auto = (await frequentes(store, dia)).produtos;
        const mapa = new Map<number, { codigo: number; descricao: string | null }>();
        for (const x of [...auto, ...(manual || [])]) mapa.set(Number(x.codigo), { codigo: Number(x.codigo), descricao: x.descricao });
        const lista = [...mapa.values()];
        const nv = naoVendidos(lista || [], rk);
        b.nao_vendidos = !lista?.length ? "Produtos de venda diária: nenhum produto escolhido."
          : nv.length ? `🚫 *Não venderam no dia (${nv.length})*\n` + nv.map((x) => `• ${x.codigo} ${x.descricao ?? ""}`).join("\n") : "✅ Todos os produtos de venda diária venderam.";
      } else {
        b.margem_negativa = b.nao_vendidos = "Vendas por produto do dia ainda não salvas no Hub.";
      }
      textos.set(store, b);
      return b;
    };
    let n = 0;
    for (const c of alvo) {
      const b = await blocos(c.store_id!);
      if (b.__sem_venda) continue; // sem venda registrada no dia anterior: não envia
      const msg = [`📊 *Resumo de ${dataBR(dia)} — ${await lojaNome(c.store_id!)}*`, ...ITENS.filter((i) => c.status_itens.includes(i)).map((i) => b[i])].join("\n\n");
      const chave = `diario:${dia}:${c.id}`;
      if (!(await registrar(chave, "diario", c.id, msg, !!contato_id))) continue;
      try { await enviarTexto(c.telefone, msg); n++; } catch (e) { await db.from("whatsapp_status_envios").update({ status: "erro", erro: String((e as Error).message) }).eq("chave", chave); }
      await sleep(2000 + Math.random() * 2000);
    }
    return json({ ok: true, dia, enviados: n });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message) }, 500);
  }
});
