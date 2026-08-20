import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Copy, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import {
  CalendarioRow, CategoriaRow, Face, ModeloRow, RegraRow, SlotRow, faixaLabel,
} from "./types";

interface Props {
  modelos: ModeloRow[];
  modeloId: string;
  onModeloChange: (v: string) => void;
  onModelosChanged: () => void;
  calendarios: CalendarioRow[];
  onCalendariosChanged: () => void;
}

const FAIXAS = ["vermelho", "amarelo", "neutro"] as const;

const ModeloTab = ({ modelos, modeloId, onModeloChange, onModelosChanged, calendarios, onCalendariosChanged }: Props) => {
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [cats, setCats] = useState<CategoriaRow[]>([]);
  const [regras, setRegras] = useState<RegraRow[]>([]);
  const [cal, setCal] = useState<CalendarioRow[]>([]);
  const [drag, setDrag] = useState<{ face: Face; index: number } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setCal(calendarios); }, [calendarios]);

  const loadSlots = async (id: string) => {
    if (!id) return setSlots([]);
    const { data } = await supabase
      .from("encarte_modelo_slot").select("*").eq("modelo_id", id)
      .order("face").order("posicao");
    setSlots((data as SlotRow[]) ?? []);
  };

  useEffect(() => { loadSlots(modeloId); }, [modeloId]);

  useEffect(() => {
    supabase.from("encarte_categoria").select("*").order("ordem")
      .then(({ data }) => setCats((data as CategoriaRow[]) ?? []));
    supabase.from("encarte_regra_faixa").select("*").order("tipo_faixa")
      .then(({ data }) => setRegras((data as RegraRow[]) ?? []));
  }, []);

  // ---------- slots ----------
  const slotsFace = (face: Face) => slots.filter((s) => s.face === face).sort((a, b) => a.posicao - b.posicao);

  const reordenar = (face: Face, from: number, to: number) => {
    const lista = slotsFace(face);
    const [mov] = lista.splice(from, 1);
    lista.splice(to, 0, mov);
    const renum = lista.map((s, i) => ({ ...s, posicao: i + 1 }));
    setSlots((prev) => [...prev.filter((s) => s.face !== face), ...renum]);
  };

  const addSlot = (face: Face) => {
    const lista = slotsFace(face);
    setSlots((prev) => [
      ...prev,
      {
        id: `novo-${crypto.randomUUID()}`, modelo_id: modeloId, face,
        posicao: lista.length + 1, tipo_faixa: "neutro", departamento: "", categoria: null,
      },
    ]);
  };

  const removeSlot = (id: string) => {
    const alvo = slots.find((s) => s.id === id);
    if (!alvo) return;
    const restantes = slots.filter((s) => s.id !== id);
    const renum = restantes
      .filter((s) => s.face === alvo.face)
      .sort((a, b) => a.posicao - b.posicao)
      .map((s, i) => ({ ...s, posicao: i + 1 }));
    setSlots([...restantes.filter((s) => s.face !== alvo.face), ...renum]);
  };

  const salvarSlots = async () => {
    if (!modeloId) return;
    setSalvando(true);
    const { error: delErr } = await supabase.from("encarte_modelo_slot").delete().eq("modelo_id", modeloId);
    if (delErr) { toast.error(delErr.message); setSalvando(false); return; }
    const linhas = slots.map((s) => ({
      modelo_id: modeloId, face: s.face, posicao: s.posicao,
      tipo_faixa: s.tipo_faixa, departamento: s.departamento || null, categoria: s.categoria || null,
    }));
    const { error } = await supabase.from("encarte_modelo_slot").insert(linhas);
    setSalvando(false);
    if (error) toast.error(error.message);
    else { toast.success("Modelo salvo"); loadSlots(modeloId); }
  };

  const duplicarModelo = async () => {
    const atual = modelos.find((m) => m.id === modeloId);
    if (!atual) return;
    const { data: novo, error } = await supabase
      .from("encarte_modelo").insert({ nome: `${atual.nome} (cópia)`, padrao: false })
      .select("id").single();
    if (error || !novo) { toast.error(error?.message ?? "falha ao duplicar"); return; }
    const linhas = slots.map((s) => ({
      modelo_id: novo.id, face: s.face, posicao: s.posicao,
      tipo_faixa: s.tipo_faixa, departamento: s.departamento, categoria: s.categoria,
    }));
    if (linhas.length) await supabase.from("encarte_modelo_slot").insert(linhas);
    toast.success("Modelo duplicado");
    onModelosChanged();
    onModeloChange(novo.id);
  };

  // ---------- calendário ----------
  const salvarCalendario = async () => {
    setSalvando(true);
    for (const c of cal) {
      const { error } = await supabase
        .from("encarte_calendario")
        .update({
          nome: c.nome, tipo_faixa: c.tipo_faixa, dia_inicio: c.dia_inicio,
          dia_fim: c.dia_fim, agv_pct: c.agv_pct, modelo_id: c.modelo_id,
        })
        .eq("id", c.id);
      if (error) { toast.error(error.message); setSalvando(false); return; }
    }
    setSalvando(false);
    toast.success("Calendário salvo");
    onCalendariosChanged();
  };

  // ---------- categorias ----------
  const salvarCategorias = async () => {
    setSalvando(true);
    for (const c of cats) {
      const { error } = await supabase
        .from("encarte_categoria")
        .update({
          nome: c.nome, departamento: c.departamento, termos: c.termos,
          vermelho: c.vermelho, amarelo: c.amarelo, neutro: c.neutro,
        })
        .eq("id", c.id);
      if (error) { toast.error(error.message); setSalvando(false); return; }
    }
    setSalvando(false);
    toast.success("Categorias salvas");
  };

  const addCategoria = async () => {
    const { data, error } = await supabase
      .from("encarte_categoria")
      .insert({ nome: `Nova categoria ${cats.length + 1}`, ordem: cats.length + 1 })
      .select("*").single();
    if (error) { toast.error(error.message); return; }
    setCats((p) => [...p, data as CategoriaRow]);
  };

  const removeCategoria = async (id: string) => {
    const { error } = await supabase.from("encarte_categoria").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setCats((p) => p.filter((c) => c.id !== id));
  };

  // ---------- regras ----------
  const salvarRegras = async () => {
    setSalvando(true);
    for (const r of regras) {
      const { error } = await supabase
        .from("encarte_regra_faixa")
        .update({
          margem_minima_pct: r.margem_minima_pct, desconto_max_pct: r.desconto_max_pct,
          janela_giro_dias: r.janela_giro_dias, peso_giro: r.peso_giro,
          peso_margem: r.peso_margem, peso_concorrente: r.peso_concorrente, peso_estoque: r.peso_estoque,
        })
        .eq("id", r.id);
      if (error) { toast.error(error.message); setSalvando(false); return; }
    }
    setSalvando(false);
    toast.success("Regras salvas");
  };

  const FaceEditor = ({ face }: { face: Face }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{face === "capa" ? "Capa" : "Verso"}</h4>
        <Button size="sm" variant="outline" onClick={() => addSlot(face)}>
          <Plus className="w-4 h-4 mr-1" /> Posição
        </Button>
      </div>
      <div className="space-y-1">
        {slotsFace(face).map((s, idx) => (
          <div
            key={s.id}
            draggable
            onDragStart={() => setDrag({ face, index: idx })}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag && drag.face === face) reordenar(face, drag.index, idx);
              setDrag(null);
            }}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
            <span className="w-6 text-xs text-muted-foreground">{s.posicao}</span>
            <Select
              value={s.tipo_faixa}
              onValueChange={(v) => setSlots((p) => p.map((x) => (x.id === s.id ? { ...x, tipo_faixa: v } : x)))}
            >
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FAIXAS.map((f) => <SelectItem key={f} value={f}>{faixaLabel(f)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              className="h-8 flex-1" placeholder="Departamento"
              value={s.departamento ?? ""}
              onChange={(e) => setSlots((p) => p.map((x) => (x.id === s.id ? { ...x, departamento: e.target.value } : x)))}
            />
            <Select
              value={s.categoria ?? "__livre"}
              onValueChange={(v) =>
                setSlots((p) => p.map((x) => (x.id === s.id ? { ...x, categoria: v === "__livre" ? null : v } : x)))
              }
            >
              <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__livre">Categoria livre</SelectItem>
                {cats.map((c) => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeSlot(s.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="space-y-1.5 min-w-64">
            <Label className="text-xs">Modelo</Label>
            <Select value={modeloId} onValueChange={onModeloChange}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {modelos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={duplicarModelo} disabled={!modeloId}>
              <Copy className="w-4 h-4 mr-2" /> Duplicar modelo
            </Button>
            <Button onClick={salvarSlots} disabled={!modeloId || salvando}>
              <Save className="w-4 h-4 mr-2" /> Salvar modelo
            </Button>
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <FaceEditor face="capa" />
          <FaceEditor face="verso" />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Calendário do mês</h3>
          <Button size="sm" onClick={salvarCalendario} disabled={salvando}>
            <Save className="w-4 h-4 mr-2" /> Salvar calendário
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="py-2 pr-2">Nome</th>
                <th className="py-2 pr-2">Faixa</th>
                <th className="py-2 pr-2">Dia início</th>
                <th className="py-2 pr-2">Dia fim</th>
                <th className="py-2 pr-2">AGV %</th>
                <th className="py-2 pr-2">Modelo</th>
              </tr>
            </thead>
            <tbody>
              {cal.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="py-1.5 pr-2">
                    <Input className="h-8" value={c.nome}
                      onChange={(e) => setCal((p) => p.map((x) => (x.id === c.id ? { ...x, nome: e.target.value } : x)))} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Select value={c.tipo_faixa}
                      onValueChange={(v) => setCal((p) => p.map((x) => (x.id === c.id ? { ...x, tipo_faixa: v } : x)))}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FAIXAS.map((f) => <SelectItem key={f} value={f}>{faixaLabel(f)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input type="number" className="h-8 w-20" value={c.dia_inicio}
                      onChange={(e) => setCal((p) => p.map((x) => (x.id === c.id ? { ...x, dia_inicio: Number(e.target.value) } : x)))} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input type="number" className="h-8 w-20" value={c.dia_fim}
                      onChange={(e) => setCal((p) => p.map((x) => (x.id === c.id ? { ...x, dia_fim: Number(e.target.value) } : x)))} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input type="number" step="0.1" className="h-8 w-24" value={c.agv_pct}
                      onChange={(e) => setCal((p) => p.map((x) => (x.id === c.id ? { ...x, agv_pct: Number(e.target.value) } : x)))} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Select value={c.modelo_id ?? ""}
                      onValueChange={(v) => setCal((p) => p.map((x) => (x.id === c.id ? { ...x, modelo_id: v } : x)))}>
                      <SelectTrigger className="h-8 w-52"><SelectValue placeholder="Modelo" /></SelectTrigger>
                      <SelectContent>
                        {modelos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Categorias por faixa</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addCategoria}>
              <Plus className="w-4 h-4 mr-1" /> Categoria
            </Button>
            <Button size="sm" onClick={salvarCategorias} disabled={salvando}>
              <Save className="w-4 h-4 mr-2" /> Salvar categorias
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="py-2 pr-2">Categoria</th>
                <th className="py-2 pr-2">Departamento</th>
                <th className="py-2 pr-2">Termos (separados por vírgula)</th>
                <th className="py-2 pr-2 text-center">Vermelho</th>
                <th className="py-2 pr-2 text-center">Amarelo</th>
                <th className="py-2 pr-2 text-center">Neutro</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="py-1.5 pr-2">
                    <Input className="h-8" value={c.nome}
                      onChange={(e) => setCats((p) => p.map((x) => (x.id === c.id ? { ...x, nome: e.target.value } : x)))} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input className="h-8" value={c.departamento ?? ""}
                      onChange={(e) => setCats((p) => p.map((x) => (x.id === c.id ? { ...x, departamento: e.target.value } : x)))} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input className="h-8" value={(c.termos ?? []).join(", ")}
                      onChange={(e) =>
                        setCats((p) => p.map((x) => (x.id === c.id
                          ? { ...x, termos: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) }
                          : x)))} />
                  </td>
                  {(["vermelho", "amarelo", "neutro"] as const).map((f) => (
                    <td key={f} className="py-1.5 pr-2 text-center">
                      <Checkbox checked={c[f]}
                        onCheckedChange={(v) => setCats((p) => p.map((x) => (x.id === c.id ? { ...x, [f]: !!v } : x)))} />
                    </td>
                  ))}
                  <td className="py-1.5">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeCategoria(c.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Regras por faixa</h3>
          <Button size="sm" onClick={salvarRegras} disabled={salvando}>
            <Save className="w-4 h-4 mr-2" /> Salvar regras
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="py-2 pr-2">Faixa</th>
                <th className="py-2 pr-2">Piso de margem %</th>
                <th className="py-2 pr-2">Desconto máx. %</th>
                <th className="py-2 pr-2">Janela giro (dias)</th>
                <th className="py-2 pr-2">Peso giro</th>
                <th className="py-2 pr-2">Peso margem</th>
                <th className="py-2 pr-2">Peso concorrente</th>
                <th className="py-2 pr-2">Peso estoque</th>
              </tr>
            </thead>
            <tbody>
              {regras.map((r) => {
                const campo = (k: keyof RegraRow, step = "0.01") => (
                  <Input type="number" step={step} className="h-8 w-24" value={String(r[k] ?? "")}
                    onChange={(e) => setRegras((p) => p.map((x) => (x.id === r.id ? { ...x, [k]: Number(e.target.value) } : x)))} />
                );
                return (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-2">{faixaLabel(r.tipo_faixa)}</td>
                    <td className="py-1.5 pr-2">{campo("margem_minima_pct", "0.1")}</td>
                    <td className="py-1.5 pr-2">{campo("desconto_max_pct", "0.1")}</td>
                    <td className="py-1.5 pr-2">{campo("janela_giro_dias", "1")}</td>
                    <td className="py-1.5 pr-2">{campo("peso_giro")}</td>
                    <td className="py-1.5 pr-2">{campo("peso_margem")}</td>
                    <td className="py-1.5 pr-2">{campo("peso_concorrente")}</td>
                    <td className="py-1.5 pr-2">{campo("peso_estoque")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default ModeloTab;
