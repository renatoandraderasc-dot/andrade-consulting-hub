import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth } from "date-fns";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, Play, Info } from "lucide-react";

import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { carregarLojasPermitidas, type LojaSimples } from "@/lib/lojasPermitidas";
import { chamarRelatorio, avisoRelatorio } from "@/lib/vrReport";
import { salvarWorkbook } from "@/lib/exportBranding";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

interface RelatorioDef {
  nome: string;
  titulo: string;
  descricao: string;
}

const RELATORIOS: RelatorioDef[] = [
  { nome: "cupons_e_ticket", titulo: "Cupons e ticket por dia", descricao: "Cupons válidos, faturamento e ticket médio de cada dia." },
  { nome: "kpis_periodo", titulo: "Indicadores do período", descricao: "Faturamento, custo, lucro, margem, volume, mix, cupons e ticket." },
  { nome: "rede_mensal", titulo: "Série mensal da rede", descricao: "Mês a mês: faturamento, custo, margem, cupons, ticket e compras." },
  { nome: "diagnostico_mensal", titulo: "Diagnóstico mensal", descricao: "Indicadores mensais completos, incluindo oferta e compras." },
  { nome: "vendas_hora_periodo", titulo: "Vendas por hora", descricao: "Venda por hora do dia e por departamento." },
  { nome: "ticket_mensal", titulo: "Ticket médio mensal", descricao: "Cupons, ticket, cupons por dia, descontos e cupons com CPF." },
  { nome: "ticket_dia_semana", titulo: "Ticket por dia da semana", descricao: "Comparação de cupons e ticket entre os dias da semana." },
  { nome: "ticket_hora", titulo: "Ticket por hora", descricao: "Cupons e ticket médio em cada hora do dia." },
  { nome: "ticket_faixas", titulo: "Faixas de valor do cupom", descricao: "Quantos cupons e quanto do faturamento em cada faixa." },
  { nome: "ticket_itens", titulo: "Composição do ticket", descricao: "Itens por cupom, preço médio do item e cupons pequenos." },
];

const hojeISO = () => format(new Date(), "yyyy-MM-dd");
const inicioMesISO = () => format(startOfMonth(new Date()), "yyyy-MM-dd");

const formatarCelula = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  }
  return s;
};

export default function Relatorios() {
  const { user, isGlobalAdmin } = useAuth() as any;

  const [lojas, setLojas] = useState<LojaSimples[]>([]);
  const [storeId, setStoreId] = useState("");
  const [inicio, setInicio] = useState(inicioMesISO);
  const [fim, setFim] = useState(hojeISO);

  const [relatorio, setRelatorio] = useState(RELATORIOS[0].nome);
  const [linhas, setLinhas] = useState<any[]>([]);
  const [colunas, setColunas] = useState<string[]>([]);
  const [rodado, setRodado] = useState<RelatorioDef | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [doCache, setDoCache] = useState(false);

  useEffect(() => {
    (async () => {
      const ls = await carregarLojasPermitidas(user?.id, !!isGlobalAdmin);
      setLojas(ls);
      if (ls.length === 1) setStoreId(ls[0].id);
    })();
  }, [user?.id, isGlobalAdmin]);

  const def = useMemo(
    () => RELATORIOS.find((r) => r.nome === relatorio) ?? RELATORIOS[0],
    [relatorio],
  );
  const nomeLoja = lojas.find((l) => l.id === storeId)?.name ?? "";

  async function rodar() {
    if (!storeId) {
      toast({ title: "Escolha a loja", variant: "destructive" });
      return;
    }
    if (!inicio || !fim || inicio > fim) {
      toast({ title: "Período inválido", description: "A data inicial deve ser anterior à final.", variant: "destructive" });
      return;
    }
    setCarregando(true);
    setAviso(null);
    setLinhas([]);
    setColunas([]);
    const r = await chamarRelatorio(storeId, def.nome, { inicio, fim });
    setCarregando(false);
    setRodado(def);

    const msg = avisoRelatorio(r);
    if (msg) {
      setAviso(msg);
      return;
    }
    const dados = (r.dados || []).map((l) => {
      const { __custoReposicao, ...resto } = l ?? {};
      return resto;
    });
    if (!dados.length) {
      setAviso("O sistema da loja não devolveu nenhuma linha para este período.");
      return;
    }
    setColunas(Object.keys(dados[0]));
    setLinhas(dados);
  }

  function exportar() {
    if (!linhas.length || !rodado) return;
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");
    salvarWorkbook(wb, `${rodado.titulo} - ${nomeLoja}`, [
      ["Loja", nomeLoja],
      ["Período", `${format(new Date(`${inicio}T00:00:00`), "dd/MM/yyyy")} a ${format(new Date(`${fim}T00:00:00`), "dd/MM/yyyy")}`],
      ["Relatório", rodado.nome],
    ]);
  }

  return (
    <ClientLayout storeName={nomeLoja}>
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Escolha a loja, o período e o relatório para consultar direto no sistema da loja.
          </p>
        </div>

        <Card className="p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Loja</label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                <SelectContent>
                  {lojas.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">De</label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Até</label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Relatório</label>
              <Select value={relatorio} onValueChange={setRelatorio}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATORIOS.map((r) => (
                    <SelectItem key={r.nome} value={r.nome}>{r.titulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={rodar} disabled={carregando}>
              <Play className="h-4 w-4 mr-2" />
              {carregando ? "Consultando..." : "Rodar relatório"}
            </Button>
            <Button variant="outline" onClick={exportar} disabled={!linhas.length}>
              <Download className="h-4 w-4 mr-2" /> Exportar Excel
            </Button>
            <span className="text-xs text-muted-foreground">{def.descricao}</span>
          </div>
        </Card>

        {carregando && (
          <Card className="p-4 space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </Card>
        )}

        {!carregando && aviso && (
          <Card className="p-4 flex items-start gap-2 text-sm">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span>{aviso}</span>
          </Card>
        )}

        {!carregando && !!linhas.length && (
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 p-3 border-b">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{rodado?.titulo}</span>
              </div>
              <Badge variant="secondary">{linhas.length.toLocaleString("pt-BR")} linha(s)</Badge>
            </div>
            <div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    {colunas.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        {c.replace(/_/g, " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={i} className="border-t hover:bg-muted/30">
                      {colunas.map((c) => (
                        <td key={c} className="px-3 py-1.5 whitespace-nowrap">{formatarCelula(l[c])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </ClientLayout>
  );
}
