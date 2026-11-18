import { describe, it, expect } from "vitest";
import {
  dimensionar, montarCurva, planejarSetor, fracaoAberta, setorDoErp, origemDoSetor, lerSetor, siglaSetor,
  type HorarioSemana, type LinhaVenda, type MarcoDim,
} from "./dimensionamento";
import { duracaoLiquidaTurno, sugerirJornadaDiaria } from "./escala-motor";

const MARCOS: MarcoDim[] = [
  { rotulo: "44h", horas_semanais: 44, folgas_semanais: 1 },
  { rotulo: "42h", horas_semanais: 42, folgas_semanais: 2 },
  { rotulo: "40h", horas_semanais: 40, folgas_semanais: 2 },
];
// loja aberta 07–21 todos os dias = 98h por semana
const SETE_DIAS: HorarioSemana = Array.from({ length: 7 }, () => ({ abre: "07:00", fecha: "21:00" }));
const soma = (g: number[][]) => g.flat().reduce((a, b) => a + b, 0);

/** 4 semanas de venda: sábado forte, pico às 11h e às 18h. */
function vendas(): LinhaVenda[] {
  const out: LinhaVenda[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(Date.UTC(2026, 9, 5 + i, 12)); // 05/10/2026 é segunda
    const data = d.toISOString().slice(0, 10);
    const fator = d.getUTCDay() === 6 ? 2 : d.getUTCDay() === 0 ? 0.8 : 1;
    for (let h = 7; h < 21; h++) {
      const pico = h === 11 || h === 18 ? 3 : 1;
      out.push({ data, hora: h, departamento: "ACOUGUE", valor: 100 * fator * pico });
      out.push({ data, hora: h, departamento: "MERCEARIA SECA", valor: 400 * fator * pico });
    }
  }
  return out;
}

describe("horário de funcionamento", () => {
  it("conta fração de hora e dia fechado", () => {
    const f = fracaoAberta({ abre: "07:30", fecha: "13:00" });
    expect(f[7]).toBe(0.5);
    expect(f[12]).toBe(1);
    expect(f[13]).toBe(0);
    expect(fracaoAberta({ abre: null, fecha: null }).every((v) => v === 0)).toBe(true);
  });
});

describe("curva de vendas", () => {
  it("faz média por dia da semana e separa setores conhecidos", () => {
    const c = montarCurva(vendas());
    expect(c.dias).toBe(28);
    expect(c.amostras).toEqual([4, 4, 4, 4, 4, 4, 4]);
    expect(c.porSetor["Açougue"][6][11]).toBeCloseTo(600); // sábado 11h: 100 × 2 × 3
    expect(c.loja[1][8]).toBeCloseTo(500); // segunda 8h: açougue 100 + mercearia 400
    expect(Object.keys(c.porSetor)).toEqual(["Açougue"]);
  });
  it("mapeia nomes do ERP e define a origem da curva", () => {
    expect(setorDoErp("Açougue / Peixaria")).toBe("Açougue");
    expect(setorDoErp("PAD PRODUT TERCEIROS")).toBe("Padaria");
    expect(setorDoErp("BAZAR")).toBeNull();
    const c = montarCurva(vendas());
    expect(origemDoSetor("Açougue", c)).toBe("proprio");
    expect(origemDoSetor("Padaria", c)).toBe("loja"); // sem venda própria na amostra
    expect(origemDoSetor("Frente de Caixa", c)).toBe("loja");
    expect(origemDoSetor("Administrativo", c)).toBe("uniforme");
    expect(origemDoSetor("Açougue", null)).toBe("uniforme");
  });
});

describe("necessidade de quadro", () => {
  it("mantém o nível atual: 10 pessoas em 44h viram 11 em 42h e 11 em 40h", () => {
    const r = dimensionar([{ departamento: "Frente de Caixa", quantidade: 10 }], SETE_DIAS, montarCurva(vendas()), { horas_referencia: 44, marcos: MARCOS });
    const s = r.setores[0];
    expect(s.demanda_horas).toBeCloseTo(10 * 44 * 0.9);
    expect(soma(s.postos)).toBeCloseTo(s.demanda_horas);
    expect(s.marcos.map((m) => m.necessario)).toEqual([10, 11, 11]);
    expect(s.marcos.map((m) => m.diferenca)).toEqual([0, 1, 1]);
    expect(s.marcos[1].falta_pessoas).toBeCloseTo(10 * 44 / 42 - 10);
    expect(s.marcos[1].falta_horas).toBeCloseTo(10 * 2 * 0.9); // 2h a menos por pessoa, já sem a reserva
    expect(r.totais[1]).toMatchObject({ quadro: 10, necessario: 11, contratar: 1, contratar_por_setor: 1 });
  });

  it("o mínimo por hora aberta exige 3 pessoas num setor que hoje tem 1", () => {
    const r = dimensionar([{ departamento: "Açougue", quantidade: 1, minimo: 1 }], SETE_DIAS, null, { horas_referencia: 44, marcos: MARCOS });
    const s = r.setores[0];
    expect(s.piso_domina).toBe(true);
    expect(s.demanda_horas).toBeCloseTo(98);
    expect(s.marcos[1].necessario).toBe(3); // 98 ÷ (42 × 0,9) = 2,6
    expect(lerSetor(s, 1)).toContain("faltam 60h por semana, o mesmo que 1,6 pessoa");
    expect(lerSetor(s, 1)).toContain("mínimo de 1 por hora aberta");
  });

  it("nunca coloca posto fora do horário e respeita o mínimo dentro dele", () => {
    const horario: HorarioSemana = SETE_DIAS.map((d, i) => (i === 0 ? { abre: "08:00", fecha: "13:00" } : d));
    const s = dimensionar([{ departamento: "Açougue", quantidade: 6, minimo: 1 }], horario, montarCurva(vendas()), { horas_referencia: 44, marcos: MARCOS }).setores[0];
    expect(s.postos[0][7]).toBe(0);
    expect(s.postos[0][13]).toBe(0);
    expect(s.postos[1][6]).toBe(0);
    for (let h = 8; h < 13; h++) expect(s.postos[0][h]).toBeGreaterThanOrEqual(1);
    // sábado 11h é o ponto de maior movimento
    expect(s.postos[6][11]).toBe(Math.max(...s.postos.flat()));
    expect(s.aperto).toMatchObject({ dia_semana: 6 });
  });

  it("meta de produtividade pode apontar sobra", () => {
    const c = montarCurva(vendas());
    const base = dimensionar([{ departamento: "Açougue", quantidade: 8 }], SETE_DIAS, c, { horas_referencia: 44, marcos: MARCOS }).setores[0];
    expect(base.produtividade_atual).toBeGreaterThan(0);
    const alvo = dimensionar([{ departamento: "Açougue", quantidade: 8, venda_por_pessoa_hora_alvo: base.produtividade_atual! * 2 }], SETE_DIAS, c, { horas_referencia: 44, marcos: MARCOS }).setores[0];
    expect(alvo.marcos[0].diferenca).toBeLessThan(0);
    expect(lerSetor(alvo, 0)).toContain("folga");
  });

  it("o total não soma um arredondamento por setor: 7 setores perdendo 5% pedem 2 pessoas, não 7", () => {
    const setores = ["Frente de Caixa", "Açougue", "Padaria", "Hortifruti", "Mercearia", "Reposição", "Recebimento"].map((departamento) => ({ departamento, quantidade: 5, minimo: 0 }));
    const t = dimensionar(setores, SETE_DIAS, montarCurva(vendas()), { horas_referencia: 44, marcos: MARCOS }).totais[1];
    expect(t.necessario_exato).toBeCloseTo(35 * 44 / 42);
    expect(t.contratar).toBe(2);
    expect(t.contratar_por_setor).toBe(7);
  });

  it("setor sem ninguém não gera demanda nem erro", () => {
    const r = dimensionar([{ departamento: "Frios", quantidade: 0 }, { departamento: "  ", quantidade: 3 }], SETE_DIAS, null, { horas_referencia: 44, marcos: MARCOS });
    expect(r.setores).toHaveLength(1);
    expect(r.setores[0].marcos.every((m) => m.necessario === 0)).toBe(true);
  });

  it("pico concentrado não vira posto impossível: escorre para as outras horas", () => {
    // toda a venda numa única hora da semana
    const linhas: LinhaVenda[] = [{ data: "2026-10-10", hora: 11, departamento: "ACOUGUE", valor: 1000 }];
    const s = dimensionar([{ departamento: "Açougue", quantidade: 4, minimo: 0 }], SETE_DIAS, montarCurva(linhas), { horas_referencia: 44, marcos: MARCOS }).setores[0];
    expect(Math.max(...s.postos.flat())).toBeLessThanOrEqual(4);
    expect(soma(s.postos)).toBeCloseTo(4 * 44 * 0.9);
    expect(s.marcos.map((m) => m.necessario)).toEqual([4, 5, 5]);
  });
});

describe("turnos e cobertura para o gerador", () => {
  const curva = montarCurva(vendas());
  const setor = (q: number) => dimensionar([{ departamento: "Frente de Caixa", quantidade: q }], SETE_DIAS, curva, { horas_referencia: 44, marcos: MARCOS }).setores[0];

  it("gera turnos dentro do horário, com a jornada do marco, somando o quadro", () => {
    const p = planejarSetor(setor(10), SETE_DIAS, MARCOS[1]);
    expect(p.turnos.map((t) => t.codigo)).toEqual(["FC-A", "FC-I", "FC-F"]);
    expect(p.turnos.reduce((a, t) => a + t.pessoas, 0)).toBe(10);
    for (const t of p.turnos) {
      expect(t.inicio >= "07:00" && t.fim <= "21:00").toBe(true);
      expect(duracaoLiquidaTurno({ id: "x", codigo: t.codigo, inicio: t.inicio, fim: t.fim, intervalo_min: t.intervalo_min })).toBe(sugerirJornadaDiaria(42, 2));
    }
    expect(p.turnos[0].inicio).toBe("07:00");
    expect(p.turnos[2].fim).toBe("21:00");
  });

  it("cobertura cabe no quadro: soma dos dias ≤ pessoas × dias trabalhados", () => {
    const p = planejarSetor(setor(10), SETE_DIAS, MARCOS[1]);
    expect(p.cobertura).toHaveLength(7);
    const total = p.cobertura.reduce((a, c) => a + c.minimo, 0);
    expect(total).toBeLessThanOrEqual(10 * 5);
    expect(total).toBe(45); // 10 × 5 × 0,9
    const sab = p.cobertura.find((c) => c.dia_semana === 6)!.minimo;
    const seg = p.cobertura.find((c) => c.dia_semana === 1)!.minimo;
    expect(sab).toBeGreaterThan(seg);
    expect(p.cobertura.every((c) => c.minimo <= 10)).toBe(true);
  });

  it("avisa quando 1 pessoa não cobre o dia e quando um dia tem horário diferente", () => {
    const horario: HorarioSemana = SETE_DIAS.map((d, i) => (i === 0 ? { abre: "08:00", fecha: "13:00" } : d));
    const s = dimensionar([{ departamento: "Açougue", quantidade: 1 }], horario, null, { horas_referencia: 44, marcos: MARCOS }).setores[0];
    const p = planejarSetor(s, horario, MARCOS[1]);
    expect(p.turnos).toHaveLength(1);
    expect(p.avisos.join(" ")).toContain("1 pessoa");
    expect(p.avisos.join(" ")).toContain("Domingo");
  });

  it("dia fechado não recebe cobertura", () => {
    const horario: HorarioSemana = SETE_DIAS.map((d, i) => (i === 0 ? { abre: null, fecha: null } : d));
    const s = dimensionar([{ departamento: "Padaria", quantidade: 5 }], horario, null, { horas_referencia: 44, marcos: MARCOS }).setores[0];
    const p = planejarSetor(s, horario, MARCOS[1]);
    expect(p.cobertura.some((c) => c.dia_semana === 0)).toBe(false);
    expect(p.cobertura).toHaveLength(6);
  });

  it("siglas curtas e estáveis", () => {
    expect(siglaSetor("Frente de Caixa")).toBe("FC");
    expect(siglaSetor("Açougue")).toBe("ACO");
    expect(siglaSetor("Prevenção de Perdas")).toBe("PP");
  });
});
