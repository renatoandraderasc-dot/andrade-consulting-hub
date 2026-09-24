import { useState, useEffect, useMemo, useCallback } from "react";
import { chamarRelatorio, avisoRelatorio, pick, num } from "@/lib/vrReport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronRight, ChevronDown, Pencil, X, RefreshCw, Loader2, Download, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { salvarWorkbook } from "@/lib/exportBranding";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Lancamento } from "./lancamentosTypes";
import {
  DRE_STRUCTURE_COMERCIAL, DRE_STRUCTURE_FINANCEIRO,
  calcularDRE, TIPOS_LANCAMENTO_V2, SUBCONTAS_V2,
  type DRENode,
} from "./contRedeStructure";

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const anoAtual = new Date().getFullYear();
const anos = Array.from({ length: anoAtual - 2023 }, (_, i) => String(2024 + i));

const STORAGE_KEY_ANO = "controladoria_ano";

function getStoredAno(): number {
  const stored = sessionStorage.getItem(STORAGE_KEY_ANO);
  return stored ? Number(stored) : anoAtual;
}

interface Props {
  storeId: string;
  onGoClassificacao?: () => void;
}

const fmtCurrency = (v: number) => {
  const neg = v < 0;
  const abs = Math.abs(v);
  const str = abs.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return neg ? `(${str})` : str;
};
const fmtCompacto = (v: number) => {
  if (!v) return "—";
  const neg = v < 0;
  const str = Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return neg ? `(${str})` : str;
};

const fmtDate = (d: string) => {
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
};

type VendaMes = { venda: number; cmv: number } | null;

// Lê faturamento/CMV de um mês tentando os relatórios publicados pela loja
async function lerVendaMes(storeId: string, ano: number, mes: number, preferido: string | null) {
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
  const base = ["dre_periodo", "kpis_periodo", "vendas_secao_periodo", "vendas_dep_periodo"];
  const candidatos = preferido ? [preferido, ...base.filter((c) => c !== preferido)] : base;
  let aviso: string | null = null;
  for (const rel of candidatos) {
    const r = await chamarRelatorio(storeId, rel, { inicio, fim });
    const av = avisoRelatorio(r);
    if (av) { aviso = av; continue; }
    if (!r.dados.length) continue;
    const venda = r.dados.reduce(
      (s, x) => s + num(pick(x, "receita_bruta", "faturamento", "total_vendido", "venda", "vendas", "valor_venda")), 0);
    let cmv = r.dados.reduce((s, x) => s + Math.abs(num(pick(x, "cmv", "custo", "custo_total"))), 0);
    if (cmv === 0) {
      const lucro = r.dados.reduce((s, x) => s + num(pick(x, "lucro", "lucro_bruto", "margem_valor")), 0);
      if (lucro !== 0 && venda !== 0) cmv = Math.abs(venda - lucro);
    }
    if (venda === 0 && cmv === 0) continue;
    return { valor: { venda, cmv } as VendaMes, rel, aviso: null };
  }
  return { valor: null as VendaMes, rel: preferido, aviso };
}

export const ContRedeTab = ({ storeId }: Props) => {
  const { user } = useAuth();
  const [ano, setAno] = useState(getStoredAno);
  const [modo, setModo] = useState<"comercial" | "financeiro">("comercial");
  const [storeName, setStoreName] = useState("");
  useEffect(() => {
    if (!storeId) { setStoreName(""); return; }
    supabase.from("stores").select("name").eq("id", storeId).maybeSingle()
      .then(({ data }) => setStoreName((data as any)?.name || ""));
  }, [storeId]);

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [mapaVr, setMapaVr] = useState<Map<number, { tipo: string; subtipo: string }>>(new Map());
  const [loading, setLoading] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailFilter, setDetailFilter] = useState<{ tipo: string; subtipo?: string } | null>(null);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingLancamento, setEditingLancamento] = useState<Lancamento | null>(null);
  const [editForm, setEditForm] = useState({
    data: "", tipo: "", subtipo: "", descricao: "", valor: "", observacao: "", status: "ativo",
  });

  useEffect(() => { sessionStorage.setItem(STORAGE_KEY_ANO, String(ano)); }, [ano]);

  // Meses exibidos: o ano todo (no ano corrente, até o mês atual)
  const mesesAno = useMemo(() => {
    const ate = ano === anoAtual ? new Date().getMonth() + 1 : ano < anoAtual ? 12 : 0;
    return Array.from({ length: ate }, (_, i) => i + 1);
  }, [ano]);

  const fetchData = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const todos: any[] = [];
    for (let de = 0; ; de += 1000) {
      const { data } = await supabase
        .from("lancamentos")
        .select("*")
        .eq("store_id", storeId)
        .eq("competencia_ano", ano)
        .eq("status", "ativo")
        .range(de, de + 999);
      todos.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    // De-para por tipo de pagamento (id_tipo): o da loja vence o padrão
    const { data: mapas } = await supabase
      .from("vr_lancamento_map")
      .select("store_id, id_tipo, tipo, subtipo")
      .or(`store_id.eq.${storeId},store_id.is.null`);
    const padrao = new Map<number, { tipo: string; subtipo: string }>();
    const daLoja = new Map<number, { tipo: string; subtipo: string }>();
    for (const m of (mapas as any[]) || []) {
      if (!m.tipo) continue;
      (m.store_id ? daLoja : padrao).set(Number(m.id_tipo), { tipo: m.tipo, subtipo: m.subtipo || "" });
    }
    setMapaVr(new Map([...padrao, ...daLoja]));
    setLancamentos(todos as Lancamento[]);
    setLoading(false);
  }, [storeId, ano]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Faturamento/CMV por mês (ao vivo no sistema da loja)
  const [vendas, setVendas] = useState<Record<number, VendaMes>>({});
  const [vendaErro, setVendaErro] = useState<string | null>(null);
  const [lendoVendas, setLendoVendas] = useState<string | null>(null);

  const fetchVendas = useCallback(async () => {
    if (!storeId || !mesesAno.length) { setVendas({}); return; }
    const res: Record<number, VendaMes> = {};
    let preferido: string | null = null;
    let aviso: string | null = null;
    for (const m of mesesAno) {
      setLendoVendas(`Lendo vendas de ${MESES_CURTOS[m - 1]}/${ano}...`);
      const r = await lerVendaMes(storeId, ano, m, preferido);
      res[m] = r.valor;
      if (r.valor) preferido = r.rel;
      else aviso = r.aviso ?? aviso;
      setVendas({ ...res });
    }
    setLendoVendas(null);
    setVendaErro(Object.values(res).some(Boolean) ? null : aviso ?? "o sistema da loja não retornou vendas");
  }, [storeId, ano, mesesAno]);

  useEffect(() => { fetchVendas(); }, [fetchVendas]);

  // COMPRA DO MÊS = entrada de NF para revenda (histórico do módulo Compras)
  const [comprasNf, setComprasNf] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!storeId) { setComprasNf({}); return; }
    let ativo = true;
    (async () => {
      const { data } = await supabase
        .from("compras_historico")
        .select("mes, compra")
        .eq("store_id", storeId)
        .eq("ano", ano);
      if (!ativo) return;
      const acc: Record<number, number> = {};
      for (const l of (data as any[]) || []) acc[l.mes] = (acc[l.mes] || 0) + Number(l.compra || 0);
      setComprasNf(acc);
    })();
    return () => { ativo = false; };
  }, [storeId, ano]);

  // Botão Atualizar: busca no sistema os lançamentos dos últimos 12 meses
  const atualizar = async () => {
    if (!storeId || !user) { toast.error("Selecione uma loja"); return; }
    setAtualizando(true);
    const hoje = new Date();
    const fim = hoje.toISOString().slice(0, 10);
    const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 11, 1)).toISOString().slice(0, 10);
    const { data, error } = await supabase.functions.invoke("importar-lancamentos-vr", {
      body: { store_id: storeId, user_id: user.id, inicio: ini, fim },
    });
    const payload = data as any;
    if (error || payload?.erro) {
      toast.error(`Falha ao ler o sistema da loja: ${error?.message || payload?.erro}`);
    } else {
      const pend = (payload?.pendentes ?? []).length;
      toast.success(`${payload?.gravados ?? 0} lançamento(s) atualizados (últimos 12 meses)` +
        (pend ? ` · ${pend} tipo(s) de pagamento sem classificação` : ""));
    }
    await fetchData();
    await fetchVendas();
    setAtualizando(false);
  };

  const structure = modo === "comercial" ? DRE_STRUCTURE_COMERCIAL : DRE_STRUCTURE_FINANCEIRO;

  // Classificação pelo tipo de pagamento (de-para), salvo edição manual
  const lancamentosClass = useMemo(() => lancamentos.map((l) => {
    const idTipo = (l as any).id_tipo;
    if ((l as any).classificacao_manual || idTipo === null || idTipo === undefined) return l;
    const cls = mapaVr.get(Number(idTipo));
    return cls ? { ...l, tipo: cls.tipo, subtipo: cls.subtipo } : l;
  }), [lancamentos, mapaVr]);

  // Deduplicação: mesmo Beneficiário + mesmo valor conta apenas 1 vez no DRE
  const beneficiarioDe = (l: Lancamento) =>
    (l.descricao || "—").split("·")[0].trim().toUpperCase();

  const duplicadosIds = useMemo(() => {
    const vistos = new Map<string, string>();
    const dups = new Set<string>();
    [...lancamentosClass]
      .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id.localeCompare(b.id)))
      .forEach(l => {
        const chave = l.origem_ref
          ? `REF|${l.origem}|${l.origem_ref}`
          : `${beneficiarioDe(l)}|${l.data}|${Number(l.valor).toFixed(2)}`;
        if (vistos.has(chave)) dups.add(l.id);
        else vistos.set(chave, l.id);
      });
    return dups;
  }, [lancamentosClass]);

  const lancamentosUnicos = useMemo(
    () => lancamentosClass.filter(l => !duplicadosIds.has(l.id)),
    [lancamentosClass, duplicadosIds],
  );

  const valorDuplicado = useMemo(
    () => lancamentosClass.filter(l => duplicadosIds.has(l.id)).reduce((s, l) => s + Number(l.valor), 0),
    [lancamentosClass, duplicadosIds],
  );

  // DRE de cada mês + total do ano
  const drePorMes = useMemo(() => {
    const porMes = new Map<number, Map<string, number>>();
    for (const m of mesesAno) {
      const overrides: Record<string, number> = {};
      const v = vendas[m];
      if (modo === "comercial" && v) {
        overrides.faturamento = v.venda;
        overrides.venda_bruta = v.venda;
        // Comercial apura o resultado pelo CMV do periodo
        overrides.cmv = v.cmv;
        overrides.cmv_merc = v.cmv;
      }
      // Entrada de NF para revenda (compras do mes) — informativa nas duas visoes
      const nf = comprasNf[m] ?? 0;
      overrides.compra_mes = nf;
      overrides.compra_fornec = nf;
      // No Financeiro o resultado e apurado pelo Pagamento de Fornecedores (nó "cmv"),
      // que vem dos proprios lancamentos de pagamento — sem override.


      const doMes = lancamentosUnicos.filter(l => Number(l.competencia_mes) === m);
      porMes.set(m, calcularDRE(structure, doMes.map(l => ({
        tipo: l.tipo, subtipo: l.subtipo, valor: Number(l.valor),
      })), overrides));
    }
    const total = new Map<string, number>();
    for (const mapa of porMes.values()) for (const [k, v] of mapa) total.set(k, (total.get(k) || 0) + v);
    return { porMes, total };
  }, [lancamentosUnicos, structure, modo, vendas, comprasNf, mesesAno]);

  const faturamentoAno = drePorMes.total.get("faturamento") || 0;

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleRowClick = (node: DRENode) => {
    if (node.isGroup) toggle(node.id);
    if (node.tipo) setDetailFilter({ tipo: node.tipo });
  };

  const handleChildClick = (tipo: string, subtipo: string) => {
    setDetailFilter({ tipo, subtipo });
  };

  const filteredLancamentos = detailFilter
    ? lancamentosClass.filter(l => {
        if (l.tipo !== detailFilter.tipo) return false;
        if (detailFilter.subtipo && l.subtipo !== detailFilter.subtipo) return false;
        return true;
      })
    : [];

  const openEditDialog = (l: Lancamento) => {
    setEditingLancamento(l);
    setEditForm({
      data: l.data,
      tipo: l.tipo,
      subtipo: l.subtipo,
      descricao: l.descricao || "",
      valor: String(l.valor),
      observacao: l.observacao || "",
      status: l.status,
    });
    setEditDialogOpen(true);
  };

  const isVr = (l: Lancamento | null) => (l as any)?.origem === "VR";

  const handleSaveEdit = async () => {
    if (!editingLancamento) return;
    const vr = isVr(editingLancamento);
    const payload: any = {
      tipo: editForm.tipo,
      subtipo: editForm.subtipo,
      descricao: editForm.descricao || null,
      observacao: editForm.observacao || null,
      status: editForm.status,
      classificacao_manual: true,
      updated_at: new Date().toISOString(),
    };
    if (!vr) {
      payload.data = editForm.data;
      payload.valor = Number(editForm.valor);
    }
    const { error } = await supabase
      .from("lancamentos")
      .update(payload)
      .eq("id", editingLancamento.id);

    if (error) { toast.error("Erro ao atualizar"); return; }
    toast.success("Lançamento atualizado");
    setEditDialogOpen(false);
    setEditingLancamento(null);
    fetchData();
  };

  const subcontas = SUBCONTAS_V2[editForm.tipo] || [];

  const isSectionHeader = (name: string) => /^\d/.test(name);

  // ===== Exportação (Excel e PDF) =====
  // Monta as mesmas linhas da tela: conta, valor de cada mês e total do ano.
  const linhasExport = useCallback(() => {
    const linhas: { conta: string; valores: number[]; total: number; nivel: number }[] = [];
    for (const node of structure) {
      linhas.push({
        conta: node.name,
        valores: mesesAno.map(m => drePorMes.porMes.get(m)?.get(node.id) || 0),
        total: drePorMes.total.get(node.id) || 0,
        nivel: 0,
      });
      if (node.isGroup && node.children) {
        for (const child of node.children) {
          linhas.push({
            conta: `   ${child.name}`,
            valores: mesesAno.map(m => drePorMes.porMes.get(m)?.get(child.id) || 0),
            total: drePorMes.total.get(child.id) || 0,
            nivel: 1,
          });
        }
      }
    }
    return linhas;
  }, [structure, mesesAno, drePorMes]);

  const tituloExport = `DRE ${modo === "comercial" ? "Comercial" : "Financeiro"} ${ano}`;

  const exportarExcel = () => {
    const linhas = linhasExport().map(l => {
      const linha: Record<string, string | number> = { Conta: l.conta };
      mesesAno.forEach((m, i) => { linha[MESES_CURTOS[m - 1]] = Math.round(l.valores[i] * 100) / 100; });
      linha["Total"] = Math.round(l.total * 100) / 100;
      return linha;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "DRE");
    salvarWorkbook(wb, tituloExport, [["Loja", storeName || "—"], ["Ano", String(ano)]]);
  };

  const exportarPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(tituloExport, 40, 40);
    doc.setFontSize(9);
    doc.text(`${storeName || ""} · exportado em ${new Date().toLocaleString("pt-BR")}`, 40, 56);
    const head = [["Conta", ...mesesAno.map(m => MESES_CURTOS[m - 1]), "Total"]];
    const body = linhasExport().map(l => [
      l.conta,
      ...l.valores.map(v => fmtCompacto(v)),
      fmtCompacto(l.total),
    ]);
    autoTable(doc, {
      head, body, startY: 70, styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [23, 37, 84] },
      columnStyles: { 0: { cellWidth: 150, halign: "left" } },
      bodyStyles: { halign: "right" },
      didParseCell: (d: any) => { if (d.column.index === 0) d.cell.styles.halign = "left"; },
    });
    doc.save(`${tituloExport.replace(/\s+/g, "-")}.pdf`);
  };

  const colunas = `minmax(220px,1fr) repeat(${mesesAno.length}, 110px) 130px 64px`;


  const pctStr = (v: number, base: number) =>
    base !== 0 ? `${((v / Math.abs(base)) * 100).toFixed(1)}%` : "—";

  // Percentuais por mês: grupos/seções sobre o faturamento do mês;
  // subcontas sobre o total do próprio grupo naquele mês.
  const celulas = (id: string, destaque: string, parentId?: string) => (
    <>
      {mesesAno.map(m => {
        const mapaMes = drePorMes.porMes.get(m);
        const v = mapaMes?.get(id) || 0;
        const base = parentId
          ? mapaMes?.get(parentId) || 0
          : mapaMes?.get("faturamento") || 0;
        return (
          <div key={m} className={`text-right font-mono ${v < 0 ? "text-red-600" : ""} ${destaque}`}>
            <div>{fmtCompacto(v)}</div>
            <div className="text-[10px] text-muted-foreground font-normal">{pctStr(v, base)}</div>
          </div>
        );
      })}
      {(() => {
        const t = drePorMes.total.get(id) || 0;
        const baseTotal = parentId ? (drePorMes.total.get(parentId) || 0) : faturamentoAno;
        return (
          <>
            <div className={`text-right font-mono font-semibold ${t < 0 ? "text-red-600" : ""} ${destaque}`}>{fmtCompacto(t)}</div>
            <div className={`text-right font-mono text-[10px] text-muted-foreground font-normal ${destaque}`}>{pctStr(t, baseTotal)}</div>
          </>
        );
      })()}
    </>
  );

  const renderNode = (node: DRENode) => {
    const isExpanded = expanded.has(node.id);
    const isClickable = !!node.tipo || !!node.calcPctOf;
    const isActive = detailFilter?.tipo === node.tipo && !detailFilter?.subtipo;
    const isSection = (node.isGroup || !!node.calcPctOf) && isSectionHeader(node.name);
    const hover = "group-hover:font-bold group-hover:text-orange-600 dark:group-hover:text-orange-400";

    return (
      <div key={node.id}>
        <div
          style={{ gridTemplateColumns: colunas }}
          className={`group grid gap-x-2 items-center px-4 border-b border-border text-xs transition-all duration-200 hover:bg-orange-50 dark:hover:bg-orange-950/20
            ${node.isResult ? "bg-accent/20 font-bold text-foreground py-3" : ""}
            ${isSection ? "bg-secondary/10 font-semibold py-2.5" : "py-2"}
            ${isClickable ? "cursor-pointer" : ""}
            ${isActive ? "bg-primary/10 border-l-2 border-l-primary" : ""}
          `}
          onClick={() => node.isGroup ? handleRowClick(node) : null}
        >
          <div className="flex items-center gap-2 sticky left-0 bg-card/95">
            {node.isGroup
              ? (isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />)
              : <span className="w-4 shrink-0" />}
            <span className={`text-sm text-foreground/90 ${hover}`}>{node.name}</span>
          </div>
          {celulas(node.id, hover)}
        </div>

        {node.isGroup && isExpanded && node.children?.map(child => {
          const isChildActive = detailFilter?.tipo === child.tipo && detailFilter?.subtipo === child.subtipo;
          return (
            <div
              key={child.id}
              style={{ gridTemplateColumns: colunas }}
              className={`group grid gap-x-2 items-center px-4 py-1.5 border-b border-border/30 text-xs cursor-pointer transition-all duration-200
                ${isChildActive ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-orange-50 dark:hover:bg-orange-950/20"}
              `}
              onClick={() => child.tipo && child.subtipo && handleChildClick(child.tipo, child.subtipo)}
            >
              <div className={`pl-8 text-foreground/75 sticky left-0 bg-card/95 ${hover}`}>{child.name}</div>
              {celulas(child.id, hover, node.id)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-foreground">Cont Rede</h2>
        <p className="text-sm text-muted-foreground">
          DRE do ano, mês a mês — lançamentos classificados pelo tipo de pagamento · percentual de cada mês em relação ao faturamento do mês (subcontas em relação ao próprio grupo)
        </p>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button onClick={atualizar} disabled={atualizando || !storeId}>
            {atualizando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {atualizando ? "Atualizando..." : "Atualizar"}
          </Button>
          <span className="text-xs text-muted-foreground">Busca no sistema os lançamentos dos últimos 12 meses</span>

          <Button variant="outline" size="sm" onClick={exportarExcel} className="gap-2">
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportarPdf} className="gap-2">
            <FileText className="h-4 w-4" /> PDF
          </Button>

          <div className="flex gap-1 ml-auto rounded-lg bg-secondary/20 p-1">
            <Button
              size="sm"
              variant={modo === "comercial" ? "default" : "ghost"}
              onClick={() => setModo("comercial")}
            >
              Comercial
            </Button>
            <Button
              size="sm"
              variant={modo === "financeiro" ? "default" : "ghost"}
              onClick={() => setModo("financeiro")}
            >
              Financeiro
            </Button>
          </div>

        </CardContent>
      </Card>

      {modo === "comercial" && (
        <p className="text-xs text-muted-foreground">
          {lendoVendas ?? (vendaErro
            ? `Vendas do sistema indisponíveis — ${vendaErro}; usando lançamentos.`
            : "Faturamento e CMV de cada mês lidos do sistema da loja.")}
        </p>
      )}

      {duplicadosIds.size > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <p className="font-semibold text-foreground">
            {duplicadosIds.size} lançamento(s) duplicado(s) identificado(s)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Mesmo beneficiário e mesmo valor: apenas 1 é somado no DRE. Total ignorado:{" "}
            {fmtCurrency(valorDuplicado)}.
          </p>
        </div>
      )}

      {loading && <p className="text-muted-foreground text-sm">Carregando dados...</p>}

      {!loading && lancamentos.length === 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-4 text-sm">
          <p className="font-semibold text-foreground">Nenhum lançamento em {ano}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Clique em Atualizar para buscar os lançamentos no sistema da loja.
          </p>
        </div>
      )}

      {/* DRE Table */}
      <Card className="bg-card border-border overflow-hidden">
        <CardHeader className="pb-0">
          <CardTitle className="text-base font-semibold">
            {modo === "comercial" ? "DRE Comercial" : "DRE Financeiro"} — {ano}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {modo === "comercial"
              ? "Resultado apurado pelo CMV. Entrada de NF para revenda e Pagamento de Fornecedores aparecem como linhas informativas."
              : "Resultado apurado pelo Pagamento de Fornecedores. Entrada de NF para revenda aparece como linha informativa."}
            {" "}Clique em uma linha para ver os lançamentos do ano.
          </p>
        </CardHeader>
        <CardContent className="p-0 mt-4 overflow-auto max-h-[70vh]">
          <div className="min-w-max">
            <div
              style={{ gridTemplateColumns: colunas }}
              className="grid gap-x-2 items-center px-4 py-2.5 bg-secondary/30 backdrop-blur border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 z-20"
            >
              <div className="sticky left-0 bg-secondary/30 backdrop-blur">Conta</div>
              {mesesAno.map(m => <div key={m} className="text-right">{MESES_CURTOS[m - 1]}</div>)}
              <div className="text-right">Total</div>
              <div className="text-right">% Fat.</div>
            </div>
            {structure.map(renderNode)}
          </div>
        </CardContent>

      </Card>

      {/* Detail Panel */}
      {detailFilter && (
        <Card className="bg-card border-border overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">
                  Lançamentos: {detailFilter.tipo}
                  {detailFilter.subtipo && ` → ${detailFilter.subtipo}`}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filteredLancamentos.length} lançamento(s) — clique para editar
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setDetailFilter(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Beneficiário</TableHead>
                  <TableHead>Subtipo</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right w-[60px]">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLancamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Nenhum lançamento nesta categoria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLancamentos.map(l => {
                    const dup = duplicadosIds.has(l.id);
                    return (
                    <TableRow key={l.id} className={`cursor-pointer hover:bg-muted/30 ${dup ? "opacity-60" : ""}`} onClick={() => openEditDialog(l)}>
                      <TableCell className="text-sm font-medium">
                        <span className="inline-flex items-center gap-2">
                          {l.descricao || "—"}
                          {isVr(l) && (
                            <span className="text-[10px] uppercase tracking-wide border border-border text-muted-foreground px-1.5 py-0.5 rounded">
                              VR
                            </span>
                          )}
                          {dup && (
                            <span className="text-[10px] uppercase tracking-wide border border-amber-500/50 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded">
                              Duplicado · não somado
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs bg-secondary/20 text-secondary-foreground px-2 py-0.5 rounded-full">
                          {l.subtipo}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(l.data)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtCurrency(Number(l.valor))}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditDialog(l); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );})
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={editForm.data} disabled={isVr(editingLancamento)} onChange={e => setEditForm(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={editForm.tipo} onValueChange={v => setEditForm(p => ({ ...p, tipo: v, subtipo: (SUBCONTAS_V2[v] || [])[0] || "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_LANCAMENTO_V2.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subconta</Label>
              <Select value={editForm.subtipo} onValueChange={v => setEditForm(p => ({ ...p, subtipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {subcontas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={editForm.valor} disabled={isVr(editingLancamento)} onChange={e => setEditForm(p => ({ ...p, valor: e.target.value }))} />
              {isVr(editingLancamento) && (
                <p className="text-xs text-muted-foreground mt-1">
                  Lançamento importado do VR: data e valor são sobrescritos a cada importação e não podem ser editados.
                </p>
              )}
            </div>
            <div>
              <Label>Descrição / Beneficiário</Label>
              <Input value={editForm.descricao} onChange={e => setEditForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea value={editForm.observacao} onChange={e => setEditForm(p => ({ ...p, observacao: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
