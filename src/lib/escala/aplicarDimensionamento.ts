import { supabase } from "@/integrations/supabase/client";
import type { DadosEscala } from "./carregarContexto";
import type { PlanoSetor } from "./dimensionamento";

// ============================================================
// Grava o resultado do dimensionamento nas tabelas que o gerador de
// escala já usa (turnos, funcionários e cobertura). Não gera nem
// valida escala: isso continua no escala-motor.ts, pela tela Escala
// do Mês. As gravações passam pelas políticas da loja (escala_pode_gerir).
// ============================================================

export interface ResumoAplicacao {
  turnos: number;
  posicoesCriadas: number;
  funcionariosComTurno: number;
  coberturas: number;
}

export interface PrevisaoAplicacao {
  departamento: string;
  turnos: string[];
  cadastrados: number;
  informados: number;
  posicoesNovas: number;
  semTurno: number;
}

const ativosDoSetor = (dados: DadosEscala, departamento: string) =>
  dados.funcionarios.filter((f) => f.ativo && f.departamento === departamento);

/** O que será criado, para o usuário confirmar antes de gravar. */
export function preverAplicacao(dados: DadosEscala, planos: PlanoSetor[], quantidades: Record<string, number>): PrevisaoAplicacao[] {
  return planos.filter((p) => p.turnos.length).map((p) => {
    const ativos = ativosDoSetor(dados, p.departamento);
    const informados = quantidades[p.departamento] || 0;
    return {
      departamento: p.departamento,
      turnos: p.turnos.map((t) => `${t.codigo} ${t.inicio}–${t.fim} (${t.pessoas})`),
      cadastrados: ativos.length,
      informados,
      posicoesNovas: Math.max(0, informados - ativos.length),
      semTurno: ativos.filter((f) => !f.turno_padrao_id).length,
    };
  });
}

export async function aplicarDimensionamento(
  storeId: string,
  dados: DadosEscala,
  planos: PlanoSetor[],
  quantidades: Record<string, number>,
): Promise<ResumoAplicacao> {
  const resumo: ResumoAplicacao = { turnos: 0, posicoesCriadas: 0, funcionariosComTurno: 0, coberturas: 0 };

  for (const plano of planos) {
    if (!plano.turnos.length) continue;

    // 1) turnos (chave: loja + código)
    const turnos = await supabase.from("escala_turnos").upsert(
      plano.turnos.map((t) => ({ store_id: storeId, departamento: t.departamento, codigo: t.codigo, nome: t.nome, inicio: t.inicio, fim: t.fim, intervalo_min: t.intervalo_min, ativo: true })),
      { onConflict: "store_id,codigo" },
    ).select("id,codigo");
    if (turnos.error) throw turnos.error;
    const idPorCodigo = new Map((turnos.data || []).map((t) => [t.codigo, t.id]));
    resumo.turnos += turnos.data?.length || 0;

    // 2) posições que faltam para chegar à quantidade informada
    const ativos = ativosDoSetor(dados, plano.departamento);
    const faltam = Math.max(0, (quantidades[plano.departamento] || 0) - ativos.length);
    let novos: { id: string }[] = [];
    if (faltam) {
      const nomes = new Set(ativos.map((f) => f.nome));
      const linhas: { store_id: string; departamento: string; nome: string }[] = [];
      for (let n = 1; linhas.length < faltam; n++) {
        const nome = `${plano.departamento} ${n}`;
        if (!nomes.has(nome)) linhas.push({ store_id: storeId, departamento: plano.departamento, nome });
      }
      const criados = await supabase.from("escala_funcionarios").insert(linhas).select("id");
      if (criados.error) throw criados.error;
      novos = criados.data || [];
      resumo.posicoesCriadas += novos.length;
    }

    // 3) turno padrão só para quem ainda não tem (não mexe em quem já foi configurado)
    const vagas = new Map<string, number>();
    for (const t of plano.turnos) {
      const id = idPorCodigo.get(t.codigo);
      if (id) vagas.set(id, t.pessoas - ativos.filter((f) => f.turno_padrao_id === id).length);
    }
    const semTurno = [...ativos.filter((f) => !f.turno_padrao_id).map((f) => f.id), ...novos.map((f) => f.id)];
    const porTurno = new Map<string, string[]>();
    for (const funcionario of semTurno) {
      const alvo = [...vagas.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!alvo) break;
      vagas.set(alvo[0], alvo[1] - 1);
      porTurno.set(alvo[0], [...(porTurno.get(alvo[0]) || []), funcionario]);
    }
    for (const [turnoId, ids] of porTurno) {
      const r = await supabase.from("escala_funcionarios").update({ turno_padrao_id: turnoId }).in("id", ids).eq("store_id", storeId);
      if (r.error) throw r.error;
      resumo.funcionariosComTurno += ids.length;
    }

    // 4) cobertura mínima por dia da semana (qualquer turno)
    for (let dow = 0; dow < 7; dow++) {
      const antiga = dados.cobertura.find((c) => c.departamento === plano.departamento && c.dia_semana === dow && c.turno_id === null);
      const minimo = plano.cobertura.find((c) => c.dia_semana === dow)?.minimo ?? 0;
      if (!antiga && !minimo) continue;
      const r = await supabase.from("escala_cobertura").upsert({ ...(antiga ? { id: antiga.id } : {}), store_id: storeId, departamento: plano.departamento, turno_id: null, dia_semana: dow, minimo });
      if (r.error) throw r.error;
      resumo.coberturas++;
    }
  }
  return resumo;
}
