export const formatBRL = (v: number | null | undefined) => {
  if (v == null || isNaN(Number(v))) return "R$ 0,00";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export const formatBRDate = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR");
};

export const parseBRNumber = (s: string): number | null => {
  if (s == null || s === "") return null;
  const cleaned = String(s).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
};

export const splitPrice = (v: number) => {
  const fixed = Math.abs(v).toFixed(2);
  const [inteiro, centavos] = fixed.split(".");
  return { inteiro, centavos };
};
