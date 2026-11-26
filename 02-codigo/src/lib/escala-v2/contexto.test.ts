import { describe, expect, it } from "vitest";
import { aplicarPedidos, montarContexto, resumoParaParecer } from "./contexto";
import type { DadosEscalaV2, PessoaRow } from "./dados";
import { feriadosNacionais } from "./leis";
import { REGRAS_PADRAO, gerar } from "./motor";

const P = (id: string, nome: string, setor: string, extra: Partial<PessoaRow> = {}): PessoaRow => ({
  id, store_id: "loja", nome, setor, cargo: null, turno: "auto", folga_fixa: null, carga_semanal: null, nascimento: null, aprendiz: false,
  domingo_quinzenal: false, admissao: null, desligamento: null, ativo: true, ...extra,
});

function dados(): DadosEscalaV2 {
  return {
    storeId: "loja", ano: 2027, mes: 2, podeGerir: true, regras: { ...REGRAS_PADRAO, setores: [{ setor: "Padaria", minimo: 1, antes_min: 120, depois_min: 0 }] }, instrucoes: "",
    pessoas: [P("a", "Maria", "Padaria"), P("b", "João", "Padaria"), P("c", "Pedro", "Padaria"), P("d", "Ana", "Padaria"), P("x", "Saiu em janeiro", "Padaria", { ativo: false, desligamento: "2027-01-20" })],
    ausencias: [], feriados: feriadosNacionais(2027).map(f => ({ ...f, loja_abre: false, origem: "nacional" as const })), mesRow: null,
    dias: [{ pessoa_id: "d", data: "2027-02-10", tipo: "T", inicio: "05:00", fim: "14:24", intervalo_min: 60, travado: true }], historico: [],
  };
}

describe("contexto da Escala V2", () => {
  it("deixa de fora quem saiu antes do mês", () => {
    expect(montarContexto(dados()).pessoas.map(p => p.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("aplica só os pedidos válidos da IA e relata o que ficou de fora", () => {
    const r = aplicarPedidos(dados(), {
      pessoas: [
        { pessoa_id: "a", folga_fixa: 2, folgas_em: ["2027-02-15", "2027-03-01", "15/02/2027"] },
        { pessoa_id: "b", turno: "fechamento" },
        { pessoa_id: "c", turno: "madrugada", folga_fixa: 9 },
        { pessoa_id: "d", folgas_em: ["2027-02-10"] },
        { pessoa_id: "nao-existe", folga_fixa: 1 },
      ],
      pesos_dia: [1, 1, 1, 1, 1, 1.4, 9],
      nao_aplicado: ["O Carlos não está na lista."],
      resumo: "",
    });
    const pessoa = (id: string) => r.ctx.pessoas.find(p => p.id === id)!;
    expect(pessoa("a").folga_fixa).toBe(2);
    expect(pessoa("b").turno).toBe("fechamento");
    expect(pessoa("c").turno).toBe("auto");
    expect(pessoa("c").folga_fixa).toBeNull();
    expect([...r.folgasPedidas]).toEqual(["a|2027-02-15"]);
    expect(r.ctx.regras.pesos_dia[6]).toBe(3); // limitado
    expect(r.aplicados).toHaveLength(4);
    expect(r.ignorados).toHaveLength(7);
    expect(r.ignorados).toContain("O Carlos não está na lista.");
    // o original não é alterado
    expect(montarContexto(dados()).pessoas[0].folga_fixa).toBeNull();
  });

  it("os pedidos chegam à escala gerada e o resumo do parecer não leva dado pessoal além do necessário", () => {
    const d = dados();
    const r = aplicarPedidos(d, { pessoas: [{ pessoa_id: "a", folga_fixa: 2, folgas_em: ["2027-02-15"] }, { pessoa_id: "b", turno: "fechamento" }], nao_aplicado: [], resumo: "" });
    const g = gerar(r.ctx);
    expect(g.validacao.erros).toBe(0);
    expect(g.dias.find(x => x.pessoa_id === "a" && x.data === "2027-02-15")?.tipo).toBe("F");
    // terça é a folga fixa; em 16/02 a lei fala mais alto (folga pedida na segunda + domingo obrigatório) e o gerador avisa
    expect(g.dias.filter(x => x.pessoa_id === "a" && ["2027-02-02", "2027-02-09", "2027-02-23"].includes(x.data)).every(x => x.tipo === "F")).toBe(true);
    expect(g.avisos.some(t => t.startsWith("Maria") && t.includes("16/02"))).toBe(true);
    expect(g.dias.filter(x => x.pessoa_id === "b" && x.tipo === "T" && x.data >= "2027-02-01" && x.data <= "2027-02-06").every(x => x.fim === "22:00")).toBe(true);
    expect(g.dias.find(x => x.pessoa_id === "d" && x.data === "2027-02-10")?.inicio).toBe("05:00");
    const resumo = resumoParaParecer(d, r.ctx, g, r);
    expect(resumo.funcionarios).toBe(4);
    expect(resumo.conferencia_automatica.pendencias_legais).toBe(0);
    expect(JSON.stringify(resumo)).not.toContain("nascimento");
  });

  it("sem resposta da IA, segue com o contexto original", () => {
    const r = aplicarPedidos(dados(), null);
    expect(r.aplicados).toEqual([]);
    expect(r.ctx.pessoas).toHaveLength(4);
  });
});
