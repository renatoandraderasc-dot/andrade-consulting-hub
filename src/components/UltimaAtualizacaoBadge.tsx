import { Clock, History } from "lucide-react";
import { useUltimaAtualizacao, formatarAtualizacao } from "@/lib/ultimaAtualizacao";

/** Mostra quando os dados da tela foram lidos do sistema da loja. */
export default function UltimaAtualizacaoBadge({ className = "" }: { className?: string }) {
  const { em, doCache } = useUltimaAtualizacao();
  if (!em) return null;
  const Icone = doCache ? History : Clock;
  return (
    <span
      title={doCache
        ? "O sistema da loja não respondeu agora. Mostrando as informações da última atualização."
        : "Informações lidas agora do sistema da loja."}
      className={`hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] ${
        doCache
          ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "border-border bg-secondary text-muted-foreground"
      } ${className}`}
    >
      <Icone className="w-3.5 h-3.5" />
      Atualizado em {formatarAtualizacao(em)}
    </span>
  );
}
