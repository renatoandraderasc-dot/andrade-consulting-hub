import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import logoAndrade from "@/assets/andrade-logo.png";
import { TvItem, TvTela, listarItens, tvDb, urlMidia } from "@/lib/tv";
import { CatalogoItem, carregarBaseCatalogo, normalizarCodigo } from "@/lib/catalogoProdutos";

const RECARREGAR_MS = 10 * 60 * 1000;
const fmt = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

const TvPlayer = () => {
  const { id } = useParams();
  const { user, loading } = useAuth();
  const [tela, setTela] = useState<TvTela | null>(null);
  const [itens, setItens] = useState<TvItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [erro, setErro] = useState("");
  const timer = useRef<number>();

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
        try { setCatalogo(await carregarBaseCatalogo(t.store_id)); } catch { /* mantém anterior */ }
      }
    };
    carregar();
    const iv = window.setInterval(carregar, RECARREGAR_MS);
    let lock: any;
    (navigator as any).wakeLock?.request("screen").then((l: any) => (lock = l)).catch(() => {});
    return () => { window.clearInterval(iv); lock?.release?.(); };
  }, [user, id]);

  const atual = itens.length ? itens[idx % itens.length] : null;
  const proximo = () => setIdx((i) => (itens.length ? (i + 1) % itens.length : 0));

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!atual) return;
    if (atual.tipo === "video") {
      timer.current = window.setTimeout(proximo, Math.max(atual.duracao_seg, 600) * 1000); // segurança
    } else {
      timer.current = window.setTimeout(proximo, atual.duracao_seg * 1000);
    }
    return () => window.clearTimeout(timer.current);
  }, [atual?.id, idx, itens.length]);

  const telaCheia = () => document.documentElement.requestFullscreen?.().catch(() => {});

  if (loading) return null;
  if (!user) {
    return <div className="h-screen grid place-items-center bg-background text-foreground"><a className="underline" href={`/login?next=/tv/${id}`}>Entrar para ligar a TV</a></div>;
  }

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden cursor-none" onDoubleClick={telaCheia}>
      {erro && <div className="h-full grid place-items-center text-2xl">{erro}</div>}
      {!erro && !atual && <div className="h-full grid place-items-center text-2xl opacity-70">{tela ? "Sem programação ativa nesta TV" : "Carregando..."}</div>}

      {atual?.tipo === "foto" && urls[atual.id] && (
        <img key={atual.id} src={urls[atual.id]} className="w-full h-full object-contain animate-fade-in" alt={atual.titulo || ""} />
      )}
      {atual?.tipo === "video" && urls[atual.id] && (
        <video key={atual.id} src={urls[atual.id]} className="w-full h-full object-contain" autoPlay muted playsInline
          onEnded={proximo} onError={proximo} />
      )}
      {atual?.tipo === "pic" && <iframe key={atual.id} src="/pic/tv" className="w-full h-full border-0" title="PIC" />}
      {atual?.tipo === "texto" && (
        <div key={atual.id} className="h-full flex flex-col items-center justify-center p-16 text-center bg-gradient-to-br from-[hsl(222,60%,18%)] to-[hsl(222,60%,8%)]">
          {atual.titulo && <h2 className="text-6xl font-bold mb-8 text-[hsl(25,95%,55%)]">{atual.titulo}</h2>}
          <p className="text-5xl leading-tight whitespace-pre-line">{atual.config.texto}</p>
        </div>
      )}
      {atual?.tipo === "precos" && (() => {
        const mapa = new Map(catalogo.map((c) => [normalizarCodigo(c.codigo), c]));
        const linhas = (atual.config.codigos || []).map((c) => mapa.get(normalizarCodigo(c))).filter(Boolean) as CatalogoItem[];
        return (
          <div key={atual.id} className="h-full flex flex-col p-10 bg-gradient-to-br from-[hsl(222,60%,18%)] to-[hsl(222,60%,8%)]">
            <h2 className="text-6xl font-bold mb-8 text-[hsl(25,95%,55%)]">{atual.titulo || "Ofertas"}</h2>
            {linhas.length === 0 && <p className="text-3xl opacity-70">Buscando preços no sistema da loja...</p>}
            <div className={`grid gap-4 flex-1 content-start ${linhas.length > 8 ? "grid-cols-2" : "grid-cols-1"}`}>
              {linhas.slice(0, 16).map((p) => {
                const oferta = p.precoOferta && p.preco && p.precoOferta < p.preco;
                return (
                  <div key={p.codigo} className="flex items-center justify-between gap-6 bg-white/10 rounded-xl px-6 py-4">
                    <span className="text-3xl font-semibold uppercase truncate">{p.descricao}</span>
                    <span className="text-right shrink-0">
                      {oferta && <span className="block text-xl line-through opacity-60">{fmt(p.preco)}</span>}
                      <span className="text-5xl font-extrabold text-[hsl(48,100%,60%)]">{fmt(oferta ? p.precoOferta : p.preco)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {atual && atual.tipo !== "pic" && (
        <img src={logoAndrade} alt="Andrade Consultoria" className="absolute bottom-4 right-4 h-10 opacity-80" />
      )}
      {itens.length > 1 && (
        <div className="absolute top-0 left-0 h-1 bg-[hsl(25,95%,55%)]" key={`${idx}-bar`}
          style={{ animation: `tvbar ${atual?.tipo === "video" ? 0 : atual?.duracao_seg}s linear forwards`, width: 0 }} />
      )}
      <style>{`@keyframes tvbar{from{width:0}to{width:100%}}`}</style>
    </div>
  );
};

export default TvPlayer;
