import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle, ClipboardPaste, Eraser, FileSpreadsheet, FolderOpen, Printer, Save, Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio } from "@/lib/vrReport";
import { salvarWorkbook } from "@/lib/exportBranding";
import { formatBRDate } from "@/lib/formatters";
import TabelaItensEncarte from "@/components/encarte/TabelaItensEncarte";
import {
  LinhaManual, linhaDoRetorno, linhaNaoLocalizada, margemEncarte, normalizarCodigos,
} from "./manualTypes";

interface Store { id: string; name: string }

interface Props {
  stores: Store[];
  storeId: string;
  onStoreChange: (v: string) => void;
  onEnviarImpressao: (itens: LinhaManual[], nomeLista: string) => Promise<void>;
}

const hojeIso = () => new Date().toISOString().slice(0, 10);
const LIMITE = 300;

const InserirManualTab = ({ stores, storeId, onStoreChange, onEnviarImpressao }: Props) => {
  const [dataRef, setDataRef] = useState(hojeIso());
  const [texto, setTexto] = useState("");
  const [itens, setItens] = useState<LinhaManual[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carga, setCarga] = useState(0);
  const [codigoLoja, setCodigoLoja] = useState<string | null>(null);
  const [nomeLista, setNomeLista] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [listas, setListas] = useState<{ id: string; nome: string; data_referencia: string; created_at: string }[]>([]);
  const [abrirListas, setAbrirListas] = useState(false);
  const [recentes, setRecentes] = useState<Set<string>>(new Set());

  const codigos = useMemo(() => normalizarCodigos(texto), [texto]);

  useEffect(() => {
    if (!storeId) return;
    supabase.from("encarte_config_loja").select("carga_tributaria_pct").eq("store_id", storeId).maybeSingle()
      .then(({ data }) => setCarga(Number(data?.carga_tributaria_pct ?? 0)));
    supabase.from("store_vr_config").select("codigo_loja").eq("store_id", storeId).maybeSingle()
      .then(({ data }) => setCodigoLoja(data?.codigo_loja ?? null));
    const limite = new Date();
    limite.setDate(limite.getDate() - 8 * 7);
    supabase.from("encarte_historico_itens").select("codigo")
      .eq("store_id", storeId).gte("data_fim", limite.toISOString().slice(0, 10))
      .then(({ data }) => setRecentes(new Set((data ?? []).map((h: { codigo: string }) => String(h.codigo)))));
    setItens([]);
  }, [storeId]);

  const carregarListas = useCallback(async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("encarte_manual_lista")
      .select("id, nome, data_referencia, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(50);
    setListas(data ?? []);
  }, [storeId]);

  useEffect(() => { carregarListas(); }, [carregarListas]);

  const buscar = async () => {
    if (!storeId) return toast.error("Escolha a loja");
    if (!codigos.length) return toast.error("Cole os códigos de barras ou reduzidos");
    if (codigos.length > LIMITE) return toast.error(`Limite de ${LIMITE} códigos por consulta`);

    setCarregando(true); setAviso(null);
    const resultado: LinhaManual[] = [];
    let ordem = 0;
    for (let i = 0; i < codigos.length; i += 100) {
      const lote = codigos.slice(i, i + 100);
      const r = await chamarRelatorio(storeId, "encarte_manual", {
        loja: codigoLoja ?? "",
        codigos: lote.join(","),
        ref: dataRef,
      });
      const msg = avisoRelatorio(r);
      if (msg) { setAviso(msg); setCarregando(false); return; }

      const porCodigo = new Map<string, Record<string, unknown>>();
      for (const linha of r.dados as Record<string, unknown>[]) {
        const chaves = [linha["codigo_digitado"], linha["CODIGO_DIGITADO"], linha["codigo"], linha["ean"]];
        for (const k of chaves) if (k) porCodigo.set(String(k).trim(), linha);
      }
      lote.forEach((cod, idx) => {
        ordem += 1;
        const bruto = porCodigo.get(cod) ?? (r.dados as Record<string, unknown>[])[idx];
        const casa = bruto && [bruto["codigo_digitado"], bruto["codigo"], bruto["ean"]]
          .some((v) => String(v ?? "").trim() === cod);
        const linha = bruto && (casa || porCodigo.size === 0)
          ? linhaDoRetorno(bruto, cod, ordem)
          : linhaNaoLocalizada(cod, ordem);
        linha.ja_saiu_recente = !!linha.codigo && recentes.has(linha.codigo);
        resultado.push(linha);
      });
    }
    setItens(resultado);
    setCarregando(false);
    const nok = resultado.filter((r) => !r.encontrado).length;
    toast.success(`${resultado.length - nok} produtos localizados${nok ? ` · ${nok} não localizados` : ""}`);
  };

  const alterar = (uid: string, patch: Partial<LinhaManual>) =>
    setItens((prev) => prev.map((i) => (i.uid === uid ? { ...i, ...patch } : i)));
  const remover = (uid: string) => setItens((prev) => prev.filter((i) => i.uid !== uid));

  const colarDoExcel = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setTexto((cur) => (cur ? `${cur}\n${t}` : t));
    } catch {
      toast.error("Não foi possível ler a área de transferência. Cole com Ctrl+V no campo.");
    }
  };

  const salvarLista = async () => {
    if (!storeId || !itens.length) return toast.error("Nada para salvar");
    setSalvando(true);
    const nome = nomeLista.trim() || `Lista manual ${formatBRDate(dataRef)}`;
    const { data: lista, error } = await supabase
      .from("encarte_manual_lista")
      .insert({ store_id: storeId, nome, data_referencia: dataRef })
      .select("id").single();
    if (error || !lista) { setSalvando(false); return toast.error(error?.message ?? "Falha ao salvar"); }
    const linhas = itens.map((i) => ({
      lista_id: lista.id, ordem: i.ordem, codigo_digitado: i.codigo_digitado, encontrado: i.encontrado,
      codigo: i.codigo || null, ean: i.ean || null, descricao: i.descricao || null,
      descricao_encarte: i.descricao_encarte || null, secao: i.secao || null, grupo: i.grupo || null,
      estoque: i.estoque, custo: i.custo, preco_venda: i.preco_venda, margem_pct: i.margem_pct,
      preco_encarte: i.preco_encarte, margem_encarte_pct: margemEncarte(i.preco_encarte, i.custo),
      posicao: i.posicao, snapshot: i.bruto as never,
    }));
    const { error: e2 } = await supabase.from("encarte_manual_item").insert(linhas);
    setSalvando(false);
    if (e2) return toast.error(e2.message);
    setNomeLista(nome);
    carregarListas();
    toast.success("Lista salva");
  };

  const abrirLista = async (id: string) => {
    const { data } = await supabase
      .from("encarte_manual_item").select("*").eq("lista_id", id).order("ordem");
    const info = listas.find((l) => l.id === id);
    setItens(
      (data ?? []).map((r) => {
        const snap = (r.snapshot ?? {}) as Record<string, unknown>;
        const base = r.encontrado ? linhaDoRetorno(snap, r.codigo_digitado ?? "", r.ordem) : linhaNaoLocalizada(r.codigo_digitado ?? "", r.ordem);
        return {
          ...base,
          codigo: r.codigo ?? base.codigo,
          ean: r.ean ?? base.ean,
          descricao: r.descricao ?? base.descricao,
          descricao_encarte: r.descricao_encarte ?? base.descricao_encarte,
          secao: r.secao ?? base.secao,
          custo: Number(r.custo ?? base.custo),
          preco_venda: Number(r.preco_venda ?? base.preco_venda),
          margem_pct: Number(r.margem_pct ?? base.margem_pct),
          preco_encarte: r.preco_encarte != null ? Number(r.preco_encarte) : null,
          posicao: (r.posicao === "verso" ? "verso" : "capa") as LinhaManual["posicao"],
          encontrado: r.encontrado,
        };
      }),
    );
    if (info) { setNomeLista(info.nome); setDataRef(info.data_referencia); }
    setAbrirListas(false);
    toast.success("Lista carregada");
  };

  const exportar = () => {
    if (!itens.length) return toast.error("Nada para exportar");
    const linhas = itens.map((i) => ({
      Ordem: i.ordem,
      "Código digitado": i.codigo_digitado,
      Localizado: i.encontrado ? "Sim" : "Não",
      Código: i.codigo,
      EAN: i.ean,
      Descrição: i.descricao,
      "Descrição do encarte": i.descricao_encarte,
      Seção: i.secao,
      Estoque: i.estoque,
      "Último custo": i.custo,
      "Preço de venda": i.preco_venda,
      "Margem atual %": i.margem_pct,
      "Última promoção": i.preco_ultima_oferta ?? "",
      "Fim última promoção": i.data_fim_ultima_oferta ?? "",
      "S-1": i.semanas[0]?.qtd ?? 0,
      "S-2": i.semanas[1]?.qtd ?? 0,
      "S-3": i.semanas[2]?.qtd ?? 0,
      "S-4": i.semanas[3]?.qtd ?? 0,
      "Total 4 sem": i.qtd_4sem,
      "Média/sem": i.media_semanal_qtd,
      "Preço do encarte": i.preco_encarte ?? "",
      "Margem no encarte %": margemEncarte(i.preco_encarte, i.custo) ?? "",
      Posição: i.posicao === "capa" ? "Capa" : "Verso",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Encarte manual");
    salvarWorkbook(wb, "encarte-inserido-manualmente");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs">Loja</Label>
            <Select value={storeId} onValueChange={onStoreChange}>
              <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Data de referência</Label>
            <Input type="date" value={dataRef} onChange={(e) => setDataRef(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Nome da lista</Label>
            <Input
              placeholder="Ex.: Encarte quinzenal"
              value={nomeLista}
              onChange={(e) => setNomeLista(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs">Códigos de barras / código reduzido</Label>
          <Textarea
            rows={4}
            placeholder="Cole aqui os códigos (um por linha ou separados por ; , TAB)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-sm text-muted-foreground">{codigos.length} códigos</span>
            <Button size="sm" onClick={buscar} disabled={carregando}>
              <Search className="w-4 h-4 mr-2" /> {carregando ? "Buscando..." : "Buscar dados"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setTexto(""); setItens([]); }}>
              <Eraser className="w-4 h-4 mr-2" /> Limpar
            </Button>
            <Button size="sm" variant="outline" onClick={colarDoExcel}>
              <ClipboardPaste className="w-4 h-4 mr-2" /> Colar do Excel
            </Button>
          </div>
        </div>

        {aviso && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600" />
            <span>{aviso}</span>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => { carregarListas(); setAbrirListas(true); }}>
            <FolderOpen className="w-4 h-4 mr-2" /> Abrir lista salva
          </Button>
          <Button size="sm" variant="outline" onClick={exportar} disabled={!itens.length}>
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar XLSX
          </Button>
          <Button size="sm" variant="outline" onClick={salvarLista} disabled={!itens.length || salvando}>
            <Save className="w-4 h-4 mr-2" /> Salvar lista
          </Button>
          <Button
            size="sm"
            disabled={!itens.some((i) => i.encontrado)}
            onClick={() => onEnviarImpressao(itens.filter((i) => i.encontrado), nomeLista)}
          >
            <Printer className="w-4 h-4 mr-2" /> Enviar para Impressão / Export
          </Button>
        </div>

        <TabelaItensEncarte
          itens={itens}
          onChange={alterar}
          onRemove={remover}
          cargaTributariaPct={carga}
          modo="manual"
        />
      </Card>

      <Dialog open={abrirListas} onOpenChange={setAbrirListas}>
        <DialogContent>
          <DialogHeader><DialogTitle>Listas salvas</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {listas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma lista salva para esta loja.</p>
            )}
            {listas.map((l) => (
              <button
                key={l.id}
                onClick={() => abrirLista(l.id)}
                className="w-full text-left rounded-md border border-border p-2 hover:bg-muted"
              >
                <span className="font-medium">{l.nome}</span>
                <span className="block text-xs text-muted-foreground">
                  Referência {formatBRDate(l.data_referencia)} · criada em {formatBRDate(l.created_at)}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InserirManualTab;
