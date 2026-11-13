import { BarChart3, Database, FileText, Package, ShoppingCart, Tv, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/andrade-logo.png";
import supermarket from "@/assets/presentation/supermercado.jpg";
import { presentationChapters, type PresentationSlideData } from "@/lib/presentation/content";
import DemoScreen from "./DemoScreen";

export type VisibleMedia = { url: string; kind: "image" | "video"; name: string };
const screenAssets = import.meta.glob<{ default: { url: string } }>("/src/assets/presentation/*.jpg.asset.json", { eager: true });

export function builtInScreenUrl(id: string) {
  return screenAssets[`/src/assets/presentation/${id}.jpg.asset.json`]?.default.url;
}

export default function PresentationSlide({ slide, index, total, partner, media, onNavigate, onExpand }: { slide: PresentationSlideData; index: number; total: number; partner?: string; media?: VisibleMedia; onNavigate?: (index: number) => void; onExpand?: () => void }) {
  const imageUrl = builtInScreenUrl(slide.id);
  const icons = { database: Database, chart: BarChart3, finance: FileText, package: Package, people: Users, tv: Tv };
  const footer = <footer className="slide-footer"><span>ANDRADE CONSULTORIA</span><span>{slide.screen ? "Telas ilustrativas · Sem dados de clientes" : "Inteligência comercial para supermercados"}</span><span className="slide-page">{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span></footer>;

  return <article className={`slide-content slide-${slide.layout ?? "module"}`} data-slide-id={slide.id}>
    {slide.layout === "cover" || slide.layout === "closing" ? <><img className="slide-cover-photo" src={supermarket} alt="Ambiente ilustrativo de um supermercado" width={1920} height={1088} /><div className="slide-photo-scrim" /><div className="slide-cover-content"><div className="slide-cover-brand"><img src={logo} width={150} height={150} alt="Andrade Assessoria Comercial" />{partner && <><span className="slide-partner-line" /><img src={partner} className="slide-partner-image" alt="Logo do parceiro" /></>}</div><p className="slide-kicker">{slide.layout === "closing" ? "Vamos conversar" : "PLATAFORMA DE GESTÃO • SUPERMERCADOS"}</p><h1 className="slide-title-lg">Andrade<br />Consultoria<span>.</span></h1><p className="slide-subtitle">{slide.subtitle}</p><div className="slide-cover-points">{slide.points.map(point => <p className="slide-body" key={point}>{point}</p>)}</div></div>{footer}</> : <>
      <header className="slide-topline"><span><ShoppingCart size={28} /> ANDRADE CONSULTORIA</span>{partner ? <img src={partner} alt="Logo do parceiro" className="slide-top-partner" /> : <span className="slide-chrome">GESTÃO PARA SUPERMERCADOS</span>}</header>
      <div className="slide-module-heading"><p className="slide-kicker">{slide.chapter}</p><h2 className="slide-title">{slide.title}</h2><p className="slide-body-lg">{slide.subtitle}</p></div>
      {slide.layout === "overview" ? <div className="slide-chapters">{presentationChapters.map((chapter, i) => { const Icon = icons[chapter.icon as keyof typeof icons]; return <Button variant="ghost" className="slide-chapter" key={chapter.name} onClick={() => onNavigate?.(chapter.slide)}><div><span className="slide-chapter-number">0{i + 1}</span><Icon size={46} /></div><strong className="slide-subtitle">{chapter.name}</strong><span className="slide-body">{chapter.description}</span></Button>; })}</div> : <div className="slide-module-body"><div className="slide-module-points">{slide.points.map((point, i) => <div key={point}><span className="slide-point-number">0{i + 1}</span><p className="slide-body">{point}</p></div>)}</div><div className="slide-screen-area">
        {media?.kind === "video" ? <video className="slide-media" src={media.url} controls playsInline preload="metadata" aria-label={`Vídeo de ${slide.title}`} /> : media?.kind === "image" || imageUrl ? <Button variant="ghost" className="slide-screen-button" onClick={onExpand} aria-label={`Ampliar tela de ${slide.title}`}><img className="slide-media" src={media?.url ?? imageUrl} alt={`Tela ilustrativa de ${slide.title}`} loading="lazy" /></Button> : slide.screen && <Button variant="ghost" className="slide-screen-button" onClick={onExpand} aria-label={`Ampliar tela de ${slide.title}`}><DemoScreen kind={slide.screen} /></Button>}
      </div></div>}{footer}
    </>}
  </article>;
}