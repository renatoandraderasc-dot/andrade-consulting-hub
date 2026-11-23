import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Copy, Crop, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { LojaSimples } from "@/lib/lojasPermitidas";
import { RELATORIOS_WHATSAPP, PAGINAS_SISTEMA, catalogoPrints, type RelatorioWhatsapp } from "@/lib/whatsappRelatorios";
import { capturarTela, CONFIG_PRINT_PADRAO, type ConfigPrint } from "@/lib/capturarTela";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Corte, divisão em páginas e formato dos prints enviados por tela. */
export default function ConfigPrintsTab({ lojas }: { lojas: LojaSimples[] }) {
  const { user } = useAuth();
  const [rid, setRid] = useState(RELATORIOS_WHATSAPP[0].id);
  const [cfgs, setCfgs] = useState<Record<string, ConfigPrint>>({});
  const [loja, setLoja] = useState("");
  const [previas, setPrevias] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [inteira, setInteira] = useState<string | null>(null);
  const [sel, setSel] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const arrasto = useRef<{ x: number; y: number } | null>(null);
  const [extras, setExtras] = useState<RelatorioWhatsapp[]>([]);
  const lista = [...RELATORIOS_WHATSAPP, ...extras];
  const rel = lista.find((r) => r.id === rid);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    supabase.from("whatsapp_print_config").select("*").then(({ data }) => {
      const m: Record<string, ConfigPrint> = {};
      for (const r of (data || []) as any[]) m[r.relatorio_id] = { ...CONFIG_PRINT_PADRAO, ...r, qualidade: Number(r.qualidade) };
      setCfgs(m);
      setExtras(catalogoPrints(data).filter((r) => r.personalizado));
    });
  }, []);
  useEffect(() => { if (!loja && lojas[0]) setLoja(lojas[0].id); }, [lojas, loja]);
  useEffect(() => { setPrevias([]); setInteira(null); setSel(null); }, [rid]);

  const cfg = cfgs[rid] ?? CONFIG_PRINT_PADRAO;
  const set = (p: Partial<ConfigPrint>) => setCfgs((c) => ({ ...c, [rid]: { ...cfg, ...p } }));
  const n = (k: keyof ConfigPrint, label: string, ajuda: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" min={0} value={cfg[k] as number} onChange={(e) => set({ [k]: Math.max(0, Number(e.target.value) || 0) } as Partial<ConfigPrint>)} />
      <p className="text-xs text-muted-foreground">{ajuda}</p>
    </div>
  );

  const setRel = (p: Partial<RelatorioWhatsapp>) => setExtras((xs) => xs.map((x) => (x.id === rid ? { ...x, ...p } : x)));
  const novoPrint = (base?: RelatorioWhatsapp) => {
    const id = `custom_${crypto.randomUUID().slice(0, 8)}`;
    const pg = PAGINAS_SISTEMA[0];
    const r: RelatorioWhatsapp = base ? { ...base, id, nome: `${base.nome} (2)`, personalizado: true } : { id, nome: pg.nome, rota: pg.rota, personalizado: true };
    setExtras((xs) => [...xs, r]);
    setCfgs((c) => ({ ...c, [id]: { ...(base ? cfg : CONFIG_PRINT_PADRAO) } }));
    setRid(id);
    toast.info("Ajuste o print e clique em Salvar");
  };
  const excluir = async () => {
    if (!rel?.personalizado || !confirm(`Excluir o print "${rel.nome}"?`)) return;
    await supabase.from("whatsapp_print_config").delete().eq("relatorio_id", rid);
    setExtras((xs) => xs.filter((x) => x.id !== rid));
    setRid(RELATORIOS_WHATSAPP[0].id);
  };

  const salvar = async () => {
    const extra = rel?.personalizado ? { nome: rel.nome, rota: rel.rota, aba: rel.aba || null } : {};
    const { error } = await supabase.from("whatsapp_print_config").upsert({ relatorio_id: rid, ...cfg, ...extra, updated_at: new Date().toISOString() } as any);
    if (error) toast.error(error.message); else toast.success("Configuração salva");
  };

  const testar = async () => {
    if (!rel || !loja || !user) return;
    setOcupado(true); setPrevias([]);
    try {
      const blobs = await capturarTela(rel, loja, user.id, cfg);
      setPrevias(blobs.map((b) => URL.createObjectURL(b)));
    } catch (e) { toast.error(String((e as Error)?.message || e)); }
    finally { setOcupado(false); }
  };

  const abrirRecorte = async () => {
    if (!rel || !loja || !user) return;
    setOcupado(true); setInteira(null); setSel(null);
    try {
      const [b] = await capturarTela(rel, loja, user.id, { ...cfg, corte_topo: 0, corte_base: 0, corte_esq: 0, corte_dir: 0, altura_pagina: 0, formato: "png" });
      if (b) setInteira(URL.createObjectURL(b));
    } catch (e) { toast.error(String((e as Error)?.message || e)); }
    finally { setOcupado(false); }
  };
  const frac = (e: React.PointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const ret = sel && { l: Math.min(sel.x1, sel.x2), r: Math.max(sel.x1, sel.x2), t: Math.min(sel.y1, sel.y2), b: Math.max(sel.y1, sel.y2) };
  const aplicarRecorte = () => {
    const img = imgRef.current;
    if (!img || !ret) return;
    const alturaTela = img.naturalHeight * (cfg.largura / img.naturalWidth);
    set({ corte_topo: Math.round(ret.t * alturaTela), corte_base: Math.round((1 - ret.b) * alturaTela),
      corte_esq: Math.round(ret.l * cfg.largura), corte_dir: Math.round((1 - ret.r) * cfg.largura) });
    setInteira(null); setSel(null);
    toast.success("Recorte aplicado. Gere a prévia e salve.");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader><CardTitle>Configuração do print</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Tela</Label>
            <Select value={rid} onValueChange={setRid}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{lista.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}{r.personalizado ? " ★" : ""}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => novoPrint()}><Plus className="mr-1 h-4 w-4" />Novo print</Button>
              <Button size="sm" variant="outline" disabled={!rel} onClick={() => rel && novoPrint(rel)}><Copy className="mr-1 h-4 w-4" />Outro print desta página</Button>
              {rel?.personalizado && <Button size="sm" variant="ghost" onClick={excluir}><Trash2 className="mr-1 h-4 w-4" />Excluir</Button>}
            </div>
          </div>
          {rel?.personalizado && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="space-y-1"><Label>Nome do print</Label><Input value={rel.nome} onChange={(e) => setRel({ nome: e.target.value })} /></div>
              <div className="space-y-1">
                <Label>Página</Label>
                <Select value={rel.rota} onValueChange={(v) => setRel({ rota: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAGINAS_SISTEMA.map((p) => <SelectItem key={p.rota} value={p.rota}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Aba (opcional)</Label><Input placeholder="Nome da aba a abrir" value={rel.aba ?? ""} onChange={(e) => setRel({ aba: e.target.value })} /></div>
            </div>
          )}
          {n("largura", "Largura da tela (px)", "Mais estreito = letras maiores no celular. Padrão 1400.")}
          <div className="grid grid-cols-2 gap-3">
            {n("corte_topo", "Cortar em cima (px)", "Remove cabeçalho/filtros.")}
            {n("corte_base", "Cortar embaixo (px)", "Remove o rodapé.")}
            {n("corte_esq", "Cortar à esquerda (px)", "Remove a lateral esquerda.")}
            {n("corte_dir", "Cortar à direita (px)", "Remove a lateral direita.")}
          </div>
          {n("altura_pagina", "Altura de cada página (px)", "0 = imagem única. Ex.: 1200 divide a tela em várias imagens (máx. 10).")}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Formato do arquivo</Label>
              <Select value={cfg.formato} onValueChange={(v) => set({ formato: v as ConfigPrint["formato"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="png">PNG (mais nítido)</SelectItem><SelectItem value="jpeg">JPG (mais leve)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Qualidade JPG (%)</Label>
              <Input type="number" min={30} max={100} disabled={cfg.formato !== "jpeg"} value={Math.round(cfg.qualidade * 100)}
                onChange={(e) => set({ qualidade: Math.min(1, Math.max(0.3, Number(e.target.value) / 100)) })} />
            </div>
          </div>
          <Button className="w-full" onClick={salvar}><Save className="mr-2 h-4 w-4" />Salvar</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Prévia</CardTitle>
          <div className="flex gap-2">
            <Select value={loja} onValueChange={setLoja}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Loja" /></SelectTrigger>
              <SelectContent>{lojas.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" disabled={ocupado || !loja} onClick={testar}><Camera className="mr-2 h-4 w-4" />{ocupado ? "Gerando…" : "Gerar prévia"}</Button>
            <Button variant="outline" disabled={ocupado || !loja} onClick={abrirRecorte}><Crop className="mr-2 h-4 w-4" />Recortar com o mouse</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {inteira && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Clique e arraste sobre a tela para marcar a parte que deve ser enviada.</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setInteira(null); setSel(null); }}>Cancelar</Button>
                  <Button size="sm" disabled={!ret || ret.b - ret.t < 0.01 || ret.r - ret.l < 0.01} onClick={aplicarRecorte}>Aplicar recorte</Button>
                </div>
              </div>
              <div className="relative cursor-crosshair select-none touch-none overflow-hidden"
                onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); const p = frac(e); arrasto.current = p; setSel({ x1: p.x, y1: p.y, x2: p.x, y2: p.y }); }}
                onPointerMove={(e) => { const a = arrasto.current; if (a) { const p = frac(e); setSel({ x1: a.x, y1: a.y, x2: p.x, y2: p.y }); } }}
                onPointerUp={() => { arrasto.current = null; }}>
                <img ref={imgRef} src={inteira} alt="Tela inteira" draggable={false} className="w-full rounded border border-border" />
                {ret && (<>
                  <div className="pointer-events-none absolute border-2 border-dashed border-primary" style={{ left: `${ret.l * 100}%`, top: `${ret.t * 100}%`, width: `${(ret.r - ret.l) * 100}%`, height: `${(ret.b - ret.t) * 100}%`, boxShadow: "0 0 0 9999px hsl(var(--background) / 0.7)" }} />
                </>)}
              </div>
            </div>
          )}
          {!previas.length && !inteira && <p className="text-sm text-muted-foreground">Gere uma prévia para ver exatamente as imagens que serão enviadas com o corte atual (não precisa salvar antes).</p>}
          {previas.map((u, i) => (
            <div key={u} className="space-y-1">
              <div className="text-xs text-muted-foreground">Imagem {i + 1} de {previas.length}</div>
              <img src={u} alt={`Prévia ${i + 1}`} className="w-full rounded border border-border" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
