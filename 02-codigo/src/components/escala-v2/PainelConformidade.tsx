import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { AVISO_LEGAL } from "@/lib/escala-v2/leis";
import type { Validacao, Violacao } from "@/lib/escala-v2/motor";

interface Props {
  validacao: Validacao;
  aoAbrir?: (v: Violacao) => void;
}

/** Lista de conferência: uma linha por regra, com a base legal e o que foi encontrado. */
export default function PainelConformidade({ validacao, aoAbrir }: Props) {
  return (
    <div className="border rounded-md divide-y">
      {validacao.checklist.map(item => {
        const lista = validacao.violacoes.filter(v => v.regra === item.regra && v.nivel !== "info");
        const estado = item.erros ? "erro" : item.alertas ? "alerta" : "ok";
        const Icone = estado === "erro" ? CircleX : estado === "alerta" ? CircleAlert : CircleCheck;
        const cor = estado === "erro" ? "text-destructive" : estado === "alerta" ? "text-warning" : "text-success";
        return (
          <details key={item.regra} className="group" open={estado === "erro"}>
            <summary className={`flex items-start gap-3 p-3 list-none ${lista.length ? "cursor-pointer" : "cursor-default"}`}>
              <Icone size={18} className={`mt-0.5 shrink-0 ${cor}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{item.titulo}</div>
                <div className="text-xs text-muted-foreground">{item.legal ? item.base_legal : "Regra da operação, não é exigência legal"}</div>
              </div>
              <div className={`text-sm tabular-nums whitespace-nowrap ${cor}`}>
                {estado === "ok" ? "Sem pendência" : estado === "erro" ? `${item.erros} ${item.erros === 1 ? "pendência" : "pendências"}` : `${item.alertas} ${item.alertas === 1 ? "alerta" : "alertas"}`}
              </div>
            </summary>
            {lista.length > 0 && (
              <ul className="px-3 pb-3 pl-10 space-y-1.5">
                {lista.slice(0, 40).map((v, i) => (
                  <li key={i} className="text-sm">
                    {aoAbrir && v.pessoa_id && v.data
                      ? <button type="button" className="text-left hover:underline" onClick={() => aoAbrir(v)}>{v.mensagem}</button>
                      : v.mensagem}
                  </li>
                ))}
                {lista.length > 40 && <li className="text-xs text-muted-foreground">e mais {lista.length - 40}. A planilha de exportação traz a lista completa.</li>}
              </ul>
            )}
          </details>
        );
      })}
      <p className="p-3 text-xs text-muted-foreground">{AVISO_LEGAL}</p>
    </div>
  );
}
