import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Download, Upload, FileDown } from "lucide-react";
import * as XLSX from "xlsx";
import ImportarMargensDialog, { montarPreview, type LinhaImport } from "./ImportarMargensDialog";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, pick as col, txt } from "@/lib/vrReport";
import { carregarMargens, type MargemPadrao, type TipoMargem } from "@/lib/margensPadrao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

interface Ref { id: string; nome: string }

const rotulo: Record<TipoMargem, string> = {
  produto: "Produto", fornecedor: "Fornecedor", departamento: "Departamento",
};
const corTipo: Record<TipoMargem, string> = {
  produto: "bg-blue-100 text-blue-800",
  fornecedor: "bg-green-100 text-green-800",
  departamento: "bg-amber-100 text-amber-800",
};

const dataHora = (s: string) => new Date(s).toLocaleString("pt-BR");

interface Props { storeId: string }

const MargensPadraoTab = ({ storeId }: Props) => {
  const [margens, setMargens] = useState<MargemPadrao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<TipoMargem | "todos">("todos");

  const [tipo, setTipo] = useState<TipoMargem>("departamento");
  const [refId, setRefId] = useState("");
  const [refNome, setRefNome] = useState("");
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<Ref[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [margemPct, setMargemPct] = useState("");
  const [margemMin, setMargemMin] = useState("");
  const [margemMax, setMargemMax] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<MargemPadrao | null>(null);

  const arquivoRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [previewLinhas, setPreviewLinhas] = useState<LinhaImport[]>([]);
  const [previewAberto, setPreviewAberto] = useState(false);

  const baixarModelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([["Cod", "Preço Novo"], [19871, 59.99]]);
    ws["!cols"] = [{ wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "modelo-margens-padrao.xlsx");
  };

  const exportarCadastro = async () => {
    const { data: loja } = await supabase.from("stores").select("name").eq("id", storeId).maybeSingle();
    const nomeLoja = (loja?.name || "loja").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const hoje = new Date().toISOString().slice(0, 10);
    const ws = XLSX.utils.json_to_sheet(
      margens.map((m) => ({
        Tipo: rotulo[m.tipo],
        "Cod/Ref": m.referencia_id,
        Nome: m.referencia_nome || "",
        "Margem %": Number(m.margem_pct),
        Min: m.margem_min == null ? "" : Number(m.margem_min),
        Max: m.margem_max == null ? "" : Number(m.margem_max),
        Observação: m.observacao || "",
        "Editado em": dataHora(m.updated_at),
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Margens");
    XLSX.writeFile(wb, `margens-padrao-${nomeLoja}-${hoje}.xlsx`);
  };

  const numeroBR = (v: unknown): number => {
    if (typeof v === "number") return v;
    const s = String(v ?? "").trim().replace(/[^\d.,-]/g, "");
    if (!s) return NaN;
    const br = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    return Number(br);
  };

  const importarArquivo = async (file: File) => {
    setImportando(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

      const entradas: { cod: number; precoNovo: number }[] = [];
      for (const l of linhas) {
        let cod = NaN, preco = NaN;
        for (const [k, v] of Object.entries(l)) {
          const n = norm(k);
          if (n.startsWith("cod")) cod = parseInt(String(v).replace(/\D/g, ""), 10);
          else if (n.includes("preco")) preco = numeroBR(v);
        }
        if (!isNaN(cod) && cod > 0 && isFinite(preco) && preco > 0) entradas.push({ cod, precoNovo: preco });
      }
      if (!entradas.length) {
        toast({ title: "Nada para importar", description: "O arquivo precisa das colunas Cod e Preço Novo.", variant: "destructive" });
        return;
      }

      const { data: cfg } = await supabase
        .from("store_vr_config").select("codigo_loja").eq("store_id", storeId).maybeSingle();
      const preview = await montarPreview(storeId, String(cfg?.codigo_loja ?? ""), entradas);
      setPreviewLinhas(preview);
      setPreviewAberto(true);
    } catch (e) {
      toast({ title: "Não foi possível ler o arquivo", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setImportando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  };

  const recarregar = async () => {
    setCarregando(true);
    try { setMargens(await carregarMargens(storeId)); } finally { setCarregando(false); }
  };

  useEffect(() => {
    if (!storeId) { setMargens([]); return; }
    recarregar();
    setOpcoes([]); setRefId(""); setRefNome("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const buscarReferencias = async () => {
    if (!storeId) return;
    setBuscando(true);
    try {
      const relatorio = tipo === "produto" ? "produtos" : tipo === "fornecedor" ? "fornecedores" : "mercadologicos_n1";
      const params = tipo === "produto" ? { busca: busca.trim(), termo: busca.trim() } : {};
      const r = await chamarRelatorio(storeId, relatorio, params);
      const lista: Ref[] = (r.dados || []).map((l) => ({
        id: String(
          col(l, "id", "id_produto", "id_fornecedor", "mercadologico1", "codigo", "cod", "codigo_produto", "codigo_fornecedor") ?? "",
        ).replace(/\D/g, ""),
        nome: txt(col(l, "descricao", "razao_social", "nome", "descricao_completa", "produto", "fornecedor"), "(sem nome)"),
      })).filter((o) => o.id);
      const vistos = new Set<string>();
      setOpcoes(lista.filter((o) => (vistos.has(o.id) ? false : (vistos.add(o.id), true))));
      if (lista.length === 0) {
        toast({ title: "Nada encontrado", description: "O sistema da loja não retornou opções para esse tipo." });
      }
    } finally {
      setBuscando(false);
    }
  };

  const limpar = () => {
    setEditandoId(null); setRefId(""); setRefNome(""); setMargemPct("");
    setMargemMin(""); setMargemMax(""); setObservacao("");
  };

  const salvar = async () => {
    const pctN = Number(margemPct.replace(",", "."));
    const idN = parseInt(refId.replace(/\D/g, ""), 10);
    if (!storeId || isNaN(idN) || !isFinite(pctN) || pctN <= 0 || pctN >= 500) {
      toast({ title: "Dados incompletos", description: "Informe a referência e uma margem entre 0 e 500%.", variant: "destructive" });
      return;
    }
    setSalvando(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("margens_padrao").upsert({
        store_id: storeId,
        tipo,
        referencia_id: idN,
        referencia_nome: refNome || null,
        margem_pct: pctN,
        margem_min: margemMin === "" ? null : Number(margemMin.replace(",", ".")),
        margem_max: margemMax === "" ? null : Number(margemMax.replace(",", ".")),
        observacao: observacao || null,
        created_by: auth.user?.id ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "store_id,tipo,referencia_id" });
      if (error) throw error;
      toast({ title: "Regra salva" });
      limpar();
      await recarregar();
    } catch (e) {
      toast({ title: "Não foi possível salvar", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const editar = (m: MargemPadrao) => {
    setEditandoId(m.id);
    setTipo(m.tipo);
    setRefId(String(m.referencia_id));
    setRefNome(m.referencia_nome || "");
    setMargemPct(String(m.margem_pct));
    setMargemMin(m.margem_min == null ? "" : String(m.margem_min));
    setMargemMax(m.margem_max == null ? "" : String(m.margem_max));
    setObservacao(m.observacao || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmarExclusao = async () => {
    if (!excluir) return;
    const { error } = await supabase.from("margens_padrao").delete().eq("id", excluir.id);
    setExcluir(null);
    if (error) toast({ title: "Não foi possível excluir", variant: "destructive" });
    else { toast({ title: "Regra excluída" }); recarregar(); }
  };

  const lista = useMemo(
    () => (filtro === "todos" ? margens : margens.filter((m) => m.tipo === filtro)),
    [margens, filtro],
  );

  const opcoesFiltradas = opcoes.filter((o) => {
    const q = busca.trim().toLowerCase();
    return !q || o.nome.toLowerCase().includes(q) || o.id.includes(q);
  }).slice(0, 300);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <input
          ref={arquivoRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importarArquivo(f); }}
        />
        <Button variant="outline" size="sm" onClick={baixarModelo}>
          <FileDown className="w-4 h-4 mr-1" /> Baixar modelo
        </Button>
        <Button variant="outline" size="sm" onClick={exportarCadastro} disabled={margens.length === 0}>
          <Download className="w-4 h-4 mr-1" /> Exportar cadastro
        </Button>
        <Button size="sm" onClick={() => arquivoRef.current?.click()} disabled={importando || !storeId}>
          {importando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
          Importar Excel
        </Button>
      </div>

      <ImportarMargensDialog
        open={previewAberto}
        onOpenChange={setPreviewAberto}
        storeId={storeId}
        linhas={previewLinhas}
        onImportado={recarregar}
      />

      <div className="bg-card border border-border rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground uppercase">Tipo</label>
            <Select value={tipo} onValueChange={(v) => { setTipo(v as TipoMargem); setOpcoes([]); setRefId(""); setRefNome(""); }}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="produto">Produto</SelectItem>
                <SelectItem value="fornecedor">Fornecedor</SelectItem>
                <SelectItem value="departamento">Departamento</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground uppercase">Referência</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[280px] justify-start font-normal truncate">
                  {refNome ? `${refId} — ${refNome}` : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[360px] space-y-2">
                <div className="flex gap-2">
                  <Input placeholder="Buscar por nome, código ou EAN" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  <Button size="sm" onClick={buscarReferencias} disabled={buscando}>
                    {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
                  </Button>
                </div>
                <div className="max-h-[260px] overflow-auto space-y-0.5">
                  {opcoesFiltradas.length === 0 && (
                    <p className="text-sm text-muted-foreground py-2">Clique em Buscar para carregar as opções.</p>
                  )}
                  {opcoesFiltradas.map((o) => (
                    <button
                      key={o.id}
                      className="w-full text-left text-sm px-2 py-1 rounded hover:bg-muted"
                      onClick={() => { setRefId(o.id); setRefNome(o.nome); }}
                    >
                      <span className="font-mono text-[11px] text-muted-foreground mr-1">{o.id}</span>
                      {o.nome}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground uppercase">Margem meta %</label>
            <Input className="w-[110px]" value={margemPct} onChange={(e) => setMargemPct(e.target.value)} placeholder="ex: 22,50" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground uppercase">Mín %</label>
            <Input className="w-[90px]" value={margemMin} onChange={(e) => setMargemMin(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground uppercase">Máx %</label>
            <Input className="w-[90px]" value={margemMax} onChange={(e) => setMargemMax(e.target.value)} />
          </div>
          <div className="space-y-1 flex-1 min-w-[180px]">
            <label className="text-[11px] text-muted-foreground uppercase">Observação</label>
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            {editandoId ? "Salvar" : "Adicionar"}
          </Button>
          {editandoId && <Button variant="ghost" onClick={limpar}>Cancelar</Button>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(["todos", "produto", "fornecedor", "departamento"] as const).map((t) => (
          <Badge
            key={t}
            variant={filtro === t ? "default" : "outline"}
            className="cursor-pointer capitalize"
            onClick={() => setFiltro(t)}
          >
            {t === "todos" ? "Todos" : rotulo[t]}
          </Badge>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">{lista.length} regra(s)</span>
      </div>

      <div className="border border-border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Tipo</TableHead>
              <TableHead>Referência</TableHead>
              <TableHead className="text-right">Margem %</TableHead>
              <TableHead className="text-right">Mín</TableHead>
              <TableHead className="text-right">Máx</TableHead>
              <TableHead>Observação</TableHead>
              <TableHead>Editado em</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando && (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Carregando...</TableCell></TableRow>
            )}
            {!carregando && lista.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Nenhuma regra cadastrada.</TableCell></TableRow>
            )}
            {lista.map((m) => (
              <TableRow key={m.id}>
                <TableCell><Badge variant="secondary" className={`text-[10px] ${corTipo[m.tipo]}`}>{rotulo[m.tipo]}</Badge></TableCell>
                <TableCell className="text-sm">
                  <span className="font-mono text-[11px] text-muted-foreground mr-1">{m.referencia_id}</span>
                  {m.referencia_nome || "—"}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">{Number(m.margem_pct).toFixed(2)}%</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{m.margem_min == null ? "—" : `${Number(m.margem_min).toFixed(2)}%`}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{m.margem_max == null ? "—" : `${Number(m.margem_max).toFixed(2)}%`}</TableCell>
                <TableCell className="text-xs max-w-[220px] truncate" title={m.observacao || ""}>{m.observacao || "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{dataHora(m.updated_at)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Button size="icon" variant="ghost" onClick={() => editar(m)} aria-label="Editar regra">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setExcluir(m)} aria-label="Excluir regra">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra de margem</AlertDialogTitle>
            <AlertDialogDescription>
              {excluir && <>A regra de {rotulo[excluir.tipo].toLowerCase()} <strong>{excluir.referencia_nome || excluir.referencia_id}</strong> será removida.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExclusao}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MargensPadraoTab;
