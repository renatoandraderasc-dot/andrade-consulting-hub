import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload, Film } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { presentationFileKind, removePresentationMedia, savePresentationMedia } from "@/lib/presentation/media";
import { presentationSlides } from "@/lib/presentation/content";
import type { VisibleMedia } from "./PresentationSlide";

export default function MediaManager({ open, onOpenChange, media, onReload }: { open: boolean; onOpenChange: (open: boolean) => void; media: Record<string, VisibleMedia>; onReload: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState("partner");
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    const kind = presentationFileKind(file.type, target === "partner");
    if (!kind) { toast.error(target === "partner" ? "Envie a logo em PNG, JPG ou WebP." : "Envie uma foto PNG, JPG, WebP ou um vídeo MP4, WebM ou MOV."); return; }
    setBusy(true);
    try {
      await savePresentationMedia({ id: target, name: file.name, kind, file });
      await onReload();
      toast.success(target === "partner" ? "Logo do parceiro adicionada neste navegador." : "Mídia adicionada à apresentação neste navegador.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar a mídia."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const remove = async (id: string) => {
    setBusy(true);
    try { await removePresentationMedia(id); await onReload(); toast.success("Mídia removida."); }
    catch { toast.error("Não foi possível remover a mídia."); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="presentation-dialog max-w-3xl max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Logo do parceiro & mídias</DialogTitle><DialogDescription>Arquivos salvos somente neste navegador e dispositivo. Não são enviados às lojas nem incluídos no link compartilhado.</DialogDescription></DialogHeader>
    <input ref={input} type="file" className="hidden" accept={target === "partner" ? "image/png,image/jpeg,image/webp" : "image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"} aria-label="Selecionar mídia da apresentação" onChange={event => void upload(event.target.files?.[0])} />
    <div className="presentation-partner-upload"><div>{media.partner ? <img src={media.partner.url} alt="Logo do parceiro" className="h-20 w-36 object-contain" /> : <ImagePlus className="h-12 w-12 text-muted-foreground" />}</div><div className="min-w-0 flex-1"><h3 className="font-semibold">Parceiro da apresentação</h3><p className="text-sm text-muted-foreground break-words">{media.partner?.name ?? "PNG, JPG ou WebP"}</p></div><Button variant="outline" disabled={busy} onClick={() => { setTarget("partner"); setTimeout(() => input.current?.click(), 0); }}><Upload />{media.partner ? "Trocar logo" : "Adicionar logo"}</Button>{media.partner && <Button variant="ghost" size="icon" disabled={busy} aria-label="Remover logo do parceiro" onClick={() => void remove("partner")}><Trash2 /></Button>}</div>
    <h3 className="font-semibold mt-2">Fotos e vídeos por tela</h3><div className="divide-y divide-border">{presentationSlides.filter(slide => slide.screen).map(slide => <div key={slide.id} className="flex items-center gap-3 py-3"><Film className="h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{slide.title}</p><p className="text-xs text-muted-foreground break-words">{media[slide.id]?.name ?? "Tela ilustrativa incluída"}</p></div><Button size="icon" variant="outline" aria-label={`Adicionar foto ou vídeo em ${slide.title}`} disabled={busy} onClick={() => { setTarget(slide.id); setTimeout(() => input.current?.click(), 0); }}>{busy && target === slide.id ? <Loader2 className="animate-spin" /> : <Upload />}</Button>{media[slide.id] && <Button size="icon" variant="ghost" aria-label={`Restaurar tela de ${slide.title}`} disabled={busy} onClick={() => void remove(slide.id)}><Trash2 /></Button>}</div>)}</div>
  </DialogContent></Dialog>;
}