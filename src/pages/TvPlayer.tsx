import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { TvItem, TvTela, listarItens, tvDb, urlMidia } from "@/lib/tv";
import { CatalogoItem, carregarBaseCatalogo, normalizarCodigo } from "@/lib/catalogoProdutos";

const RECARREGAR_MS = 10 * 60 * 1000;
const fmt = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

/** Distribui os itens pelas colunas físicas: item na posição i vai para a coluna i % colunas. */
export function distribuirColunas<T>(itens: T[], colunas: number): T[][] {
  const n = Math.max(1, colunas);
  const out: T[][] = Array.from({ length: n }, () => []);
  itens.forEach((it, i) => out[i % n].push(it));
  return out;
}

const ItemView = ({ atual, url, catalogo, proximo }: { atual: TvItem; url?: string; catalogo: CatalogoItem[]; proximo: () => void }) => {
  if (atual.tipo === "foto" && url) return <img key={atual.id} src={url} className="w-full h-full object-contain animate-fade-in" alt={atual.titulo || ""} />;
  if (atual.tipo === "video" && url) return <video key={atual.id} src={url} className="w-full h-full object-contain" autoPlay muted playsInline onEnded={proximo} onError={proximo} />;
  if (atual.tipo === "pic") return <iframe key={atual.id} src="/pic/tv" className="w-full h-full border-0" title="PIC" />;
  if (atual.tipo === "texto") return (
    <div key={atual.id} className="h-full flex flex-col items-center justify-center p-[4cqw] text-center bg-gradient-to-br from-[hsl(222,60%,18%)] to-[hsl(222,60%,8%)]">
      {atual.titulo && <h2 className="font-bold mb-[3cqh] text-[hsl(25,95%,55%)]" style={{ fontSize: "8cqh" }}>{atual.titulo}</h2>}
      <p className="leading-tight whitespace-pre-line" style={{ fontSize: "6cqh" }}>{atual.config.texto}</p>
    </div>
  );
  if (atual.tipo !== "precos") return null;
  const mapa = new Map(catalogo.map((c) => [normalizarCodigo(c.codigo), c]));
  let linhas = (atual.config.codigos || []).map((c) => mapa.get(normalizarCodigo(c))).filter(Boolean) as CatalogoItem[];
  const d2 = atual.config.descricoes || {};
  linhas = linhas.map((p) => { const t = d2[normalizarCodigo(p.codigo)]?.trim(); return t ? { ...p, descricao: t } : p; });
  if (url) return <ArtePrecos atual={atual} url={url} linhas={linhas} />;
  return (
    <div key={atual.id} className="h-full flex flex-col p-[3cqw] bg-gradient-to-br from-[hsl(222,60%,18%)] to-[hsl(222,60%,8%)]">
      <h2 className="font-bold mb-[2cqh] text-[hsl(25,95%,55%)]" style={{ fontSize: "7cqh" }}>{atual.titulo || "Ofertas"}</h2>
      {linhas.length === 0 && <p className="opacity-70" style={{ fontSize: "3.5cqh" }}>Buscando preços no sistema da loja...</p>}
      <div className="flex flex-col gap-[1cqh] flex-1">
        {linhas.map((p) => {
          const oferta = p.precoOferta && p.preco && p.precoOferta < p.preco;
          return (
            <div key={p.codigo} className="flex items-center justify-between gap-[2cqw] bg-white/10 rounded-xl px-[2cqw] py-[0.8cqh]">
              <span className="font-semibold uppercase truncate" style={{ fontSize: "3.4cqh" }}>{p.descricao}</span>
              <span className="text-right shrink-0">
                {oferta && <span className="block line-through opacity-60" style={{ fontSize: "2cqh" }}>{fmt(p.preco)}</span>}
                <span className="font-extrabold text-[hsl(48,100%,60%)]" style={{ fontSize: "4.6cqh" }}>{fmt(oferta ? p.precoOferta : p.preco)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Each row owns its stripe, product and price; no independently tiled background. */
export const ArtePrecos = ({ atual, url, linhas }: { atual: TvItem; url: string; linhas: CatalogoItem[] }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setTam({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const topo = tam.w * 335 / 1920;
  const nFaixas = Math.max(12, linhas.length);
  const faixa = Math.max(0, tam.h - topo) / nFaixas;
  const fs = Math.min(faixa / 100, tam.w / 1100);
  return (
    <div ref={ref} key={atual.id} className="relative w-full h-full overflow-hidden">
      <div className="absolute inset-x-0 top-0" style={{ height: topo, backgroundImage: `url(${url})`, backgroundSize: "100% auto", backgroundPosition: "top", backgroundRepeat: "no-repeat" }} />
      {linhas.length === 0 && <p className="absolute inset-x-0 text-center opacity-80" style={{ top: topo + faixa * 0.3, fontSize: 30 * fs }}>Buscando preços no sistema da loja...</p>}
      <div className="absolute inset-x-0 bottom-0 grid" style={{ top: topo, gridTemplateRows: `repeat(${nFaixas}, minmax(0, 1fr))` }}>
      {Array.from({ length: nFaixas }, (_, i) => {
        const p = linhas[i];
        if (!p) return <div key={`empty-${i}`} className="tv-price-row" />;
        const oferta = p.precoOferta && p.preco && p.precoOferta < p.preco;
        return (
          <div key={p.codigo} className="tv-price-row min-h-0 flex items-center overflow-hidden" style={{ padding: `${faixa * 0.1}px ${tam.w * 0.02}px`, gap: tam.w * 0.015 }}>
            <div className="flex-1 min-w-0 h-full flex items-center overflow-hidden">
              <span className="font-bold uppercase leading-tight break-words" style={{ fontSize: (p.descricao.length > 26 ? 32 : 42) * fs, overflowWrap: "anywhere" }}>{p.descricao}</span>
            </div>
            <div className="tv-price-value h-full flex flex-col items-center justify-center rounded-lg shrink-0 overflow-hidden" style={{ width: tam.w * 0.32 }}>
              {oferta && <span className="line-through opacity-60 leading-none" style={{ fontSize: 22 * fs }}>{fmt(p.preco)}</span>}
              <span className="font-extrabold leading-none" style={{ fontSize: 58 * fs }}>{fmt(oferta ? p.precoOferta : p.preco)}</span>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
};

/** Uma tela física (módulo) que gira sua própria programação. */
const Slot = ({ itens, urls, catalogo, mostrarLogo }: { itens: TvItem[]; urls: Record<string, string>; catalogo: CatalogoItem[]; mostrarLogo: boolean }) => {
  const [idx, setIdx] = useState(0);
  const timer = useRef<number>();
  const atual = itens.length ? itens[idx % itens.length] : null;
  const proximo = () => setIdx((i) => (itens.length ? (i + 1) % itens.length : 0));
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!atual || itens.length < 2) return;
    const seg = atual.tipo === "video" ? Math.max(atual.duracao_seg, 600) : atual.duracao_seg;
    timer.current = window.setTimeout(proximo, seg * 1000);
    return () => window.clearTimeout(timer.current);
  }, [atual?.id, idx, itens.length]);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ containerType: "size" } as any}>
      {atual ? <ItemView atual={atual} url={urls[atual.id]} catalogo={catalogo} proximo={proximo} /> : <div className="h-full bg-background" />}
      {itens.length > 1 && (
        <div className="absolute top-0 left-0 h-1 bg-[hsl(25,95%,55%)]" key={`${idx}-bar`} style={{ animation: `tvbar ${atual?.tipo === "video" ? 0 : atual?.duracao_seg}s linear forwards`, width: 0 }} />
      )}
    </div>
  );
};

const TvPlayer = () => {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const [tela, setTela] = useState<TvTela | null>(null);
  const [itens, setItens] = useState<TvItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [erro, setErro] = useState("");

  // TV: recarrega a programação periodicamente (exceção à regra de não buscar sozinho)
  useEffect(() => {
    if (!user || !id) return;
    const carregar = async () => {
      const { data: t } = await tvDb.from("tv_telas").select("*").eq("id", id).maybeSingle();
      if (!t) { setErro("TV não encontrada ou sem acesso para este login."); return; }
      setTela(t);
      const lista = (await listarItens(id)).filter((i) => i.ativo);
      setItens(lista);
      const u: Record<string, string> = {};
      for (const it of lista) if (it.midia_path) u[it.id] = await urlMidia(it.midia_path);
      setUrls(u);
      if (lista.some((i) => i.tipo === "precos")) {
        try { setCatalogo(await carregarBaseCatalogo(t.store_id, { fresco: true })); } catch { /* mantém anterior */ }
      }
    };
    carregar();
    const iv = window.setInterval(carregar, RECARREGAR_MS);
    let lock: any;
    (navigator as any).wakeLock?.request("screen").then((l: any) => (lock = l)).catch(() => {});
    return () => { window.clearInterval(iv); lock?.release?.(); };
  }, [user, id]);

  const telaCheia = () => document.documentElement.requestFullscreen?.().catch(() => {});
  const colunas = Math.max(1, tela?.colunas || 1);
  const linhasGrid = Math.max(1, tela?.linhas || 1);
  const modulos = colunas * linhasGrid;
  const grupos = distribuirColunas(itens, modulos);

  if (loading) return null;
  if (!user) {
    return <div className="h-screen grid place-items-center bg-background text-foreground"><a className="underline" href={`/login?next=/tv/${id}`}>Entrar para ligar a TV</a></div>;
  }

  return (
    <div className="fixed inset-0 bg-background text-foreground overflow-hidden cursor-none" onDoubleClick={telaCheia} data-testid="tv-canvas">
      {erro && <div className="h-full grid place-items-center text-2xl">{erro}</div>}
      {!erro && itens.length === 0 && <div className="h-full grid place-items-center text-2xl opacity-70">{tela ? "Sem programação ativa nesta TV" : "Carregando..."}</div>}
      {!erro && itens.length > 0 && (
        <div className="w-full h-full grid" style={{ gridTemplateColumns: `repeat(${colunas}, 1fr)`, gridTemplateRows: `repeat(${linhasGrid}, 1fr)` }}>
          {grupos.map((g, i) => (
            <div key={i} className="tv-module min-w-0 min-h-0 border-2">
              <Slot itens={g} urls={urls} catalogo={catalogo} mostrarLogo={i === modulos - 1} />
            </div>
          ))}
        </div>
      )}
      <style>{`@keyframes tvbar{from{width:0}to{width:100%}}`}</style>
    </div>
  );
};

export default TvPlayer;
