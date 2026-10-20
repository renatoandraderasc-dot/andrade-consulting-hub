import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TvTela, tvDb } from "@/lib/tv";
import { dimensoesTotais, TvDimensoes, validarDimensoes } from "@/lib/tvDimensoes";

export default function TvDimensoesForm({ tela, onSaved }: { tela: TvTela; onSaved: () => void }) {
  const [config, setConfig] = useState<TvDimensoes>({ largura_m: tela.largura_m ?? null, altura_m: tela.altura_m ?? null, resolucao_largura: tela.resolucao_largura ?? null, resolucao_altura: tela.resolucao_altura ?? null, colunas: tela.colunas ?? 1, linhas: tela.linhas ?? 1 });
  const [saving, setSaving] = useState(false);
  const total = dimensoesTotais(config);
  const fields: { key: keyof TvDimensoes; label: string; optional?: boolean; step?: string }[] = [
    { key: "colunas", label: "Telas lado a lado" },
    { key: "linhas", label: "Telas empilhadas" },
    { key: "largura_m", label: "Largura de cada tela (m)", optional: true, step: "0.01" },
    { key: "altura_m", label: "Altura de cada tela (m)", optional: true, step: "0.01" },
    { key: "resolucao_largura", label: "Resolução por tela — largura (px)", optional: true },
    { key: "resolucao_altura", label: "Resolução por tela — altura (px)", optional: true },
  ];
  const salvar = async () => {
    const erro = validarDimensoes(config);
    if (erro) return toast.error(erro);
    setSaving(true);
    try {
      const { error } = await tvDb.from("tv_telas").update(config).eq("id", tela.id);
      if (error) throw error;
      toast.success("Dimensões da TV salvas");
      onSaved();
    } catch { toast.error("Não foi possível salvar as dimensões"); }
    finally { setSaving(false); }
  };
  return <section className="border-y border-border py-4 space-y-4">
    <h2 className="font-semibold">Dimensões e resolução — {tela.nome}</h2>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(f => <div key={f.key} className="space-y-1">
        <label htmlFor={`tv-${f.key}`} className="text-xs text-muted-foreground">{f.label}</label>
        <Input id={`tv-${f.key}`} type="number" min={f.step ? "0.01" : 1} max={f.optional ? undefined : 16} step={f.step ?? "1"} placeholder={f.optional ? "Não informada" : "1"} value={config[f.key] ?? ""} onChange={e => setConfig(c => ({ ...c, [f.key]: e.target.value === "" ? (f.optional ? null : 0) : Number(e.target.value) }))} />
      </div>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm space-y-1">
        <p>{config.colunas} × {config.linhas} · {config.colunas * config.linhas} telas
          {total.larguraM && total.alturaM ? ` · ${total.larguraM.toLocaleString("pt-BR")} × ${total.alturaM.toLocaleString("pt-BR")} m no conjunto` : ""}</p>
        <p className="text-muted-foreground">Resolução total: {total.larguraPx && total.alturaPx ? `${total.larguraPx} × ${total.alturaPx} px` : "Não informada"}</p>
      </div>
      <Button onClick={salvar} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? "Salvando..." : "Salvar dimensões"}</Button>
    </div>
  </section>;
}