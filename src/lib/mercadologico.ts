import { pick } from "@/lib/vrReport";

export const MERCADOLOGICOS_INICIAIS = ["PADARIA", "AÇOUGUE", "HORTIFRUTI"];

export const normalizarMercadologico = (valor: unknown) =>
  String(valor ?? "").trim().toUpperCase();

export const mercadologicoNivel1 = (linha: unknown) => normalizarMercadologico(pick(
  linha,
  "m1_departamento", "mercadologico1", "mercadologico_1", "merc1",
  "n1", "nivel1", "departamento", "secao", "desc_secao", "descricao_secao",
  "sec", "dept", "grupo_1",
));

export const mercadologicoNivel2 = (linha: unknown) => normalizarMercadologico(pick(
  linha,
  "m2_grupo", "mercadologico2", "mercadologico_2", "merc2",
  "n2", "nivel2", "grupo", "categoria", "grupo_2",
));

export const mercadologicoNivel3 = (linha: unknown) => normalizarMercadologico(pick(
  linha,
  "m3_subgrupo", "mercadologico3", "mercadologico_3", "merc3",
  "n3", "nivel3", "subgrupo", "subcategoria", "grupo_3",
));