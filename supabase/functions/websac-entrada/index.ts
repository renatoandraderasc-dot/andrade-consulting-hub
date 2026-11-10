// supabase/functions/websac-entrada/index.ts
// Andrade Hub — ENTRADA AUTOMÁTICA da NF-e no WebSac (Cliente Nascimento)
//
// Reproduz, na mesma sessão PHP, a sequência que a tela "Comercial › Compras › Importação de XML"
// executa quando o usuário importa uma NF-e do Manifesto e clica em Gravar (mapeada em 21/09/2026
// a partir de js/form/importarnotafiscal.js e notafiscaleletronicaestabelecimento.php):
//
//   1. POST ajax/verificarnfevalida.php                                   {chavenfe, codestabelec}
//   2. GET  ajax/importarnotafiscal_notafiscaleletronica_carregarxml.php  {idnfeestabelec, tipoqtdenfe:'E'}
//        (ou {codestabelec, tipoqtdenfe, numpedido, arquivo:<chave>})     → HTML+script que preenche o form
//   3. GET  ajax/importarnotafiscal_notafiscaleletronica_verificarpedido.php {codestabelec, numpedido}
//   4. GET  ajax/importarnotafiscal_divergencia_verificar.php             {codestabelec, numpedido}
//   5. GET  ajax/importarnotafiscal_notafiscaleletronica_gravarxml.php    {codestabelec}   (variação de custo)
//   6. GET  ajax/importarnotafiscal_gravarxml_alerta.php                  {codestabelec}   (alertas, texto)
//   7. POST ajax/importarnotafiscal_gravar.php   campos do #div_principal + numpedido + gerarnota + observacao
//        → resposta contém posgravacao(<idnotafiscal>, ...)
//
// Chamada: POST { store_id, recebimento_id, modo: "ensaio" | "gravar" }
//   ensaio → executa 1–6, devolve o formulário que o WebSac montou e PARA (nada é gravado).
//   gravar → executa 1–7 e grava; exige recebimento sem BLOQUEIO/PENDENTE e avisos com ciente.
//   Divergência que o WebSac exige supervisor ou custo acima do parâmetro com bloqueio → não grava,
//   estado ENTRADA_PENDENTE_SUPERVISOR com o motivo devolvido pelo WebSac.
//
// verify_jwt = false (valida o JWT do usuário manualmente). Segredo: mesmo api_key "usuario:senha"
// de store_vr_config usado pelo websac-proxy. Usar de preferência um usuário WebSac próprio ("hub").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consultarRelatorioLoja } from "../_shared/consultaLoja.ts";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UA = "Mozilla/5.0 (compatible; AndradeHub/1.0)";

// ---------- sessão WebSac (igual ao websac-proxy) ----------
async function loginWebSac(base: string, usuario: string, senha: string): Promise<string> {
  const pre = await fetch(`${base}/v3/login`, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60000) });
  let cookie = (pre.headers.get("set-cookie") ?? "").split(",").map((c) => c.split(";")[0].trim()).filter((c) => c.includes("=")).join("; ");
  await pre.text();
  const r = await fetch(`${base}/v3/ajax/view/login/entrar.php`, {
    method: "POST",
    headers: { "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams({ login: usuario, senha }).toString(),
    signal: AbortSignal.timeout(60000),
  });
  const novo = (r.headers.get("set-cookie") ?? "").split(",").map((c) => c.split(";")[0].trim()).filter((c) => c.includes("=")).join("; ");
  if (novo) cookie = novo;
  const txt = (await r.text()).slice(0, 300);
  if (!/"status"\s*:\s*"?0/.test(txt)) throw new Error(`falha no login WebSac: ${txt}`);
  if (!cookie) throw new Error("WebSac não devolveu sessão");
  return cookie;
}

async function ws(base: string, cookie: string, path: string, params: Record<string, string>, method: "GET" | "POST" = "GET"): Promise<string> {
  const qs = new URLSearchParams(params).toString();
  const url = method === "GET" ? `${base}/ajax/${path}?${qs}` : `${base}/ajax/${path}`;
  const r = await fetch(url, {
    method,
    headers: { "X-Requested-With": "XMLHttpRequest", "User-Agent": UA, Cookie: cookie, Referer: `${base}/form/importarnotafiscal.php?tipo=nfe`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: method === "POST" ? qs : undefined,
    signal: AbortSignal.timeout(120000),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}: ${t.slice(0, 200)}`);
  return t;
}

function extrairCampos(html: string): Record<string, string> {
  const campos: Record<string, string> = {};
  const pats = [
    /\$\(\s*["']#([a-zA-Z0-9_\-]+)["']\s*\)\.val\(\s*["']([^"']*)["']\s*\)/g,          // $("#id").val("x")
    /\$\(\s*["']#([a-zA-Z0-9_\-]+)["']\s*\)\.val\(\s*([0-9.\-]+)\s*\)/g,                  // $("#id").val(12.5)
    /\$\(\s*["']#([a-zA-Z0-9_\-]+)["']\s*\)\.changeValue\(\s*["']([^"']*)["']/g,          // $("#id").changeValue("x")
    /<(?:input|select)[^>]*\bid=["']([a-zA-Z0-9_\-]+)["'][^>]*\bvalue=["']([^"']*)["']/g,  // <input id value>
  ];
  for (const re of pats) for (const m of html.matchAll(re)) if (!(m[1] in campos)) campos[m[1]] = m[2];
  return campos;
}
// Avisos que a tela mostra em $.messageBox({type:"alert", text:`...`}) (ex.: variação de custo por item)
function alertasDe(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/messageBox\(\s*\{[\s\S]*?text\s*:\s*(`([\s\S]*?)`|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g)) {
    const raw = m[2] ?? m[3] ?? m[4] ?? "";
    out.push(raw.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  }
  return out;
}
const textoDe = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

// Campos que a tela envia no Gravar (ids do #div_principal, lidos da tela em 21/09/2026) + ped_numpedido
const CAMPOS_GRAVAR = [
  "arqxmlnfe","chavenfe","tipoevento","totalbaseicmsnaoaproveitavel","totalicmsnaoaproveitavel","basecalculosubstretido",
  "valoricmssubstretido","valoricmssubstituto","idnfeestabelec","numnotafiscusto","fornecedor-custobonificado","operacao-interestadual",
  "numnotafis","serie","bonificacao","codestabelec","operacao","tipoparceiro","codparceiro","desc_codparceiro","natoperacao",
  "codcondpagto","codespecie","codfunc","desc_codfunc","dtemissao","dtentrega","codsituacaodocumento","codtransp","modfrete",
  "transpplacavei","transpufvei","totalbruto","totaldesconto","totalacrescimo","totalfrete","totalseguro","totalipi","totalbaseicms",
  "totalicms","totalbaseicmssubst","totalicmssubst","totalliquido","totalbonificado","totalbasepis","totalpis","totalbasecofins",
  "totalcofins","basecalculofcpst","valorfcpst","totaldesoneracao","totalbaseibs","totalibs","totalbasecbs","totalcbs",
];
const OBRIGATORIOS = ["natoperacao", "codcondpagto", "codespecie", "dtentrega", "modfrete"]; // mesmos que gravardados_1 valida

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const auth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return json({ erro: "não autenticado" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ erro: "JSON inválido" }, 400); }
  const storeId = String(body.store_id ?? ""), rid = String(body.recebimento_id ?? "");
  const modo = body.modo === "gravar" ? "gravar" : "ensaio";
  if (!storeId || !rid) return json({ erro: "store_id e recebimento_id obrigatórios" }, 400);

  // mesma regra de tem_acesso_loja(): admin global ou acesso aprovado à loja
  const { data: papeis } = await db.from("user_roles").select("role").eq("user_id", user.id);
  const ehAdmin = (papeis ?? []).some((p) => p.role === "admin");
  if (!ehAdmin) {
    const { data: acesso } = await db.from("user_store_access").select("id").eq("user_id", user.id).eq("store_id", storeId).eq("approved", true).maybeSingle();
    if (!acesso) return json({ erro: "sem acesso à loja" }, 403);
  }
  const { data: cfg } = await db.from("store_vr_config").select("api_url, api_key, codigo_loja, sistema").eq("store_id", storeId).single();
  if (!cfg || (cfg.sistema ?? "").toUpperCase() !== "WEBSAC") return json({ erro: "loja não é WebSac" }, 400);
  const { data: rec } = await db.from("recebimentos").select("*").eq("id", rid).eq("store_id", storeId).single();
  if (!rec) return json({ erro: "recebimento não encontrado" }, 404);

  const evento = (ev: string, detalhe?: unknown) => db.from("recebimento_eventos").insert({ recebimento_id: rid, evento: ev, detalhe, usuario_id: user.id });

  // pré-condições (só para gravar)
  if (modo === "gravar") {
    if (rec.estado === "ENTRADA_CONFIRMADA" || rec.idnotafiscal_entrada) return json({ erro: "esta nota já deu entrada", idnotafiscal: rec.idnotafiscal_entrada }, 409);
    if (!["APROVADA", "APROVADA_COM_RESSALVA", "ENTRADA_PENDENTE_SUPERVISOR"].includes(rec.estado)) return json({ erro: `recebimento em ${rec.estado} — aprove antes de dar entrada` }, 409);
    const { data: crits } = await db.from("recebimento_criterios").select("*").eq("recebimento_id", rid);
    const bloq = (crits ?? []).find((c) => c.resultado === "BLOQUEIO"); if (bloq) return json({ erro: `critério ${bloq.criterio} (${bloq.nome}) bloqueia a entrada` }, 409);
    const pend = (crits ?? []).find((c) => c.resultado === "PENDENTE"); if (pend) return json({ erro: `critério ${pend.criterio} (${pend.nome}) ainda não avaliado` }, 409);
    const semCiente = (crits ?? []).filter((c) => c.resultado === "AVISO" && !c.ciente_por);
    if (semCiente.length) return json({ erro: `avisos sem ciente: ${semCiente.map((c) => c.nome).join(", ")}` }, 409);
    if (!rec.numpedido) return json({ erro: "recebimento sem pedido — crie/vincule o pedido antes" }, 409);
  }

  const base = String(cfg.api_url).replace(/\/+$/, "");
  // credenciais: api_key "usuario:senha" da loja ou, na falta, os segredos do websac-proxy
  let usuario = Deno.env.get("WEBSAC_USERNAME") ?? "", senha = Deno.env.get("WEBSAC_PASSWORD") ?? "";
  if (String(cfg.api_key ?? "").includes(":")) { const [u, ...rest] = String(cfg.api_key).split(":"); usuario = u; senha = rest.join(":"); }
  if (!usuario || !senha) return json({ erro: "sem usuário/senha do WebSac para esta loja (api_key usuario:senha)" }, 400);
  const codestabelec = String(cfg.codigo_loja);
  const log: Record<string, unknown>[] = [];

  try {
    const cookie = await loginWebSac(base, usuario, senha);

    // 1. chave válida para o estabelecimento
    const v = await ws(base, cookie, "verificarnfevalida.php", { chavenfe: rec.chave, codestabelec }, "POST");
    log.push({ passo: 1, resp: v.slice(0, 300) });
    let vj: { ok?: boolean; msg?: string } = {}; try { vj = JSON.parse(v); } catch { /* html */ }
    if (vj.ok === false) { await evento("ENTRADA_RECUSADA", { passo: 1, msg: vj.msg }); return json({ erro: `WebSac: ${vj.msg}`, log }, 409); }

    // 2. carrega o XML na sessão e monta o formulário
    const h2 = rec.idnfeestabelec
      ? await ws(base, cookie, "importarnotafiscal_notafiscaleletronica_carregarxml.php", { idnfeestabelec: String(rec.idnfeestabelec), tipoqtdenfe: "E" })
      : await ws(base, cookie, "importarnotafiscal_notafiscaleletronica_carregarxml.php", { codestabelec, tipoqtdenfe: "E", numpedido: String(rec.numpedido ?? ""), arquivo: rec.chave });
    const form = extrairCampos(h2);
    const msg2 = textoDe(h2).slice(0, 400);
    const alertas2 = alertasDe(h2); // ex.: "custo informado ultrapassa a variação" — a tela só avisa e segue
    log.push({ passo: 2, campos: Object.keys(form).length, texto: msg2, alertas: alertas2 });
    if (/messageBox\(\s*\{[^}]*type\s*:\s*["']error/.test(h2)) { await evento("ENTRADA_RECUSADA", { passo: 2, msg: msg2 }); return json({ erro: `WebSac ao carregar XML: ${msg2}`, log }, 409); }
    form.codestabelec ||= codestabelec;
    form.chavenfe ||= rec.chave;
    if (rec.idnfeestabelec) form.idnfeestabelec ||= String(rec.idnfeestabelec);
    if (!form.dtentrega) form.dtentrega = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

    // 3. vincula o pedido
    if (rec.numpedido) {
      const h3 = await ws(base, cookie, "importarnotafiscal_notafiscaleletronica_verificarpedido.php", { codestabelec, numpedido: String(rec.numpedido) });
      Object.assign(form, extrairCampos(h3)); // pode preencher condpagto/natoperacao a partir do pedido
      log.push({ passo: 3, texto: textoDe(h3).slice(0, 300) });
      // 4. divergência nota × pedido
      const h4 = await ws(base, cookie, "importarnotafiscal_divergencia_verificar.php", { codestabelec, numpedido: String(rec.numpedido) });
      const t4 = textoDe(h4); log.push({ passo: 4, texto: t4.slice(0, 400) });
      if (/diverg/i.test(t4) && !/gravardados\(\)/.test(h4)) {
        await db.from("recebimentos").update({ estado: "ENTRADA_PENDENTE_SUPERVISOR", justificativa: `WebSac: divergência nota × pedido — ${t4.slice(0, 300)}` }).eq("id", rid);
        await evento("ENTRADA_PENDENTE_SUPERVISOR", { passo: 4, texto: t4.slice(0, 600) });
        return json({ estado: "ENTRADA_PENDENTE_SUPERVISOR", motivo: t4.slice(0, 600), log }, 409);
      }
    }

    // obrigatórios (mesma regra da tela). Sem pedido, o WebSac deixa natureza/condição/espécie em branco:
    // preenche com os valores da última entrada deste fornecedor nesta loja (igual o operador faria).
    let preenchidoPelaUltima: string[] = [];
    if (OBRIGATORIOS.some((k) => !form[k]) && rec.codfornec) {
      const u = await consultarRelatorioLoja({ supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, storeId, relatorio: "ultima_entrada_fornecedor", params: { codfornec: rec.codfornec }, timeoutMs: 60000 });
      const ult = (u.ok && u.dados?.[0]) ? u.dados[0] as Record<string, unknown> : null;
      if (ult) {
        for (const k of ["natoperacao", "codcondpagto", "codespecie", "modfrete", "codfunc"]) {
          if (!form[k] && ult[k] != null && String(ult[k]) !== "") { form[k] = String(ult[k]); preenchidoPelaUltima.push(k); }
        }
        log.push({ passo: "3b", ultima_entrada: ult.idnotafiscal, preenchido: preenchidoPelaUltima });
      }
    }
    const faltando = OBRIGATORIOS.filter((k) => !form[k]);
    if (faltando.length) { await evento("ENTRADA_RECUSADA", { motivo: "campos obrigatórios", faltando }); return json({ erro: `WebSac não preencheu: ${faltando.join(", ")} — cadastro do fornecedor/pedido incompleto`, form, log }, 409); }

    // 5. variação de custo
    const h5 = await ws(base, cookie, "importarnotafiscal_notafiscaleletronica_gravarxml.php", { codestabelec });
    const t5 = textoDe(h5); log.push({ passo: 5, texto: t5.slice(0, 400) });
    if (t5.length > 0 && /bloque/i.test(t5)) {
      await db.from("recebimentos").update({ estado: "ENTRADA_PENDENTE_SUPERVISOR", justificativa: `WebSac: variação de custo — ${t5.slice(0, 300)}` }).eq("id", rid);
      await evento("ENTRADA_PENDENTE_SUPERVISOR", { passo: 5, texto: t5.slice(0, 600) });
      return json({ estado: "ENTRADA_PENDENTE_SUPERVISOR", motivo: t5.slice(0, 600), log }, 409);
    }
    // 6. alertas (a tela pergunta "Sim/Não"; o Hub responde Sim e registra o texto)
    const h6 = await ws(base, cookie, "importarnotafiscal_gravarxml_alerta.php", { codestabelec });
    const t6 = textoDe(h6); log.push({ passo: 6, alerta: t6.slice(0, 400) });

    if (modo === "ensaio") {
      await evento("ENSAIO_ENTRADA", { form, alertas_xml: alertas2, alerta: t6.slice(0, 400), custo: t5.slice(0, 400), preenchido_pela_ultima_entrada: preenchidoPelaUltima });
      return json({ modo, ok: true, form, alertas_xml: alertas2, alerta_websac: t6, variacao_custo: t5, preenchido_pela_ultima_entrada: preenchidoPelaUltima, log, mensagem: "Ensaio concluído — nada foi gravado." });
    }

    // 7. GRAVAR — trava para nunca enviar a mesma nota duas vezes (duplo clique / duas abas)
    const limite = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: trava } = await db.from("recebimentos").update({ entrada_iniciada_em: new Date().toISOString() })
      .eq("id", rid).is("idnotafiscal_entrada", null).or(`entrada_iniciada_em.is.null,entrada_iniciada_em.lt.${limite}`).select("id");
    if (!trava?.length) return json({ erro: "já existe uma entrada em andamento para esta nota — aguarde e use Atualizar status", log }, 409);
    const payload: Record<string, string> = {};
    for (const k of CAMPOS_GRAVAR) payload[k] = form[k] ?? "";
    payload.numpedido = String(rec.numpedido ?? "");
    payload.gerarnota = "S";
    payload.observacao = `Entrada automática pelo Hub — recebimento ${rid.slice(0, 8)} por ${user.email ?? user.id} em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
    log.push({ passo: 7, enviado: true }); // a partir daqui a trava NÃO é liberada em caso de erro/timeout
    const h7 = await ws(base, cookie, "importarnotafiscal_gravar.php", payload, "POST");
    const t7 = textoDe(h7); log.push({ passo: 7, texto: t7.slice(0, 400) });
    const m = h7.match(/posgravacao\(\s*(\d+)/);
    if (!m) {
      // sem confirmação não dá para saber se o WebSac gravou: a trava fica por 10 min e o
      // "Atualizar status" (sincronizar) confere em notafiscal antes de qualquer nova tentativa
      await evento("ENTRADA_FALHOU", { passo: 7, texto: t7.slice(0, 800) });
      return json({ erro: `WebSac não confirmou a gravação: ${t7.slice(0, 300)}. Use "Atualizar status" antes de tentar de novo.`, log }, 502);
    }
    const idnotafiscal = Number(m[1]);
    await db.from("recebimentos").update({ estado: "ENTRADA_CONFIRMADA", idnotafiscal_entrada: idnotafiscal, entrada_confirmada_em: new Date().toISOString(), liberado_por: user.id, liberado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq("id", rid);
    await evento("ENTRADA_CONFIRMADA", { idnotafiscal, alertas_xml: alertas2, alerta: t6.slice(0, 300), preenchido_pela_ultima_entrada: preenchidoPelaUltima });
    return json({ estado: "ENTRADA_CONFIRMADA", idnotafiscal, log });
  } catch (e) {
    await evento("ENTRADA_ERRO", { erro: String((e as Error).message ?? e), log });
    // erro antes do passo 7 não gravou nada: libera a trava (o passo 7 só roda depois dela)
    if (!log.some((l) => l.passo === 7)) await db.from("recebimentos").update({ entrada_iniciada_em: null }).eq("id", rid).is("idnotafiscal_entrada", null);
    return json({ erro: String((e as Error).message ?? e), log }, 500);
  }
});
