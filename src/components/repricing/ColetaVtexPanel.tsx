import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play, Loader2, Plus, AlertTriangle, CheckCircle2, XCircle, Trash2, Store } from "lucide-react";

interface Concorrente {
  id: string;
  nome: string;
  host: string;
  sales_channel: number;
  praca_esperada: string | null;
}

interface Job {
  id: string;
  status: string;
  progress_pct: number;
  pages_crawled: number;
  total_pages: number;
  products_found: number;
  skus_validos: number;
  skus_indisponiveis: number;
  skus_sem_ean: number;
  rate_limit_hits: number;
  lojista_detectado: string | null;
  categorias_incompletas: { path: string; nome: string }[] | null;
  log_lines: string[] | null;
  error_message: string | null;
  concorrente_id: string | null;
}

const ColetaVtexPanel = () => {
  const [concorrentes, setConcorrentes] = useState<Concorrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoHost, setNovoHost] = useState("");
  const [novoSc, setNovoSc] = useState("1");
  const [novaPraca, setNovaPraca] = useState("");
  const timer = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("concorrentes")
      .select("id, nome, host, sales_channel, praca_esperada")
      .eq("ativo", true)
      .order("nome");
    if (error) toast.error("Não foi possível carregar os concorrentes");
    const list = (data as Concorrente[]) || [];
    setConcorrentes(list);
    setSelected((prev) => (prev && list.some((c) => c.id === prev) ? prev : list[0]?.id || ""));
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // recupera coleta em andamento
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("scrape_jobs")
        .select("*")
        .in("status", ["pending", "crawling"])
        .not("host", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data.length) setJob(data[0] as unknown as Job);
    })();
  }, []);

  useEffect(() => {
    if (!job || (job.status !== "pending" && job.status !== "crawling")) {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    timer.current = window.setInterval(async () => {
      const { data } = await supabase.from("scrape_jobs").select("*").eq("id", job.id).maybeSingle();
      if (data) setJob(data as unknown as Job);
    }, 2500);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [job?.id, job?.status]);

  const criarConcorrente = async () => {
    const host = novoHost.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
    if (!novoNome.trim() || !host) return toast.error("Informe o nome e o site do concorrente");
    const { data, error } = await supabase.from("concorrentes").insert({
      nome: novoNome.trim(),
      host,
      plataforma: "vtex",
      sales_channel: Number(novoSc) || 1,
      praca_esperada: novaPraca.trim() || null,
    }).select("id").maybeSingle();
    if (error) return toast.error(error.message);
    toast.success("Concorrente cadastrado");
    setNovoNome(""); setNovoHost(""); setNovaPraca("");
    await carregar();
    if (data?.id) setSelected(data.id);
  };

  const removerConcorrente = async (id: string) => {
    const { error } = await supabase.from("concorrentes").update({ ativo: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Concorrente removido");
    carregar();
  };

  const iniciar = async () => {
    if (!selected) return toast.error("Cadastre e selecione um concorrente");
    setStarting(true);
    const conc = concorrentes.find((c) => c.id === selected);
    const { data, error } = await supabase.functions.invoke("vtex-catalog-collector", {
      body: { action: "start", concorrente_id: selected, host: conc?.host, sc: conc?.sales_channel ?? 1 },
    });
    setStarting(false);
    if (error || !data?.success) return toast.error(error?.message || data?.error || "Falha ao iniciar a coleta");
    toast.success("Coleta iniciada em segundo plano");
    const { data: j } = await supabase.from("scrape_jobs").select("*").eq("id", data.jobId).maybeSingle();
    if (j) setJob(j as unknown as Job);
  };

  const rodando = job && (job.status === "pending" || job.status === "crawling");
  const concJob = concorrentes.find((c) => c.id === job?.concorrente_id);
  const pracaDivergente =
    job?.lojista_detectado && concJob?.praca_esperada &&
    !job.lojista_detectado.toUpperCase().includes(concJob.praca_esperada.toUpperCase());

  const statusLabel = (s: string) =>
    s === "pending" ? "aguardando" : s === "crawling" ? "coletando" : s === "done" ? "concluída" : "erro";

  return (
    <div className="space-y-5">
      {/* Cadastro */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> Cadastrar concorrente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-5 items-end">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Savegnago" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Site do concorrente</Label>
              <Input value={novoHost} onChange={(e) => setNovoHost(e.target.value)} placeholder="www.savegnago.com.br" />
            </div>
            <div>
              <Label className="text-xs">Canal de venda</Label>
              <Input value={novoSc} onChange={(e) => setNovoSc(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">Cidade/praça</Label>
                <Input value={novaPraca} onChange={(e) => setNovaPraca(e.target.value)} placeholder="MONTE ALTO" />
              </div>
              <Button size="icon" onClick={criarConcorrente} title="Cadastrar">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Concorrentes cadastrados */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Store className="w-4 h-4" /> Concorrentes cadastrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Nome</TableHead>
                <TableHead>Site</TableHead>
                <TableHead className="w-[140px]">Cidade/praça</TableHead>
                <TableHead className="w-[70px] text-center">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {concorrentes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-sm">{c.nome}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.host}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.praca_esperada || "—"}</TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removerConcorrente(c.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && concorrentes.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  Nenhum concorrente cadastrado ainda — use o formulário acima.
                </TableCell></TableRow>
              )}
              {loading && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Coleta */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coleta de preços do concorrente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Select value={selected} onValueChange={setSelected} disabled={concorrentes.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={concorrentes.length === 0 ? "Cadastre um concorrente primeiro" : "Selecione o concorrente"} />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {concorrentes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome} — {c.host}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={iniciar} disabled={starting || !!rodando || !selected} className="gap-2">
              {starting || rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {rodando ? "Coletando..." : "Iniciar coleta"}
            </Button>
          </div>

          {job && (
            <div className="space-y-3 rounded-lg border border-border/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  {rodando ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> :
                    job.status === "done" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> :
                    <XCircle className="w-4 h-4 text-destructive" />}
                  {concJob?.nome || "Coleta"} — {statusLabel(job.status)}
                </span>
                <Badge variant="outline">{job.progress_pct || 0}%</Badge>
              </div>
              <Progress value={job.progress_pct || 0} className="h-2" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
                <span>Páginas: <strong className="text-foreground">{job.pages_crawled || 0} / {job.total_pages || 0}</strong></span>
                <span>Produtos gravados: <strong className="text-foreground">{job.products_found || 0}</strong></span>
                <span>Com preço válido: <strong className="text-foreground">{job.skus_validos || 0}</strong></span>
                <span>Indisponíveis: <strong className="text-foreground">{job.skus_indisponiveis || 0}</strong></span>
                <span>Sem código de barras: <strong className="text-foreground">{job.skus_sem_ean || 0}</strong></span>
                <span>Tentativas bloqueadas: <strong className="text-foreground">{job.rate_limit_hits || 0}</strong></span>
              </div>

              <div className={`rounded-md border p-2 text-xs ${pracaDivergente ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border/60 text-muted-foreground"}`}>
                <span className="flex items-center gap-2">
                  {pracaDivergente && <AlertTriangle className="w-3.5 h-3.5" />}
                  Loja/praça identificada:{" "}
                  <strong className="text-foreground">{job.lojista_detectado || "—"}</strong>
                  {concJob?.praca_esperada && <> (esperado: {concJob.praca_esperada})</>}
                </span>
                {pracaDivergente && <p className="mt-1">A praça identificada não é a esperada — os preços podem não corresponder à loja concorrente.</p>}
              </div>

              {!!job.categorias_incompletas?.length && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700">
                  {job.categorias_incompletas.length} categoria(s) muito grandes foram coletadas por marca:
                  {" "}{job.categorias_incompletas.slice(0, 5).map((c) => c.nome).join("; ")}
                </div>
              )}

              {job.error_message && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{job.error_message}</div>
              )}

              <div className="max-h-48 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
                {(job.log_lines || []).slice(-40).reverse().map((l, i) => (
                  <div key={i} className="text-muted-foreground">{l}</div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ColetaVtexPanel;
