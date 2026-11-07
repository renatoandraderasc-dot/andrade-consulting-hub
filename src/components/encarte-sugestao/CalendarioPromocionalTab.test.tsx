import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BlocoCampanha } from "./CalendarioPromocionalTab";

it("preserva foco e edição em andamento quando outra campanha salva", () => {
  const s = { inicio: new Date(2026, 10, 2), fim: new Date(2026, 10, 5), fds: false };
  const c = { data_inicio: "2026-11-02", data_fim: "2026-11-05", nome: "", agv_pct: null, destaque: false };
  const salvar = vi.fn();
  const { rerender } = render(<BlocoCampanha s={s} c={c} salvar={salvar} />);
  const input = screen.getByPlaceholderText("Nome da campanha");
  input.focus();
  fireEvent.change(input, { target: { value: "Ofertas novas" } });
  rerender(<BlocoCampanha s={s} c={{ ...c, id: "salvo" }} salvar={salvar} />);
  expect(document.activeElement).toBe(input);
  expect((input as HTMLInputElement).value).toBe("Ofertas novas");
  fireEvent.blur(input);
  expect(salvar).toHaveBeenCalledWith(s, { nome: "Ofertas novas" });
});