// ============================================================
// Registro da ultima atualizacao dos dados vindos do sistema da loja.
// Cada consulta de relatorio informa aqui a data do dado exibido
// (leitura ao vivo ou ultima leitura guardada). O cabecalho mostra
// essa informacao em todas as telas.
// ============================================================
import { useEffect, useState } from "react";

export interface EstadoAtualizacao {
  /** ISO da leitura mostrada na tela */
  em: string | null;
  /** true quando o dado veio da ultima leitura guardada (loja fora do ar) */
  doCache: boolean;
}

let estado: EstadoAtualizacao = { em: null, doCache: false };
const ouvintes = new Set<(e: EstadoAtualizacao) => void>();

function publicar(novo: EstadoAtualizacao) {
  estado = novo;
  ouvintes.forEach((f) => f(estado));
}

/** Chamado a cada relatorio lido. */
export function registrarAtualizacao(em: string | null, doCache: boolean) {
  const quando = em || new Date().toISOString();
  // mantem sempre a leitura mais recente da tela
  if (!estado.em || quando >= estado.em || estado.doCache !== doCache) {
    publicar({ em: quando, doCache });
  }
}

/** Limpa ao trocar de tela/loja. */
export function limparAtualizacao() {
  publicar({ em: null, doCache: false });
}

export function useUltimaAtualizacao(): EstadoAtualizacao {
  const [v, setV] = useState(estado);
  useEffect(() => {
    ouvintes.add(setV);
    return () => { ouvintes.delete(setV); };
  }, []);
  return v;
}

export function formatarAtualizacao(em: string | null): string {
  if (!em) return "";
  const d = new Date(em);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}
