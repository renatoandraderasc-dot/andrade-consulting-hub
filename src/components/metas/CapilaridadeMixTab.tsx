import { useEffect, useMemo, useState } from "react";
import { Boxes, Wand2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  storeId: string;
  year: number;
  month: number;
}

interface LinhaMix {
  department: string;
  base_trimestre: number;
  pct_reducao: number;
}

const PIC_DEPTS = ["PADARIA", "AÇOUGUE", "HORTIFRUTI"];

const semAcento = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

/** Normaliza o nome vindo do relatório para os departamentos do PIC. */
const normalizarDepto = (nome: string): string => {
  const n = semAcento(nome);
  if (!n) return "SEM DEPARTAMENTO";
  if (/PADAR|CONFEIT/.test(n)) return "PADARIA";
  if (/ACOUG|CARNE|FRIGOR|AVES|PEIX/.test(n)) return "AÇOUGUE";
  if (/HORTI|FLV|FRUT|VERDUR|LEGUM/.test(n)) return "HORTIFRUTI";
  return nome.toUpperCase().trim();
};

const trimestreRange = (year: number, month: number) => {
  const ini = new Date(year, month - 4, 1);
  const fimDate = new Date(year, month - 1, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    inicio: `${ini.getFullYear()}-${p(ini.getMonth() + 1)}-01`,
    fim: `${fimDate.getFullYear()}-${p(fimDate.getMonth() + 1)}-${p(fimDate.getDate())}`,
  };
};

const fmtInt = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const CapilaridadeMixTab = ({ storeId, year, month }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linhas, setLinhas] = useState<LinhaMix[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const { inicio, fim } = useMemo(() => trimestreRange(year, month), [year, month]);

  const buscarBase = async () => {
    if (!storeId) return;
    setLoading(true);
    setAviso(null);
    try {
      const [{ data, error }, { data: metas }] = await Promise.all([
        supabase.functions.invoke("vr-proxy", {
          body: { store_id: storeId, relatorio: "mix_trimestre", params: { inicio, fim } },
        }),
        supabase
          .from("meta_mix")
          .select("department, pct_reducao")
          .eq("store_id", storeId)
          .eq("ano", year)
          .eq("mes", month),
      ]);
      if (error) throw error;
      if ((data as any)?.erro) throw new Error((data as any).erro);

      const pctSalvo = new Map<string, number>(
        (metas || []).map((m: any) => [m.department, Number(m.pct_reducao)]),
      );

      const acc = new Map<string, number>();
      for (const l of ((data as any)?.dados ?? []) as any[]) {
        const dep = normalizarDepto(String(l.departamento ?? l.department ?? ""));
        const base = Number(l.base_trimestre ?? l.mix ?? 0) || 0;
        acc.set(dep, (acc.get(dep) || 0) + base);
      }
      if (acc.size === 0) setAviso("Nenhum dado retornado para o período.");

      const ordenado = [...acc.entries()].sort((a, b) => {
        const ia = PIC_DEPTS.indexOf(a[0]);
        const ib = PIC_DEPTS.indexOf(b[0]);
        if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        return b[1] - a[1];
      });

      setLinhas(
        ordenado.map(([department, base_trimestre]) => ({
          department,
          base_trimestre,
          pct_reducao: pctSalvo.get(department) ?? 0.15,
        })),
      );
    } catch (err: any) {
      setLinhas([]);
      setAviso(err.message || "Falha ao buscar a base de mix.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLinhas([]);
    if (storeId) buscarBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, year, month]);

  const setPct = (department: string, valor: string) => {
    const n = Number(valor.replace(",", "."));
    setLinhas((rows) =>
      rows.map((r) =>
        r.department === department
          ? { ...r, pct_reducao: isNaN(n) ? r.pct_reducao : Math.min(Math.max(n, 0), 100) / 100 }
          : r,
      ),
    );
  };

  const metaDe = (l: LinhaMix) => Math.max(Math.round(l.base_trimestre * (1 - l.pct_reducao)), 0);

  const totais = useMemo(
    () => linhas.reduce(
      (a, l) => ({ base: a.base + l.base_trimestre, meta: a.meta + metaDe(l) }),
      { base: 0, meta: 0 },
    ),
    [linhas],
  );

  const handleGerar = async () => {
    if (!linhas.length) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("gerar_meta_mix", {
        p_store_id: storeId,
        p_ano: year,
        p_mes: month,
        p_bases: linhas.map((l) => ({
          department: l.department,
          base_trimestre: l.base_trimestre,
          pct_reducao: l.pct_reducao,
        })) as any,
        p_pct: 0.15,
      });
      if (error) throw error;
      const r: any = (data as any)?.[0];
      toast({
        title: "Metas de mix geradas",
        description: `${r?.departamentos ?? 0} departamentos · Meta total: ${fmtInt(Number(r?.total_meta ?? 0))} produtos`,
      });
    } catch (err: any) {
      toast({ title: "Erro ao gerar meta de mix", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const btnPrimary = "flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl font-body font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50";
  const btnGhost = "flex items-center gap-2 border border-border bg-card px-4 py-2 rounded-xl font-body font-semibold text-sm hover:bg-muted transition-colors disabled:opacity-50";

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Boxes className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-display font-bold text-foreground">Capilaridade de Mix</h3>
              <p className="font-body text-xs text-muted-foreground">
                Base: produtos distintos vendidos entre {inicio.split("-").reverse().join("/")} e {fim.split("-").reverse().join("/")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={buscarBase} disabled={loading} className={btnGhost}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar base
            </button>
            <button onClick={handleGerar} disabled={saving || loading || !linhas.length} className={btnPrimary}>
              <Wand2 className="w-4 h-4" /> Gerar metas de mix
            </button>
          </div>
        </div>
      </div>

      {aviso && (
        <div className="bg-card border border-border rounded-2xl p-4 font-body text-sm text-muted-foreground">
          {aviso}
        </div>
      )}

      {linhas.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-body text-xs uppercase">
                <th className="text-left py-3 pr-2">Departamento</th>
                <th className="text-right py-3 px-2">Base do trimestre</th>
                <th className="text-right py-3 px-2">% de redução</th>
                <th className="text-right py-3 pl-2">Meta de mix</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.department} className="border-b border-border/50">
                  <td className="py-2.5 pr-2 font-body font-medium text-foreground">{l.department}</td>
                  <td className="py-2.5 px-2 text-right font-body">{fmtInt(l.base_trimestre)}</td>
                  <td className="py-2.5 px-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={Number((l.pct_reducao * 100).toFixed(2))}
                        onChange={(e) => setPct(l.department, e.target.value)}
                        className="w-20 bg-background border border-border rounded-lg px-2 py-1 text-right font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <span className="font-body text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  <td className="py-2.5 pl-2 text-right font-body font-semibold text-foreground">{fmtInt(metaDe(l))}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-3 pr-2 font-body">Total</td>
                <td className="py-3 px-2 text-right font-body">{fmtInt(totais.base)}</td>
                <td />
                <td className="py-3 pl-2 text-right font-body">{fmtInt(totais.meta)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CapilaridadeMixTab;
