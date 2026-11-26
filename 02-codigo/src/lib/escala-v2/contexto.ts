/**
 * Escala V2 — funções puras entre os dados carregados e o motor:
 * monta o contexto, confere os pedidos devolvidos pela IA e resume a
 * escala para o parecer. Sem Supabase, para poder ser testado sozinho.
 */
import { faseEm } from "./leis";
import type { DadosEscalaV2 } from "./dados";
import {
  NOMES_DIA_LONGO, dataNum, diagnosticar, diasDoMes, fmtDataBr, fmtDur, numData,
  type Contexto, type DiaEscala, type Geracao, type Pessoa, type TurnoPreferido,
} from "./motor";

/** Contexto do motor a partir dos dados carregados: só quem trabalhou na loja em algum dia do mês. */
export function montarContexto(d: DadosEscalaV2): Contexto {
  const dias = diasDoMes(d.ano, d.mes);
  const inicioMes = numData(dias[0]);
  const fimMes = numData(dias[dias.length - 1]);
  return {
    ano: d.ano, mes: d.mes,
    regras: d.regras,
    pessoas: d.pessoas.filter(p => (!p.desligamento || p.desligamento >= inicioMes) && (!p.admissao || p.admissao <= fimMes)),
    ausencias: d.ausencias,
    feriados: d.feriados,
    dias: d.dias,
    historico: d.historico,
  };
}

export interface PedidosIA {
  pessoas: { pessoa_id: string; folga_fixa?: number | null; turno?: string | null; folgas_em?: string[] | null }[];
  pesos_dia?: number[] | null;
  nao_aplicado: string[];
  resumo: string;
}

export interface PedidosAplicados {
  ctx: Contexto;
  /** chaves pessoa|data das folgas pedidas (viram dias comuns ao gravar) */
  folgasPedidas: Set<string>;
  aplicados: string[];
  ignorados: string[];
}

const TURNOS: TurnoPreferido[] = ["abertura", "intermediario", "fechamento"];
const NOME_TURNO: Record<string, string> = { abertura: "abertura", intermediario: "intermediário", fechamento: "fechamento" };

/**
 * Confere e aplica o que a IA devolveu. Tudo é validado aqui: pessoa da
 * loja, dia da semana, turno conhecido, data dentro do mês. O que não
 * passa vai para `ignorados` e aparece para o gestor.
 */
export function aplicarPedidos(d: DadosEscalaV2, pedidos: PedidosIA | null): PedidosAplicados {
  const base = montarContexto(d);
  const out: PedidosAplicados = { ctx: base, folgasPedidas: new Set(), aplicados: [], ignorados: [] };
  if (!pedidos) return out;
  const dias = diasDoMes(d.ano, d.mes);
  const inicio = numData(dias[0]);
  const fim = numData(dias[dias.length - 1]);
  const porId = new Map(base.pessoas.map(p => [p.id, p]));
  const pessoas = new Map<string, Pessoa>(base.pessoas.map(p => [p.id, { ...p }]));
  const travados = new Map<string, DiaEscala>(base.dias.filter(x => x.travado).map(x => [`${x.pessoa_id}|${x.data}`, x]));
  const novos: DiaEscala[] = [];
  for (const item of Array.isArray(pedidos.pessoas) ? pedidos.pessoas : []) {
    const original = porId.get(String(item?.pessoa_id));
    if (!original) { out.ignorados.push("Pedido para um funcionário que não está na equipe desta loja."); continue; }
    const p = pessoas.get(original.id)!;
    if (item.folga_fixa !== undefined && item.folga_fixa !== null) {
      const f = Number(item.folga_fixa);
      if (Number.isInteger(f) && f >= 0 && f <= 6) { p.folga_fixa = f; out.aplicados.push(`${p.nome}: folga fixa ${f === 0 || f === 6 ? "no" : "na"} ${NOMES_DIA_LONGO[f]}.`); }
      else out.ignorados.push(`${p.nome}: dia de folga fixa não reconhecido.`);
    }
    if (item.turno) {
      if (TURNOS.includes(item.turno as TurnoPreferido)) { p.turno = item.turno as TurnoPreferido; out.aplicados.push(`${p.nome}: turno de ${NOME_TURNO[item.turno]}.`); }
      else out.ignorados.push(`${p.nome}: turno não reconhecido.`);
    }
    for (const data of Array.isArray(item.folgas_em) ? item.folgas_em : []) {
      if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data) || numData(dataNum(data)) !== data || data < inicio || data > fim) { out.ignorados.push(`${p.nome}: data de folga fora do mês.`); continue; }
      const chave = `${p.id}|${data}`;
      if (travados.has(chave)) { out.ignorados.push(`${p.nome}: ${fmtDataBr(data)} já está travado na escala.`); continue; }
      if (out.folgasPedidas.has(chave)) continue;
      out.folgasPedidas.add(chave);
      novos.push({ pessoa_id: p.id, data, tipo: "F", travado: true });
      out.aplicados.push(`${p.nome}: folga em ${fmtDataBr(data)}.`);
    }
  }
  let regras = base.regras;
  if (Array.isArray(pedidos.pesos_dia) && pedidos.pesos_dia.length === 7 && pedidos.pesos_dia.every(x => Number.isFinite(Number(x)) && Number(x) > 0)) {
    regras = { ...regras, pesos_dia: pedidos.pesos_dia.map(x => Math.min(3, Math.max(0.3, Number(x)))) };
    out.aplicados.push("Movimento por dia da semana ajustado conforme o pedido.");
  }
  for (const texto of Array.isArray(pedidos.nao_aplicado) ? pedidos.nao_aplicado : []) if (typeof texto === "string" && texto.trim()) out.ignorados.push(texto.trim().slice(0, 200));
  out.ctx = { ...base, regras, pessoas: base.pessoas.map(p => pessoas.get(p.id)!), dias: [...base.dias, ...novos] };
  return out;
}

export function resumoParaParecer(d: DadosEscalaV2, ctx: Contexto, g: Geracao, pedidos: PedidosAplicados) {
  const dias = diasDoMes(d.ano, d.mes);
  const fase = faseEm(numData(dias[dias.length - 1]), ctx.regras.antecipar_desde);
  const trabalho = g.dias.filter(x => x.tipo === "T");
  const minutos = g.validacao.resumo.reduce((s, r) => s + r.minutos, 0);
  return {
    mes: `${String(d.mes).padStart(2, "0")}/${d.ano}`,
    regra_vigente_no_fim_do_mes: fase.rotulo,
    usa_jornada_8h24_por_liminar_do_stf: !!fase.diaria_liminar_min && ctx.regras.jornada_8h24,
    loja_tem_convencao_coletiva_cadastrada: ctx.regras.tem_cct,
    funcionarios: ctx.pessoas.length,
    dias_de_trabalho: trabalho.length,
    folgas: g.dias.filter(x => x.tipo === "F").length,
    horas_previstas_no_mes: fmtDur(minutos),
    conferencia_automatica: {
      pendencias_legais: g.validacao.erros,
      alertas: g.validacao.alertas,
      por_regra: g.validacao.checklist.map(c => ({ regra: c.titulo, exigencia_legal: c.legal, pendencias: c.erros, alertas: c.alertas })),
      primeiras_mensagens: g.validacao.violacoes.filter(v => v.nivel !== "info").slice(0, 12).map(v => v.mensagem),
    },
    quadro_por_setor: diagnosticar(ctx).map(x => ({ setor: x.setor, tem: x.pessoas, minimo_necessario: x.necessarias, faltam: x.faltam })),
    avisos: g.avisos,
    pedidos_do_gestor_aplicados: pedidos.aplicados.slice(0, 30),
    pedidos_do_gestor_nao_aplicados: pedidos.ignorados.slice(0, 30),
  };
}
