import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Maximize, Pause, Play, ChevronLeft, ChevronRight, Newspaper, PackageX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVrRealizado, LOJA, canonDept } from "@/hooks/useVrRealizado";
import { usePicDepartments } from "@/hooks/usePicDepartments";
import { usePicDisplayMode } from "@/hooks/usePicDisplay";
import { useDepartamentosPermitidos } from "@/hooks/useDepartamentosPermitidos";
import { useHierarquiaVendas } from "@/hooks/useHierarquiaVendas";
import { carregarDepartamentosLoja } from "@/lib/departamentosLoja";
import TvWeather from "@/components/pic/TvWeather";
import andradeLogo from "@/assets/andrade-logo.png";

/**
 * PIC TV Canal: versão "TV corporativa" do PIC, separada da /pic/tv.
 * Ciclo: notícias → um departamento por vez → produtos sem venda → todos → reinicia.
 * Atualização automática (30 min) permitida por ser monitor sem operador.
 */

const REFRESH_MS = 30 * 60 * 1000;
const INTERVALOS = [10, 15, 20, 30, 45, 60];
const LS_KEY = "picTvCanalIntervalo";
const pad2 = (n: number) => String(n).padStart(2, "0");

const NOTICIAS = [
  { t: "Ruptura custa venda", d: "Gôndola vazia é cliente que leva o produto do concorrente. Confira a reposição a cada pico de movimento." },
  { t: "Perecíveis puxam o fluxo", d: "Açougue, padaria e hortifruti bem abastecidos e organizados aumentam a frequência de visitas da loja." },
  { t: "Preço visível vende mais", d: "Etiqueta correta e legível evita reclamação no caixa e transmite confiança ao cliente." },
  { t: "Quebra é lucro perdido", d: "Controle de validade e rodízio (o que vence primeiro vai na frente) protegem a margem do mês." },
  { t: "Atendimento faz diferença", d: "Cumprimentar e orientar o cliente é o que diferencia o supermercado de bairro das grandes redes." },
  { t: "Mix positivado", d: "Cada produto vendido no mês conta para o Mix. Exponha bem os itens que ainda não giraram." },
];

const fmtMoney = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtNum = (v: number) => Math.round(v).toLocaleString("pt-BR");
const deptLabel = (d: string) => (d === LOJA ? "Loja inteira" : d.charAt(0) + d.slice(1).toLowerCase());
function cor(pct: number, has: boolean) {
  if (!has) return "hsl(var(--muted-foreground))";
  if (pct >= 100) return "hsl(var(--success))";
  if (pct >= 80) return "hsl(var(--warning))";
  return "hsl(var(--danger))";
}

interface Kpi { real: number; metaAcum: number; metaMes: number; pct: number; has: boolean }
interface Dia { dia: number; real: number; meta: number }
interface DeptRes { dept: string; fat: Kpi; arr: Kpi; vol: Kpi; mix: Kpi; dias: Dia[] }

type Cena = { tipo: "noticias" } | { tipo: "dept"; dept: string } | { tipo: "semvenda" } | { tipo: "todos" };

export default function PicTvCanal() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { restrito, filtrarDepts } = useDepartamentosPermitidos();
  const [store, setStore] = useState<{ id: string; name: string } | null>(null);
  const storeId = store?.id || "";
  const soPct = usePicDisplayMode(storeId, true) === "percentual";

  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);

  const ref = useMemo(() => {
    const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    const ano = ontem.getFullYear(), mes = ontem.getMonth() + 1, diaCorte = ontem.getDate();
    const dias = new Date(ano, mes, 0).getDate();
    const ant = new Date(ano, mes - 2, 1);
    const aAno = ant.getFullYear(), aMes = ant.getMonth() + 1, aDias = new Date(aAno, aMes, 0).getDate();
    return {
      ano, mes, diaCorte, dias,
      ini: `${ano}-${pad2(mes)}-01`, fimMes: `${ano}-${pad2(mes)}-${pad2(dias)}`, ontem: `${ano}-${pad2(mes)}-${pad2(diaCorte)}`,
      antIni: `${aAno}-${pad2(aMes)}-01`, antFim: `${aAno}-${pad2(aMes)}-${pad2(aDias)}`,
    };
  }, [now.getDate()]);

  useEffect(() => { if (!authLoading && !user) navigate("/login"); }, [authLoading, user]);

  // Loja do login, validada pelas regras de acesso (sem troca/rotação de loja)
  useEffect(() => {
    if (!user) { setStore(null); return; }
    let ativo = true;
    (async () => {
      const saved = sessionStorage.getItem("selectedStoreId");
      const { data, error } = await supabase.from("stores").select("id, name").order("name");
      if (!ativo) return;
      if (error) { setStore(null); return; }
      const list = data || [];
      const sel = saved ? list.find((s) => s.id === saved) : list[0];
      setStore(sel || null);
      if (sel && !saved) sessionStorage.setItem("selectedStoreId", sel.id);
    })();
    return () => { ativo = false; };
  }, [user]);

  const { data: vr, refresh } = useVrRealizado(storeId, ref.ini, ref.ontem);
  const deptsConfig = usePicDepartments(storeId);
  const [deptsLoja, setDeptsLoja] = useState<string[]>([]);
  useEffect(() => { if (storeId) carregarDepartamentosLoja(storeId).then(setDeptsLoja); }, [storeId]);

  const [metasDia, setMetasDia] = useState<any[]>([]);
  const [metaMix, setMetaMix] = useState<Record<string, number>>({});
  const fetchMetas = useCallback(async () => {
    if (!storeId) return;
    const [{ data }, { data: mixRows }] = await Promise.all([
      supabase.from("store_daily_metrics").select("date, department, meta_vendas, meta_lucro, meta_volume, meta_mix")
        .eq("store_id", storeId).gte("date", ref.ini).lte("date", ref.fimMes),
      supabase.from("meta_mix").select("department, meta_mix").eq("store_id", storeId).eq("ano", ref.ano).eq("mes", ref.mes),
    ]);
    setMetasDia(data || []);
    setMetaMix(Object.fromEntries((mixRows || []).map((m: any) => [canonDept(m.department), Number(m.meta_mix) || 0])));
  }, [storeId, ref.ini, ref.fimMes, ref.ano, ref.mes]);
  useEffect(() => { fetchMetas(); }, [fetchMetas]);

  // Produtos sem venda: vendidos no mês anterior e ainda não vendidos neste mês
  const hAtual = useHierarquiaVendas(storeId, ref.ini, ref.ontem);
  const hAnt = useHierarquiaVendas(storeId, ref.antIni, ref.antFim);

  useEffect(() => {
    const t = setInterval(() => { fetchMetas(); refresh(); hAtual.refresh(); hAnt.refresh(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchMetas, refresh, hAtual.refresh, hAnt.refresh]);

  useEffect(() => {
    let lock: any = null;
    const req = async () => { try { lock = await (navigator as any).wakeLock?.request("screen"); } catch { /* recusado */ } };
    req();
    const onVis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release?.().catch(() => {}); };
  }, []);

  const departamentos = useMemo(() => {
    const base = deptsConfig && deptsConfig.length ? [...new Set(deptsConfig)] : [...new Set([...deptsLoja, ...Object.keys(vr ?? {})])];
    const f = base.filter((k) => k !== LOJA);
    return restrito ? filtrarDepts(f) : f;
  }, [deptsConfig, deptsLoja, vr, restrito]);

  const calc = useCallback((dept: string): DeptRes => {
    const key = canonDept(dept);
    const metas = metasDia.filter((m) => canonDept(m.department) === key);
    const real = (vr?.[key] || []).filter((r) => r.date <= ref.ontem);
    const sum = (a: any[], f: string) => a.reduce((s, r) => s + (Number(r[f]) || 0), 0);
    const acum = metas.filter((m) => m.date <= ref.ontem);
    const mk = (r: number, ma: number, mm: number, usarMes = false): Kpi => {
      const base = usarMes ? mm : ma;
      return { real: r, metaAcum: ma, metaMes: mm, pct: base > 0 ? (r / base) * 100 : 0, has: ma > 0 || mm > 0 };
    };
    const mixMes = Number(metaMix[key]) || sum(metas, "meta_mix");
    let ra = 0, ma = 0;
    const dias: Dia[] = [];
    for (let d = 1; d <= ref.diaCorte; d++) {
      const dt = `${ref.ano}-${pad2(ref.mes)}-${pad2(d)}`;
      ra += sum(real.filter((r) => r.date === dt), "vendas");
      ma += sum(metas.filter((m) => m.date === dt), "meta_vendas");
      dias.push({ dia: d, real: ra, meta: ma });
    }
    return {
      dept,
      fat: mk(sum(real, "vendas"), sum(acum, "meta_vendas"), sum(metas, "meta_vendas")),
      arr: mk(sum(real, "lucro"), sum(acum, "meta_lucro"), sum(metas, "meta_lucro")),
      vol: mk(sum(real, "volume"), sum(acum, "meta_volume"), sum(metas, "meta_volume")),
      mix: mk(sum(real, "mix"), mixMes, mixMes, true),
      dias,
    };
  }, [metasDia, metaMix, vr, ref]);

  const resultados = useMemo(() => departamentos.map(calc), [departamentos, calc]);
  const loja = useMemo(() => (restrito ? null : calc(LOJA)), [restrito, calc]);

  const semVenda = useMemo(() => {
    const vendidos = new Set((hAtual.linhas ?? []).map((l) => l.codigo || l.produto));
    const permit = new Set(departamentos.map(canonDept));
    return (hAnt.linhas ?? [])
      .filter((l) => (l.codigo || l.produto) && !vendidos.has(l.codigo || l.produto))
      .filter((l) => !permit.size || permit.has(canonDept(l.n1)))
      .sort((a, b) => b.vendas - a.vendas)
      .slice(0, 12);
  }, [hAtual.linhas, hAnt.linhas, departamentos]);

  const cenas: Cena[] = useMemo(() => [
    { tipo: "noticias" },
    ...departamentos.map((d) => ({ tipo: "dept" as const, dept: d })),
    ...(semVenda.length ? [{ tipo: "semvenda" as const }] : []),
    { tipo: "todos" },
  ], [departamentos, semVenda.length]);

  const [intervalo, setIntervalo] = useState<number>(() => Number(localStorage.getItem(LS_KEY)) || 20);
  useEffect(() => { localStorage.setItem(LS_KEY, String(intervalo)); }, [intervalo]);
  const [idx, setIdx] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [tick, setTick] = useState(0);
  const total = intervalo * 10;

  useEffect(() => {
    if (pausado) return;
    const t = setInterval(() => setTick((v) => v + 1), 100);
    return () => clearInterval(t);
  }, [pausado]);
  useEffect(() => {
    if (tick >= total) { setTick(0); setIdx((i) => (i + 1) % Math.max(cenas.length, 1)); }
  }, [tick, total, cenas.length]);
  const ir = (d: number) => { setTick(0); setIdx((i) => (i + d + cenas.length) % cenas.length); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); setPausado((p) => !p); }
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cenas.length]);

  const cena = cenas[idx % cenas.length] ?? { tipo: "noticias" };
  const noticia = NOTICIAS[Math.floor(now.getTime() / 60000) % NOTICIAS.length];
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="dark pic-tv min-h-screen bg-background text-foreground flex flex-col">
      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-[width] duration-100" style={{ width: `${(tick / total) * 100}%` }} />
      </div>
      <header className="tv-header">
        <img src={andradeLogo} alt="Andrade Consultoria" className="tv-logo" />
        <span className="tv-num rounded-md bg-primary px-3 py-1 text-primary-foreground text-2xl">PIC TV</span>
        <h1 className="tv-num tv-store" translate="no">{store?.name || "—"}</h1>
        <span className="flex-1" />
        <TvWeather />
        <div className="text-right tv-clock">
          <div className="tv-num" style={{ fontSize: "clamp(22px,2.6vw,56px)" }}>
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: "clamp(12px,1vw,22px)" }}>
            Dia {ref.diaCorte} de {ref.dias} · vendas até ontem
          </div>
        </div>
      </header>

      <main key={idx} className="flex-1 min-h-0 animate-fade-in">
        {cena.tipo === "noticias" && <CenaNoticias noticia={noticia} loja={loja} soPct={soPct} />}
        {cena.tipo === "dept" && <CenaDept r={resultados.find((r) => r.dept === cena.dept) ?? calc(cena.dept)} soPct={soPct} />}
        {cena.tipo === "semvenda" && <CenaSemVenda itens={semVenda} soPct={soPct} />}
        {cena.tipo === "todos" && <CenaTodos linhas={loja ? [...resultados, loja] : resultados} soPct={soPct} />}
      </main>

      <footer className="flex flex-wrap items-center gap-3 text-muted-foreground" style={{ fontSize: "clamp(11px,0.9vw,20px)" }}>
        <div className="flex gap-1.5">
          {cenas.map((_, i) => (
            <span key={i} className={`h-2.5 rounded-full ${i === idx ? "w-8 bg-primary" : "w-2.5 bg-secondary"}`} />
          ))}
        </div>
        <span className="flex-1" />
        <button onClick={() => ir(-1)} className="p-2 rounded-md bg-secondary text-secondary-foreground" aria-label="Cena anterior"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => setPausado((p) => !p)} className="p-2 rounded-md bg-secondary text-secondary-foreground" aria-label={pausado ? "Continuar" : "Pausar"}>
          {pausado ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
        </button>
        <button onClick={() => ir(1)} className="p-2 rounded-md bg-secondary text-secondary-foreground" aria-label="Próxima cena"><ChevronRight className="w-4 h-4" /></button>
        <label className="inline-flex items-center gap-2">
          Tempo por tela
          <select value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))} className="rounded-md bg-secondary text-secondary-foreground px-2 py-1">
            {INTERVALOS.map((s) => <option key={s} value={s}>{s}s</option>)}
          </select>
        </label>
        <button onClick={fullscreen} className="inline-flex items-center gap-2 p-2 rounded-md bg-secondary text-secondary-foreground"><Maximize className="w-4 h-4" /> Tela cheia</button>
      </footer>
    </div>
  );
}

function Big({ label, k, money, soPct, mix }: { label: string; k: Kpi; money?: boolean; soPct: boolean; mix?: boolean }) {
  const c = cor(k.pct, k.has);
  const valor = soPct ? (k.has ? `${Math.round(k.pct)}%` : "—") : mix ? fmtNum(k.real) : money ? fmtMoney(k.real) : fmtNum(k.real);
  const sub = !k.has ? "Sem meta" : soPct ? (mix ? "da meta do mês" : "da meta até ontem")
    : mix ? `Meta: ${fmtNum(k.metaMes)} produtos · ${Math.round(k.pct)}%`
    : `Meta até ontem ${money ? fmtMoney(k.metaAcum) : fmtNum(k.metaAcum)} · ${Math.round(k.pct)}%`;
  return (
    <div className="tv-card flex flex-col gap-2" style={{ borderLeft: `6px solid ${c}` }}>
      <div className="tv-title">{label}</div>
      <div className="tv-num" style={{ fontSize: "clamp(32px,3.6vw,84px)", lineHeight: 1, color: c }}>{valor}</div>
      <div className="h-2 rounded-full bg-secondary"><div className="h-full rounded-full" style={{ width: `${Math.min(k.pct, 100)}%`, background: c }} /></div>
      <div className="text-muted-foreground" style={{ fontSize: "clamp(13px,1.1vw,24px)" }}>{sub}</div>
    </div>
  );
}

function Evolucao({ dias, soPct }: { dias: Dia[]; soPct: boolean }) {
  const max = Math.max(1, ...dias.map((d) => Math.max(d.real, d.meta)));
  return (
    <div className="tv-card flex-1 min-h-0 flex flex-col">
      <div className="tv-title">Evolução dia a dia (acumulado × meta)</div>
      <div className="flex-1 flex items-end gap-1 min-h-[180px] pt-4">
        {dias.map((d) => {
          const pct = d.meta > 0 ? (d.real / d.meta) * 100 : 0;
          return (
            <div key={d.dia} className="flex-1 h-full flex flex-col justify-end items-center gap-1 relative">
              <span className="text-muted-foreground" style={{ fontSize: "clamp(9px,0.7vw,15px)" }}>
                {soPct ? (d.meta > 0 ? `${Math.round(pct)}%` : "") : ""}
              </span>
              <div className="w-full relative" style={{ height: `${(Math.max(d.real, d.meta) / max) * 100}%` }}>
                <div className="absolute inset-x-0 bottom-0 rounded-t" style={{ height: `${d.meta ? (d.meta / Math.max(d.real, d.meta)) * 100 : 0}%`, background: "hsl(var(--muted))" }} />
                <div className="absolute inset-x-[15%] bottom-0 rounded-t" style={{ height: `${(d.real / Math.max(d.real, d.meta, 1)) * 100}%`, background: cor(pct, d.meta > 0) }} />
              </div>
              <span className="text-muted-foreground" style={{ fontSize: "clamp(9px,0.7vw,15px)" }}>{d.dia}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CenaDept({ r, soPct }: { r: DeptRes; soPct: boolean }) {
  const melhor = [...r.dias].reverse().find((d) => d.meta > 0);
  return (
    <section className="h-full flex flex-col gap-4">
      <div className="flex items-baseline gap-4 flex-wrap">
        <h2 className="tv-num" style={{ fontSize: "clamp(36px,4.5vw,110px)", lineHeight: 1 }} translate="no">{deptLabel(r.dept)}</h2>
        {melhor && <span className="text-muted-foreground" style={{ fontSize: "clamp(14px,1.3vw,28px)" }}>
          Ritmo do mês: <b style={{ color: cor((melhor.real / melhor.meta) * 100, true) }}>{Math.round((melhor.real / melhor.meta) * 100)}%</b> da meta acumulada
        </span>}
      </div>
      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <Big label="Faturamento" k={r.fat} money soPct={soPct} />
        <Big label="Arrecadação" k={r.arr} money soPct={soPct} />
        <Big label="Volume" k={r.vol} soPct={soPct} />
        <Big label="Mix (produtos vendidos)" k={r.mix} soPct={soPct} mix />
      </div>
      <Evolucao dias={r.dias} soPct={soPct} />
    </section>
  );
}

function CenaNoticias({ noticia, loja, soPct }: { noticia: { t: string; d: string }; loja: DeptRes | null; soPct: boolean }) {
  return (
    <section className="h-full grid gap-6 lg:grid-cols-[1.4fr_1fr] items-stretch">
      <div className="tv-card flex flex-col justify-center gap-6">
        <div className="inline-flex items-center gap-3 text-primary tv-title"><Newspaper className="w-8 h-8" /> Notícias do varejo</div>
        <h2 className="tv-num" style={{ fontSize: "clamp(36px,4.2vw,100px)", lineHeight: 1.05 }}>{noticia.t}</h2>
        <p className="text-muted-foreground" style={{ fontSize: "clamp(18px,1.8vw,40px)" }}>{noticia.d}</p>
      </div>
      {loja && (
        <div className="flex flex-col gap-4">
          <Big label="Loja · Faturamento" k={loja.fat} money soPct={soPct} />
          <Big label="Loja · Arrecadação" k={loja.arr} money soPct={soPct} />
        </div>
      )}
    </section>
  );
}

function CenaSemVenda({ itens, soPct }: { itens: { produto: string; n1: string; codigo: string; vendas: number }[]; soPct: boolean }) {
  return (
    <section className="h-full flex flex-col gap-4">
      <h2 className="tv-num inline-flex items-center gap-3" style={{ fontSize: "clamp(30px,3.4vw,80px)" }}>
        <PackageX className="w-[1em] h-[1em] text-warning" /> Produtos que ainda não venderam este mês
      </h2>
      <p className="text-muted-foreground" style={{ fontSize: "clamp(14px,1.2vw,26px)" }}>Venderam no mês passado. Confira estoque, exposição e preço.</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {itens.map((p) => (
          <div key={p.codigo + p.produto} className="tv-card" style={{ borderLeft: "6px solid hsl(var(--warning))" }}>
            <div className="tv-num break-words" style={{ fontSize: "clamp(16px,1.4vw,32px)" }}>{p.produto}</div>
            <div className="text-muted-foreground" style={{ fontSize: "clamp(12px,1vw,22px)" }}>
              {deptLabel(canonDept(p.n1))}{p.codigo ? ` · cód. ${p.codigo}` : ""}{!soPct ? ` · mês passado ${fmtMoney(p.vendas)}` : ""}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CenaTodos({ linhas, soPct }: { linhas: DeptRes[]; soPct: boolean }) {
  const ks: { k: keyof Pick<DeptRes, "fat" | "arr" | "vol" | "mix">; l: string }[] = [
    { k: "fat", l: "Faturamento" }, { k: "arr", l: "Arrecadação" }, { k: "vol", l: "Volume" }, { k: "mix", l: "Mix" },
  ];
  return (
    <section className="h-full flex flex-col gap-3">
      <h2 className="tv-num" style={{ fontSize: "clamp(30px,3.4vw,80px)" }}>Todos os departamentos</h2>
      <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(140px,1fr) repeat(4, minmax(0,1fr))" }}>
        <div />
        {ks.map((x) => <div key={x.k} className="tv-title">{x.l}</div>)}
        {linhas.map((r) => (
          <div key={r.dept} className="contents">
            <div className={`tv-num flex items-center ${r.dept === LOJA ? "text-primary" : ""}`} style={{ fontSize: "clamp(16px,1.5vw,34px)" }} translate="no">{deptLabel(r.dept)}</div>
            {ks.map((x) => {
              const k = r[x.k];
              const c = cor(k.pct, k.has);
              return (
                <div key={x.k} className="tv-card py-2" style={{ borderLeft: `6px solid ${c}` }}>
                  <div className="tv-num" style={{ fontSize: "clamp(20px,2vw,46px)", color: c }}>
                    {x.k === "mix" && !soPct ? fmtNum(k.real) : k.has ? `${Math.round(k.pct)}%` : "—"}
                  </div>
                  {!soPct && x.k !== "mix" && <div className="text-muted-foreground text-sm">{x.k === "vol" ? fmtNum(k.real) : fmtMoney(k.real)}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
