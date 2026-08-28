import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Thermometer, Plus, Trash2, Save, History, Settings2, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import ClientLayout from "@/components/ClientLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { salvarWorkbook } from "@/lib/exportBranding";
import * as XLSX from "xlsx";

interface Department {
  id: string;
  name: string;
  sort_order: number;
}

interface Equipamento {
  id: string;
  store_id: string;
  department_id: string | null;
  nome: string;
  tipo: string;
  temp_min: number;
  temp_max: number;
  turnos: string[];
  exige_foto: boolean;
  ordem: number;
  ativo: boolean;
}

interface Registro {
  id: string;
  equipamento_id: string;
  data: string;
  turno: string;
  temperatura: number;
  conforme: boolean;
  observacao: string | null;
  user_id: string;
}

const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const TURNOS_PADRAO = ["Manhã", "Tarde", "Noite"];

// Base padrão de equipamentos com faixas típicas de temperatura
const BASE_EQUIPAMENTOS: { nome: string; tipo: string; min: number; max: number }[] = [
  { nome: "Sorvete", tipo: "Freezer", min: -24, max: -18 },
  { nome: "Danone", tipo: "Freezer", min: -24, max: -18 },
  { nome: "Ilha Carnes", tipo: "Freezer", min: -22, max: -16 },
  { nome: "Ilha Carnes 2", tipo: "Freezer", min: -22, max: -16 },
  { nome: "Ilha Batata 2", tipo: "Freezer", min: -22, max: -16 },
  { nome: "Ilha Lasanha 3", tipo: "Freezer", min: -22, max: -16 },
  { nome: "Gelo", tipo: "Freezer", min: -22, max: -14 },
  { nome: "Refrigerador", tipo: "Refrigerador", min: 0, max: 7 },
  { nome: "Red", tipo: "Refrigerador", min: 0, max: 6 },
  { nome: "Monster", tipo: "Refrigerador", min: 0, max: 6 },
  { nome: "Coca 1", tipo: "Refrigerador", min: 0, max: 6 },
  { nome: "Coca 2", tipo: "Refrigerador", min: 0, max: 6 },
  { nome: "Coca 3", tipo: "Refrigerador", min: 0, max: 6 },
  { nome: "Coca 4", tipo: "Refrigerador", min: 0, max: 6 },
  { nome: "Coca 5", tipo: "Refrigerador", min: 0, max: 6 },
  { nome: "Cerveja", tipo: "Refrigerador", min: -2, max: 4 },
  { nome: "Auto Host", tipo: "Refrigerador", min: 0, max: 7 },
  { nome: "Padaria 1", tipo: "Refrigerador", min: 0, max: 7 },
  { nome: "Padaria 2", tipo: "Refrigerador", min: 0, max: 7 },
  { nome: "Balcão 1", tipo: "Balcão Refrigerado", min: 0, max: 5 },
  { nome: "Balcão 2", tipo: "Balcão Refrigerado", min: 0, max: 5 },
  { nome: "Câmara 1", tipo: "Câmara Fria", min: -2, max: 4 },
  { nome: "Câmara 2", tipo: "Câmara Fria", min: -2, max: 4 },
  { nome: "Câmara 3", tipo: "Câmara Fria", min: -2, max: 4 },
];

const ChecklistTemperatura = () => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [storeId, setStoreId] = useState<string>(() => sessionStorage.getItem("selectedStoreId") || "");
  const [storeName, setStoreName] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [historico, setHistorico] = useState<Registro[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [data, setData] = useState<string>(hoje());
  const [entradas, setEntradas] = useState<Record<string, { temp: string; obs: string }>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [filtroDept, setFiltroDept] = useState<string>("todos");

  // Novo equipamento
  const [novo, setNovo] = useState({ nome: "", tipo: "Câmara Fria", department_id: "", temp_min: -18, temp_max: -12, turnos: TURNOS_PADRAO.join(", ") });

  useEffect(() => {
    const onStore = (e: any) => setStoreId(e.detail);
    window.addEventListener("store-changed", onStore as EventListener);
    return () => window.removeEventListener("store-changed", onStore as EventListener);
  }, []);

  useEffect(() => {
    if (!storeId) return;
    carregar();
  }, [storeId, data]);

  const carregar = async () => {
    setLoading(true);
    const [{ data: depts }, { data: eqs }, { data: regs }, { data: store }] = await Promise.all([
      supabase.from("departments").select("*").order("sort_order"),
      supabase.from("temperatura_equipamentos").select("*").eq("store_id", storeId).order("ordem"),
      supabase.from("temperatura_registros").select("*").eq("store_id", storeId).eq("data", data),
      supabase.from("stores").select("name").eq("id", storeId).maybeSingle(),
    ]);
    setDepartments(depts || []);
    setEquipamentos(((eqs || []) as any[]).map((e) => ({ ...e, turnos: e.turnos || TURNOS_PADRAO })));
    setRegistros((regs || []) as any);
    setStoreName(store?.name || "");
    const map: Record<string, { temp: string; obs: string }> = {};
    (regs || []).forEach((r: any) => {
      map[`${r.equipamento_id}|${r.turno}`] = { temp: String(r.temperatura), obs: r.observacao || "" };
    });
    setEntradas(map);
    setLoading(false);
  };

  const carregarHistorico = async () => {
    if (!storeId) return;
    const { data: regs } = await supabase
      .from("temperatura_registros")
      .select("*")
      .eq("store_id", storeId)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);
    setHistorico((regs || []) as any);
    const ids = [...new Set((regs || []).map((r: any) => r.user_id))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      setProfiles(Object.fromEntries((profs || []).map((p) => [p.user_id, p.full_name || "Usuário"])));
    }
  };

  const salvarLeitura = async (eq: Equipamento, turno: string) => {
    const key = `${eq.id}|${turno}`;
    const val = entradas[key];
    if (!val || val.temp === "") {
      toast({ title: "Informe a temperatura", variant: "destructive" });
      return;
    }
    const temp = Number(String(val.temp).replace(",", "."));
    if (Number.isNaN(temp)) {
      toast({ title: "Temperatura inválida", variant: "destructive" });
      return;
    }
    setSavingKey(key);
    const conforme = temp >= Number(eq.temp_min) && temp <= Number(eq.temp_max);
    const { error } = await supabase.from("temperatura_registros").upsert(
      {
        store_id: storeId,
        equipamento_id: eq.id,
        data,
        turno,
        temperatura: temp,
        conforme,
        observacao: val.obs || null,
        user_id: user!.id,
      },
      { onConflict: "equipamento_id,data,turno" }
    );
    setSavingKey(null);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: conforme ? "Leitura registrada" : "Leitura fora da faixa!", description: `${eq.nome} • ${turno}: ${temp}°C` });
    carregar();
  };

  const addEquipamento = async () => {
    if (!novo.nome.trim() || !storeId) return;
    const { error } = await supabase.from("temperatura_equipamentos").insert({
      store_id: storeId,
      department_id: novo.department_id || null,
      nome: novo.nome.trim(),
      tipo: novo.tipo.trim() || "Equipamento",
      temp_min: Number(novo.temp_min),
      temp_max: Number(novo.temp_max),
      turnos: novo.turnos.split(",").map((t) => t.trim()).filter(Boolean),
      ordem: equipamentos.length + 1,
    });
    if (error) {
      toast({ title: "Erro ao cadastrar", description: error.message, variant: "destructive" });
      return;
    }
    setNovo({ ...novo, nome: "" });
    carregar();
  };

  const updateEquipamento = async (id: string, updates: Partial<Equipamento>) => {
    setEquipamentos((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } as Equipamento : e)));
    await supabase.from("temperatura_equipamentos").update(updates as any).eq("id", id);
  };

  const deleteEquipamento = async (id: string) => {
    await supabase.from("temperatura_equipamentos").delete().eq("id", id);
    carregar();
  };

  const equipamentosVisiveis = useMemo(
    () => equipamentos.filter((e) => e.ativo && (filtroDept === "todos" || e.department_id === filtroDept)),
    [equipamentos, filtroDept]
  );

  const regMap = useMemo(() => {
    const m: Record<string, Registro> = {};
    registros.forEach((r) => { m[`${r.equipamento_id}|${r.turno}`] = r; });
    return m;
  }, [registros]);

  const totalLeituras = equipamentosVisiveis.reduce((s, e) => s + e.turnos.length, 0);
  const feitas = equipamentosVisiveis.reduce((s, e) => s + e.turnos.filter((t) => regMap[`${e.id}|${t}`]).length, 0);
  const foraFaixa = registros.filter((r) => !r.conforme).length;

  const exportarHistorico = () => {
    const eqMap = Object.fromEntries(equipamentos.map((e) => [e.id, e]));
    const rows = historico.map((r) => ({
      Data: new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR"),
      Equipamento: eqMap[r.equipamento_id]?.nome || "-",
      Tipo: eqMap[r.equipamento_id]?.tipo || "-",
      Turno: r.turno,
      "Temperatura (°C)": Number(r.temperatura),
      "Faixa": eqMap[r.equipamento_id] ? `${eqMap[r.equipamento_id].temp_min} a ${eqMap[r.equipamento_id].temp_max}` : "-",
      Status: r.conforme ? "OK" : "FORA DA FAIXA",
      Responsável: profiles[r.user_id] || "Usuário",
      Observação: r.observacao || "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Temperaturas");
    salvarWorkbook(wb, `Checklist Temperaturas - ${storeName}`);
  };

  if (!storeId) {
    return (
      <ClientLayout storeName={storeName}>
        <div className="container mx-auto px-6 py-20 text-center">
          <p className="text-muted-foreground font-body">Selecione uma loja para começar.</p>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout storeName={storeName}>
      <div className="container mx-auto px-4 sm:px-6 py-8 max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Thermometer className="w-7 h-7 text-primary" />
            <h1 className="font-display text-2xl md:text-3xl font-bold">
              Checklist de <span className="text-gradient-gold">Temperaturas</span>
            </h1>
          </div>
          <p className="text-muted-foreground font-body text-sm">
            Acompanhamento diário dos equipamentos de {storeName || "sua loja"}.
          </p>
        </motion.div>

        <Tabs defaultValue="dia" onValueChange={(v) => { if (v === "historico") carregarHistorico(); }}>
          <TabsList className="w-full mb-6">
            <TabsTrigger value="dia" className="flex-1 gap-2"><Thermometer className="w-4 h-4" /> Registro do dia</TabsTrigger>
            <TabsTrigger value="historico" className="flex-1 gap-2"><History className="w-4 h-4" /> Histórico</TabsTrigger>
            <TabsTrigger value="equipamentos" className="flex-1 gap-2"><Settings2 className="w-4 h-4" /> Equipamentos</TabsTrigger>
          </TabsList>

          {/* ------- REGISTRO DO DIA ------- */}
          <TabsContent value="dia">
            <div className="flex flex-wrap items-end gap-3 mb-6">
              <div className="space-y-1">
                <Label className="font-body text-xs">Data</Label>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-44" />
              </div>
              <div className="space-y-1">
                <Label className="font-body text-xs">Departamento</Label>
                <select
                  value={filtroDept}
                  onChange={(e) => setFiltroDept(e.target.value)}
                  className="h-10 rounded-md border border-border bg-background px-3 font-body text-sm"
                >
                  <option value="todos">Todos</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 ml-auto">
                <div className="bg-card border border-border rounded-xl px-4 py-2">
                  <p className="font-body text-xs text-muted-foreground">Leituras</p>
                  <p className="font-display font-bold">{feitas}/{totalLeituras}</p>
                </div>
                <div className="bg-card border border-border rounded-xl px-4 py-2">
                  <p className="font-body text-xs text-muted-foreground">Fora da faixa</p>
                  <p className={`font-display font-bold ${foraFaixa > 0 ? "text-red-400" : "text-green-400"}`}>{foraFaixa}</p>
                </div>
              </div>
            </div>

            {loading ? (
              <p className="text-muted-foreground font-body text-center py-12">Carregando...</p>
            ) : equipamentosVisiveis.length === 0 ? (
              <p className="text-muted-foreground font-body text-center py-12">
                Nenhum equipamento cadastrado. Use a aba "Equipamentos" para adicionar.
              </p>
            ) : (
              <div className="space-y-4">
                {equipamentosVisiveis.map((eq) => (
                  <div key={eq.id} className="bg-card border border-border rounded-2xl p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="font-display font-semibold">{eq.nome}</h3>
                        <p className="font-body text-xs text-muted-foreground">
                          {eq.tipo} • faixa {eq.temp_min}°C a {eq.temp_max}°C
                          {eq.department_id && ` • ${departments.find((d) => d.id === eq.department_id)?.name || ""}`}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {eq.turnos.map((turno) => {
                        const key = `${eq.id}|${turno}`;
                        const reg = regMap[key];
                        const val = entradas[key] || { temp: "", obs: "" };
                        const numeric = Number(String(val.temp).replace(",", "."));
                        const foraPrevia = val.temp !== "" && !Number.isNaN(numeric) && (numeric < eq.temp_min || numeric > eq.temp_max);
                        return (
                          <div key={turno} className={`rounded-xl border p-3 space-y-2 ${reg ? (reg.conforme ? "border-green-500/40" : "border-red-500/50") : "border-border"}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-body text-sm font-semibold">{turno}</span>
                              {reg && (reg.conforme
                                ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                                : <AlertTriangle className="w-4 h-4 text-red-400" />)}
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                step="0.1"
                                placeholder="°C"
                                value={val.temp}
                                onChange={(e) => setEntradas((p) => ({ ...p, [key]: { ...val, temp: e.target.value } }))}
                                className={foraPrevia ? "border-red-500/60" : ""}
                              />
                              <button
                                onClick={() => salvarLeitura(eq, turno)}
                                disabled={savingKey === key}
                                className="shrink-0 h-10 px-3 rounded-lg bg-gradient-gold text-primary-foreground font-body text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                            </div>
                            <Input
                              placeholder="Observação"
                              value={val.obs}
                              onChange={(e) => setEntradas((p) => ({ ...p, [key]: { ...val, obs: e.target.value } }))}
                              className="text-xs"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ------- HISTÓRICO ------- */}
          <TabsContent value="historico">
            <div className="flex justify-end mb-4">
              <button onClick={exportarHistorico} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border font-body text-sm hover:border-primary/50">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            </div>
            <div className="bg-card border border-border rounded-2xl overflow-x-auto">
              <table className="w-full text-sm font-body">
                <thead className="bg-muted/40">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Equipamento</th>
                    <th className="px-4 py-3">Turno</th>
                    <th className="px-4 py-3 text-right">Temp.</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Responsável</th>
                    <th className="px-4 py-3">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {historico.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nenhum registro encontrado.</td></tr>
                  ) : historico.map((r) => {
                    const eq = equipamentos.find((e) => e.id === r.equipamento_id);
                    return (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5">{new Date(r.data + "T12:00:00").toLocaleDateString("pt-BR")}</td>
                        <td className="px-4 py-2.5">{eq?.nome || "-"}</td>
                        <td className="px-4 py-2.5">{r.turno}</td>
                        <td className="px-4 py-2.5 text-right">{Number(r.temperatura).toFixed(1)}°C</td>
                        <td className={`px-4 py-2.5 font-semibold ${r.conforme ? "text-green-400" : "text-red-400"}`}>
                          {r.conforme ? "OK" : "Fora da faixa"}
                        </td>
                        <td className="px-4 py-2.5">{profiles[r.user_id] || "Usuário"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.observacao || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ------- EQUIPAMENTOS ------- */}
          <TabsContent value="equipamentos">
            <div className="bg-card border border-border rounded-2xl p-5 mb-6">
              <h2 className="font-display text-lg font-semibold mb-4">Novo equipamento</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label className="font-body text-xs">Nome</Label>
                  <Input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex: Câmara de congelados 1" />
                </div>
                <div className="space-y-1">
                  <Label className="font-body text-xs">Tipo</Label>
                  <Input value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })} placeholder="Câmara Fria, Freezer, Balcão..." />
                </div>
                <div className="space-y-1">
                  <Label className="font-body text-xs">Departamento</Label>
                  <select
                    value={novo.department_id}
                    onChange={(e) => setNovo({ ...novo, department_id: e.target.value })}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 font-body text-sm"
                  >
                    <option value="">Sem departamento</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="font-body text-xs">Temp. mínima (°C)</Label>
                  <Input type="number" step="0.1" value={novo.temp_min} onChange={(e) => setNovo({ ...novo, temp_min: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label className="font-body text-xs">Temp. máxima (°C)</Label>
                  <Input type="number" step="0.1" value={novo.temp_max} onChange={(e) => setNovo({ ...novo, temp_max: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label className="font-body text-xs">Turnos (separados por vírgula)</Label>
                  <Input value={novo.turnos} onChange={(e) => setNovo({ ...novo, turnos: e.target.value })} />
                </div>
              </div>
              <button onClick={addEquipamento} className="mt-4 flex items-center gap-2 bg-gradient-gold text-primary-foreground font-body font-semibold px-5 py-2 rounded-lg hover:opacity-90">
                <Plus className="w-4 h-4" /> Adicionar
              </button>
            </div>

            <div className="space-y-3">
              {equipamentos.length === 0 ? (
                <p className="text-muted-foreground font-body text-center py-8">Nenhum equipamento cadastrado.</p>
              ) : equipamentos.map((eq) => (
                <div key={eq.id} className="bg-card border border-border rounded-xl p-4 grid gap-3 md:grid-cols-12 items-end">
                  <div className="md:col-span-3 space-y-1">
                    <Label className="font-body text-xs">Nome</Label>
                    <Input value={eq.nome} onChange={(e) => updateEquipamento(eq.id, { nome: e.target.value })} />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label className="font-body text-xs">Tipo</Label>
                    <Input value={eq.tipo} onChange={(e) => updateEquipamento(eq.id, { tipo: e.target.value })} />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label className="font-body text-xs">Departamento</Label>
                    <select
                      value={eq.department_id || ""}
                      onChange={(e) => updateEquipamento(eq.id, { department_id: e.target.value || null })}
                      className="h-10 w-full rounded-md border border-border bg-background px-2 font-body text-sm"
                    >
                      <option value="">—</option>
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-1 space-y-1">
                    <Label className="font-body text-xs">Mín.</Label>
                    <Input type="number" step="0.1" value={eq.temp_min} onChange={(e) => updateEquipamento(eq.id, { temp_min: Number(e.target.value) })} />
                  </div>
                  <div className="md:col-span-1 space-y-1">
                    <Label className="font-body text-xs">Máx.</Label>
                    <Input type="number" step="0.1" value={eq.temp_max} onChange={(e) => updateEquipamento(eq.id, { temp_max: Number(e.target.value) })} />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label className="font-body text-xs">Turnos</Label>
                    <Input
                      value={eq.turnos.join(", ")}
                      onChange={(e) => updateEquipamento(eq.id, { turnos: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                    />
                  </div>
                  <div className="md:col-span-1 flex items-center gap-3 justify-end">
                    <label className="flex items-center gap-1 font-body text-xs cursor-pointer" title="Ativo">
                      <input type="checkbox" checked={eq.ativo} onChange={(e) => updateEquipamento(eq.id, { ativo: e.target.checked })} className="rounded" />
                      Ativo
                    </label>
                    <button onClick={() => deleteEquipamento(eq.id)} className="text-destructive hover:text-destructive/80">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ClientLayout>
  );
};

export default ChecklistTemperatura;
