type Item = { seq_xml: number | null; codproduto: number | null; ean: string | null; descricao_produto: string | null; descricao_xml: string | null; eans_cadastro: string | null; cprod?: string | null; ref_cadastro?: string | null; qtd_unidades: number | null };
type Contagem = { codproduto: number | null; ean: string | null; descricao: string | null; qtd_contada: number | null };
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
export function conferirItens(itens: Item[], cont: Contagem[], toleranciaQtd: number) {
      // casa por código de produto OU por EAN (o que existir dos dois lados)
      const eanN = (v: unknown) => String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
      const contagem = cont.map((c) => ({ ...c, _usado: false }));
      const resultado = itens.map((it) => {
        const casa = contagem.filter((c) => !c._usado && ((it.codproduto && c.codproduto && Number(c.codproduto) === Number(it.codproduto)) || (it.ean && c.ean && eanN(c.ean) === eanN(it.ean))));
        casa.forEach((c) => { c._usado = true; });
        const contada = casa.reduce((s, c) => s + num(c.qtd_contada), 0); const nota = num(it.qtd_unidades);
        const tol = nota * toleranciaQtd / 100;
        const situacao = !casa.length ? "NAO_CONTADO" : Math.abs(contada - nota) <= tol ? "OK" : contada < nota ? "FALTA" : "SOBRA";
        return { seq: it.seq_xml, codproduto: it.codproduto, ean: it.ean, descricao: it.descricao_produto ?? it.descricao_xml, descricao_nota: it.descricao_xml, descricao_sistema: it.descricao_produto, eans_cadastro: it.eans_cadastro, ref_nota: it.cprod ?? null, ref_cadastro: it.ref_cadastro ?? null, qtd_nota: nota, qtd_contada: contada, diferenca: contada - nota, situacao };
      });
      const sobras = new Map<string, { c: typeof contagem[number]; q: number }>();
      for (const c of contagem) if (!c._usado) { const k = c.codproduto ? `p:${c.codproduto}` : `e:${eanN(c.ean)}`; const s = sobras.get(k); if (s) s.q += num(c.qtd_contada); else sobras.set(k, { c, q: num(c.qtd_contada) }); }
      for (const { c, q } of sobras.values()) resultado.push({ seq: null, codproduto: c.codproduto, ean: c.ean, descricao: c.descricao, descricao_nota: null, descricao_sistema: c.descricao, eans_cadastro: null, ref_nota: null, ref_cadastro: null, qtd_nota: 0, qtd_contada: q, diferenca: q, situacao: "FORA_DA_NOTA" });
      return resultado;
}
