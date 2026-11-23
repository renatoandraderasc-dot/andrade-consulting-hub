import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Crop, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { LojaSimples } from "@/lib/lojasPermitidas";
import { RELATORIOS_WHATSAPP } from "@/lib/whatsappRelatorios";
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
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const arrasto = useRef<number | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    supabase.from("whatsapp_print_config").select("*").then(({ data }) => {
      const m: Record<string, ConfigPrint> = {};
      for (const r of (data || []) as any[]) m[r.relatorio_id] = { ...CONFIG_PRINT_PADRAO, ...r, qualidade: Number(r.qualidade) };
      setCfgs(m);
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

  const salvar = async () => {
    const { error } = await supabase.from("whatsapp_print_config").upsert({ relatorio_id: rid, ...cfg, updated_at: new Date().toISOString() });
    if (error) toast.error(error.message); else toast.success("Configuração salva");
  };

  const testar = async () => {
    const rel = RELATORIOS_WHATSAPP.find((r) => r.id === rid);
    if (!rel || !loja || !user) return;
    setOcupado(true); setPrevias([]);
    try {
      const blobs = await capturarTela(rel, loja, user.id, cfg);
      setPrevias(blobs.map((b) => URL.createObjectURL(b)));
    } catch (e) { toast.error(String((e as Error)?.message || e)); }
    finally { setOcupado(false); }
  };

  const abrirRecorte = async () => {
    const rel = RELATORIOS_WHATSAPP.find((r) => r.id === rid);
    if (!rel || !loja || !user) return;
    setOcupado(true); setInteira(null); setSel(null);
    try {
      const [b] = await capturarTela(rel, loja, user.id, { ...cfg, corte_topo: 0, corte_base: 0, altura_pagina: 0, formato: "png" });
      if (b) setInteira(URL.createObjectURL(b));
    } catch (e) { toast.error(String((e as Error)?.message || e)); }
    finally { setOcupado(false); }
  };
  const fracY = (e: React.PointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  };
  const aplicarRecorte = () => {
    const img = imgRef.current;
    if (!img || !sel) return;
    const alturaTela = img.naturalHeight * (cfg.largura / img.naturalWidth);
    const t = Math.min(sel.a, sel.b), f = Math.max(sel.a, sel.b);
    set({ corte_topo: Math.round(t * alturaTela), corte_base: Math.round((1 - f) * alturaTela) });
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
              <SelectContent>{RELATORIOS_WHATSAPP.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {n("largura", "Largura da tela (px)", "Mais estreito = letras maiores no celular. Padrão 1400.")}
          <div className="grid grid-cols-2 gap-3">
            {n("corte_topo", "Cortar em cima (px)", "Remove cabeçalho/filtros.")}
            {n("corte_base", "Cortar embaixo (px)", "Remove o rodapé.")}
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
                  <Button size="sm" disabled={!sel || Math.abs(sel.a - sel.b) < 0.01} onClick={aplicarRecorte}>Aplicar recorte</Button>
                </div>
              </div>
              <div className="relative cursor-crosshair select-none touch-none"
                onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); const y = fracY(e); arrasto.current = y; setSel({ a: y, b: y }); }}
                onPointerMove={(e) => { if (arrasto.current !== null) setSel({ a: arrasto.current, b: fracY(e) }); }}
                onPointerUp={() => { arrasto.current = null; }}>
                <img ref={imgRef} src={inteira} alt="Tela inteira" draggable={false} className="w-full rounded border border-border" />
                {sel && (() => { const t = Math.min(sel.a, sel.b) * 100, f = Math.max(sel.a, sel.b) * 100; return (<>
                  <div className="pointer-events-none absolute inset-x-0 top-0 bg-background/70" style={{ height: `${t}%` }} />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/70" style={{ height: `${100 - f}%` }} />
                  <div className="pointer-events-none absolute inset-x-0 border-2 border-dashed border-primary" style={{ top: `${t}%`, height: `${f - t}%` }} />
                </>); })()}
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
