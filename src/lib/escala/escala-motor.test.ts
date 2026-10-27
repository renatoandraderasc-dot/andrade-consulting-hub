import { describe, it, expect } from "vitest";
import {
  gerarEscala,
  validarEscala,
  marcoEfetivo,
  diasDoMes,
  dataParaNum,
  numParaData,
  diaSemana,
  sugerirJornadaDiaria,
  type ContextoEscala,
  type Funcionario,
  type Turno,
  type Cobertura,
  type Alocacao,
} from "./escala-motor";

// ---------------------------------------------------------------- cenário: loja de bairro
const turnos: Turno[] = [
  { id: "CXM", codigo: "CX-M", inicio: "07:00", fim: "16:24", intervalo_min: 60 },
  { id: "CXT", codigo: "CX-T", inicio: "13:36", fim: "23:00", intervalo_min: 60 },
  { id: "AC", codigo: "AÇ", inicio: "06:00", fim: "15:24", intervalo_min: 60 },
  { id: "PD", codigo: "PD", inicio: "05:00", fim: "14:24", intervalo_min: 60 },
  { id: "HT", codigo: "HT", inicio: "06:00", fim: "15:24", intervalo_min: 60 },
  { id: "RP", codigo: "RP", inicio: "07:00", fim: "16:24", intervalo_min: 60 },
  { id: "AP", codigo: "APR", inicio: "08:00", fim: "14:15", intervalo_min: 15 },
];

function equipe(): Funcionario[] {
  const f: Funcionario[] = [];
  const add = (prefixo: string, depto: string, turno: string, qtd: number, extra: Partial<Funcionario> = {}) => {
    for (let i = 1; i <= qtd; i++) f.push({ id: `${prefixo}${i}`, nome: `${prefixo}${i}`, departamento: depto, turno_padrao_id: turno, ...extra });
  };
  add("CM", "Frente de Caixa", "CXM", 5);
  add("CT", "Frente de Caixa", "CXT", 5);
  add("AC", "Açougue", "AC", 4);
  add("PD", "Padaria", "PD", 4);
  add("HT", "Hortifruti", "HT", 3);
  add("RP", "Reposição", "RP", 4);
  f.push({ id: "APR1", nome: "APR1", departamento: "Reposição", turno_padrao_id: "AP", aprendiz: true, data_nascimento: "2009-03-10" });
  f.find((x) => x.id === "CM2")!.domingo_quinzenal = true;
  return f;
}

function cobertura(): Cobertura[] {
  const c: Cobertura[] = [];
  for (let d = 0; d < 7; d++) {
    const pico = d === 5 || d === 6;
    c.push({ departamento: "Frente de Caixa", dia_semana: d, turno_id: "CXM", minimo: pico ? 4 : 3 });
    c.push({ departamento: "Frente de Caixa", dia_semana: d, turno_id: "CXT", minimo: pico ? 4 : d === 0 ? 2 : 3 });
    c.push({ departamento: "Açougue", dia_semana: d, turno_id: null, minimo: pico ? 3 : 2 });
    c.push({ departamento: "Padaria", dia_semana: d, turno_id: null, minimo: 2 });
    c.push({ departamento: "Hortifruti", dia_semana: d, turno_id: null, minimo: pico ? 2 : 1 });
    c.push({ departamento: "Reposição", dia_semana: d, turno_id: null, minimo: 2 });
  }
  return c;
}

function base(ano: number, mes: number, extra: Partial<ContextoEscala> = {}): ContextoEscala {
  return { ano, mes, turnos, funcionarios: equipe(), cobertura: cobertura(), ...extra };
}

/** Confere folgas por semana completa (seg-dom) dentro do mês. */
function folgasPorSemana(aloc: Alocacao[], fid: string, ano: number, mes: number) {
  const dias = diasDoMes(ano, mes);
  const st = new Map(aloc.filter((a) => a.funcionario_id === fid).map((a) => [dataParaNum(a.data), a.status]));
  const out: { semana: string; folgas: number }[] = [];
  for (const n of dias) {
    if (diaSemana(n) !== 1) continue;
    if (n + 6 > dias[dias.length - 1]) continue;
    let fo = 0;
    for (let i = 0; i < 7; i++) if (st.get(n + i) === "FOLGA") fo++;
    out.push({ semana: numParaData(n), folgas: fo });
  }
  return out;
}

function imprimir(aloc: Alocacao[], ano: number, mes: number, ids: string[]) {
  const dias = diasDoMes(ano, mes);
  const sigla: Record<string, string> = { TRABALHO: "·", FOLGA: "F", FERIADO: "H", FERIAS: "V", ATESTADO: "A", AFASTADO: "X", FOLGA_COMP: "C" };
  const cab = "      " + dias.map((n) => "DSTQQSS"[diaSemana(n)]).join("");
  const linhas = ids.map((id) => id.padEnd(6) + dias.map((n) => sigla[aloc.find((a) => a.funcionario_id === id && a.data === numParaData(n))?.status ?? ""] ?? "?").join(""));
  return [cab, ...linhas].join("\n");
}

// ---------------------------------------------------------------- marcos
describe("marcos legais", () => {
  it("aplica 44h → 42h → 40h nas datas da EC 141", () => {
    expect(marcoEfetivo("2026-12-13").horas_semanais).toBe(44);
    expect(marcoEfetivo("2026-12-14").horas_semanais).toBe(42);
    expect(marcoEfetivo("2026-12-14").folgas_semanais).toBe(2);
    expect(marcoEfetivo("2027-12-13").horas_semanais).toBe(42);
    expect(marcoEfetivo("2027-12-14").horas_semanais).toBe(40);
  });
  it("loja pode antecipar, mas nunca afrouxar", () => {
    const marcos = [
      { vigencia_inicio: "1900-01-01", horas_semanais: 44, folgas_semanais: 1, rotulo: "CLT" },
      { vigencia_inicio: "2026-12-14", horas_semanais: 42, folgas_semanais: 2, rotulo: "EC fase 1" },
      { vigencia_inicio: "2026-11-01", horas_semanais: 42, folgas_semanais: 2, rotulo: "Dom Bosco 5x2", store_id: "L1" },
      { vigencia_inicio: "2027-12-14", horas_semanais: 40, folgas_semanais: 2, rotulo: "EC fase 2" },
    ];
    expect(marcoEfetivo("2026-11-10", marcos).folgas_semanais).toBe(2);
    expect(marcoEfetivo("2026-11-10", marcos).horas_semanais).toBe(42);
    expect(marcoEfetivo("2028-01-10", marcos).horas_semanais).toBe(40); // a regra da loja (42) não vence a lei (40)
  });
  it("sugere jornada diária", () => {
    expect(sugerirJornadaDiaria(42, 2)).toBe(504); // 8h24
    expect(sugerirJornadaDiaria(40, 2)).toBe(480); // 8h
    expect(sugerirJornadaDiaria(44, 1)).toBe(440); // 7h20
  });
});

// ---------------------------------------------------------------- gerador 5x2
describe("gerador 5x2 — janeiro/2027 (42h)", () => {
  const ctx = base(2027, 1);
  const r = gerarEscala(ctx);

  it("gera sem nenhum erro legal", () => {
    const erros = r.validacao.violacoes.filter((v) => v.nivel === "erro");
    if (erros.length) console.log(erros);
    expect(r.validacao.erros).toBe(0);
  });

  it("2 folgas em toda semana completa, para todos", () => {
    for (const f of ctx.funcionarios) {
      for (const s of folgasPorSemana(r.alocacoes, f.id, 2027, 1)) expect(s.folgas, `${f.id} ${s.semana}`).toBe(2);
    }
  });

  it("aloca todos os dias do mês de todos", () => {
    expect(r.alocacoes.length).toBe(ctx.funcionarios.length * 31);
  });

  it("mostra a grade e a cobertura", () => {
    console.log("\nJAN/2027 — Frente de Caixa e Açougue\n" + imprimir(r.alocacoes, 2027, 1, ["CM1", "CM2", "CM3", "CM4", "CM5", "CT1", "CT2", "CT3", "CT4", "CT5", "AC1", "AC2", "AC3", "AC4", "APR1"]));
    const cob = r.validacao.violacoes.filter((v) => v.regra === "cobertura");
    console.log(`alertas de cobertura: ${cob.length}`, cob.slice(0, 5).map((c) => c.mensagem));
    console.log("avisos do gerador:", r.avisos.map((a) => a.mensagem));
    expect(cob.length).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------- transição dezembro/2026
describe("dezembro/2026 — mês da transição", () => {
  it("sem antecipar: até 13/12 vale 1 folga/semana e o turno de 8h24 gera hora extra", () => {
    const r = gerarEscala(base(2026, 12));
    expect(r.validacao.erros).toBe(0);
    expect(r.avisos.some((a) => a.regra === "turno_acima_limite")).toBe(true);
    const he = r.validacao.violacoes.filter((v) => v.regra === "horas_semanais");
    expect(he.length).toBeGreaterThan(0);
    expect(he.every((v) => v.data! < "2026-12-14")).toBe(true); // HE só antes da fase 1
    // a partir de 14/12 todos têm 2 folgas por semana
    for (const f of equipe()) {
      for (const s of folgasPorSemana(r.alocacoes, f.id, 2026, 12).filter((s) => s.semana >= "2026-12-14")) expect(s.folgas).toBe(2);
    }
  });

  it("antecipando 5x2/42h desde 01/12 não sobra hora extra", () => {
    const marcos = [
      { vigencia_inicio: "1900-01-01", horas_semanais: 44, folgas_semanais: 1, rotulo: "CLT" },
      { vigencia_inicio: "2026-12-14", horas_semanais: 42, folgas_semanais: 2, rotulo: "EC fase 1" },
      { vigencia_inicio: "2027-12-14", horas_semanais: 40, folgas_semanais: 2, rotulo: "EC fase 2" },
      { vigencia_inicio: "2026-12-01", horas_semanais: 42, folgas_semanais: 2, rotulo: "Antecipação 5x2", store_id: "L1" },
    ];
    const r = gerarEscala(base(2026, 12, { marcos }));
    expect(r.validacao.erros).toBe(0);
    expect(r.validacao.violacoes.filter((v) => v.regra === "horas_semanais").length).toBe(0);
  });

  it("Natal com loja fechada vira FERIADO para todos e não conta como folga", () => {
    const r = gerarEscala(base(2026, 12, { datas: [{ data: "2026-12-25", nome: "Natal", tipo: "feriado", loja_abre: false }] }));
    const natal = r.alocacoes.filter((a) => a.data === "2026-12-25");
    expect(natal.every((a) => a.status === "FERIADO")).toBe(true);
    for (const f of equipe()) {
      const s = folgasPorSemana(r.alocacoes, f.id, 2026, 12).find((x) => x.semana === "2026-12-21")!;
      expect(s.folgas).toBe(2);
    }
    expect(r.validacao.erros).toBe(0);
  });
});

// ---------------------------------------------------------------- compensatório
describe("regime compensatório (CCT) — dezembro/2026 com pico de Natal", () => {
  const marcos = [
    { vigencia_inicio: "1900-01-01", horas_semanais: 44, folgas_semanais: 1, rotulo: "CLT" },
    { vigencia_inicio: "2026-12-14", horas_semanais: 42, folgas_semanais: 2, rotulo: "EC fase 1" },
    { vigencia_inicio: "2027-12-14", horas_semanais: 40, folgas_semanais: 2, rotulo: "EC fase 2" },
    { vigencia_inicio: "2026-12-01", horas_semanais: 42, folgas_semanais: 2, rotulo: "Antecipação", store_id: "L1" },
  ];
  const pico = ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24"].map((d) => ({ data: d, nome: "Natal", tipo: "pico" as const }));
  const ctx = base(2026, 12, { marcos, datas: pico, config: { regime: "compensatorio_cct" } });
  const r = gerarEscala(ctx);

  it("fecha a média de 2 folgas/semana no mês, sem nenhum erro", () => {
    if (r.validacao.erros) console.log(r.validacao.violacoes.filter((v) => v.nivel === "erro"));
    expect(r.validacao.erros).toBe(0);
    for (const f of ctx.funcionarios) {
      const folgas = r.alocacoes.filter((a) => a.funcionario_id === f.id && a.status === "FOLGA").length;
      expect(folgas, f.id).toBeGreaterThanOrEqual(9); // 31 dias × 2/7 = 8,86 → 9
    }
  });

  it("tira folgas da semana de pico", () => {
    const semPico = r.alocacoes.filter((a) => a.status === "FOLGA" && a.data >= "2026-12-21" && a.data <= "2026-12-24").length;
    const semNormal = r.alocacoes.filter((a) => a.status === "FOLGA" && a.data >= "2026-12-07" && a.data <= "2026-12-10").length;
    console.log(`folgas 21-24/12 (pico): ${semPico} · 07-10/12 (normal): ${semNormal}`);
    expect(semPico).toBeLessThan(semNormal);
  });
});

// ---------------------------------------------------------------- continuidade
describe("continuidade com o mês anterior", () => {
  it("quem fechou o mês com 5 dias seguidos folga logo no início", () => {
    const f: Funcionario[] = [{ id: "X", nome: "X", departamento: "Padaria", turno_padrao_id: "PD" }];
    // 26/12/2026 (sáb) a 31/12 trabalhados = 6 dias seguidos; domingo 27 trabalhado
    const historico: Alocacao[] = [];
    for (let n = dataParaNum("2026-12-14"); n <= dataParaNum("2026-12-31"); n++) {
      const d = numParaData(n);
      const folga = ["2026-12-14", "2026-12-15", "2026-12-20", "2026-12-21", "2026-12-24", "2026-12-25"].includes(d);
      historico.push({ funcionario_id: "X", data: d, status: folga ? "FOLGA" : "TRABALHO", turno_id: folga ? null : "PD" });
    }
    const r = gerarEscala({ ano: 2027, mes: 1, turnos, funcionarios: f, historico });
    expect(r.validacao.violacoes.filter((v) => v.regra === "dias_consecutivos")).toHaveLength(0);
    expect(r.alocacoes.find((a) => a.data === "2027-01-01")!.status).toBe("FOLGA");
  });

  it("respeita célula travada pelo gestor", () => {
    const ctx = base(2027, 1, { alocacoes: [{ funcionario_id: "AC1", data: "2027-01-08", status: "FOLGA", travado: true }] });
    const r = gerarEscala(ctx);
    expect(r.alocacoes.find((a) => a.funcionario_id === "AC1" && a.data === "2027-01-08")!.status).toBe("FOLGA");
    expect(r.validacao.erros).toBe(0);
  });
});

// ---------------------------------------------------------------- validador pega cada infração
describe("validador", () => {
  const f: Funcionario[] = [
    { id: "A", nome: "Ana", departamento: "Caixa", turno_padrao_id: "CXT" },
    { id: "M", nome: "Menor", departamento: "Caixa", turno_padrao_id: "CXT", data_nascimento: "2010-05-01", aprendiz: true },
  ];
  const trab = (fid: string, d: string, extra: Partial<Alocacao> = {}): Alocacao => ({ funcionario_id: fid, data: d, status: "TRABALHO", turno_id: "CXT", ...extra });
  const mes = (fid: string, folgas: string[], extra: (d: string) => Partial<Alocacao> = () => ({})) =>
    diasDoMes(2027, 2).map((n) => {
      const d = numParaData(n);
      return folgas.includes(d) ? { funcionario_id: fid, data: d, status: "FOLGA" as const } : trab(fid, d, extra(d));
    });

  it("dias consecutivos, domingos, interjornada, intervalo, feriado, menor e aprendiz", () => {
    const alocacoes: Alocacao[] = [
      // Ana: folga só 1/fev e depois trabalha tudo → 7+ dias seguidos, semanas sem 2 folgas, domingos seguidos
      ...mes("A", ["2027-02-01"], (d) =>
        d === "2027-02-10" ? { turno_id: "CXM", inicio: "07:00", fim: "16:24", intervalo_min: 30 } : {}),
      ...mes("M", ["2027-02-01", "2027-02-02", "2027-02-08", "2027-02-09", "2027-02-14", "2027-02-15", "2027-02-16", "2027-02-22", "2027-02-23"]),
    ];
    const r = validarEscala({
      ano: 2027, mes: 2, turnos, funcionarios: f, alocacoes,
      datas: [{ data: "2027-02-09", nome: "Carnaval", tipo: "feriado", loja_abre: true }],
    });
    const regras = new Set(r.violacoes.filter((v) => v.nivel === "erro").map((v) => v.regra));
    for (const esperado of ["dias_consecutivos", "folgas_semanais", "domingo", "interjornada", "intervalo", "feriado_sem_cct", "aprendiz", "menor_noturno", "menor_jornada"]) {
      expect(regras.has(esperado), esperado).toBe(true);
    }
    const inter = r.violacoes.find((v) => v.regra === "interjornada")!;
    expect(inter.data).toBe("2027-02-10"); // sai 23:00 no dia 9 e entra 07:00 no dia 10 = 8h
  });

  it("jornada acima de 8h sem acordo de compensação vira erro", () => {
    const r = validarEscala({ ano: 2027, mes: 2, turnos, funcionarios: [f[0]], alocacoes: [trab("A", "2027-02-03")], config: { acordo_compensacao: false } });
    expect(r.violacoes.some((v) => v.regra === "jornada_diaria_sem_acordo")).toBe(true);
  });

  it("feriado com CCT vira só lembrete de pagamento em dobro", () => {
    const r = validarEscala({
      ano: 2027, mes: 2, turnos, funcionarios: [f[0]], alocacoes: [trab("A", "2027-02-09")],
      config: { feriado_autorizado_cct: true },
      datas: [{ data: "2027-02-09", nome: "Carnaval", tipo: "feriado", loja_abre: true }],
    });
    expect(r.violacoes.find((v) => v.regra === "feriado_trabalhado")?.nivel).toBe("info");
  });
});
