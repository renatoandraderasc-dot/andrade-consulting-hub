import { WifiOff } from "lucide-react";

interface Props {
  message?: string | null;
  className?: string;
}

/** Aviso exibido quando a API do VR nao responde. Nunca mostrar zeros no lugar. */
export default function VrOfflineNotice({ message, className = "" }: Props) {
  return (
    <div
      className={`rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-6 text-center ${className}`}
    >
      <WifiOff className="w-5 h-5 mx-auto mb-2 text-amber-500" />
      <p className="text-sm font-semibold text-foreground">Sem conexão com o VR</p>
      <p className="text-xs text-muted-foreground mt-1">
        Os dados de realizado não puderam ser consultados agora. Nada é exibido para não confundir
        falta de conexão com falta de venda.
      </p>
      {message && <p className="text-[10px] text-muted-foreground/70 mt-2 font-mono">{message}</p>}
    </div>
  );
}
