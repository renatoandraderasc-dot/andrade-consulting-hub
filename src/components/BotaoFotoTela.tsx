import { useState } from "react";
import { Camera, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { gerarFotoElemento } from "@/lib/fotoElemento";

/** Botão que tira foto do elemento com o id informado e copia (ou baixa) o PNG. */
export default function BotaoFotoTela({ alvoId, nome }: { alvoId: string; nome: string }) {
  const [estado, setEstado] = useState<"livre" | "gerando" | "ok">("livre");

  const tirar = async () => {
    const el = document.getElementById(alvoId);
    if (!el) return;
    setEstado("gerando");
    try {
      const bg = getComputedStyle(document.body).backgroundColor;
      const blob = await gerarFotoElemento(el, {
        backgroundColor: bg,
        style: { margin: "0" },
      });
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("Print copiado! Cole no WhatsApp.");
      } catch {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${nome}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Print baixado! Envie no WhatsApp.");
      }
      setEstado("ok");
      setTimeout(() => setEstado("livre"), 2000);
    } catch {
      toast.error("Não foi possível gerar o print.");
      setEstado("livre");
    }
  };

  return (
    <button
      type="button"
      onClick={tirar}
      disabled={estado === "gerando"}
      title="Tirar print da tela"
      data-sem-foto
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-60"
    >
      {estado === "gerando" ? <Loader2 className="w-4 h-4 animate-spin" /> : estado === "ok" ? <Check className="w-4 h-4 text-primary" /> : <Camera className="w-4 h-4" />}
      Print
    </button>
  );
}
