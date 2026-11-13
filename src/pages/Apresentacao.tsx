import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, FileDown, Film, Grid2X2, ImagePlus, List, MessageSquare, Monitor, Play, StickyNote, X, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import andradeLogo from "@/assets/andrade-logo.png";
import { builtInVideoUrl } from "@/lib/presentation/assets";
import { getPresentationMedia } from "@/lib/presentation/media";
import { nextSlideIndex, presentationSlides, readSlideIndex } from "@/lib/presentation/content";
import PresentationSlide, { builtInScreenUrl, type VisibleMedia } from "@/components/presentation/PresentationSlide";
import ScaledSlide from "@/components/presentation/ScaledSlide";
import MediaManager from "@/components/presentation/MediaManager";
import DemoScreen from "@/components/presentation/DemoScreen";

function IconAction({ title, children, onClick, disabled = false }: { title: string; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={title} disabled={disabled} onClick={onClick}>{children}</Button></TooltipTrigger><TooltipContent>{title}</TooltipContent></Tooltip>;
}

function loadNotes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem("andrade-presentation-notes") ?? "{}"); } catch { return {}; }
}

export default function Apresentacao() {
  const [params, setParams] = useSearchParams();
  const index = readSlideIndex(params.get("slide"));
  const slide = presentationSlides[index] ?? presentationSlides[0];
  const [grid, setGrid] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>(loadNotes);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [media, setMedia] = useState<Record<string, VisibleMedia>>({});
  const [mediaReady, setMediaReady] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const mediaUrls = useRef<string[]>([]);
  const [presenting, setPresenting] = useState(false);
  const [idle, setIdle] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const slideRef = useRef(index);
  slideRef.current = index;
  const touch = useRef<{ x: number; y: number } | null>(null);
  const captureKind = presentationSlides.find(item => item.id === params.get("capture"))?.screen;
  const printMode = params.has("print");
  const presenterMode = params.has("presenter");

  const goTo = useCallback((value: number) => {
    const target = Math.max(0, Math.min(presentationSlides.length - 1, value));
    setParams(previous => { const next = new URLSearchParams(previous); next.set("slide", String(target + 1)); return next; }, { replace: true });
    setGrid(false);
    channel.current?.postMessage({ type: "slide", index: target });
  }, [setParams]);
  const move = useCallback((direction: number) => goTo(nextSlideIndex(slideRef.current, direction)), [goTo]);

  const reloadMedia = useCallback(async () => {
    const saved = await getPresentationMedia();
    const urls: string[] = [];
    const next: Record<string, VisibleMedia> = {};
    for (const item of saved) { const url = URL.createObjectURL(item.file); urls.push(url); next[item.id] = { url, name: item.name, kind: item.kind }; }
    for (const url of mediaUrls.current) URL.revokeObjectURL(url);
    mediaUrls.current = urls;
    setMedia(next);
  }, []);

  useEffect(() => {
    void reloadMedia().catch(() => toast.error("As mídias salvas neste navegador não puderam ser carregadas.")).finally(() => setMediaReady(true));
    return () => { for (const url of mediaUrls.current) URL.revokeObjectURL(url); };
  }, [reloadMedia]);

  useEffect(() => {
    const previousTitle = document.title;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap";
    document.head.appendChild(link);
    return () => { document.title = previousTitle; link.remove(); };
  }, []);
  useEffect(() => { if (slide) document.title = `${index + 1}/${presentationSlides.length} — ${slide.title} | Andrade Consultoria`; }, [index, slide]);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const connection = new BroadcastChannel("andrade-presentation");
    channel.current = connection;
    connection.onmessage = event => {
      const message = event.data;
      if (message?.type === "slide" && Number.isInteger(message.index) && message.index >= 0 && message.index < presentationSlides.length) {
        setParams(previous => { const next = new URLSearchParams(previous); next.set("slide", String(message.index + 1)); return next; }, { replace: true });
      }
      if (message?.type === "request") connection.postMessage({ type: "slide", index: slideRef.current });
    };
    if (presenterMode) connection.postMessage({ type: "request" });
    return () => { connection.close(); channel.current = null; };
  }, [presenterMode, setParams]);

  const startPresentation = useCallback(async () => {
    setGrid(false); setPresenting(true);
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); }
    catch { /* Full viewport mode remains available on browsers without fullscreen. */ }
  }, []);
  const exitPresentation = useCallback(() => {
    setPresenting(false); setIdle(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => { if (!document.fullscreenElement) setPresenting(false); };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  useEffect(() => {
    if (!presenting) return;
    let timeout: ReturnType<typeof setTimeout>;
    const wake = () => { setIdle(false); clearTimeout(timeout); timeout = setTimeout(() => setIdle(true), 3000); };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("touchstart", wake);
    return () => { clearTimeout(timeout); window.removeEventListener("pointermove", wake); window.removeEventListener("touchstart", wake); };
  }, [presenting]);
  useEffect(() => {
    if (!presenterMode) return;
    const timer = setInterval(() => setElapsed(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [presenterMode]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input,textarea,select,video") || target.isContentEditable)) return;
      if (mediaOpen || zoom || videoOpen || printMode || captureKind) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) { event.preventDefault(); move(1); }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); move(-1); }
      if (event.key === "Home") { event.preventDefault(); goTo(0); }
      if (event.key === "End") { event.preventDefault(); goTo(presentationSlides.length - 1); }
      if (event.key === "F5") { event.preventDefault(); void startPresentation(); }
      if (event.key.toLowerCase() === "g" && !presenting) setGrid(value => !value);
      if (event.key === "Escape") exitPresentation();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, goTo, presenting, mediaOpen, zoom, videoOpen, printMode, captureKind, exitPresentation, startPresentation]);
  useEffect(() => {
    if (!printMode || !mediaReady) return;
    let canceled = false;
    const print = async () => {
      await document.fonts.ready;
      await Promise.race([Promise.all(Array.from(document.images).map(image => image.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 10000))]);
      if (!canceled) window.print();
    };
    void print();
    return () => { canceled = true; };
  }, [printMode, mediaReady]);

  if (!slide) return null;
  const renderSlide = (at = index) => { const item = presentationSlides[at]; return item ? <PresentationSlide slide={item} index={at} total={presentationSlides.length} partner={media.partner?.url} media={media[item.id]} onNavigate={goTo} onExpand={() => setZoom(true)} /> : null; };
  const currentNote = notes[slide.id] ?? slide.notes;
  const updateNote = (value: string) => { const next = { ...notes, [slide.id]: value }; setNotes(next); try { localStorage.setItem("andrade-presentation-notes", JSON.stringify(next)); } catch { toast.error("Não foi possível salvar as notas neste navegador."); } };
  const touchHandlers = {
    onTouchStart: (event: React.TouchEvent) => { const first = event.touches[0]; if (first) touch.current = { x: first.clientX, y: first.clientY }; },
    onTouchEnd: (event: React.TouchEvent) => { const end = event.changedTouches[0]; const start = touch.current; touch.current = null; if (!end || !start) return; const dx = end.clientX - start.x; if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(end.clientY - start.y) * 1.4) move(dx < 0 ? 1 : -1); },
  };
  const copyLink = async () => { try { const url = new URL(window.location.href); url.search = `?slide=${index + 1}`; await navigator.clipboard.writeText(url.href); toast.success("Link da tela copiado. Mídias locais não acompanham o link."); } catch { toast.error("Não foi possível copiar o link."); } };
  const navigation = <><IconAction title="Tela anterior" disabled={index === 0} onClick={() => move(-1)}><ChevronLeft /></IconAction><span className="tabular-nums">{String(index + 1).padStart(2, "0")} / {presentationSlides.length}</span><IconAction title="Próxima tela" disabled={index === presentationSlides.length - 1} onClick={() => move(1)}><ChevronRight /></IconAction></>;

  if (captureKind) return <div className="presentation-capture"><DemoScreen kind={captureKind} /></div>;
  if (printMode) return <div className="presentation-print">{presentationSlides.map((item, at) => <div className="presentation-print-slide" key={item.id}><PresentationSlide slide={item} index={at} total={presentationSlides.length} partner={media.partner?.url} media={media[item.id]?.kind === "image" ? media[item.id] : undefined} staticView /></div>)}</div>;
  if (presenterMode) return <div className="presentation-app presentation-presenter"><main><div className="flex items-center justify-between mb-4"><strong>Apresentador · {slide.title}</strong><span className="tabular-nums">{Math.floor(elapsed / 60).toString().padStart(2, "0")}:{(elapsed % 60).toString().padStart(2, "0")}</span></div><div className="presentation-presenter-current" {...touchHandlers}><ScaledSlide>{renderSlide()}</ScaledSlide></div><div className="presentation-navigation">{navigation}</div><div className="presentation-notes"><h3 className="font-semibold mb-3">Notas do apresentador</h3><textarea aria-label="Notas do apresentador" value={currentNote} onChange={event => updateNote(event.target.value)} /></div></main><aside><Button variant="outline" asChild><Link to={`/apresentacao?slide=${index + 1}`}><ArrowLeft /> Voltar à apresentação</Link></Button><p className="mt-7 text-sm font-medium">Próxima tela</p><div className="presentation-presenter-next"><ScaledSlide>{renderSlide(index + 1)}</ScaledSlide></div></aside></div>;

  return <div className="presentation-app"><header className="presentation-toolbar"><div className="presentation-brand"><Link to="/" aria-label="Página inicial"><img src={andradeLogo} alt="Andrade Consultoria" width={42} height={42} /></Link><div><strong>Andrade Consultoria</strong><small>Apresentação da plataforma</small></div></div><div className="presentation-toolbar-actions"><IconAction title={grid ? "Ver tela" : "Visão geral"} onClick={() => setGrid(value => !value)}>{grid ? <List /> : <Grid2X2 />}</IconAction><IconAction title="Notas do apresentador" onClick={() => setNotesOpen(value => !value)}><StickyNote /></IconAction><IconAction title="Abrir visão do apresentador" onClick={() => window.open(`/apresentacao?slide=${index + 1}&presenter`, "andrade-presenter")}><Monitor /></IconAction><IconAction title="Vídeo de demonstração" disabled={!builtInVideoUrl} onClick={() => setVideoOpen(true)}><Film /></IconAction><IconAction title="Copiar link desta tela" onClick={() => void copyLink()}><Copy /></IconAction><IconAction title="Exportar PDF" onClick={() => { toast.info('Na janela de impressão, escolha “Salvar como PDF”. Vídeos não são incluídos.'); window.open("/apresentacao?print", "_blank"); }}><FileDown /></IconAction><Button variant="outline" size="sm" aria-label="Logo & mídias" title="Logo & mídias" onClick={() => setMediaOpen(true)}><ImagePlus /><span className="presentation-action-text">Logo & mídias</span></Button><Button size="sm" aria-label="Apresentar" title="Apresentar" onClick={() => void startPresentation()}><Play /><span className="presentation-action-text">Apresentar</span></Button></div></header>
    <div className="presentation-workspace"><aside className="presentation-sidebar"><div className="presentation-sidebar-label"><span>ROTEIRO DA APRESENTAÇÃO</span><span>{presentationSlides.length}</span></div>{presentationSlides.map((item, at) => <Button key={item.id} variant="ghost" className="presentation-slide-link" aria-current={at === index ? "step" : undefined} onClick={() => goTo(at)}><span>{String(at + 1).padStart(2, "0")}</span><span>{item.title}</span></Button>)}</aside><main className="presentation-main"><div className="presentation-stage-label"><span>{grid ? "VISÃO GERAL" : `${slide.chapter.toUpperCase()} / ${slide.title}`}</span><span>SEM DADOS DE CLIENTES</span></div>
      {grid ? <div className="presentation-grid">{presentationSlides.map((item, at) => <Button key={item.id} variant="ghost" className="presentation-grid-item" aria-label={`Abrir tela ${at + 1}: ${item.title}`} onClick={() => goTo(at)}><ScaledSlide><PresentationSlide slide={item} index={at} total={presentationSlides.length} partner={media.partner?.url} media={media[item.id]?.kind === "image" ? media[item.id] : undefined} staticView /></ScaledSlide><span><span className="text-muted-foreground">{String(at + 1).padStart(2, "0")}</span>{item.title}</span></Button>)}</div> : <><div className="presentation-canvas" {...touchHandlers}><ScaledSlide>{renderSlide()}</ScaledSlide></div><div className="presentation-progress"><div style={{ width: `${(index + 1) / presentationSlides.length * 100}%` }} /></div><div className="presentation-navigation">{navigation}{slide.screen && <IconAction title="Ampliar tela demonstrativa" onClick={() => setZoom(true)}><ZoomIn /></IconAction>}</div></>}
      {notesOpen && <div className="presentation-notes"><div className="presentation-notes-header"><h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="h-4 w-4" /> Notas do apresentador</h3><span className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3 w-3" /> Neste navegador</span></div><textarea aria-label="Notas do apresentador" value={currentNote} onChange={event => updateNote(event.target.value)} /></div>}
    </main></div>
    <Dialog open={videoOpen} onOpenChange={setVideoOpen}><DialogContent className="presentation-dialog max-w-[94vw]"><DialogHeader><DialogTitle>Visão da plataforma · vídeo ilustrativo</DialogTitle></DialogHeader><video src={builtInVideoUrl} className="presentation-zoom-image" controls playsInline preload="metadata" aria-label="Vídeo de demonstração da plataforma" /></DialogContent></Dialog>
    <MediaManager open={mediaOpen} onOpenChange={setMediaOpen} media={media} onReload={reloadMedia} />
    <Dialog open={zoom} onOpenChange={setZoom}><DialogContent className="presentation-dialog max-w-[94vw] max-h-[92dvh] overflow-hidden"><DialogHeader><DialogTitle>{slide.title} · demonstração</DialogTitle></DialogHeader>{media[slide.id]?.kind === "video" ? <video src={media[slide.id]?.url} className="presentation-zoom-image" controls playsInline /> : builtInScreenUrl(slide.id) || media[slide.id]?.url ? <img src={media[slide.id]?.url ?? builtInScreenUrl(slide.id)} className="presentation-zoom-image" alt={`Tela de ${slide.title}`} /> : slide.screen && <div className="overflow-auto"><DemoScreen kind={slide.screen} /></div>}</DialogContent></Dialog>
    {presenting && <div className={`presentation-fullscreen ${idle ? "presentation-fullscreen-idle" : ""}`} {...touchHandlers}><ScaledSlide>{renderSlide()}</ScaledSlide><div className={`presentation-fullscreen-nav ${idle ? "presentation-fullscreen-nav-idle" : ""}`}>{navigation}<IconAction title="Sair da apresentação" onClick={exitPresentation}><X /></IconAction></div></div>}
  </div>;
}