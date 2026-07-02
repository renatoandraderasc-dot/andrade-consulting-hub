import { useState, useEffect, useRef, ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ClientLayout from "@/components/ClientLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Save, Download, FileDown, Trash2, GripVertical, ArrowUp, ArrowDown, Upload, Loader2 } from "lucide-react";
import { THEMES, FORMATOS, ThemeKey, FormatoKey } from "@/lib/encarteThemes";
import { Encarte, EncarteItem, Produto } from "@/lib/encarteTypes";
import { EncartePreview } from "@/components/encarte/EncartePreview";
import { ProdutoAutocomplete } from "@/components/encarte/ProdutoAutocomplete";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const emptyEncarte = (): Encarte => ({
  nome: "Novo Encarte",
  tema: "ofertao",
  formato: "a4",
  colunas: 3,
  titulo: "OFERTAS DA SEMANA",
  validade_de: null,
  validade_ate: null,
  loja_nome: "",
  loja_telefone: "",
  loja_endereco: "",
  loja_logo_url: null,
});

const EncarteEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [encarte, setEncarte] = useState<Encarte>(emptyEncarte());
  const [itens, setItens] = useState<EncarteItem[]>([]);
  const [selected, setSelected] = useState<Produto | null>(null);
  const [precoOferta, setPrecoOferta] = useState<string>("");
  const [precoDe, setPrecoDe] = useState<string>("");
  const [destaque, setDestaque] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: e } = await supabase.from("encartes").select("*").eq("id", id).single();
      if (e) setEncarte(e as unknown as Encarte);
      const { data: its } = await supabase.from("encarte_itens").select("*, produto:produtos(*)").eq("encarte_id", id).order("ordem");
      if (its) setItens(its as unknown as EncarteItem[]);
    })();
  }, [id]);

  const addItem = () => {
    if (!selected) { toast.error("Selecione um produto"); return; }
    if (!precoOferta) { toast.error("Informe o preço de oferta"); return; }
    const novo: EncarteItem = {
      produto_id: selected.id,
      produto: selected,
      preco_oferta: Number(precoOferta.replace(",", ".")),
      preco_de: precoDe ? Number(precoDe.replace(",", ".")) : null,
      destaque,
      observacao: observacao || null,
      ordem: itens.length,
    };
    setItens((s) => [...s, novo]);
    setSelected(null); setPrecoOferta(""); setPrecoDe(""); setDestaque(false); setObservacao("");
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    setItens((s) => {
      const n = [...s];
      const t = idx + dir;
      if (t < 0 || t >= n.length) return n;
      [n[idx], n[t]] = [n[t], n[idx]];
      return n.map((it, i) => ({ ...it, ordem: i }));
    });
  };
  const removeItem = (idx: number) => setItens((s) => s.filter((_, i) => i !== idx).map((it, i) => ({ ...it, ordem: i })));
  const updateItem = (idx: number, patch: Partial<EncarteItem>) => setItens((s) => s.map((it, i) => i === idx ? { ...it, ...patch } : it));

  const uploadLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const path = `logos/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("imagens").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = await supabase.storage.from("imagens").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (data?.signedUrl) setEncarte((s) => ({ ...s, loja_logo_url: data.signedUrl }));
    toast.success("Logo enviado");
  };

  const salvar = async () => {
    setSaving(true);
    try {
      const payload = { ...encarte, updated_at: new Date().toISOString() };
      let encarteId = id;
      if (encarteId) {
        const { error } = await supabase.from("encartes").update(payload as any).eq("id", encarteId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("encartes").insert(payload as any).select().single();
        if (error) throw error;
        encarteId = data.id;
      }
      await supabase.from("encarte_itens").delete().eq("encarte_id", encarteId);
      if (itens.length) {
        const insert = itens.map((it, i) => ({
          encarte_id: encarteId,
          produto_id: it.produto_id,
          preco_oferta: it.preco_oferta,
          preco_de: it.preco_de,
          destaque: it.destaque,
          observacao: it.observacao,
          ordem: i,
        }));
        const { error } = await supabase.from("encarte_itens").insert(insert as any);
        if (error) throw error;
      }
      toast.success("Encarte salvo");
      if (!id) navigate(`/encartes/editor/${encarteId}`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const exportPNG = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true, backgroundColor: null });
      const link = document.createElement("a");
      link.download = `${encarte.nome || "encarte"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e: any) { toast.error("Falha ao gerar PNG: " + e.message); }
    finally { setExporting(false); }
  };

  const exportPDF = async () => {
    if (!previewRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true, backgroundColor: null });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pw / canvas.width, ph / canvas.height);
      pdf.addImage(img, "PNG", 0, 0, canvas.width * ratio, canvas.height * ratio);
      pdf.save(`${encarte.nome || "encarte"}.pdf`);
    } catch (e: any) { toast.error("Falha ao gerar PDF: " + e.message); }
    finally { setExporting(false); }
  };

  return (
    <ClientLayout>
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Editor de Encarte</h1>
            <p className="text-sm text-muted-foreground">Monte o encarte com preview em tempo real</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportPNG} disabled={exporting}><Download className="w-4 h-4 mr-2" /> PNG</Button>
            <Button variant="outline" onClick={exportPDF} disabled={exporting}><FileDown className="w-4 h-4 mr-2" /> PDF</Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
          {/* Painel */}
          <div className="space-y-4">
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold">Dados</h3>
              <div><Label>Nome do encarte</Label><Input value={encarte.nome} onChange={(e) => setEncarte({ ...encarte, nome: e.target.value })} /></div>
              <div><Label>Título</Label><Input value={encarte.titulo || ""} onChange={(e) => setEncarte({ ...encarte, titulo: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Válido de</Label><Input type="date" value={encarte.validade_de || ""} onChange={(e) => setEncarte({ ...encarte, validade_de: e.target.value })} /></div>
                <div><Label>Até</Label><Input type="date" value={encarte.validade_ate || ""} onChange={(e) => setEncarte({ ...encarte, validade_ate: e.target.value })} /></div>
              </div>
              <div><Label>Loja</Label><Input value={encarte.loja_nome || ""} onChange={(e) => setEncarte({ ...encarte, loja_nome: e.target.value })} /></div>
              <div><Label>Telefone / WhatsApp</Label><Input value={encarte.loja_telefone || ""} onChange={(e) => setEncarte({ ...encarte, loja_telefone: e.target.value })} /></div>
              <div><Label>Endereço</Label><Input value={encarte.loja_endereco || ""} onChange={(e) => setEncarte({ ...encarte, loja_endereco: e.target.value })} /></div>
              <div>
                <Label>Logo</Label>
                <div className="flex items-center gap-2">
                  <input hidden ref={logoInput} type="file" accept="image/*" onChange={uploadLogo} />
                  <Button variant="outline" size="sm" onClick={() => logoInput.current?.click()}><Upload className="w-4 h-4 mr-1" /> Enviar logo</Button>
                  {encarte.loja_logo_url && <img src={encarte.loja_logo_url} className="h-10 w-10 object-contain bg-white rounded p-0.5" alt="logo" />}
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <h3 className="font-semibold">Tema</h3>
              <div className="grid grid-cols-5 gap-2">
                {Object.values(THEMES).map((t) => (
                  <button key={t.key} type="button" onClick={() => setEncarte({ ...encarte, tema: t.key })}
                    className={`rounded-md p-1 border-2 ${encarte.tema === t.key ? "border-primary" : "border-transparent"}`}>
                    <div className="flex overflow-hidden rounded">
                      {t.swatch.map((c, i) => <div key={i} style={{ background: c, width: "100%", height: 24 }} />)}
                    </div>
                    <div className="text-[10px] mt-1 font-medium">{t.label}</div>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Formato</Label>
                  <Select value={encarte.formato} onValueChange={(v) => setEncarte({ ...encarte, formato: v as FormatoKey })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(FORMATOS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Colunas</Label>
                  <Select value={String(encarte.colunas)} onValueChange={(v) => setEncarte({ ...encarte, colunas: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{[2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n} colunas</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <h3 className="font-semibold">Adicionar produto</h3>
              <ProdutoAutocomplete onSelect={(p) => { setSelected(p); if (p.preco_regular) setPrecoDe(String(p.preco_regular).replace(".", ",")); }} />
              {selected && (
                <div className="border rounded p-3 space-y-2 bg-muted/30">
                  <div className="text-sm font-medium">{selected.descricao}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Preço oferta *</Label><Input value={precoOferta} onChange={(e) => setPrecoOferta(e.target.value)} placeholder="9,90" /></div>
                    <div><Label className="text-xs">Preço "de"</Label><Input value={precoDe} onChange={(e) => setPrecoDe(e.target.value)} placeholder="12,90" /></div>
                  </div>
                  <div className="flex items-center gap-2"><Switch checked={destaque} onCheckedChange={setDestaque} /><Label className="text-xs">Destaque (ocupa 2 colunas)</Label></div>
                  <Textarea placeholder="Observação (opcional)" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
                  <div className="flex gap-2"><Button size="sm" onClick={addItem}>Adicionar</Button><Button size="sm" variant="outline" onClick={() => setSelected(null)}>Cancelar</Button></div>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-2">Itens do encarte ({itens.length})</h3>
              <div className="space-y-2 max-h-96 overflow-auto">
                {itens.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 border rounded p-2 text-sm">
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 truncate">
                      <div className="font-medium truncate">{it.produto?.descricao}</div>
                      <div className="text-xs text-muted-foreground">R$ {it.preco_oferta.toFixed(2).replace(".", ",")}{it.destaque && " · destaque"}</div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => moveItem(i, -1)}><ArrowUp className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => moveItem(i, 1)}><ArrowDown className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => updateItem(i, { destaque: !it.destaque })} title="Alternar destaque">
                      <span className={`text-xs font-bold ${it.destaque ? "text-primary" : "text-muted-foreground"}`}>D</span>
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                  </div>
                ))}
                {itens.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">Nenhum item adicionado</div>}
              </div>
            </Card>
          </div>

          {/* Preview */}
          <Card className="p-4 overflow-auto bg-neutral-100 dark:bg-neutral-900">
            <EncartePreview ref={previewRef} encarte={encarte} itens={itens} scale={0.55} />
          </Card>
        </div>
      </div>
    </ClientLayout>
  );
};

export default EncarteEditor;
