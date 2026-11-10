// supabase/functions/recebimento/index.ts
// Andrade Hub — Recebimento de NF-e (WebSac / Nascimento)
//
// POST { acao: "validar",  store_id, chave }                  → critérios 1–4
// POST { acao: "conferir", store_id, recebimento_id, rodada } → critério 5 (cruza lista_cega_itens × XML)
// POST { acao: "ciente",   store_id, recebimento_id, criterio, justificativa } → assume um AVISO
// POST { acao: "aprovar",  store_id, recebimento_id, justificativa? } → APROVADA(_COM_RESSALVA) e chama websac-entrada (modo gravar)
// POST { acao: "cancelar", store_id, recebimento_id, justificativa } → CANCELADA (supervisor/admin)
// POST { acao: "sincronizar", store_id } → marca ENTRADA_CONFIRMADA quando a nota aparece em notafiscal
//
// Leitura do WebSac pelo helper já existente (consultarRelatorioLoja → websac-proxy).
// A entrada no WebSac é feita pela edge websac-entrada (06), chamada ao final de "aprovar".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarRelatorioLoja } from "../_shared/consultaLoja.ts";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ---------- chave de acesso ----------
export function validarChave(chave: string): { ok: boolean; erro?: string; cnpj?: string; nNF?: number; serie?: number; modelo?: string } {
  const c = (chave || "").replace(/\D/g, "");
  if (c.length !== 44) return { ok: false, erro: "chave precisa ter 44 dígitos" };
  // DV módulo 11 (pesos 2..9 da direita para a esquerda)
  let soma = 0, peso = 2;
  for (let i = 42; i >= 0; i--) { soma += Number(c[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
  if (dv !== Number(c[43])) return { ok: false, erro: "dígito verificador inválido — leia o código de novo" };
  const modelo = c.slice(20, 22);
  if (modelo !== "55") return { ok: false, erro: `modelo ${modelo} não é NF-e (55)` };
  return { ok: true, cnpj: c.slice(6, 20), serie: Number(c.slice(22, 25)), nNF: Number(c.slice(25, 34)), modelo };
}

// ---------- XML (sem dependências: regex sobre o texto) ----------
type ItemXml = { seq: number; cProd: string; cEAN: string; xProd: string; uCom: string; qCom: number; vUnCom: number; vProd: number };
type DupXml = { nDup: string; dVenc: string; vDup: number };
function tag(src: string, nome: string): string | null {
  const m = src.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`));
  return m ? m[1].trim() : null;
}
export function parseXml(xml: string) {
  const emitCnpj = tag(tag(xml, "emit") ?? "", "CNPJ") ?? "";
  const ide = tag(xml, "ide") ?? "";
  const dhEmi = (tag(ide, "dhEmi") ?? tag(ide, "dEmi") ?? "").slice(0, 10);
  const nNF = Number(tag(ide, "nNF") ?? 0);
  const serie = tag(ide, "serie") ?? "";
  const vNF = Number(tag(tag(xml, "ICMSTot") ?? "", "vNF") ?? 0);
  const itens: ItemXml[] = [];
  for (const m of xml.matchAll(/<det\s+nItem="(\d+)"[^>]*>([\s\S]*?)<\/det>/g)) {
    const prod = tag(m[2], "prod") ?? "";
    const ean = (tag(prod, "cEAN") ?? "").replace(/\D/g, "");
    const eanTrib = (tag(prod, "cEANTrib") ?? "").replace(/\D/g, "");
    itens.push({
      seq: Number(m[1]),
      cProd: tag(prod, "cProd") ?? "",
      cEAN: ean.length >= 8 ? ean : (eanTrib.length >= 8 ? eanTrib : ""),
      xProd: tag(prod, "xProd") ?? "",
      uCom: tag(prod, "uCom") ?? "",
      qCom: Number(tag(prod, "qCom") ?? 0),
      vUnCom: Number(tag(prod, "vUnCom") ?? 0),
      vProd: Number(tag(prod, "vProd") ?? 0),
    });
  }
  const dups: DupXml[] = [];
  for (const m of xml.matchAll(/<dup>([\s\S]*?)<\/dup>/g)) {
    dups.push({ nDup: tag(m[1], "nDup") ?? "", dVenc: tag(m[1], "dVenc") ?? "", vDup: Number(tag(m[1], "vDup") ?? 0) });
  }
  return { emitCnpj, dhEmi, nNF, serie, vNF, itens, dups };
}

// ---------- helpers ----------
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const diasEntre = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const addDias = (iso: string, d: number) => { const x = new Date(iso); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const hojeBrasil = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
// O relatório devolve o XML em base64 (xmlnfe_b64) porque a tela SQL do WebSac responde em HTML.
function xmlDaNfe(nfe: Record<string, unknown>): string {
  const b64 = String(nfe.xmlnfe_b64 ?? "").replace(/\s+/g, "");
  if (b64) {
    try { return new TextDecoder("utf-8").decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))); } catch { /* cai no texto cru */ }
  }
  return String(nfe.xmlnfe ?? "");
}

async function rel(storeId: string, relatorio: string, params: Record<string, unknown>) {
  const r = await consultarRelatorioLoja({ supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, storeId, relatorio, params, timeoutMs: 60000 });
  // a tela SQL do WebSac devolve uma grade vazia (sem <tr>) quando não há linhas e o websac-proxy
  // responde isso como erro em branco — aqui é só "nenhuma linha"
  if (!r.ok && /^WebSac:\s*$/.test(String(r.erro ?? ""))) return [];
  if (!r.ok) throw new Error(`${relatorio}: ${r.erro ?? "falha"}`);
  return (r.dados ?? []) as Record<string, unknown>[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const auth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return json({ erro: "não autenticado" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }
  const acao = String(body.acao ?? "");
  const storeId = String(body.store_id ?? "");
  if (!storeId) return json({ erro: "store_id obrigatório" }, 400);
  // mesma regra de tem_acesso_loja(): admin global ou acesso aprovado à loja
  const { data: papeis } = await db.from("user_roles").select("role").eq("user_id", user.id);
  const ehAdmin = (papeis ?? []).some((p) => p.role === "admin");
  const ehSupervisor = ehAdmin || (papeis ?? []).some((p) => p.role === "supervisor");
  if (!ehAdmin) {
    const { data: acesso } = await db.from("user_store_access").select("id").eq("user_id", user.id).eq("store_id", storeId).eq("approved", true).maybeSingle();
    if (!acesso) return json({ erro: "sem acesso à loja" }, 403);
  }
  // toda ação sobre um recebimento confere se ele é mesmo desta loja
  const recebimentoDaLoja = async (rid: string) => {
    const { data } = await db.from("recebimentos").select("*").eq("id", rid).eq("store_id", storeId).maybeSingle();
    return data as Record<string, any> | null;
  };

  const { data: cfgRow } = await db.from("recebimento_config").select("*").eq("store_id", storeId).maybeSingle();
  const cfg = { dias_max_emissao: 3, tolerancia_prazo: 2, tolerancia_preco: 1, tolerancia_qtd: 0, recontagens: 1, exigir_pedido: true, entrada_automatica: true, ...(cfgRow ?? {}) };

  const evento = (recebimento_id: string, evento: string, detalhe?: unknown) =>
    db.from("recebimento_eventos").insert({ recebimento_id, evento, detalhe, usuario_id: user.id });

  try {
    // =====================================================================
    if (acao === "validar") {
      const chk = validarChave(String(body.chave ?? ""));
      if (!chk.ok) return json({ erro: chk.erro }, 400);
      const chave = String(body.chave).replace(/\D/g, "");

      // 1) NF-e no WebSac
      const nfe = (await rel(storeId, "nfe_recebida_por_chave", { chave }))[0];
      if (!nfe) {
        const { data: r } = await db.from("recebimentos").upsert({
          store_id: storeId, chave, cnpj_emitente: chk.cnpj, numero_nf: chk.nNF, serie: String(chk.serie),
          estado: "AGUARDANDO_NFE", iniciado_por: user.id, atualizado_em: new Date().toISOString(),
        }, { onConflict: "store_id,chave" }).select().single();
        if (!r) throw new Error("falha ao salvar recebimento");
        await evento(r.id, "SCAN_SEM_NFE", { chave });
        return json({ recebimento: r, estado: "AGUARDANDO_NFE", mensagem: "NF-e ainda não chegou da SEFAZ para esta loja. Tente novamente em alguns minutos." });
      }
      if (nfe.idnotafiscal_entrada) {
        return json({ estado: "ENTRADA_CONFIRMADA", mensagem: `Esta nota já deu entrada no WebSac em ${nfe.dtentrada} (id ${nfe.idnotafiscal_entrada}).` });
      }
      const { data: jaExiste } = await db.from("recebimentos").select("id, estado, idnotafiscal_entrada").eq("store_id", storeId).eq("chave", chave).maybeSingle();
      if (jaExiste && (jaExiste.estado === "ENTRADA_CONFIRMADA" || jaExiste.idnotafiscal_entrada)) {
        return json({ recebimento_id: jaExiste.id, estado: "ENTRADA_CONFIRMADA", mensagem: `Esta nota já deu entrada pelo Hub (id ${jaExiste.idnotafiscal_entrada ?? "?"}).` });
      }
      const xml = parseXml(xmlDaNfe(nfe));
      const cnpj = (xml.emitCnpj || String(nfe.cnpj_emitente ?? "")).replace(/\D/g, "") || chk.cnpj;
      const dataEmissao = xml.dhEmi || String(nfe.dataemissao ?? "");

      // recebimento (cabeçalho)
      const { data: rec } = await db.from("recebimentos").upsert({
        store_id: storeId, chave, idnfeestabelec: nfe.idnfeestabelec, numero_nf: nfe.numnotafiscal ?? chk.nNF,
        serie: String(nfe.serie ?? chk.serie), cnpj_emitente: cnpj, nome_emitente: nfe.nome_emitente,
        data_emissao: dataEmissao, total_nf: num(nfe.total) || xml.vNF, estado: "EM_VALIDACAO",
        xml_resumo: { itens: xml.itens, dups: xml.dups, vNF: xml.vNF }, iniciado_por: user.id,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: "store_id,chave" }).select().single();
      if (!rec) throw new Error("falha ao salvar recebimento");
      const rid = rec.id as string;
      await evento(rid, "SCAN", { chave, numero: nfe.numnotafiscal });

      const criterios: { criterio: number; nome: string; resultado: "OK" | "AVISO" | "BLOQUEIO" | "PENDENTE"; detalhe: unknown }[] = [];

      // ---- 1. CNPJ ----
      const forns = await rel(storeId, "fornecedor_por_cnpj", { cnpj });
      const forn = forns.find((f) => f.status === "A") ?? forns[0];
      let codfornec: number | null = forn ? Number(forn.codfornec) : null;
      if (!forn) criterios.push({ criterio: 1, nome: "CNPJ", resultado: "BLOQUEIO", detalhe: { cnpj, motivo: "fornecedor não cadastrado", precadastros_pendentes: 0 } });
      else if (forn.status !== "A") criterios.push({ criterio: 1, nome: "CNPJ", resultado: "BLOQUEIO", detalhe: { cnpj, codfornec, nome: forn.nome, motivo: `fornecedor inativo (status ${forn.status})` } });
      else criterios.push({ criterio: 1, nome: "CNPJ", resultado: "OK", detalhe: { cnpj, codfornec, nome: forn.nome, condpagto: forn.condpagto_descricao } });

      // ---- 2. Emissão ----
      const hoje = hojeBrasil();
      const dias = dataEmissao ? diasEntre(dataEmissao, hoje) : 0;
      criterios.push({ criterio: 2, nome: "EMISSAO", resultado: dias > cfg.dias_max_emissao ? "AVISO" : "OK", detalhe: { data_emissao: dataEmissao, dias, limite: cfg.dias_max_emissao } });

      // ---- 3. Pedido ----
      let numpedido: number | null = null;
      let itensPedido: Record<string, unknown>[] = [];
      let condPedido: Record<string, unknown> | null = null;
      if (codfornec) {
        const vinculados = String(nfe.pedidos_vinculados ?? "").split(",").map((s) => Number(s)).filter(Boolean);
        const abertos = await rel(storeId, "pedidos_abertos_fornecedor", { codfornec });
        // prioridade: pedido que o WebSac já vinculou à NF-e; senão, pedido aberto cujo total bate (±5%); senão o mais recente
        const alvo = abertos.find((p) => vinculados.includes(Number(p.numpedido)))
          ?? abertos.find((p) => Math.abs(num(p.totalliquido) - (num(nfe.total) || xml.vNF)) / Math.max(1, num(p.totalliquido)) <= 0.05)
          ?? null;
        if (alvo) {
          numpedido = Number(alvo.numpedido);
          itensPedido = await rel(storeId, "pedido_itens", { numpedido });
          condPedido = (await rel(storeId, "condpagto_detalhe", { numpedido }))[0] ?? null;
        }
        if (!numpedido) {
          criterios.push({ criterio: 3, nome: "PEDIDO", resultado: cfg.exigir_pedido ? "BLOQUEIO" : "AVISO", detalhe: { motivo: "nenhum pedido em aberto deste fornecedor casa com a nota", pedidos_abertos: abertos.map((p) => ({ numpedido: p.numpedido, dtemissao: p.dtemissao, total: p.totalliquido })), acao: "criar_pedido" } });
        }
      } else {
        criterios.push({ criterio: 3, nome: "PEDIDO", resultado: "PENDENTE", detalhe: { motivo: "depende do critério 1" } });
      }

      // itens: XML × pedido
      const itensWs = await rel(storeId, "nfe_recebida_itens", { chave });
      const itensNota: ItemXml[] = xml.itens.length ? xml.itens : itensWs.map((w, i) => ({
        seq: Number(w.seqitem) || i + 1, cProd: String(w.reffornec ?? ""), cEAN: String(w.ean_xml ?? "").replace(/\D/g, ""),
        xProd: String(w.descricao_xml ?? ""), uCom: "", qCom: num(w.qtd_xml), vUnCom: num(w.preco_xml), vProd: num(w.totalproduto),
      }));
      const linhas = itensNota.map((it) => {
        const ws = itensWs.find((w) => Number(w.seqitem) === it.seq) ?? itensWs.find((w) => String(w.ean_xml ?? "").replace(/\D/g, "") === it.cEAN && it.cEAN);
        const codproduto = ws?.codproduto ? Number(ws.codproduto) : null;
        const ped = itensPedido.find((p) => (codproduto && Number(p.codproduto) === codproduto) || (it.cEAN && String(p.ean ?? "") === it.cEAN) || (it.cProd && String(p.reffornec ?? "") === it.cProd));
        const fator = num(ped?.fator) || num(ws?.fator_embalagem) || 1;
        let situacao: string;
        if (!codproduto) situacao = "NAO_CASADO";
        else if (!numpedido) situacao = "SEM_PEDIDO";
        else if (!ped) situacao = "SEM_PEDIDO";
        else if (Math.abs(it.qCom - num(ped.quantidade)) > num(ped.quantidade) * cfg.tolerancia_qtd / 100) situacao = "QTD_DIVERGE";
        else if (num(ped.preco) > 0 && Math.abs(it.vUnCom - num(ped.preco)) / num(ped.preco) * 100 > cfg.tolerancia_preco) situacao = "PRECO_DIVERGE";
        else situacao = "OK";
        return {
          recebimento_id: rid, seq_xml: it.seq, cprod: it.cProd, ean: it.cEAN || (ws?.ean_cadastro ? String(ws.ean_cadastro) : null),
          descricao_xml: it.xProd, qtd_xml: it.qCom, un_xml: it.uCom, preco_xml: it.vUnCom,
          codproduto, descricao_produto: ws?.descricao_produto ?? null, fator,
          qtd_pedido: ped ? num(ped.quantidade) : null, preco_pedido: ped ? num(ped.preco) : null, situacao_pedido: situacao,
        };
      });
      await db.from("recebimento_itens").delete().eq("recebimento_id", rid);
      if (linhas.length) await db.from("recebimento_itens").insert(linhas);
      if (numpedido) {
        const div = linhas.filter((l) => l.situacao_pedido !== "OK");
        const faltamNoXml = itensPedido.filter((p) => !linhas.some((l) => l.codproduto && Number(p.codproduto) === l.codproduto)).map((p) => ({ codproduto: p.codproduto, descricao: p.descricao, quantidade: p.quantidade }));
        criterios.push({ criterio: 3, nome: "PEDIDO", resultado: div.length || faltamNoXml.length ? "AVISO" : "OK", detalhe: { numpedido, itens_nota: linhas.length, itens_pedido: itensPedido.length, divergentes: div.map((d) => ({ seq: d.seq_xml, descricao: d.descricao_xml, situacao: d.situacao_pedido, qtd_xml: d.qtd_xml, qtd_pedido: d.qtd_pedido, preco_xml: d.preco_xml, preco_pedido: d.preco_pedido })), itens_do_pedido_fora_da_nota: faltamNoXml } });
      }

      // ---- 4. Prazos ----
      if (numpedido && condPedido) {
        const esperados: { parcela: number; venc: string; pct: number }[] = [];
        for (let i = 1; i <= 12; i++) {
          const d = num(condPedido[`dia${i}`]); const pct = num(condPedido[`percdia${i}`]);
          if (i === 1 || d > 0 || pct > 0) { if (i > 1 && d === 0 && pct === 0) break; esperados.push({ parcela: i, venc: addDias(dataEmissao, d + num(condPedido.diascarencia)), pct }); }
        }
        const comparacao = xml.dups.map((dup, i) => {
          const esp = esperados[i];
          const delta = esp ? diasEntre(esp.venc, dup.dVenc) : null; // >0 = nota vence depois (melhor); <0 = antes
          return { parcela: i + 1, venc_nota: dup.dVenc, valor: dup.vDup, venc_pedido: esp?.venc ?? null, delta_dias: delta, situacao: esp == null ? "PARCELA_EXTRA" : delta != null && delta < -cfg.tolerancia_prazo ? "ANTECIPADO" : "OK" };
        });
        const problemas = comparacao.filter((c) => c.situacao !== "OK");
        const parcelasDif = xml.dups.length !== esperados.length;
        criterios.push({ criterio: 4, nome: "PRAZOS", resultado: xml.dups.length === 0 ? "AVISO" : (problemas.length || parcelasDif ? "AVISO" : "OK"), detalhe: { condpagto: condPedido.descricao, parcelas_pedido: esperados.length, parcelas_nota: xml.dups.length, comparacao, sem_duplicata_no_xml: xml.dups.length === 0 } });
      } else {
        criterios.push({ criterio: 4, nome: "PRAZOS", resultado: "PENDENTE", detalhe: { motivo: "depende do pedido" } });
      }

      // ---- 5. Lista cega: pendente até a contagem ----
      criterios.push({ criterio: 5, nome: "LISTA_CEGA", resultado: "PENDENTE", detalhe: null });

      await db.from("recebimento_criterios").upsert(criterios.map((c) => ({ recebimento_id: rid, ...c, ciente_por: null, ciente_em: null, justificativa: null, avaliado_em: new Date().toISOString() })), { onConflict: "recebimento_id,criterio" });
      const bloqueado = criterios.some((c) => c.resultado === "BLOQUEIO");
      await db.from("recebimentos").update({ codfornec, numpedido, pedido_origem: numpedido ? "websac" : null, estado: bloqueado ? "BLOQUEADA" : "EM_CONTAGEM", atualizado_em: new Date().toISOString() }).eq("id", rid);
      await evento(rid, "VALIDOU", { criterios: criterios.map((c) => [c.criterio, c.resultado]) });
      return json({ recebimento_id: rid, estado: bloqueado ? "BLOQUEADA" : "EM_CONTAGEM", nota: { numero: nfe.numnotafiscal, emitente: nfe.nome_emitente, total: nfe.total, emissao: dataEmissao, itens: linhas.length, xml_lido: xml.itens.length > 0 }, criterios });
    }

    // =====================================================================
    if (acao === "ciente") {
      const rid = String(body.recebimento_id); const criterio = Number(body.criterio);
      if (!(await recebimentoDaLoja(rid))) return json({ erro: "recebimento não encontrado nesta loja" }, 404);
      const just = String(body.justificativa ?? "").trim();
      if (just.length < 5) return json({ erro: "justificativa obrigatória" }, 400);
      await db.from("recebimento_criterios").update({ ciente_por: user.id, ciente_em: new Date().toISOString(), justificativa: just }).eq("recebimento_id", rid).eq("criterio", criterio);
      await evento(rid, "CIENTE", { criterio, justificativa: just });
      return json({ ok: true });
    }

    // =====================================================================
    if (acao === "conferir") {
      const rid = String(body.recebimento_id);
      const rodada = Number(body.rodada ?? 1);
      const rec = await recebimentoDaLoja(rid);
      if (!rec) return json({ erro: "recebimento não encontrado nesta loja" }, 404);
      if (rec.estado === "ENTRADA_CONFIRMADA") return json({ erro: "esta nota já deu entrada" }, 409);
      const { data: itens } = await db.from("recebimento_itens").select("*").eq("recebimento_id", rid);
      const { data: cont } = await db.from("lista_cega_itens").select("*").eq("recebimento_id", rid).eq("rodada", rodada);
      const porChave = new Map<string, number>();
      for (const c of cont ?? []) { const k = c.codproduto ? `p:${c.codproduto}` : `e:${c.ean}`; porChave.set(k, (porChave.get(k) ?? 0) + num(c.qtd_contada)); }
      const usados = new Set<string>();
      const resultado = (itens ?? []).map((it) => {
        const k = it.codproduto ? `p:${it.codproduto}` : `e:${it.ean}`; usados.add(k);
        const contada = porChave.get(k) ?? 0; const nota = num(it.qtd_unidades);
        const tol = nota * cfg.tolerancia_qtd / 100;
        const situacao = !porChave.has(k) ? "NAO_CONTADO" : Math.abs(contada - nota) <= tol ? "OK" : contada < nota ? "FALTA" : "SOBRA";
        return { seq: it.seq_xml, codproduto: it.codproduto, ean: it.ean, descricao: it.descricao_produto ?? it.descricao_xml, qtd_nota: nota, qtd_contada: contada, diferenca: contada - nota, situacao };
      });
      for (const [k, q] of porChave) if (!usados.has(k)) {
        const c = (cont ?? []).find((x) => (x.codproduto ? `p:${x.codproduto}` : `e:${x.ean}`) === k);
        if (!c) continue;
        resultado.push({ seq: null, codproduto: c.codproduto, ean: c.ean, descricao: c.descricao, qtd_nota: 0, qtd_contada: q, diferenca: q, situacao: "FORA_DA_NOTA" });
      }
      const divergentes = resultado.filter((r) => r.situacao !== "OK");
      await db.from("recebimento_criterios").upsert({ recebimento_id: rid, criterio: 5, nome: "LISTA_CEGA", resultado: divergentes.length ? "AVISO" : "OK", detalhe: { rodada, itens: resultado, resumo: { ok: resultado.length - divergentes.length, falta: divergentes.filter((d) => d.situacao === "FALTA").length, sobra: divergentes.filter((d) => d.situacao === "SOBRA").length, nao_contado: divergentes.filter((d) => d.situacao === "NAO_CONTADO").length, fora_da_nota: divergentes.filter((d) => d.situacao === "FORA_DA_NOTA").length } }, avaliado_em: new Date().toISOString() }, { onConflict: "recebimento_id,criterio" });
      await evento(rid, rodada > 1 ? "RECONTAGEM" : "CONTAGEM", { rodada, divergentes: divergentes.length });
      return json({ rodada, pode_recontar: divergentes.length > 0 && rodada <= cfg.recontagens, itens: resultado, divergentes: divergentes.length });
    }

    // =====================================================================
    if (acao === "aprovar" || acao === "liberar") {
      const rid = String(body.recebimento_id);
      const recAtual = await recebimentoDaLoja(rid);
      if (!recAtual) return json({ erro: "recebimento não encontrado nesta loja" }, 404);
      if (recAtual.estado === "ENTRADA_CONFIRMADA" || recAtual.idnotafiscal_entrada) return json({ erro: "esta nota já deu entrada", idnotafiscal: recAtual.idnotafiscal_entrada }, 409);
      const { data: crits } = await db.from("recebimento_criterios").select("*").eq("recebimento_id", rid);
      if ((crits ?? []).length < 5) return json({ erro: "valide a nota antes de aprovar" }, 409);
      const bloqueio = (crits ?? []).find((c) => c.resultado === "BLOQUEIO");
      if (bloqueio) return json({ erro: `critério ${bloqueio.criterio} (${bloqueio.nome}) está bloqueando` }, 409);
      const pendente = (crits ?? []).find((c) => c.resultado === "PENDENTE");
      if (pendente) return json({ erro: `critério ${pendente.criterio} (${pendente.nome}) ainda não foi avaliado` }, 409);
      const avisosSemCiente = (crits ?? []).filter((c) => c.resultado === "AVISO" && !c.ciente_por && c.criterio !== 5);
      if (avisosSemCiente.length) return json({ erro: `assuma os avisos antes de aprovar: ${avisosSemCiente.map((c) => c.nome).join(", ")}` }, 409);
      const ressalva = (crits ?? []).some((c) => c.resultado === "AVISO");
      const just = String(body.justificativa ?? "").trim();
      if (ressalva) {
        if (!ehSupervisor) return json({ erro: "aprovar com ressalva exige perfil supervisor/admin" }, 403);
        if (just.length < 5) return json({ erro: "justificativa obrigatória para aprovar com ressalva" }, 400);
        // a justificativa da ressalva vale como ciente da divergência de contagem (critério 5)
        await db.from("recebimento_criterios").update({ ciente_por: user.id, ciente_em: new Date().toISOString(), justificativa: just })
          .eq("recebimento_id", rid).eq("resultado", "AVISO").is("ciente_por", null);
      }
      const estado = ressalva ? "APROVADA_COM_RESSALVA" : "APROVADA";
      await db.from("recebimentos").update({ estado, liberado_por: user.id, liberado_em: new Date().toISOString(), justificativa: just || null, atualizado_em: new Date().toISOString() }).eq("id", rid);
      await evento(rid, "APROVOU", { estado, justificativa: just });
      // entrada automática no WebSac (mesma sessão do usuário → websac-entrada valida o JWT)
      if (cfg.entrada_automatica !== false) {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/websac-entrada`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") ?? "", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
          body: JSON.stringify({ store_id: storeId, recebimento_id: rid, modo: "gravar" }),
        });
        const ent = await r.json().catch(() => ({ erro: `websac-entrada HTTP ${r.status}` }));
        return json({ estado: ent.estado ?? estado, entrada: ent }, r.ok ? 200 : 207);
      }
      return json({ estado, mensagem: "Aprovada. Entrada automática desligada para esta loja — rode websac-entrada manualmente." });
    }

    // =====================================================================
    if (acao === "cancelar") {
      const rid = String(body.recebimento_id);
      const rec = await recebimentoDaLoja(rid);
      if (!rec) return json({ erro: "recebimento não encontrado nesta loja" }, 404);
      if (rec.estado === "ENTRADA_CONFIRMADA" || rec.idnotafiscal_entrada) return json({ erro: "esta nota já deu entrada — não pode ser cancelada no Hub" }, 409);
      if (!ehSupervisor) return json({ erro: "cancelar exige perfil supervisor/admin" }, 403);
      const just = String(body.justificativa ?? "").trim();
      if (just.length < 5) return json({ erro: "justificativa obrigatória" }, 400);
      await db.from("recebimentos").update({ estado: "CANCELADA", justificativa: just, atualizado_em: new Date().toISOString() }).eq("id", rid);
      await evento(rid, "CANCELOU", { justificativa: just });
      return json({ estado: "CANCELADA" });
    }

    // =====================================================================
    if (acao === "sincronizar") {
      // confirma entradas feitas fora do Hub: para cada aprovada, consulta a nota no WebSac
      const { data: abertas } = await db.from("recebimentos").select("id, chave").eq("store_id", storeId).in("estado", ["APROVADA", "APROVADA_COM_RESSALVA", "ENTRADA_PENDENTE_SUPERVISOR"]).limit(50);
      let confirmadas = 0;
      for (const r of abertas ?? []) {
        const nfe = (await rel(storeId, "nfe_recebida_por_chave", { chave: r.chave }))[0];
        if (nfe?.idnotafiscal_entrada) {
          await db.from("recebimentos").update({ estado: "ENTRADA_CONFIRMADA", idnotafiscal_entrada: Number(nfe.idnotafiscal_entrada), entrada_confirmada_em: new Date().toISOString() }).eq("id", r.id);
          await evento(r.id, "ENTRADA_CONFIRMADA", { idnotafiscal: nfe.idnotafiscal_entrada, dtentrada: nfe.dtentrada });
          confirmadas++;
        }
      }
      return json({ verificadas: abertas?.length ?? 0, confirmadas });
    }

    return json({ erro: `ação desconhecida: ${acao}` }, 400);
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 500);
  }
});
