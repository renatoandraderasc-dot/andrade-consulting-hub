import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Flame, Printer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const DIAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

type Camp = { id?: string; data_inicio: string; data_fim: string; nome: string; agv_pct: number | null; destaque: boolean };
type Seg = { inicio: Date; fim: Date; fds: boolean };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Divide o mês em semanas: Seg–Qui e Sex–Dom, cortando nas bordas do mês. */
export function segmentosMes(ano: number, mes: number): { semana: number; seg?: Seg; fds?: Seg }[] {
  const ini = new Date(ano, mes, 1);
  const fim = new Date(ano, mes + 1, 0);
  const segunda = new Date(ini);
  segunda.setDate(ini.getDate() - ((ini.getDay() + 6) % 7));
  const out: { semana: number; seg?: Seg; fds?: Seg }[] = [];
  for (let w = 0; segunda <= fim; w++) {
    const clip = (a: number, b: number, fds: boolean): Seg | undefined => {
      const s = new Date(segunda); s.setDate(s.getDate() + a);
      const e = new Date(segunda); e.setDate(e.getDate() + b);
      const ci = s < ini ? ini : s, cf = e > fim ? fim : e;
      return ci <= cf ? { inicio: new Date(ci), fim: new Date(cf), fds } : undefined;
    };
    out.push({ semana: w, seg: clip(0, 3, false), fds: clip(4, 6, true) });
    segunda.setDate(segunda.getDate() + 7);
  }
  return out;
}

export default function CalendarioPromocionalTab({ storeId }: { storeId: string }) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [camps, setCamps] = useState<Record<string, Camp>>({});

  const semanas = useMemo(() => segmentosMes(ano, mes), [ano, mes]);

  useEffect(() => {
    if (!storeId) return;
    const ini = iso(new Date(ano, mes, 1)), fim = iso(new Date(ano, mes + 1, 0));
    supabase.from("calendario_promocional").select("*").eq("store_id", storeId)
      .gte("data_inicio", ini).lte("data_inicio", fim)
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); return; }
        const m: Record<string, Camp> = {};
        (data || []).forEach((c: any) => { m[c.data_inicio] = c; });
        setCamps(m);
      });
  }, [storeId, ano, mes]);

  const salvar = async (s: Seg, patch: Partial<Camp>) => {
    const k = iso(s.inicio);
    const atual: Camp = camps[k] ?? { data_inicio: k, data_fim: iso(s.fim), nome: "", agv_pct: null, destaque: false };
    const novo = { ...atual, ...patch };
    setCamps((p) => ({ ...p, [k]: novo }));
    const payload = { store_id: storeId, data_inicio: novo.data_inicio, data_fim: iso(s.fim), nome: novo.nome, agv_pct: novo.agv_pct, destaque: novo.destaque, updated_at: new Date().toISOString() };
    const q = novo.id
      ? supabase.from("calendario_promocional").update(payload).eq("id", novo.id).select().single()
      : supabase.from("calendario_promocional").insert(payload).select().single();
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    setCamps((p) => ({ ...p, [k]: { ...p[k], id: (data as any).id } }));
  };

  const mudarMes = (d: number) => {
    const n = new Date(ano, mes + d, 1);
    setAno(n.getFullYear()); setMes(n.getMonth());
  };

  const Bloco = ({ s }: { s: Seg }) => {
    const c = camps[iso(s.inicio)];
    const [nome, setNome] = useState(c?.nome ?? "");
    const [agv, setAgv] = useState(c?.agv_pct != null ? String(c.agv_pct) : "");
    useEffect(() => { setNome(c?.nome ?? ""); setAgv(c?.agv_pct != null ? String(c.agv_pct) : ""); }, [c?.nome, c?.agv_pct]);
    const destaque = !!c?.destaque;
    const cor = destaque ? "bg-offer-red text-offer-red-foreground" : "bg-promo-yellow text-promo-yellow-foreground";
    return (
      <div className="space-y-1.5">
        <div className="rounded-lg bg-muted py-2 text-center text-base font-bold text-muted-foreground">
          {iso(s.inicio) === iso(s.fim) ? dm(s.inicio) : `${dm(s.inicio)} → ${dm(s.fim)}`}
        </div>
        <div className={cn("group flex items-center gap-1 rounded-lg px-2 py-1.5 border border-border", cor)}>
          <input
            value={nome}
            placeholder="Nome da campanha"
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => nome !== (c?.nome ?? "") && salvar(s, { nome })}
            className="min-w-0 flex-1 bg-transparent text-center text-sm font-bold uppercase outline-none placeholder:opacity-50 placeholder:normal-case"
          />
          <span className="text-xs font-bold">AGV</span>
          <input
            value={agv}
            inputMode="numeric"
            placeholder="%"
            onChange={(e) => setAgv(e.target.value.replace(/[^\d,.]/g, ""))}
            onBlur={() => {
              const v = agv === "" ? null : Number(agv.replace(",", "."));
              if (v !== (c?.agv_pct ?? null)) salvar(s, { agv_pct: v });
            }}
            className="w-10 bg-transparent text-right text-sm font-bold outline-none placeholder:opacity-50"
          />
          <span className="text-sm font-bold">%</span>
          <button
            type="button"
            title={destaque ? "Tirar destaque (amarelo)" : "Destacar (vermelho)"}
            onClick={() => salvar(s, { destaque: !destaque, nome, agv_pct: agv === "" ? null : Number(agv.replace(",", ".")) })}
            className="ml-1 rounded p-1 opacity-60 hover:opacity-100 print:hidden"
          >
            <Flame className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  if (!storeId) return <Card className="p-6 text-muted-foreground">Selecione uma loja.</Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 print:hidden">
        <Button variant="outline" size="icon" onClick={() => mudarMes(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Input type="number" className="w-24" value={ano} onChange={(e) => setAno(Number(e.target.value) || ano)} />
        <Button variant="outline" size="icon" onClick={() => mudarMes(1)}><ChevronRight className="h-4 w-4" /></Button>
        <span className="text-sm text-muted-foreground">Clique no nome para editar · <Flame className="inline h-3 w-3" /> alterna vermelho/amarelo · salva sozinho</span>
        <Button variant="outline" className="ml-auto" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
      </div>

      <div className="rounded-xl border-2 border-border bg-promo-yellow py-4 text-center font-display text-2xl font-bold text-promo-yellow-foreground">
        CALENDÁRIO PROMOCIONAL - <span className="text-offer-red">{MESES[mes]}</span>
      </div>

      <div className="flex flex-wrap gap-1 print:hidden">
        {MESES.map((m, i) => (
          <Button key={m} size="sm" variant={i === mes ? "default" : "outline"} onClick={() => setMes(i)}>{m.slice(0, 3)}</Button>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-3">
        {DIAS.map((d, i) => (
          <div key={d} className={cn("rounded-lg py-3 text-center text-xs font-bold border border-border", i >= 4 ? "bg-offer-red text-offer-red-foreground" : "bg-promo-yellow text-promo-yellow-foreground")}>{d}</div>
        ))}
        {semanas.map((w) => (
          <div key={w.semana} className="col-span-7 grid grid-cols-7 gap-3">
            <div className="col-span-4">{w.seg && <Bloco s={w.seg} />}</div>
            <div className="col-span-3">{w.fds && <Bloco s={w.fds} />}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
