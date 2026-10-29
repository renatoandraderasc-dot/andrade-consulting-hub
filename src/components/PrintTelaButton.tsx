import { useState } from "react";
import { toPng } from "html-to-image";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** Botão flutuante: tira um "print" (imagem PNG) da tela atual e baixa. */
export default function PrintTelaButton({ targetId }: { targetId: string }) {
  const [busy, setBusy] = useState(false);
  const tirar = async () => {
    const el = document.getElementById(targetId);
    if (!el) return;
    setBusy(true);
    try {
      const bg = getComputedStyle(document.body).backgroundColor;
      const url = await toPng(el, { backgroundColor: bg, pixelRatio: 2, cacheBust: true, filter: (n) => !(n instanceof HTMLElement && n.dataset?.noPrint === "true") });
      const a = document.createElement("a");
      const d = new Date();
      a.download = `print-${document.title.replace(/[^\w-]+/g, "_")}-${d.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`;
      a.href = url;
      a.click();
      toast.success("Print salvo");
    } catch (e: any) {
      toast.error("Não foi possível tirar o print: " + (e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      data-no-print="true"
      onClick={tirar}
      disabled={busy}
      title="Tirar print desta tela"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90 disabled:opacity-60 print:hidden"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      Print
    </button>
  );
}
