import { chamarRelatorio, pick, num } from "@/lib/vrReport";
import { mercadologicoNivel1 } from "@/lib/mercadologico";
import { ontemIso } from "@/lib/hubDiario";
import type { LinhaVenda } from "./dimensionamento";

// ============================================================
// Leitura da venda por hora (relatório vendas_hora_periodo) para o
// dimensionamento da escala. Uma semana por consulta, em sequência,
// porque pontes lentas não aguentam período longo nem paralelo.
// Só roda quando o usuário pede (regra do Hub: nada consulta sozinho).
// ============================================================

export interface LeituraVendasHora {
  linhas: LinhaVenda[];
  inicio: string;
  fim: string;
  /** relatório não publicado na ponte desta loja */
  indisponivel: boolean;
  offline: boolean;
  erro: string | null;
  /** semanas que falharam (as demais entram no cálculo) */
  semanasComFalha: number;
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Aceita '2026-10-05', '2026-10-05T00:00:00' e '05/10/2026'. */
export function lerData(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

/** Aceita 13, '13', '13:00', '13:00:00', '1300' e data-hora completa. */
export function lerHora(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let h: number | null = null;
  const sep = s.match(/(\d{1,2}):(\d{2})/);
  if (sep) h = Number(sep[1]);
  else if (/^\d{3,4}$/.test(s)) h = Number(s.slice(0, s.length - 2));
  else if (/^\d{1,2}(\.0+)?$/.test(s)) h = Number(s);
  return h !== null && isFinite(h) && h >= 0 && h <= 23 ? h : null;
}

export function converterLinhas(dados: unknown[], dataPadrao?: string): LinhaVenda[] {
  const out: LinhaVenda[] = [];
  for (const l of dados) {
    const hora = lerHora(pick(l, "hora", "horario", "hora_venda", "data_hora", "datahora"));
    const data = lerData(pick(l, "dia", "data", "data_venda", "data_hora", "datahora")) ?? dataPadrao ?? null;
    if (hora === null || !data) continue;
    const valor = num(pick(l, "total_vendido", "faturamento", "venda", "valor", "total"));
    if (!valor) continue;
    out.push({ data, hora, departamento: mercadologicoNivel1(l) || "TOTAL", valor });
  }
  return out;
}

export async function buscarVendasHora(
  storeId: string,
  semanas = 4,
  aoProgredir?: (feitas: number, total: number) => void,
): Promise<LeituraVendasHora> {
  const fim = ontemIso();
  const inicio = somarDias(fim, -(semanas * 7 - 1));
  const leitura: LeituraVendasHora = { linhas: [], inicio, fim, indisponivel: false, offline: false, erro: null, semanasComFalha: 0 };
  for (let s = 0; s < semanas; s++) {
    const ini = somarDias(inicio, s * 7);
    const f = somarDias(ini, 6);
    const r = await chamarRelatorio(storeId, "vendas_hora_periodo", { inicio: ini, fim: f });
    if (r.indisponivel) { leitura.indisponivel = true; break; }
    if (r.offline) { leitura.offline = true; break; }
    if (r.erro) { leitura.erro = r.erro; leitura.semanasComFalha++; aoProgredir?.(s + 1, semanas); continue; }
    let linhas = converterLinhas(r.dados);
    if (!linhas.length && r.dados.length) {
      // conector devolveu o período sem coluna de data: lê dia a dia
      for (let d = 0; d < 7; d++) {
        const dia = somarDias(ini, d);
        const rd = await chamarRelatorio(storeId, "vendas_hora_periodo", { inicio: dia, fim: dia });
        if (rd.erro || rd.offline || rd.indisponivel) continue;
        linhas = linhas.concat(converterLinhas(rd.dados, dia));
      }
    }
    leitura.linhas.push(...linhas);
    aoProgredir?.(s + 1, semanas);
  }
  if (leitura.linhas.length) leitura.erro = null;
  return leitura;
}
