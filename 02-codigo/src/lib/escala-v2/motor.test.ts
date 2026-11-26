import { describe, expect, it } from "vitest";
import { faseEm, feriadosNacionais } from "./leis";
import {
  REGRAS_PADRAO, dataNum, diaSemana, diagnosticar, diasDoMes, gerar, numData, segundaDe, validar,
  type Contexto, type DiaEscala, type Pessoa, type RegrasLoja,
} from "./motor";

function pessoa(id: string, setor: string, extra: Partial<Pessoa> = {}): Pessoa {
  return { id, nome: `Pessoa ${id}`, setor, turno: "auto", folga_fixa: null, carga_semanal: null, nascimento: null, aprendiz: false, domingo_quinzenal: false, admissao: null, desligamento: null, ...extra };
}

function loja(extra: Partial<RegrasLoja> = {}): RegrasLoja {
  return {
    ...REGRAS_PADRAO,
    setores: [
      { setor: "Frente de Caixa", minimo: 2, antes_min: 0, depois_min: 0 },
      { setor: "Açougue", minimo: 1, antes_min: 60, depois_min: 0 },
      { setor: "Padaria", minimo: 1, antes_min: 120, depois_min: 0 },
      { setor: "Hortifruti", minimo: 1, antes_min: 60, depois_min: 0 },
      { setor: "Frios", minimo: 1, antes_min: 0, depois_min: 0 },
      { setor: "Mercearia", minimo: 1, antes_min: 0, depois_min: 0 },
    ],
    ...extra,
  };
}

function equipe(): Pessoa[] {
  const out: Pessoa[] = [];
  const add = (setor: string, qtd: number, prefixo: string) => { for (let i = 1; i <= qtd; i++) out.push(pessoa(`${prefixo}${i}`, setor, { domingo_quinzenal: i % 2 === 0 })); };
  add("Frente de Caixa", 10, "cx");
  add("Açougue", 5, "ac");
  add("Padaria", 5, "pa");
  add("Hortifruti", 4, "ho");
  add("Frios", 4, "fr");
  add("Mercearia", 6, "me");
  return out;
}

function contexto(ano: number, mes: number, extra: Partial<Contexto> = {}): Contexto {
  const feriados = [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)].map(f => ({ ...f, loja_abre: false }));
  return { ano, mes, regras: loja(), pessoas: equipe(), ausencias: [], feriados, dias: [], historico: [], ...extra };
}

function liquido(d: DiaEscala): number {
  const [h1, m1] = d.inicio!.split(":").map(Number);
  const [h2, m2] = d.fim!.split(":").map(Number);
  let fim = h2 * 60 + m2;
  const ini = h1 * 60 + m1;
  if (fim <= ini) fim += 1440;
  return fim - ini - (d.intervalo_min || 0);
}

const erros = (ctx: Contexto, dias: DiaEscala[]) => validar({ ...ctx, dias }).violacoes.filter(v => v.nivel === "erro");

describe("leis", () => {
  it("aplica as fases da EC 141 nas datas certas", () => {
    expect(faseEm("2026-12-15").horas_semanais).toBe(44);
    expect(faseEm("2026-12-16").horas_semanais).toBe(42);
    expect(faseEm("2026-12-16").repousos_semanais).toBe(2);
    expect(faseEm("2027-12-15").horas_semanais).toBe(42);
    expect(faseEm("2027-12-16").horas_semanais).toBe(40);
    expect(faseEm("2026-12-01", "2026-12-01").repousos_semanais).toBe(2);
  });
  it("calcula os feriados nacionais, inclusive a Sexta-feira Santa", () => {
    const f = feriadosNacionais(2027).map(x => x.data);
    expect(f).toContain("2027-03-26");
    expect(f).toContain("2027-11-20");
    expect(f).toHaveLength(10);
    expect(feriadosNacionais(2026).map(x => x.data)).toContain("2026-04-03");
  });
  it("trata datas sem fuso", () => {
    expect(diaSemana(dataNum("2026-12-16"))).toBe(3);
    expect(numData(segundaDe(dataNum("2026-12-16")))).toBe("2026-12-14");
    expect(diasDoMes(2027, 2)).toHaveLength(28);
  });
});

describe("gerador", () => {
  it("gera janeiro/2027 (42h, 2 folgas) sem nenhum erro legal", () => {
    const ctx = contexto(2027, 1);
    const g = gerar(ctx);
    expect(g.validacao.erros).toBe(0);
    expect(g.dias.length).toBe(ctx.pessoas.length * 31);
    for (const d of g.dias.filter(x => x.tipo === "T")) {
      expect(liquido(d)).toBeLessThanOrEqual(504);
      expect(d.intervalo_min).toBeGreaterThanOrEqual(60);
    }
    // semanas inteiras de janeiro: exatamente 2 folgas e no máximo 42h
    for (const p of ctx.pessoas) {
      for (const seg of ["2027-01-04", "2027-01-11", "2027-01-18", "2027-01-25"]) {
        const ini = dataNum(seg);
        const semana = g.dias.filter(d => d.pessoa_id === p.id && dataNum(d.data) >= ini && dataNum(d.data) < ini + 7);
        expect(semana.filter(d => d.tipo === "F").length).toBe(2);
        expect(semana.filter(d => d.tipo === "T").reduce((s, d) => s + liquido(d), 0)).toBeLessThanOrEqual(42 * 60);
      }
    }
    // 1º de janeiro é feriado e a loja fecha
    expect(g.dias.filter(d => d.data === "2027-01-01").every(d => d.tipo === "FR")).toBe(true);
  });

  it("atravessa a virada de 16/12/2026 sem erro", () => {
    const g = gerar(contexto(2026, 12));
    expect(g.validacao.erros).toBe(0);
    // antes da virada: 44h em 6 dias de 7h20
    const antes = g.dias.filter(d => d.tipo === "T" && d.data <= "2026-12-13");
    expect(Math.max(...antes.map(liquido))).toBe(440);
    const depois = g.dias.filter(d => d.tipo === "T" && d.data >= "2026-12-14");
    expect(Math.max(...depois.map(liquido))).toBe(504);
  });

  it("usa 8h por dia na fase de 40h", () => {
    const g = gerar(contexto(2028, 1));
    expect(g.validacao.erros).toBe(0);
    expect(Math.max(...g.dias.filter(d => d.tipo === "T").map(liquido))).toBe(480);
  });

  it("usa 8h por dia quando a loja não adota a liminar das 8h24", () => {
    const ctx = contexto(2027, 3);
    ctx.regras = loja({ jornada_8h24: false });
    const g = gerar(ctx);
    expect(g.validacao.erros).toBe(0);
    expect(Math.max(...g.dias.filter(d => d.tipo === "T").map(liquido))).toBe(480);
  });

  it("dá continuidade entre meses usando o histórico", () => {
    const jan = gerar(contexto(2027, 1));
    const fev = gerar(contexto(2027, 2, { historico: jan.dias }));
    expect(fev.validacao.erros).toBe(0);
    const mar = gerar(contexto(2027, 3, { historico: [...jan.dias, ...fev.dias] }));
    expect(mar.validacao.erros).toBe(0);
  });

  it("nunca coloca quem tem domingo quinzenal em dois domingos seguidos", () => {
    const ctx = contexto(2027, 5);
    const g = gerar(ctx);
    expect(g.validacao.erros).toBe(0);
    const domingos = diasDoMes(2027, 5).filter(n => diaSemana(n) === 0).map(numData);
    for (const p of ctx.pessoas.filter(x => x.domingo_quinzenal)) {
      const trabalhou = domingos.map(d => g.dias.find(x => x.pessoa_id === p.id && x.data === d)?.tipo === "T");
      for (let i = 1; i < trabalhou.length; i++) expect(trabalhou[i] && trabalhou[i - 1]).toBe(false);
    }
  });

  it("respeita férias, folga fixa e dias travados", () => {
    const ctx = contexto(2027, 4);
    ctx.pessoas[0].folga_fixa = 3; // quarta
    ctx.ausencias = [{ pessoa_id: "ac1", tipo: "FER", inicio: "2027-04-05", fim: "2027-04-24" }];
    ctx.dias = [{ pessoa_id: "me1", data: "2027-04-14", tipo: "F", travado: true }, { pessoa_id: "me1", data: "2027-04-15", tipo: "F", travado: true }];
    const g = gerar(ctx);
    expect(g.validacao.erros).toBe(0);
    const quartas = g.dias.filter(d => d.pessoa_id === ctx.pessoas[0].id && diaSemana(dataNum(d.data)) === 3 && d.data !== "2027-04-21");
    expect(quartas.every(d => d.tipo === "F")).toBe(true);
    const ferias = g.dias.filter(d => d.pessoa_id === "ac1" && d.data >= "2027-04-05" && d.data <= "2027-04-24");
    expect(ferias).toHaveLength(20);
    expect(ferias.every(d => d.tipo === "FER")).toBe(true);
    expect(g.dias.find(d => d.pessoa_id === "me1" && d.data === "2027-04-14")?.travado).toBe(true);
    expect(g.dias.find(d => d.pessoa_id === "me1" && d.data === "2027-04-15")?.tipo).toBe("F");
  });

  it("protege menor de 18 e aprendiz", () => {
    const ctx = contexto(2027, 6);
    ctx.regras = loja({ horario: REGRAS_PADRAO.horario.map(h => ({ abre: h.abre, fecha: "23:00" })) });
    ctx.pessoas.push(pessoa("menor", "Mercearia", { nascimento: "2010-09-10", turno: "fechamento" }));
    ctx.pessoas.push(pessoa("aprendiz", "Mercearia", { aprendiz: true, nascimento: "2009-02-01" }));
    const g = gerar(ctx);
    expect(g.validacao.erros).toBe(0);
    for (const d of g.dias.filter(x => x.pessoa_id === "menor" && x.tipo === "T")) expect(d.fim! <= "22:00").toBe(true);
    for (const d of g.dias.filter(x => x.pessoa_id === "aprendiz" && x.tipo === "T")) expect(liquido(d)).toBeLessThanOrEqual(360);
  });

  it("cobre abertura e fechamento em setor pequeno e avisa quando falta gente", () => {
    const ctx = contexto(2027, 1, {
      pessoas: [pessoa("a", "Açougue"), pessoa("b", "Açougue"), pessoa("c", "Açougue"), pessoa("d", "Açougue")],
      regras: loja({ setores: [{ setor: "Açougue", minimo: 1, antes_min: 0, depois_min: 0 }] }),
    });
    const g = gerar(ctx);
    expect(g.validacao.erros).toBe(0);
    expect(g.validacao.violacoes.filter(v => v.regra === "cobertura").length).toBeLessThanOrEqual(2);
    const curto = contexto(2027, 1, { pessoas: [pessoa("a", "Açougue"), pessoa("b", "Açougue")], regras: ctx.regras });
    const g2 = gerar(curto);
    expect(g2.validacao.erros).toBe(0);
    const diag = diagnosticar(curto).find(x => x.setor === "Açougue")!;
    expect(diag.faltam).toBeGreaterThan(0);
    expect(g2.avisos.some(a => a.startsWith("Açougue"))).toBe(true);
  });

  it("revezamento de turnos continua dentro da lei", () => {
    const ctx = contexto(2027, 8);
    ctx.regras = loja({ revezar_turnos: true });
    const g = gerar(ctx);
    expect(g.validacao.erros).toBe(0);
  });

  it("com CCT, abre no feriado e reduz o intervalo", () => {
    const ctx = contexto(2027, 4);
    ctx.regras = loja({ tem_cct: true, cct_feriado_autorizado: true, cct_intervalo_min: 30 });
    ctx.feriados = ctx.feriados.map(f => ({ ...f, loja_abre: true }));
    const g = gerar(ctx);
    expect(g.validacao.erros).toBe(0);
    expect(g.dias.some(d => d.data === "2027-04-21" && d.tipo === "T")).toBe(true);
    expect(g.dias.filter(d => d.tipo === "T").every(d => d.intervalo_min === 30)).toBe(true);
  });

  it("sem CCT, feriado marcado para abrir é tratado como fechado e gera aviso", () => {
    const ctx = contexto(2027, 4);
    ctx.feriados = ctx.feriados.map(f => ({ ...f, loja_abre: true }));
    const g = gerar(ctx);
    expect(g.validacao.erros).toBe(0);
    expect(g.dias.some(d => d.data === "2027-04-21" && d.tipo === "T")).toBe(false);
    expect(g.avisos.some(a => a.includes("Tiradentes"))).toBe(true);
  });

  it("encadeia 14 meses (dez/2026 a jan/2028), com férias e atestados, sem erro legal", () => {
    let historico: DiaEscala[] = [];
    let ano = 2026, mes = 12;
    for (let i = 0; i < 14; i++) {
      const ctx = contexto(ano, mes, { historico });
      const m = String(mes).padStart(2, "0");
      ctx.ausencias = [
        { pessoa_id: ctx.pessoas[i % ctx.pessoas.length].id, tipo: "FER", inicio: `${ano}-${m}-03`, fim: `${ano}-${m}-22` },
        { pessoa_id: ctx.pessoas[(i * 7 + 3) % ctx.pessoas.length].id, tipo: "AT", inicio: `${ano}-${m}-10`, fim: `${ano}-${m}-12` },
      ];
      const g = gerar(ctx, { tentativas: 8 });
      expect(g.validacao.violacoes.filter(v => v.nivel === "erro").map(v => v.mensagem)).toEqual([]);
      historico = g.dias;
      mes++;
      if (mes > 12) { mes = 1; ano++; }
    }
  }, 60000);

  it("gera a mesma escala para a mesma entrada", () => {
    expect(gerar(contexto(2027, 7)).dias).toEqual(gerar(contexto(2027, 7)).dias);
  });
});

describe("validador", () => {
  const base = () => {
    const ctx = contexto(2027, 2, { pessoas: [pessoa("x", "Mercearia"), pessoa("y", "Mercearia"), pessoa("z", "Mercearia"), pessoa("w", "Mercearia")], regras: loja({ setores: [] }) });
    return { ctx, dias: gerar(ctx).dias };
  };
  const trocar = (dias: DiaEscala[], pid: string, data: string, novo: Partial<DiaEscala>) => dias.map(d => (d.pessoa_id === pid && d.data === data ? { ...d, ...novo } : d));
  const turno = { tipo: "T" as const, inicio: "07:00", fim: "16:24", intervalo_min: 60 };

  it("parte de uma escala limpa", () => {
    const { ctx, dias } = base();
    expect(erros(ctx, dias)).toHaveLength(0);
  });

  it("acusa semana com menos de 2 folgas e excesso de horas", () => {
    const { ctx } = base();
    let { dias } = base();
    const folga = dias.find(d => d.pessoa_id === "x" && d.tipo === "F" && d.data >= "2027-02-08" && d.data <= "2027-02-14")!;
    dias = trocar(dias, "x", folga.data, turno);
    const regras = erros(ctx, dias).filter(v => v.pessoa_id === "x").map(v => v.regra);
    expect(regras).toContain("repousos");
    expect(regras).toContain("semanal");
  });

  it("acusa o 7º dia seguido de trabalho", () => {
    const { ctx } = base();
    let { dias } = base();
    for (let d = 8; d <= 14; d++) dias = trocar(dias, "y", `2027-02-${String(d).padStart(2, "0")}`, turno);
    expect(erros(ctx, dias).some(v => v.regra === "consecutivos" && v.pessoa_id === "y")).toBe(true);
  });

  it("acusa três domingos seguidos (e dois para quem tem domingo quinzenal)", () => {
    const { ctx } = base();
    let { dias } = base();
    for (const d of ["2027-02-07", "2027-02-14", "2027-02-21"]) dias = trocar(dias, "z", d, turno);
    expect(erros(ctx, dias).some(v => v.regra === "domingo" && v.pessoa_id === "z")).toBe(true);
    const q = base();
    q.ctx.pessoas[3].domingo_quinzenal = true;
    let d2 = q.dias;
    for (const d of ["2027-02-07", "2027-02-14"]) d2 = trocar(d2, "w", d, turno);
    expect(erros(q.ctx, d2).some(v => v.regra === "domingo" && v.pessoa_id === "w")).toBe(true);
  });

  it("acusa menos de 11h entre jornadas e menos de 35h com folga no meio", () => {
    const { ctx } = base();
    let dias: DiaEscala[] = [
      { pessoa_id: "x", data: "2027-02-08", tipo: "T", inicio: "12:36", fim: "22:00", intervalo_min: 60 },
      { pessoa_id: "x", data: "2027-02-09", tipo: "T", inicio: "07:00", fim: "16:24", intervalo_min: 60 },
    ];
    expect(erros(ctx, dias).some(v => v.regra === "descanso" && v.mensagem.includes("11h"))).toBe(true);
    dias = [
      { pessoa_id: "x", data: "2027-02-08", tipo: "T", inicio: "12:36", fim: "22:00", intervalo_min: 60 },
      { pessoa_id: "x", data: "2027-02-09", tipo: "F" },
      { pessoa_id: "x", data: "2027-02-10", tipo: "T", inicio: "07:00", fim: "16:24", intervalo_min: 60 },
    ];
    expect(erros(ctx, dias).some(v => v.regra === "descanso" && v.mensagem.includes("35h"))).toBe(true);
  });

  it("acusa jornada diária acima do teto e intervalo curto", () => {
    const { ctx } = base();
    const dias: DiaEscala[] = [
      { pessoa_id: "x", data: "2027-02-08", tipo: "T", inicio: "07:00", fim: "17:00", intervalo_min: 60 },
      { pessoa_id: "y", data: "2027-02-08", tipo: "T", inicio: "07:00", fim: "15:30", intervalo_min: 30 },
    ];
    const e = erros(ctx, dias);
    expect(e.some(v => v.regra === "diaria" && v.pessoa_id === "x")).toBe(true);
    expect(e.some(v => v.regra === "intervalo" && v.pessoa_id === "y")).toBe(true);
  });

  it("acusa menor em horário noturno, aprendiz acima de 6h, feriado sem CCT e trabalho nas férias", () => {
    const ctx = contexto(2027, 4, {
      pessoas: [pessoa("m", "Mercearia", { nascimento: "2010-06-01" }), pessoa("ap", "Mercearia", { aprendiz: true }), pessoa("f", "Mercearia"), pessoa("v", "Mercearia")],
      regras: loja({ setores: [] }),
      ausencias: [{ pessoa_id: "v", tipo: "FER", inicio: "2027-04-19", fim: "2027-04-30" }],
    });
    const dias: DiaEscala[] = [
      { pessoa_id: "m", data: "2027-04-06", tipo: "T", inicio: "14:00", fim: "22:30", intervalo_min: 60 },
      { pessoa_id: "ap", data: "2027-04-06", tipo: "T", inicio: "08:00", fim: "16:00", intervalo_min: 60 },
      { pessoa_id: "f", data: "2027-04-21", tipo: "T", inicio: "08:00", fim: "16:00", intervalo_min: 60 },
      { pessoa_id: "v", data: "2027-04-22", tipo: "T", inicio: "08:00", fim: "16:00", intervalo_min: 60 },
    ];
    const e = erros(ctx, dias);
    expect(e.some(v => v.regra === "menor" && v.pessoa_id === "m")).toBe(true);
    expect(e.some(v => v.regra === "menor" && v.pessoa_id === "ap")).toBe(true);
    expect(e.some(v => v.regra === "feriado" && v.pessoa_id === "f")).toBe(true);
    expect(e.some(v => v.regra === "ausencia" && v.pessoa_id === "v")).toBe(true);
    // férias começando dois dias antes de Tiradentes
    const alertas = validar({ ...ctx, dias }).violacoes.filter(v => v.nivel === "alerta" && v.regra === "ausencia");
    expect(alertas.some(v => v.pessoa_id === "v")).toBe(true);
  });

  it("com compensação mensal em CCT cobra a média de 2 folgas por semana", () => {
    const { ctx } = base();
    let { dias } = base();
    ctx.regras = loja({ setores: [], tem_cct: true, cct_repousos_media_mensal: true, cct_diaria_max_min: 600 });
    expect(erros(ctx, dias)).toHaveLength(0);
    const folga = dias.find(d => d.pessoa_id === "x" && d.tipo === "F" && d.data >= "2027-02-08" && d.data <= "2027-02-14")!;
    dias = dias.map(d => (d.pessoa_id === "x" && d.data === folga.data ? { ...d, tipo: "T" as const, inicio: "08:00", fim: "13:00", intervalo_min: 15 } : d));
    expect(erros(ctx, dias).some(v => v.regra === "repousos" && v.mensagem.includes("no mês"))).toBe(true);
  });
});
