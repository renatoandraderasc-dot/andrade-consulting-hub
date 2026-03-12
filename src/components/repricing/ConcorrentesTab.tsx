import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Plus, Globe, RefreshCw, Trash2, Play, Loader2, CheckCircle2,
  XCircle, Clock, Store, Link2, Search, Download, Settings2, Eye
} from "lucide-react";
import ConcorrenteAnalise from "./ConcorrenteAnalise";
import { firecrawlApi, type ScrapedProduct } from "@/lib/api/firecrawl";

interface Concorrente {
  id: string;
  nome: string;
  url: string;
  plataforma: "vtex" | "woocommerce" | "magento" | "shopify" | "outro";
  status: "ativo" | "inativo" | "erro";
  ultimaColeta: string | null;
  totalProdutos: number;
  matchRate: number;
}

interface ColetaLog {
  id: string;
  concorrenteId: string;
  concorrenteNome: string;
  data: string;
  status: "sucesso" | "erro" | "em_andamento";
  produtosColetados: number;
  produtosMatchados: number;
  duracao: string;
  erro?: string;
}

const mockConcorrentes: Concorrente[] = [
  { id: "1", nome: "Santo Antônio em Casa", url: "https://www.santoantonioemcasa.com.br", plataforma: "vtex", status: "ativo", ultimaColeta: "2026-03-12 08:30", totalProdutos: 18, matchRate: 89 },
  { id: "2", nome: "Supermercado Extra", url: "https://www.clubeextra.com.br", plataforma: "vtex", status: "ativo", ultimaColeta: "2026-03-11 22:00", totalProdutos: 22, matchRate: 82 },
  { id: "3", nome: "Atacadão Online", url: "https://www.atacadao.com.br", plataforma: "vtex", status: "inativo", ultimaColeta: "2026-03-10 14:15", totalProdutos: 15, matchRate: 73 },
  { id: "4", nome: "Mercado Regional", url: "https://www.mercadoregional.com.br", plataforma: "woocommerce", status: "erro", ultimaColeta: "2026-03-09 10:00", totalProdutos: 0, matchRate: 0 },
];

const mockLogs: ColetaLog[] = [
  { id: "1", concorrenteId: "1", concorrenteNome: "Santo Antônio em Casa", data: "2026-03-12 08:30", status: "sucesso", produtosColetados: 18, produtosMatchados: 16, duracao: "4m 32s" },
  { id: "2", concorrenteId: "2", concorrenteNome: "Supermercado Extra", data: "2026-03-11 22:00", status: "sucesso", produtosColetados: 22, produtosMatchados: 18, duracao: "8m 15s" },
  { id: "3", concorrenteId: "4", concorrenteNome: "Mercado Regional", data: "2026-03-09 10:00", status: "erro", produtosColetados: 0, produtosMatchados: 0, duracao: "0m 45s", erro: "Timeout ao acessar o site" },
  { id: "4", concorrenteId: "1", concorrenteNome: "Santo Antônio em Casa", data: "2026-03-11 08:30", status: "sucesso", produtosColetados: 18, produtosMatchados: 16, duracao: "4m 28s" },
  { id: "5", concorrenteId: "3", concorrenteNome: "Atacadão Online", data: "2026-03-10 14:15", status: "sucesso", produtosColetados: 15, produtosMatchados: 11, duracao: "6m 50s" },
];

const plataformaLabels: Record<string, string> = {
  vtex: "VTEX",
  woocommerce: "WooCommerce",
  magento: "Magento",
  shopify: "Shopify",
  outro: "Outro",
};

const statusBadge = (s: Concorrente["status"]) => {
  if (s === "ativo") return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20 gap-1"><CheckCircle2 className="w-3 h-3" /> Ativo</Badge>;
  if (s === "erro") return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1"><XCircle className="w-3 h-3" /> Erro</Badge>;
  return <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1"><Clock className="w-3 h-3" /> Inativo</Badge>;
};

const logStatusBadge = (s: ColetaLog["status"]) => {
  if (s === "sucesso") return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20 text-[11px]">Sucesso</Badge>;
  if (s === "erro") return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[11px]">Erro</Badge>;
  return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20 text-[11px] gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Coletando...</Badge>;
};

const ConcorrentesTab = () => {
  const [concorrentes, setConcorrentes] = useState(mockConcorrentes);
  const [logs, setLogs] = useState(mockLogs);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", url: "", plataforma: "vtex" as Concorrente["plataforma"] });
  const [coletando, setColetando] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedConcorrente, setSelectedConcorrente] = useState<Concorrente | null>(null);
  const [lastScrapedProducts, setLastScrapedProducts] = useState<ScrapedProduct[]>([]);

  const openNew = () => { setEditId(null); setForm({ nome: "", url: "", plataforma: "vtex" }); setShowModal(true); };
  const openEdit = (c: Concorrente) => { setEditId(c.id); setForm({ nome: c.nome, url: c.url, plataforma: c.plataforma }); setShowModal(true); };

  const handleSave = () => {
    if (!form.nome || !form.url) { toast.error("Preencha todos os campos"); return; }
    if (editId) {
      setConcorrentes(prev => prev.map(c => c.id === editId ? { ...c, nome: form.nome, url: form.url, plataforma: form.plataforma } : c));
      toast.success("Concorrente atualizado");
    } else {
      const novo: Concorrente = { id: Date.now().toString(), ...form, status: "ativo", ultimaColeta: null, totalProdutos: 0, matchRate: 0 };
      setConcorrentes(prev => [...prev, novo]);
      toast.success("Concorrente adicionado");
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    setConcorrentes(prev => prev.filter(c => c.id !== id));
    toast.success("Concorrente removido");
  };

  const handleColetar = (id: string) => {
    setColetando(id);
    toast.info("Iniciando coleta de preços...");
    setTimeout(() => {
      setColetando(null);
      setConcorrentes(prev => prev.map(c => c.id === id ? { ...c, ultimaColeta: new Date().toLocaleString("pt-BR"), status: "ativo" } : c));
      toast.success("Coleta finalizada com sucesso!");
    }, 3000);
  };

  const handleColetarTodos = () => {
    toast.info("Iniciando coleta em todos os concorrentes ativos...");
    const ativos = concorrentes.filter(c => c.status !== "inativo");
    ativos.forEach((c, i) => {
      setTimeout(() => handleColetar(c.id), i * 3500);
    });
  };

  const handleExportLogs = () => {
    const header = ["Data", "Concorrente", "Status", "Produtos Coletados", "Matchados", "Duração", "Erro"];
    const rows = logs.map(l => [l.data, l.concorrenteNome, l.status, l.produtosColetados, l.produtosMatchados, l.duracao, l.erro || ""]);
    const csv = [header, ...rows].map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `coleta-logs-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Logs exportados");
  };

  const filteredConcorrentes = concorrentes.filter(c =>
    !search || c.nome.toLowerCase().includes(search.toLowerCase()) || c.url.toLowerCase().includes(search.toLowerCase())
  );

  const totalAtivos = concorrentes.filter(c => c.status === "ativo").length;
  const totalProdutos = concorrentes.reduce((s, c) => s + c.totalProdutos, 0);
  const mediaMatch = concorrentes.length ? Math.round(concorrentes.reduce((s, c) => s + c.matchRate, 0) / concorrentes.length) : 0;

  if (selectedConcorrente) {
    return (
      <ConcorrenteAnalise
        concorrente={{ id: selectedConcorrente.id, nome: selectedConcorrente.nome, url: selectedConcorrente.url, plataforma: selectedConcorrente.plataforma }}
        onBack={() => setSelectedConcorrente(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Concorrentes</p>
          <p className="text-2xl font-bold text-foreground">{concorrentes.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Ativos</p>
          <p className="text-2xl font-bold text-green-600">{totalAtivos}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Produtos Capturados</p>
          <p className="text-2xl font-bold text-foreground">{totalProdutos.toLocaleString("pt-BR")}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Taxa de Match Média</p>
          <p className="text-2xl font-bold text-primary">{mediaMatch}%</p>
        </CardContent></Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar concorrente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo Concorrente</Button>
        <Button size="sm" variant="outline" onClick={handleColetarTodos}><RefreshCw className="w-4 h-4 mr-1" /> Coletar Todos</Button>
      </div>

      {/* Concorrentes Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Store className="w-4 h-4" /> Concorrentes Cadastrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Nome</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead className="w-[110px]">Plataforma</TableHead>
                  <TableHead className="w-[90px] text-center">Status</TableHead>
                  <TableHead className="w-[140px]">Última Coleta</TableHead>
                  <TableHead className="w-[90px] text-right">Produtos</TableHead>
                  <TableHead className="w-[80px] text-right">Match %</TableHead>
                  <TableHead className="w-[140px] text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredConcorrentes.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-sm">{c.nome}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors">
                        <Link2 className="w-3 h-3" /> {c.url.replace(/https?:\/\/(www\.)?/, "")}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[11px]">{plataformaLabels[c.plataforma]}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{statusBadge(c.status)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{c.ultimaColeta || "Nunca"}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{c.totalProdutos.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium">{c.matchRate}%</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Analisar" onClick={() => setSelectedConcorrente(c)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleColetar(c.id)} disabled={coletando === c.id}>
                          {coletando === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Settings2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredConcorrentes.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum concorrente encontrado</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Coleta Logs */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4" /> Histórico de Coletas</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExportLogs}><Download className="w-4 h-4 mr-1" /> Exportar Logs</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Data</TableHead>
                  <TableHead>Concorrente</TableHead>
                  <TableHead className="text-center w-[90px]">Status</TableHead>
                  <TableHead className="text-right w-[100px]">Coletados</TableHead>
                  <TableHead className="text-right w-[100px]">Matchados</TableHead>
                  <TableHead className="w-[80px] text-right">Duração</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground">{l.data}</TableCell>
                    <TableCell className="text-sm font-medium">{l.concorrenteNome}</TableCell>
                    <TableCell className="text-center">{logStatusBadge(l.status)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{l.produtosColetados.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{l.produtosMatchados.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{l.duracao}</TableCell>
                    <TableCell className="text-xs text-destructive">{l.erro || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Informações sobre plataformas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4" /> Plataformas Suportadas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { name: "VTEX", desc: "Coleta via API de catálogo VTEX. Suporta busca por categoria, listagem completa e preços." },
              { name: "WooCommerce", desc: "Integração via REST API do WooCommerce. Requer credenciais de API do site." },
              { name: "Magento", desc: "Coleta via REST API do Magento 2. Suporta catálogo completo com variações." },
              { name: "Shopify", desc: "Integração via Storefront API do Shopify. Coleta preços e disponibilidade." },
              { name: "Web Scraping", desc: "Para sites sem API, utiliza scraping com renderização JavaScript (Firecrawl)." },
            ].map(p => (
              <div key={p.name} className="border border-border rounded-lg p-3">
                <p className="text-sm font-semibold text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Concorrente" : "Novo Concorrente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Concorrente</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Santo Antônio em Casa" />
            </div>
            <div>
              <Label>URL do Site</Label>
              <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://www.exemplo.com.br" />
            </div>
            <div>
              <Label>Plataforma</Label>
              <Select value={form.plataforma} onValueChange={v => setForm(f => ({ ...f, plataforma: v as Concorrente["plataforma"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vtex">VTEX</SelectItem>
                  <SelectItem value="woocommerce">WooCommerce</SelectItem>
                  <SelectItem value="magento">Magento</SelectItem>
                  <SelectItem value="shopify">Shopify</SelectItem>
                  <SelectItem value="outro">Outro (Web Scraping)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editId ? "Salvar" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConcorrentesTab;
