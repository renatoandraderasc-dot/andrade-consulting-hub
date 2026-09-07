import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings2, Save, Image as ImageIcon, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fmtPct, MESES, diasNoMes } from "@/lib/metasSugestao";
import { toast } from "@/hooks/use-toast";

interface Store { id: string; name: string }

export interface PremiacaoConfig {
  valor_premiacao: number;
  peso_faturamento: number;
  peso_arrecadacao: number;
  peso_volume: number;
  peso_mix: number;
  atingimento_minimo: number;
  foto_cabecalho: string | null;
  foto_rodape: string | null;
  foto_faturamento: string | null;
  foto_arrecadacao: string | null;
  foto_volume: string | null;
  foto_mix: string | null;
  mostrar_valores: boolean;
  fotos_departamentos: Record<string, string>;
}

export const PREMIACAO_PADRAO: PremiacaoConfig = {
  valor_premiacao: 0,
  peso_faturamento: 25,
  peso_arrecadacao: 40,
  peso_volume: 20,
  peso_mix: 15,
  atingimento_minimo: 99,
  foto_cabecalho: null,
  foto_rodape: null,
  foto_faturamento: null,
  foto_arrecadacao: null,
  foto_volume: null,
  foto_mix: null,
  mostrar_valores: true,
  fotos_departamentos: {},
};

export type FotoKey =
  | "foto_cabecalho" | "foto_rodape" | "foto_faturamento"
  | "foto_arrecadacao" | "foto_volume" | "foto_mix";

export const carregarPremiacaoConfig = async (storeId: string): Promise<PremiacaoConfig> => {
  const { data } = await supabase
    .from("premiacao_config").select("*").eq("store_id", storeId).maybeSingle();
  if (!data) return PREMIACAO_PADRAO;
  return {
    valor_premiacao: Number(data.valor_premiacao) || 0,
    peso_faturamento: Number(data.peso_faturamento) || 0,
    peso_arrecadacao: Number(data.peso_arrecadacao) || 0,
    peso_volume: Number(data.peso_volume) || 0,
    peso_mix: Number(data.peso_mix) || 0,
    atingimento_minimo: Number(data.atingimento_minimo) || 99,
    foto_cabecalho: (data as any).foto_cabecalho ?? null,
    foto_rodape: (data as any).foto_rodape ?? null,
    foto_faturamento: (data as any).foto_faturamento ?? null,
    foto_arrecadacao: (data as any).foto_arrecadacao ?? null,
    foto_volume: (data as any).foto_volume ?? null,
    foto_mix: (data as any).foto_mix ?? null,
    mostrar_valores: (data as any).mostrar_valores ?? true,
    fotos_departamentos: ((data as any).fotos_departamentos ?? {}) as Record<string, string>,
  };
};

const iso = (a: number, m: number, d: number) =>
  `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const MetasPremiacaoConfig = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");

  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [ano, setAno] = useState(Number(hojeSP.slice(0, 4)));
  const [mes, setMes] = useState(Number(hojeSP.slice(5, 7)));

  const [cfg, setCfg] = useState<PremiacaoConfig>(PREMIACAO_PADRAO);
  const [departamentos, setDepartamentos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
    if (user && isAdmin) {
      supabase.from("stores").select("id, name").order("name").then(({ data }) => {
        if (!data?.length) return;
        setStores(data);
        const sid = sessionStorage.getItem("selectedStoreId");
        const p = data.find((s) => s.id === sid) || data[0];
        setStoreId(p.id); setStoreName(p.name);
      });
    }
  }, [user, isAdmin, authLoading]);

  useEffect(() => {
    if (!storeId) return;
    carregarPremiacaoConfig(storeId).then(setCfg);
  }, [storeId]);

  // Departamentos com metas gravadas no mes selecionado
  useEffect(() => {
    if (!storeId) return;
    const inicio = iso(ano, mes, 1);
    const fim = iso(ano, mes, diasNoMes(ano, mes));
    supabase
      .from("store_daily_metrics")
      .select("department")
      .eq("store_id", storeId)
      .gte("date", inicio)
      .lte("date", fim)
      .then(({ data }) => {
        const set = new Set<string>();
        (data || []).forEach((r) => set.add((r.department || "OUTROS").toUpperCase()));
        setDepartamentos(Array.from(set).sort());
      });
  }, [storeId, ano, mes]);

  const gravar = async (novo: PremiacaoConfig, silencioso = false) => {
    if (!storeId) return;
    const { error } = await supabase.from("premiacao_config")
      .upsert({ store_id: storeId, ...novo } as any, { onConflict: "store_id" });
    if (error) {
      toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
      return;
    }
    if (!silencioso) toast({ title: "Parametrização salva" });
  };

  const enviarFoto = async (campo: FotoKey, file: File, departamento?: string) => {
    if (!storeId) return;
    const chave = departamento ? `dep:${departamento}` : campo;
    setEnviando(chave);
    const ext = file.name.split(".").pop() || "jpg";
    const slug = (departamento || campo).toLowerCase().replace(/[^a-z0-9]+/gi, "-");
    const path = `premiacao/${storeId}/${slug}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("imagens").upload(path, file, { upsert: true });
    if (error) {
      setEnviando(null);
      toast({ title: "Não foi possível enviar a foto", description: error.message, variant: "destructive" });
      return;
    }
    const { data } = await supabase.storage.from("imagens").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    const url = data?.signedUrl ?? null;
    const atualizado: PremiacaoConfig = departamento
      ? { ...cfg, fotos_departamentos: { ...cfg.fotos_departamentos, [departamento]: url || "" } }
      : { ...cfg, [campo]: url };
    setCfg(atualizado);
    await gravar(atualizado, true);
    setEnviando(null);
    toast({ title: "Foto salva" });
  };

  const removerFoto = async (campo: FotoKey, departamento?: string) => {
    let atualizado: PremiacaoConfig;
    if (departamento) {
      const fotos = { ...cfg.fotos_departamentos };
      delete fotos[departamento];
      atualizado = { ...cfg, fotos_departamentos: fotos };
    } else {
      atualizado = { ...cfg, [campo]: null };
    }
    setCfg(atualizado);
    await gravar(atualizado, true);
  };

  const pesoTotal = cfg.peso_faturamento + cfg.peso_arrecadacao + cfg.peso_volume + cfg.peso_mix;

  return (
    <ClientLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Settings2 className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Parametrização de Pagamento de Metas</h1>
              <p className="text-sm text-muted-foreground">
                Valor da premiação, ponderações, gatilhos e fotos do demonstrativo
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={storeId} onValueChange={(v) => {
              setStoreId(v); setStoreName(stores.find((s) => s.id === v)?.name ?? "");
            }}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Loja" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
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
            <Button variant="outline" size="sm" onClick={() => navigate("/metas/premiacao")}>
              <Award className="h-4 w-4 mr-1" /> Ver demonstrativo
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-5">
          <h2 className="text-sm font-semibold">Valores e ponderações — {storeName}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {[
              { k: "valor_premiacao" as const, label: "Valor da premiação (R$)" },
              { k: "peso_faturamento" as const, label: "Faturamento (%)" },
              { k: "peso_arrecadacao" as const, label: "Arrecadação (%)" },
              { k: "peso_volume" as const, label: "Volume (%)" },
              { k: "peso_mix" as const, label: "Mix (%)" },
              { k: "atingimento_minimo" as const, label: "Atingimento mínimo (%)" },
            ].map((f) => (
              <div key={f.k} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type="number"
                  value={cfg[f.k]}
                  onChange={(e) => setCfg({ ...cfg, [f.k]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="mostrar-valores"
              checked={cfg.mostrar_valores}
              onCheckedChange={(v) => setCfg({ ...cfg, mostrar_valores: v })}
            />
            <Label htmlFor="mostrar-valores" className="text-xs">
              {cfg.mostrar_valores ? "Mostrar valores e %" : "Mostrar apenas %"}
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={async () => { setSalvando(true); await gravar(cfg); setSalvando(false); }} disabled={salvando}>
              <Save className="h-4 w-4 mr-1" /> Salvar
            </Button>
            <span className={`text-xs ${pesoTotal === 100 ? "text-muted-foreground" : "text-amber-500"}`}>
              Soma das ponderações: {fmtPct(pesoTotal)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">Fotos do demonstrativo</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {([
              { k: "foto_cabecalho", label: "Foto do cabeçalho" },
              { k: "foto_rodape", label: "Foto do rodapé" },
              { k: "foto_faturamento", label: "Foto Faturamento" },
              { k: "foto_arrecadacao", label: "Foto Arrecadação" },
              { k: "foto_volume", label: "Foto Volume" },
              { k: "foto_mix", label: "Foto Mix" },
            ] as { k: FotoKey; label: string }[]).map((f) => (
              <div key={f.k} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
                  {cfg[f.k]
                    ? <img src={cfg[f.k] as string} alt={f.label} className="h-full w-full object-cover" />
                    : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                </div>
                <Input
                  type="file"
                  accept="image/*"
                  className="text-xs"
                  disabled={enviando === f.k}
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) enviarFoto(f.k, file); }}
                />
                {cfg[f.k] && (
                  <button type="button" className="text-xs text-muted-foreground underline" onClick={() => removerFoto(f.k)}>
                    Remover foto
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">Fotos por departamento</h2>
          {departamentos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum departamento com metas gravadas em {MESES[mes - 1]}/{ano}.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {departamentos.map((dep) => {
                const foto = cfg.fotos_departamentos?.[dep] || null;
                return (
                  <div key={dep} className="space-y-1">
                    <Label className="text-xs">{dep}</Label>
                    <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
                      {foto
                        ? <img src={foto} alt={dep} className="h-full w-full object-cover" />
                        : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <Input
                      type="file"
                      accept="image/*"
                      className="text-xs"
                      disabled={enviando === `dep:${dep}`}
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) enviarFoto("foto_cabecalho", file, dep); }}
                    />
                    {foto && (
                      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => removerFoto("foto_cabecalho", dep)}>
                        Remover foto
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ClientLayout>
  );
};

export default MetasPremiacaoConfig;
