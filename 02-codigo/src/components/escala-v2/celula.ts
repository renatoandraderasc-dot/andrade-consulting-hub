export const idCelula = (pessoaId: string, data: string) => `e2-${pessoaId}-${data}`;

/** Rola a grade até o dia e destaca a célula por alguns segundos. */
export function irParaCelula(pessoaId: string, data: string) {
  const el = document.getElementById(idCelula(pessoaId, data));
  if (!el) return;
  el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  el.classList.add("outline", "outline-2", "outline-primary");
  window.setTimeout(() => el.classList.remove("outline", "outline-2", "outline-primary"), 2500);
}
