import CryptoJS from "https://esm.sh/crypto-js@4.2.0";
import LZString from "https://esm.sh/lz-string@1.5.0";

const BASE_SITE = "https://www.vivencisupermercado.com.br";
const BASE_API  = "https://apiecommerce.regexsolutions.com.br/ecommerce";

// Divino I. Categoria 16390 = Queijos e Frios (produtos com marca/EAN,
// bons pra ver se o EAN está no payload).
const FILIAL_ID = 25;
const CATEGORIA = 16390;

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

async function extrairSenha(): Promise<string> {
  const html = await fetch(BASE_SITE + "/", {
    headers: { "User-Agent": UA, "Accept": "text/html" },
  }).then(r => r.text());

  const m = html.match(/id="ng-state"[^>]*>([^<]+)</);
  if (!m) throw new Error("ng-state nao encontrado no HTML");
  const state = JSON.parse(m[1]);

  for (const [k, v] of Object.entries(state)) {
    if (typeof v !== "string" || k.length > 30) continue;
    if (LZString.decompressFromBase64(k) === "desconto") {
      const senha = LZString.decompressFromBase64(v as string);
      if (senha) return senha;
    }
  }
  throw new Error("chave 'desconto' nao achada no ng-state");
}

function acharArrayProdutos(obj: any, caminho = "$"): { path: string; arr: any[] } | null {
  if (Array.isArray(obj)) return { path: caminho, arr: obj };
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const r = acharArrayProdutos(v, `${caminho}.${k}`);
      if (r) return r;
    }
  }
  return null;
}

function candidatosEan(obj: any, caminho: string, acc: {path: string, val: string}[]) {
  if (obj == null) return;
  if (typeof obj === "string" || typeof obj === "number") {
    const s = String(obj);
    if (/^\d{13}$/.test(s) || /^\d{12}$/.test(s) || /^\d{8}$/.test(s)) {
      acc.push({ path: caminho, val: s });
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => candidatosEan(v, `${caminho}[${i}]`, acc));
  } else if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) candidatosEan(v, `${caminho}.${k}`, acc);
  }
}

Deno.serve(async (_req) => {
  try {
    const senha = await extrairSenha();

    const body = {
      filialId: FILIAL_ID,
      page: 0,
      perPage: 3,
      ordenacao: 0,
      tokenPaginaAtual: "",
      categoriaId: CATEGORIA,
    };

    const apiResp = await fetch(BASE_API + "/produto/lista", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": BASE_SITE,
        "Referer": BASE_SITE + "/",
        "User-Agent": UA,
      },
      body: JSON.stringify(body),
    });

    const status = apiResp.status;
    const jr = await apiResp.json();

    if (!jr.encrypted) {
      return new Response(JSON.stringify({
        etapa: "resposta_sem_encrypted",
        status,
        respostaCrua: jr,
      }, null, 2), { headers: { "Content-Type": "application/json" }});
    }

    const bin = atob(jr.encrypted);
    const plain = CryptoJS.AES.decrypt(bin, senha).toString(CryptoJS.enc.Utf8);
    if (!plain) throw new Error("decrypt vazio - senha errada?");
    const payload = JSON.parse(plain);

    const arr = acharArrayProdutos(payload);
    const eans: {path: string, val: string}[] = [];
    if (arr && arr.arr.length) {
      arr.arr.slice(0, 3).forEach((p, i) => candidatosEan(p, `p[${i}]`, eans));
    }

    return new Response(JSON.stringify({
      ok: true,
      senhaLen: senha.length,
      apiStatus: status,
      payloadRootKeys: Object.keys(payload),
      caminhoArrayProdutos: arr?.path,
      qtdProdutos: arr?.arr.length,
      primeirosCampos: arr && arr.arr[0] ? Object.keys(arr.arr[0]) : null,
      primeiroProduto: arr?.arr[0],
      candidatosEan: eans.length ? eans : "(nenhum 13/12/8 digitos achado)",
    }, null, 2), { headers: { "Content-Type": "application/json" }});
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      erro: String(e && e.message || e),
      stack: e?.stack,
    }, null, 2), { status: 500, headers: { "Content-Type": "application/json" }});
  }
});
