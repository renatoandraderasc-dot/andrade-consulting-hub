import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Maximize, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVrRealizado, LOJA, canonDept } from "@/hooks/useVrRealizado";
import { usePicDepartments, usePicKpis } from "@/hooks/usePicDepartments";
import { usePicDisplayMode } from "@/hooks/usePicDisplay";
import { useDepartamentosPermitidos } from "@/hooks/useDepartamentosPermitidos";
import { carregarDepartamentosLoja } from "@/lib/departamentosLoja";

/**
 * PIC em modo monitor/TV. Mesmas fontes do PIC (metas em store_daily_metrics /
 * meta_mix, realizado via useVrRealizado), porém com corte D-1 (até ontem).
 * Único caso com atualização automática (30 min): monitor sem operador.
 */

type KpiKey = "fat" | "arr" | "vol" | "mix";
const KPIS: { key: KpiKey; label: string; unit: string }[] = [
  { key: "fat", label: "Faturamento", unit: "R$ vendas" },
  { key: "arr", label: "Arrecadação", unit: "R$ lucro bruto" },
  { key: "vol", label: "Volume", unit: "kg / unid." },
  { key: "mix", label: "Mix", unit: "itens distintos" },
];
const DEFAULT_DEPARTMENTS = ["PADARIA", "AÇOUGUE", "HORTIFRUTI"];
const REFRESH_MS = 30 * 60 * 1000;
const ROTATE_MS = 20 * 1000;

interface Cell {
  realizado: number;
  metaAcum: number;
  metaMes: number;
  pctAcum: number;
  pctMes: number;
  hasMeta: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const pctTxt = (v: number) => `${Math.round(v)}%`;

function fmtCompact(v: number, money: boolean) {
  const abs = Math.abs(v);
  const n = (x: number, d: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  let s: string;
  if (abs >= 1_000_000) s = `${n(v / 1_000_000, 2)} mi`;
  else if (abs >= 1_000) s = `${n(v / 1_000, 1)} mil`;
  else s = n(v, money ? 2 : 0);
  return money ? `R$ ${s}` : s;
}

function faixa(pct: number, hasMeta: boolean) {
  if (!hasMeta) return { txt: "Sem meta", color: "hsl(var(--muted-foreground))" };
  if (pct >= 100) return { txt: "No ritmo", color: "hsl(var(--success))" };
  if (pct >= 80) return { txt: "Atenção", color: "hsl(var(--warning))" };
  return { txt: "Abaixo", color: "hsl(var(--danger))" };
}

const deptLabel = (d: string) =>
  d === LOJA ? "Loja inteira" : d.charAt(0) + d.slice(1).toLowerCase();

export default function PicTv() {
  const { user, loading: authLoading, isGlobalAdmin } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { restrito, filtrarDepts } = useDepartamentosPermitidos();

  const lojaLogin = sessionStorage.getItem("selectedStoreId");
  // Cliente: fica preso à loja escolhida no login. Só o admin global troca de loja.
  const lojaFixa = params.get("loja") || (!isGlobalAdmin ? lojaLogin : null);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [storeId, setStoreId] = useState<string>(lojaFixa || sessionStorage.getItem("selectedStoreId") || "");
  const [rotacao, setRotacao] = useState<boolean>(() =>
    params.get("rotacao") === "0" || lojaFixa ? false : localStorage.getItem("pic_tv_rotacao") === "1",
  );
  const [modo, setModo] = useState<"valores" | "pct">(() =>
    params.get("modo") === "pct" ? "pct" : (localStorage.getItem("pic_tv_modo") as any) === "pct" ? "pct" : "valores",
  );
  const forcadoPct = usePicDisplayMode(storeId) === "percentual";
  const soPct = forcadoPct || modo === "pct";

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  // Referência D-1 no fuso de São Paulo
  const ref = useMemo(() => {
    const hoje = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    const ano = ontem.getFullYear();
    const mes = ontem.getMonth() + 1;
    const diaCorte = ontem.getDate();
    const dias = new Date(ano, mes, 0).getDate();
    return { ano, mes, diaCorte, dias, ini: `${ano}-${pad2(mes)}-01`, fimMes: `${ano}-${pad2(mes)}-${pad2(dias)}`, ontem: `${ano}-${pad2(mes)}-${pad2(diaCorte)}` };
  }, [now.getDate()]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, user]);

  // Lojas: RLS já devolve apenas as aprovadas em user_store_access (admin: todas)
  useEffect(() => {
    if (!user) return;
    supabase.from("stores").select("id, name").order("name").then(({ data }) => {
      const list = (data || []) as { id: string; name: string }[];
      const visiveis = lojaFixa ? list.filter((s) => s.id === lojaFixa) : list;
      setStores(visiveis.length ? visiveis : list);
      if (lojaFixa && visiveis.length) { setStoreId(lojaFixa); return; }
      if (!list.some((s) => s.id === storeId) && list.length) setStoreId(list[0].id);
    });
  }, [user, lojaFixa]);

  const storeName = stores.find((s) => s.id === storeId)?.name || "";

  const { data: vr, loading: loadingVr, refresh } = useVrRealizado(storeId, ref.ini, ref.ontem);
  const deptsConfig = usePicDepartments(storeId);
  // Índices ativos na Parametrização do PIC (vazio = todos)
  const kpisConfig = usePicKpis(storeId);
  const KPIS_ATIVOS = useMemo(() => {
    const mapa: Record<string, KpiKey> = { faturamento: "fat", arrecadacao: "arr", quantidade: "vol", volume: "mix" };
    if (!kpisConfig || !kpisConfig.length) return KPIS;
    const ativos = new Set(kpisConfig.map((k) => mapa[k]).filter(Boolean));
    const f = KPIS.filter((k) => ativos.has(k.key));
    return f.length ? f : KPIS;
  }, [kpisConfig]);
  const [deptsLoja, setDeptsLoja] = useState<string[]>([]);
  useEffect(() => {
    if (storeId) carregarDepartamentosLoja(storeId).then(setDeptsLoja);
  }, [storeId]);

  const [metasDia, setMetasDia] = useState<any[]>([]);
  const [metaMix, setMetaMix] = useState<Record<string, number>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchMetas = useCallback(async () => {
    if (!storeId) return;
    const [{ data }, { data: mixRows }] = await Promise.all([
      supabase
        .from("store_daily_metrics")
        .select("date, department, meta_vendas, meta_lucro, meta_volume, meta_mix")
        .eq("store_id", storeId)
        .gte("date", ref.ini)
        .lte("date", ref.fimMes),
      supabase.from("meta_mix").select("department, meta_mix").eq("store_id", storeId).eq("ano", ref.ano).eq("mes", ref.mes),
    ]);
    setMetasDia(data || []);
    setMetaMix(Object.fromEntries((mixRows || []).map((m: any) => [canonDept(m.department), Number(m.meta_mix) || 0])));
    setUpdatedAt(new Date());
  }, [storeId, ref.ini, ref.fimMes, ref.ano, ref.mes]);

  useEffect(() => {
    fetchMetas();
  }, [fetchMetas]);

  // Monitor: atualiza sozinho a cada 30 minutos
  useEffect(() => {
    const t = setInterval(() => {
      fetchMetas();
      refresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [fetchMetas, refresh]);

  // Rotação de lojas
  useEffect(() => {
    if (!rotacao || stores.length < 2) return;
    const t = setInterval(() => {
      setStoreId((cur) => {
        const i = stores.findIndex((s) => s.id === cur);
        return stores[(i + 1) % stores.length].id;
      });
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [rotacao, stores]);

  // Wake Lock
  useEffect(() => {
    let lock: any = null;
    const req = async () => {
      try {
        lock = await (navigator as any).wakeLock?.request("screen");
      } catch {
        /* navegador recusou */
      }
    };
    req();
    const onVis = () => document.visibilityState === "visible" && req();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release?.().catch(() => {});
    };
  }, []);

  // Mesma ordem de departamentos do PIC (Loja inteira fica por último aqui)
  const departamentos = useMemo(() => {
    const detectados = [...(deptsConfig ?? []), ...deptsLoja, ...Object.keys(vr ?? {})].filter((k) => k !== LOJA);
    if (restrito) return filtrarDepts(detectados);
    const keys = [...new Set(detectados)];
    const presentes = DEFAULT_DEPARTMENTS.filter((d) => keys.includes(d));
    const outros = keys.filter((k) => !presentes.includes(k)).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [...presentes, ...outros];
  }, [deptsConfig, deptsLoja, vr, restrito]);

  const matriz = useMemo(() => {
    const calc = (dept: string): Record<KpiKey, Cell> => {
      const key = canonDept(dept);
      const metas = metasDia.filter((m) => canonDept(m.department) === key);
      const real = (vr?.[key] || []).filter((r) => r.date <= ref.ontem);
      const sum = (arr: any[], f: string) => arr.reduce((a, r) => a + (Number(r[f]) || 0), 0);
      const acum = metas.filter((m) => m.date <= ref.ontem);
      const mk = (realizado: number, metaAcum: number, metaMes: number): Cell => ({
        realizado,
        metaAcum,
        metaMes,
        pctAcum: metaAcum > 0 ? (realizado / metaAcum) * 100 : 0,
        pctMes: metaMes > 0 ? (realizado / metaMes) * 100 : 0,
        hasMeta: metaAcum > 0 || metaMes > 0,
      });
      const metaMixMes = Number(metaMix[key]) || sum(metas, "meta_mix");
      return {
        fat: mk(sum(real, "vendas"), sum(acum, "meta_vendas"), sum(metas, "meta_vendas")),
        arr: mk(sum(real, "lucro"), sum(acum, "meta_lucro"), sum(metas, "meta_lucro")),
        vol: mk(sum(real, "volume"), sum(acum, "meta_volume"), sum(metas, "meta_volume")),
        // Mix não soma por dia: distintos no mês até ontem ÷ meta do mês
        mix: mk(sum(real, "mix"), metaMixMes, metaMixMes),
      };
    };
    const linhas = departamentos.map((d) => ({ dept: d, cells: calc(d) }));
    if (!restrito) {
      const loja = calc(LOJA);
      // Sem metas próprias da loja: soma dos setores
      (["fat", "arr", "vol", "mix"] as KpiKey[]).forEach((k) => {
        if (!loja[k].hasMeta) {
          const ma = linhas.reduce((a, l) => a + l.cells[k].metaAcum, 0);
          const mm = linhas.reduce((a, l) => a + l.cells[k].metaMes, 0);
          const r = loja[k].realizado || linhas.reduce((a, l) => a + l.cells[k].realizado, 0);
          loja[k] = { realizado: r, metaAcum: ma, metaMes: mm, pctAcum: ma ? (r / ma) * 100 : 0, pctMes: mm ? (r / mm) * 100 : 0, hasMeta: ma > 0 || mm > 0 };
        }
      });
      linhas.push({ dept: LOJA, cells: loja });
    }
    return linhas;
  }, [departamentos, metasDia, metaMix, vr, ref.ontem, restrito]);

  const metasLista = matriz
    .filter((l) => l.dept !== LOJA)
    .flatMap((l) => KPIS_ATIVOS.map((k) => ({ dept: l.dept, kpi: k.label, cell: l.cells[k.key] })))
    .filter((m) => m.cell.hasMeta);
  const noRitmo = metasLista.filter((m) => m.cell.pctAcum >= 100).length;
  const atencao = [...metasLista].sort((a, b) => a.cell.pctAcum - b.cell.pctAcum).slice(0, 3);
  const destaques = metasLista.filter((m) => m.cell.pctAcum > 100).sort((a, b) => b.cell.pctAcum - a.cell.pctAcum).slice(0, 3);

  const toggleModo = (m: "valores" | "pct") => {
    setModo(m);
    localStorage.setItem("pic_tv_modo", m);
  };
  const toggleRot = () => {
    setRotacao((r) => {
      localStorage.setItem("pic_tv_rotacao", r ? "0" : "1");
      return !r;
    });
  };
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const cellRef = useRef<HTMLDivElement>(null);
  const diasRestantes = ref.dias - ref.diaCorte;

  return (
    <div className="dark pic-tv min-h-screen bg-background text-foreground p-[1.2vw] flex flex-col gap-[1vw]">
      {/* Topo */}
      <header className="flex flex-wrap items-center gap-[1.5vw]">
        <span className="tv-num rounded-md bg-primary px-[0.8vw] py-[0.2vw] text-primary-foreground" style={{ fontSize: "clamp(20px,2.2vw,48px)" }}>PIC</span>
        <h1 className="tv-num truncate" style={{ fontSize: "clamp(22px,2.6vw,56px)" }} translate="no">{storeName || "—"}</h1>
        <div className="flex-1 min-w-[200px]">
          <div className="h-[0.6vw] min-h-[6px] rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${(ref.diaCorte / ref.dias) * 100}%` }} />
          </div>
          <p className="mt-1 text-muted-foreground" style={{ fontSize: "clamp(12px,1vw,22px)" }}>
            Dia {ref.diaCorte} de {ref.dias} · {diasRestantes} dias restantes · vendas até ontem
          </p>
        </div>
        <div className="text-right">
          <div className="tv-num" style={{ fontSize: "clamp(22px,2.6vw,56px)" }}>
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
          </div>
          <div className="text-muted-foreground" style={{ fontSize: "clamp(12px,1vw,22px)" }}>
            {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}
          </div>
        </div>
      </header>

      <main className="flex-1 grid gap-[1vw] lg:grid-cols-3">
        {/* Matriz */}
        <section className="lg:col-span-2" ref={cellRef}>
          <div className="tv-matrix">
            <div className="tv-head hidden md:contents">
              <div />
              {KPIS_ATIVOS.map((k) => (
                <div key={k.key} className="px-2">
                  <div className="tv-num" style={{ fontSize: "clamp(16px,1.5vw,34px)" }}>{k.label}</div>
                  <div className="text-muted-foreground" style={{ fontSize: "clamp(10px,0.8vw,18px)" }}>{k.unit}</div>
                </div>
              ))}
            </div>
            {matriz.map((l) => (
              <div key={l.dept} className={`tv-row ${l.dept === LOJA ? "tv-row-loja" : ""}`}>
                <div className="tv-num flex items-center" style={{ fontSize: "clamp(16px,1.5vw,34px)" }} translate="no">
                  {deptLabel(l.dept)}
                </div>
                {KPIS_ATIVOS.map((k) => (
                  <TvCell key={k.key} kpi={k.key} label={k.label} cell={l.cells[k.key]} soPct={soPct} />
                ))}
              </div>
            ))}
            {!matriz.length && (
              <p className="text-muted-foreground p-4">{loadingVr ? "Carregando…" : "Sem departamentos para exibir."}</p>
            )}
          </div>
        </section>

        {/* Coluna direita */}
        <aside className="flex flex-col gap-[1vw]">
          <div className="tv-card">
            <h2 className="tv-title">Metas no ritmo</h2>
            <div className="tv-num" style={{ fontSize: "clamp(36px,4.5vw,110px)", lineHeight: 1 }}>
              {noRitmo} <span className="text-muted-foreground" style={{ fontSize: "0.5em" }}>de {metasLista.length}</span>
            </div>
            <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${KPIS_ATIVOS.length}, minmax(0,1fr))` }}>
              {matriz.filter((l) => l.dept !== LOJA).flatMap((l) =>
                KPIS_ATIVOS.map((k) => (
                  <span key={l.dept + k.key} title={`${deptLabel(l.dept)} · ${k.label}`} className="h-[1.2vw] min-h-[10px] rounded-sm"
                    style={{ background: faixa(l.cells[k.key].pctAcum, l.cells[k.key].hasMeta).color, opacity: l.cells[k.key].hasMeta ? 1 : 0.25 }} />
                )),
              )}
            </div>
          </div>
          <div className="tv-card">
            <h2 className="tv-title">Precisa de atenção</h2>
            <ListaMetas items={atencao} />
          </div>
          <div className="tv-card">
            <h2 className="tv-title">Destaques</h2>
            {destaques.length ? <ListaMetas items={destaques} /> : <p className="text-muted-foreground">Nenhuma meta acima de 100% ainda.</p>}
          </div>
        </aside>
      </main>

      {/* Rodapé */}
      <footer className="flex flex-wrap items-center gap-3 text-muted-foreground" style={{ fontSize: "clamp(11px,0.9vw,20px)" }}>
        {[["No ritmo ≥100%", "--success"], ["Atenção 80–99%", "--warning"], ["Abaixo <80%", "--danger"]].map(([t, v]) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: `hsl(var(${v}))` }} />
            {t}
          </span>
        ))}
        <span className="flex-1" />
        {!lojaFixa && stores.length > 1 && (
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="rounded-md border border-border bg-secondary px-2 py-1 text-foreground" aria-label="Loja">
            {stores.map((s) => <option key={s.id} value={s.id} translate="no">{s.name}</option>)}
          </select>
        )}
        {!forcadoPct && (
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {(["valores", "pct"] as const).map((m) => (
              <button key={m} onClick={() => toggleModo(m)} className={`px-3 py-1 ${modo === m ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                {m === "valores" ? "Com valores" : "Só %"}
              </button>
            ))}
          </div>
        )}
        {!lojaFixa && stores.length > 1 && (
          <button onClick={toggleRot} className={`rounded-md border border-border px-3 py-1 ${rotacao ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
            Trocar loja a cada 20 s
          </button>
        )}
        <button onClick={fullscreen} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-3 py-1 text-foreground">
          <Maximize className="w-4 h-4" /> Tela cheia
        </button>
        <span className="inline-flex items-center gap-1">
          <RefreshCw className={`w-3.5 h-3.5 ${loadingVr ? "animate-spin" : ""}`} />
          Atualizado às {updatedAt ? updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "--:--"}
        </span>
      </footer>
    </div>
  );
}

function TvCell({ kpi, label, cell, soPct }: { kpi: KpiKey; label: string; cell: Cell; soPct: boolean }) {
  const f = faixa(cell.pctAcum, cell.hasMeta);
  const money = kpi === "fat" || kpi === "arr";
  const bar = Math.min(Math.max(cell.pctAcum, 0), 125) / 125 * 100;
  const diff = Math.round(cell.pctAcum - 100);
  let detalhe: string;
  if (!cell.hasMeta) detalhe = "Sem meta cadastrada";
  else if (soPct) detalhe = `Mês ${pctTxt(cell.pctMes)} · ${diff >= 0 ? `+${diff} pts` : `faltam ${Math.abs(diff)} pts`}`;
  else if (kpi === "mix") detalhe = `${Math.round(cell.realizado).toLocaleString("pt-BR")} de ${Math.round(cell.metaMes).toLocaleString("pt-BR")} itens · Mês ${pctTxt(cell.pctMes)}`;
  else detalhe = `${fmtCompact(cell.realizado, money)} de ${fmtCompact(cell.metaAcum, money)} até ontem · Mês ${pctTxt(cell.pctMes)}`;

  return (
    <div className="tv-cell" style={{ borderLeftColor: f.color }}>
      <div className="md:hidden text-muted-foreground text-xs">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <span className="tv-num" style={{ color: f.color, fontSize: "clamp(26px,2.8vw,64px)", lineHeight: 1 }}>
          {cell.hasMeta ? pctTxt(cell.pctAcum) : "—"}
        </span>
        <span className="rounded px-1.5 py-0.5 font-medium uppercase" style={{ color: f.color, border: `1px solid ${f.color}`, fontSize: "clamp(9px,0.7vw,16px)" }}>
          {f.txt}
        </span>
      </div>
      <div className="relative mt-1.5 h-[0.5vw] min-h-[5px] rounded-full bg-secondary">
        <div className="h-full rounded-full" style={{ width: `${bar}%`, background: f.color }} />
        <span className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-foreground" style={{ left: "80%" }} />
      </div>
      <div className="mt-1 text-muted-foreground truncate" style={{ fontSize: "clamp(10px,0.8vw,18px)" }}>{detalhe}</div>
    </div>
  );
}

function ListaMetas({ items }: { items: { dept: string; kpi: string; cell: Cell }[] }) {
  return (
    <ul className="space-y-1">
      {items.map((m) => {
        const f = faixa(m.cell.pctAcum, true);
        return (
          <li key={m.dept + m.kpi} className="flex justify-between gap-2" style={{ fontSize: "clamp(14px,1.2vw,28px)" }}>
            <span className="truncate" translate="no">{deptLabel(m.dept)} · {m.kpi}</span>
            <span className="tv-num" style={{ color: f.color }}>{pctTxt(m.cell.pctAcum)}</span>
          </li>
        );
      })}
    </ul>
  );
}
