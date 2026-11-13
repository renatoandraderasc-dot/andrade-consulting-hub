import { mercadologicoNivel1 } from "@/lib/mercadologico";

export const chaveDepartamento = (nome: string) => nome.trim().toUpperCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

/** Movimento nunca é descartado por não existir na configuração de metas. */
export function completarDepartamentos<T extends Record<string, unknown>>(
  linhas: T[], nomes: string[], permite: (nome: string) => boolean,
): (T | { departamento: string })[] {
  const resultado: (T | { departamento: string })[] = linhas.filter((linha) =>
    permite(mercadologicoNivel1(linha) || "SEM DEPARTAMENTO"));
  const presentes = new Set(resultado.map((linha) => chaveDepartamento(mercadologicoNivel1(linha))));
  for (const nome of nomes) {
    const departamento = nome.trim().toUpperCase();
    const chave = chaveDepartamento(departamento);
    if (!chave || presentes.has(chave) || !permite(departamento)) continue;
    presentes.add(chave);
    resultado.push({ departamento });
  }
  return resultado;
}