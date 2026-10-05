import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import { Award, RefreshCw, Settings2, CheckCircle2, XCircle, Gift, Share2, Copy, Download, ShoppingCart, CircleDollarSign, Package, LayoutGrid, ShieldAlert, Trophy } from "lucide-react";
import logoAndrade from "@/assets/andrade-logo.png";

const ICONES = {
  faturamento: { Icon: ShoppingCart, bg: "bg-[#1f5fbf]", txt: "text-[#1f5fbf]" },
  arrecadacao: { Icon: CircleDollarSign, bg: "bg-[#0f6b2f]", txt: "text-[#0f6b2f]" },
  volume: { Icon: Package, bg: "bg-[#f26a1b]", txt: "text-[#e05a10]" },
  mix: { Icon: LayoutGrid, bg: "bg-[#5b3aa8]", txt: "text-[#5b3aa8]" },
} as const;
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { carregarLojaLogin } from "@/lib/lojasPermitidas";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CartProgressOverlay } from "@/components/CartProgress";
import { useVrRealizado, LOJA, canonDept } from "@/hooks/useVrRealizado";
import { useDepartamentosPermitidos } from "@/hooks/useDepartamentosPermitidos";
import { fmtBRL, fmtPct, MESES, diasNoMes } from "@/lib/metasSugestao";
import {
  carregarPremiacaoConfig, PREMIACAO_PADRAO, valoresDe, type PremiacaoConfig, type FotoKey,
} from "@/pages/MetasPremiacaoConfig";


interface Store { id: string; name: string }

type KpiKey = "faturamento" | "arrecadacao" | "volume" | "mix";

const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

const MetasPremiacao = () => {
  const { user, isAdmin, isGlobalAdmin, loading: authLoading } = useAuth();
  const { restrito, permiteDept, filtrarDepts } = useDepartamentosPermitidos();
  const navigate = useNavigate();
  const { toast } = useToast();


  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");

  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [ano, setAno] = useState(Number(hojeSP.slice(0, 4)));
  const [mes, setMes] = useState(Number(hojeSP.slice(5, 7)));

  const [cfg, setCfg] = useState<PremiacaoConfig>(PREMIACAO_PADRAO);
  const [metas, setMetas] = useState({ vendas: 0, lucro: 0, volume: 0, mix: 0 });
  const [metasDep, setMetasDep] = useState<Record<string, { vendas: number; lucro: number; volume: number; mix: number }>>({});
  const [carregandoMetas, setCarregandoMetas] = useState(false);
  const [dep, setDep] = useState<string>(LOJA);
  const [mostrarValores, setMostrarValores] = useState(cfg.mostrar_valores);


  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
    if (user && isAdmin) {
      carregarLojaLogin(user.id, isGlobalAdmin).then((data) => {
        if (!data?.length) return;
        setStores(data);
        const sid = sessionStorage.getItem("selectedStoreId");
        const p = data.find((s) => s.id === sid) || data[0];
        setStoreId(p.id); setStoreName(p.name);
      });
    }
  }, [user, isAdmin, isGlobalAdmin, authLoading]);

  const inicio = iso(ano, mes, 1);
  const fim = iso(ano, mes, diasNoMes(ano, mes));

  const atual = useVrRealizado(storeId, inicio, fim);

  useEffect(() => {
    if (!storeId) return;
    carregarPremiacaoConfig(storeId).then(setCfg);
  }, [storeId]);

  useEffect(() => {
    setMostrarValores(cfg.mostrar_valores);
  }, [cfg.mostrar_valores]);

  const carregarMetas = async () => {
    if (!storeId) return;
    setCarregandoMetas(true);
    const porDep: Record<string, { vendas: number; lucro: number; volume: number; mix: number }> = {};
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("store_daily_metrics")
        .select("department, meta_vendas, meta_lucro, meta_volume, meta_mix")
        .eq("store_id", storeId)
        .gte("date", inicio)
        .lte("date", fim)
        .range(from, from + 999);
      if (error || !data?.length) break;
      for (const r of data) {
        const dep = canonDept(r.department || "OUTROS") || "OUTROS";
        if (!permiteDept(dep)) continue;
        const d = porDep[dep] ?? (porDep[dep] = { vendas: 0, lucro: 0, volume: 0, mix: 0 });
        d.vendas += Number(r.meta_vendas) || 0;
        d.lucro += Number(r.meta_lucro) || 0;
        d.volume += Number(r.meta_volume) || 0;
        d.mix += Number(r.meta_mix) || 0;
      }
      if (data.length < 1000) break;
      from += 1000;
    }
    // Total da loja: usa a linha consolidada (LOJA/GERAL) quando existir;
    // caso contrário soma os departamentos, sem duplicar o consolidado.
    const consolidado = porDep[LOJA] ?? porDep["GERAL"];
    const acc = { vendas: 0, lucro: 0, volume: 0, mix: 0 };
    if (consolidado && consolidado.vendas > 0) {
      Object.assign(acc, consolidado);
    } else {
      for (const [k, v] of Object.entries(porDep)) {
        if (k === LOJA || k === "GERAL") continue;
        acc.vendas += v.vendas; acc.lucro += v.lucro; acc.volume += v.volume; acc.mix += v.mix;
      }
    }
    setMetas(acc);
    setMetasDep(porDep);
    setCarregandoMetas(false);
  };

  useEffect(() => { carregarMetas(); }, [storeId, inicio, fim]);

  const realizadoDep = useMemo(() => {
    const out: Record<string, { vendas: number; lucro: number; volume: number; mix: number }> = {};
    for (const k of Object.keys(atual.data ?? {})) {
      const key = k === LOJA ? LOJA : canonDept(k) || k.toUpperCase();
      const t = out[key] ?? (out[key] = { vendas: 0, lucro: 0, volume: 0, mix: 0 });
      for (const d of atual.data![k]) {
        t.vendas += d.vendas; t.lucro += d.lucro; t.volume += d.volume; t.mix += d.mix;
      }
    }
    return out;
  }, [atual.data]);

  const departamentosDisponiveis = useMemo(() => {
    const nomes = new Set<string>();
    Object.keys(metasDep).forEach((d) => { if (d !== LOJA && d !== "GERAL") nomes.add(d); });
    Object.keys(realizadoDep).forEach((d) => { if (d !== LOJA) nomes.add(d); });
    return Array.from(nomes).sort();
  }, [metasDep, realizadoDep]);


  const metasSel = dep === LOJA ? metas : (metasDep[dep] ?? { vendas: 0, lucro: 0, volume: 0, mix: 0 });
  const realizado = realizadoDep[dep] ?? { vendas: 0, lucro: 0, volume: 0, mix: 0 };

  const val = useMemo(() => valoresDe(cfg, dep === LOJA ? "LOJA" : dep), [cfg, dep]);

  const kpis = useMemo(() => {
    const min = val.atingimento_minimo || 99;
    const base: { key: KpiKey; label: string; sub?: string; meta: number; real: number; peso: number }[] = [
      { key: "faturamento", label: "FATURAMENTO", meta: metasSel.vendas, real: realizado.vendas, peso: val.peso_faturamento },
      { key: "arrecadacao", label: "MARGEM", sub: "(ARRECADAÇÃO)", meta: metasSel.lucro, real: realizado.lucro, peso: val.peso_arrecadacao },
      { key: "volume", label: "VOLUME", meta: metasSel.volume, real: realizado.volume, peso: val.peso_volume },
      { key: "mix", label: "MIX", meta: metasSel.mix, real: realizado.mix, peso: val.peso_mix },
    ];
    const calc = base.map((k) => ({ ...k, atingimento: pct(k.real, k.meta), atingiu: k.meta > 0 && pct(k.real, k.meta) >= min }));
    const gatilho = calc.some((k) => (k.key === "faturamento" || k.key === "arrecadacao") && k.atingiu);
    return calc.map((k) => ({
      ...k,
      pago: k.key === "volume" || k.key === "mix" ? k.atingiu && gatilho : k.atingiu,
      bloqueado: (k.key === "volume" || k.key === "mix") && k.atingiu && !gatilho,
    }));
  }, [metasSel, realizado, val]);

  const fotoTopo = dep === LOJA ? cfg.foto_cabecalho : (cfg.fotos_departamentos?.[dep] || cfg.foto_cabecalho);
  const titulo = dep === LOJA ? (storeName || "LOJA") : dep;


  const pctPago = kpis.reduce((s, k) => s + (k.pago ? k.peso || 0 : 0), 0);
  const valorPago = (val.valor_premiacao * pctPago) / 100;
  const todas = kpis.length > 0 && kpis.every((k) => k.pago);
  const carregando = atual.loading || carregandoMetas;

  const cartazRef = useRef<HTMLDivElement>(null);
  const [compartilhando, setCompartilhando] = useState(false);

  const nomeArquivo = () =>
    `Premiacao-${titulo}-${MESES[mes]}-${ano} - Andrade Consultoria Ltda.png`.replace(/[\\/:*?"<>|]/g, "-");

  // Converte imagens externas em data URL antes da captura (evita canvas "tainted" por CORS)
  const gerarBlob = async (): Promise<Blob> => {
    const el = cartazRef.current!;
    const imgs = Array.from(el.querySelectorAll("img"));
    const originais = new Map<HTMLImageElement, string>();
    await Promise.all(imgs.map(async (img) => {
      if (!img.src || img.src.startsWith("data:") || img.src.startsWith(window.location.origin)) return;
      try {
        const r = await fetch(img.src, { mode: "cors" });
        const b = await r.blob();
        const data: string = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(b); });
        originais.set(img, img.src);
        img.src = data;
        await img.decode().catch(() => {});
      } catch { /* mantém original */ }
    }));
    try {
      const canvas = await html2canvas(el, {
        backgroundColor: "#f4f4f4", scale: 2, useCORS: true, allowTaint: false,
        width: 768, windowWidth: 1280,
        onclone: (doc, clone) => {
          // Corrige deslocamento de texto do html2canvas com img display:block (Tailwind)
          const st = doc.createElement("style");
          st.innerHTML = "img{display:inline-block !important}";
          doc.head.appendChild(st);
          clone.style.width = "768px";
          clone.style.maxWidth = "768px";
          clone.style.borderRadius = "0";
        },
      });
      return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao gerar imagem"))), "image/png"));
    } finally {
      originais.forEach((src, img) => { img.src = src; });
    }
  };

  const baixar = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nomeArquivo(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const executar = async (acao: "share" | "copy" | "download") => {
    if (!cartazRef.current) return;
    setCompartilhando(true);
    try {
      const blob = await gerarBlob();
      if (acao === "download") {
        baixar(blob);
        toast({ title: "Imagem baixada" });
      } else if (acao === "copy") {
        if (!("ClipboardItem" in window) || !navigator.clipboard?.write) throw new Error("Seu navegador não permite copiar imagem. Use Baixar.");
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast({ title: "Imagem copiada", description: "Cole no WhatsApp com Ctrl+V." });
      } else {
        const file = new File([blob], nomeArquivo(), { type: "image/png" });
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        try {
          if (nav.canShare?.({ files: [file] })) {
            await nav.share({ files: [file], title: nomeArquivo() });
            return;
          }
        } catch (e: any) {
          if (e?.name === "AbortError") return;
        }
        baixar(blob);
        toast({ title: "Imagem baixada", description: "Compartilhamento direto indisponível neste navegador; envie o arquivo baixado." });
      }
    } catch (e: any) {
      toast({ title: "Erro ao gerar imagem", description: e?.message, variant: "destructive" });
    } finally {
      setCompartilhando(false);
    }
  };


  return (
    <ClientLayout>
      {carregando && <CartProgressOverlay label="Carregando demonstrativo..." />}
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <Award className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Demonstrativo de Pagamento de Metas</h1>
              <p className="text-sm text-muted-foreground">Layout pronto para enviar ao time</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-10 items-center rounded-md border border-border bg-secondary px-3 text-sm font-medium">{storeName}</div>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.slice(1).map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[ano - 2, ano - 1, ano, ano + 1].map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dep} onValueChange={setDep}>
              <SelectTrigger className="h-auto min-h-10 w-full sm:w-64 [&>span]:whitespace-normal [&>span]:break-words [&>span]:text-left"><SelectValue placeholder="Departamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={LOJA}>Loja (geral)</SelectItem>
                {departamentosDisponiveis.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
              <span className="text-xs text-muted-foreground">Valores</span>
              <Switch
                id="mostrar-valores-dem"
                checked={mostrarValores}
                onCheckedChange={(v) => setMostrarValores(v)}
              />
              <Label htmlFor="mostrar-valores-dem" className="text-xs text-muted-foreground">
                {mostrarValores ? "R$ + %" : "Apenas %"}
              </Label>
            </div>

            <Button variant="outline" size="sm" onClick={() => { atual.refresh(); carregarMetas(); }}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/metas/premiacao/config")}>
              <Settings2 className="h-4 w-4 mr-1" /> Parametrização
            </Button>
            <Button variant="outline" size="sm" onClick={() => executar("copy")} disabled={compartilhando}>
              <Copy className="h-4 w-4 mr-1" /> Copiar
            </Button>
            <Button variant="outline" size="sm" onClick={() => executar("download")} disabled={compartilhando}>
              <Download className="h-4 w-4 mr-1" /> Baixar
            </Button>
            <Button size="sm" onClick={() => executar("share")} disabled={compartilhando}>
              <Share2 className="h-4 w-4 mr-1" /> {compartilhando ? "Gerando..." : "Compartilhar"}
            </Button>
          </div>
        </div>

        {/* Demonstrativo — cartaz */}
        <div ref={cartazRef} className="mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-[#f4f4f4] text-[#111] shadow-xl">
          {/* Cabeçalho */}
          <div className="relative grid h-52 grid-cols-[38%_62%] bg-[#111]">
            <div className="relative z-10 flex flex-col items-center justify-center bg-white px-4">
              <img src={logoAndrade} alt="Andrade" className="h-20 w-auto object-contain" />
              <p className="mt-1 text-2xl font-black leading-tight tracking-tight">ANDRADE</p>
              <p className="text-[10px] font-bold leading-tight tracking-wide">ASSESSORIA COMERCIAL</p>
            </div>
            <div className="relative overflow-hidden">
              {fotoTopo ? (
                <img src={fotoTopo} alt="Setor" crossOrigin="anonymous" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#2f6b2f,#1b3d1b)" }} />
              )}
              <div className="absolute left-12 right-4 top-4 rounded-md border-2 border-[#d9c27a] bg-[#1f5a2b] px-3 py-1 text-center text-base font-extrabold uppercase text-white shadow-lg whitespace-normal [overflow-wrap:anywhere]">
                {titulo}
              </div>
            </div>
          </div>

          {/* Tarja do setor */}
          <div className="bg-[#111] px-5 pb-4">
            <div className="flex items-center gap-4 rounded-2xl border-2 border-[#f26a1b] bg-[#1a1a1a] px-5 py-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#f26a1b]">
                <ShoppingCart className="h-7 w-7 text-white" />
              </span>
              <span className="h-10 w-px bg-white/40" />
              <p className="min-w-0 flex-1 whitespace-normal [overflow-wrap:anywhere] text-center text-2xl font-black uppercase text-white sm:text-3xl">{titulo}</p>
            </div>
          </div>

          <div className="space-y-4 p-5">
            {/* KPIs 2x2 */}
            <div className="grid gap-4 sm:grid-cols-2">
              {kpis.map((k) => {
                const ic = ICONES[k.key];
                const cor = k.pago ? "text-[#0f6b2f]" : "text-[#b3141c]";
                const barra = k.pago ? "bg-[#0f6b2f]" : "bg-[#d61e26]";
                const money = k.key === "faturamento" || k.key === "arrecadacao";
                const f = (n: number) => (money ? fmtBRL(n) : Math.round(n).toLocaleString("pt-BR"));
                return (
                  <div key={k.key} className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${ic.bg}`}>
                        <ic.Icon className="h-6 w-6 text-white" />
                      </span>
                      <div className="flex-1 text-center">
                        <p className="text-lg font-extrabold uppercase">{k.label}</p>
                        {k.sub && <p className="text-xs font-bold uppercase">{k.sub}</p>}
                      </div>
                    </div>
                    <div className="my-3 h-px bg-[#d61e26]" />
                    <p className={`py-1 text-center text-5xl font-black leading-[1.1] ${cor}`}>
                      {k.meta > 0 ? k.atingimento.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                      <span className="text-2xl">%</span>
                    </p>
                    <p className={`mt-2 flex items-center justify-center gap-2 text-base font-extrabold uppercase leading-tight ${cor}`}>
                      {k.pago ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                      {k.pago ? "Atingido" : k.bloqueado ? "Sem gatilho" : "Não atingido"}
                    </p>
                    {mostrarValores && k.meta > 0 && (
                      <p className="mt-1 text-center text-[11px] text-[#555]">{f(k.real)} de {f(k.meta)}</p>
                    )}
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#ddd] px-3 py-1.5 text-[11px] font-bold">
                      <span>ACUMULADO</span>
                      <div className="h-1.5 flex-1 rounded-full bg-[#ddd]">
                        <div className={`h-full rounded-full ${barra}`} style={{ width: `${Math.min(100, k.atingimento)}%` }} />
                      </div>
                      <span>{fmtPct(k.atingimento, 2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Regra */}
            <div className="flex items-center gap-3 rounded-xl border-2 border-[#d61e26] bg-white px-4 py-2">
              <ShieldAlert className="h-8 w-8 shrink-0 text-[#d61e26]" />
              <div>
                <p className="text-sm font-extrabold">
                  <span className="text-[#b3141c]">REGRA DO PROGRAMA:</span> MENOS DE {val.atingimento_minimo || 99}% É NÃO ATINGIDO!
                </p>
                <p className="text-[11px] font-semibold">
                  GATILHO: MIX E VOLUME SÓ VALEM SE FATURAMENTO E/OU MARGEM (ARRECADAÇÃO) FOREM ATINGIDOS.
                </p>
              </div>
            </div>

            {/* Tabelas */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                <p className="bg-[#0e1a33] py-1.5 text-center text-sm font-bold text-white">PESO DOS KPIs (PREMIAÇÃO)</p>
                {[...kpis].sort((a, b) => (b.peso || 0) - (a.peso || 0)).map((k) => {
                  const ic = ICONES[k.key];
                  return (
                    <div key={k.key} className="flex items-center border-b border-[#eee] text-sm">
                      <span className={`m-1 flex h-7 w-7 items-center justify-center rounded ${ic.bg}`}><ic.Icon className="h-4 w-4 text-white" /></span>
                      <span className={`flex-1 px-2 font-semibold ${ic.txt}`}>{k.label}{k.sub ? " (ARRECADAÇÃO)" : ""}</span>
                      <span className={`w-16 border-l border-[#eee] text-center text-base font-extrabold ${ic.txt}`}>{fmtPct(k.peso || 0)}</span>
                    </div>
                  );
                })}
                <div className="flex bg-[#0e1a33] py-1.5 text-sm font-bold text-white">
                  <span className="flex-1 text-center">TOTAL</span>
                  <span className="w-16 text-center">{fmtPct(kpis.reduce((s, k) => s + (k.peso || 0), 0))}</span>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl bg-white shadow-sm">
                <p className="bg-[#0e1a33] py-1.5 text-center text-sm font-bold text-white">CÁLCULO DA PREMIAÇÃO</p>
                {[...kpis].sort((a, b) => (b.peso || 0) - (a.peso || 0)).map((k) => (
                  <div key={k.key} className={`flex border-b border-[#eee] py-1.5 text-sm font-semibold ${k.pago ? "text-[#0f6b2f]" : "text-[#b3141c]"}`}>
                    <span className="flex-1 px-3">{k.label} ({fmtPct(k.atingimento, 2)})</span>
                    <span className="w-16 border-l border-[#eee] text-center font-extrabold">{fmtPct(k.pago ? k.peso || 0 : 0)}</span>
                  </div>
                ))}
                <div className="flex bg-[#0f5a2a] py-2 font-bold text-white">
                  <span className="flex-1 px-3 text-sm">PERCENTUAL ATINGIDO</span>
                  <span className="w-16 text-center text-xl font-black">{fmtPct(pctPago)}</span>
                </div>
              </div>
            </div>

            {/* Premiação */}
            <div className="grid grid-cols-[80px_1fr_1fr] items-center rounded-2xl border-2 border-[#f26a1b] bg-[#111] px-4 py-3 text-center text-white">
              <Gift className="h-12 w-12 justify-self-center" />
              <div className="border-x border-white/30 px-2">
                <p className="text-xs font-bold uppercase">Percentual atingido</p>
                <p className="py-1 text-4xl font-black leading-[1.1] text-[#f26a1b]">{fmtPct(pctPago)}</p>
                <p className="text-[10px] font-bold uppercase">do valor da premiação</p>
              </div>
              <div className="px-2">
                <p className="text-xs font-bold uppercase">Valor da premiação</p>
                <p className="break-words py-1 text-3xl font-black leading-[1.1] text-[#f26a1b]">{fmtBRL(valorPago)}</p>
                <p className="text-[10px] font-bold uppercase">de {fmtBRL(val.valor_premiacao)}</p>
              </div>
            </div>

            {/* Rodapé */}
            <div className="flex items-center justify-center gap-3 rounded-xl bg-[#0e1a33] px-4 py-2 text-white">
              <Trophy className="h-7 w-7 shrink-0" />
              <div className="text-center">
                <p className="text-sm font-extrabold uppercase">{todas ? "Todas as metas atingidas! Parabéns à equipe!" : "Parabéns à equipe pelo esforço!"}</p>
                <p className="text-[10px] font-semibold uppercase">Vamos continuar evoluindo e superando nossas metas!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
};

export default MetasPremiacao;
