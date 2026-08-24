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
import {
  Play, Loader2, Plus, AlertTriangle, CheckCircle2, XCircle, MapPin, RefreshCw, Globe, Power,
} from "lucide-react";

export const PLATAFORMAS = [
  { value: "vtex", label: "VTEX" },
  { value: "opencart", label: "OpenCart" },
  { value: "regex_solutions", label: "Regex Solutions" },
  { value: "shopify", label: "Shopify" },
  { value: "magento", label: "Magento" },
  { value: "tray", label: "Tray" },
  { value: "nuvemshop", label: "Nuvemshop" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "desconhecida", label: "Não identificada" },
  { value: "outra", label: "Outra" },
] as const;

export const COLETOR_DISPONIVEL = new Set(["vtex", "opencart"]);

export interface SiteConcorrente {
  id: string;
  nome: string;
  host: string;
  plataforma: string;
  provedor?: string | null;
  deteccao_evidencia?: string | null;
  cep_referencia: string;
  region_id: string | null;
  praca_esperada: string | null;
  loja_externa_id: string | null;
  sc: number;
  ativo: boolean;
  ultima_coleta: string | null;
  status_ultima_coleta: string | null;
}

interface FilaItem {
  path: string;
  nome: string;
  arvore: string;
  status: "pendente" | "feita" | "erro";
  erro?: string;
}

interface Job {
  id: string;
  status: string;
  progress_pct: number;
  products_found: number;
  skus_validos: number;
  skus_indisponiveis: number;
  skus_sem_ean: number;
  rate_limit_hits: number;
  lojista_detectado: string | null;
  categorias_incompletas: { path: string; nome: string }[] | null;
  categorias_erro: { nome: string; erro: string }[] | null;
  log_lines: string[] | null;
  error_message: string | null;
  site_concorrente_id: string | null;
  fila: FilaItem[] | null;
  ultima_atividade: string | null;
  updated_at: string | null;
  created_at: string | null;
  finished_at?: string | null;
  cep_referencia: string | null;
}

const dataHora = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const SitesCatalogoPanel = () => {
  const [sites, setSites] = useState<SiteConcorrente[]>([]);
  const [vinculos, setVinculos] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const [resuming, setResuming] = useState(false);

  const [novoNome, setNovoNome] = useState("");
  const [novoHost, setNovoHost] = useState("");
  const [novaPlataforma, setNovaPlataforma] = useState("vtex");
  const [novoSc, setNovoSc] = useState("1");
  const [novaPraca, setNovaPraca] = useState("");
  const [novoCep, setNovoCep] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [regiao, setRegiao] = useState<{ regionId: string; sellers: { id: string; nome: string }[] } | null>(null);
  const [detectando, setDetectando] = useState(false);
  const [deteccao, setDeteccao] = useState<
    { plataforma: string; provedor: string | null; coletor_disponivel: boolean; evidencia: string } | null
  >(null);
  const [lojasOc, setLojasOc] = useState<{ store_id: string; store_title: string }[]>([]);
  const [lojaOc, setLojaOc] = useState("");
  const [agora, setAgora] = useState(Date.now());
  const timer = useRef<number | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: links }] = await Promise.all([
      supabase.from("sites_concorrentes").select("*").order("nome"),
      supabase.from("cliente_concorrentes").select("site_concorrente_id"),
    ]);
    if (error) toast.error("Não foi possível carregar o catálogo de sites");
    const list = (data as SiteConcorrente[]) || [];
    setSites(list);
    const cont: Record<string, number> = {};
    for (const l of links || []) cont[l.site_concorrente_id] = (cont[l.site_concorrente_id] || 0) + 1;
    setVinculos(cont);
    setSelected((prev) => (prev && list.some((s) => s.id === prev) ? prev : list.find((s) => s.ativo)?.id || ""));
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("scrape_jobs").select("*")
        .not("site_concorrente_id", "is", null)
        .order("created_at", { ascending: false }).limit(1);
      if (data && data.length) setJob(data[0] as unknown as Job);
    })();
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 5000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!job || (job.status !== "pending" && job.status !== "crawling")) {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    timer.current = window.setInterval(async () => {
      setAgora(Date.now());
      const { data } = await supabase.from("scrape_jobs").select("*").eq("id", job.id).maybeSingle();
      if (data) setJob(data as unknown as Job);
    }, 5000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [job?.id, job?.status]);

  const verificarCep = async () => {
    const host = novoHost.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
    const cep = novoCep.replace(/\D/g, "");
    if (!host || cep.length !== 8) return toast.error("Informe o site e um CEP com 8 dígitos");
    setVerificando(true);
    const { data, error } = await supabase.functions.invoke("vtex-catalog-collector", {
      body: { action: "regions", host, cep },
    });
    setVerificando(false);
    if (error || !data?.success) return toast.error(error?.message || data?.error || "Não foi possível localizar a loja deste CEP");
    setRegiao({ regionId: data.regionId, sellers: data.sellers || [] });
    if (!novaPraca && data.sellers?.[0]?.id) setNovaPraca(String(data.sellers[0].id));
    toast.success("Loja localizada — confira antes de cadastrar");
  };

  const criarSite = async () => {
    const host = novoHost.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
    const cep = novoCep.replace(/\D/g, "");
    if (!novoNome.trim() || !host) return toast.error("Informe o nome e o site");
    if (novaPlataforma === "vtex") {
      if (cep.length !== 8) return toast.error("Informe o CEP de referência (8 dígitos)");
      if (!regiao) return toast.error("Verifique o CEP antes de cadastrar");
    }
    const { data, error } = await supabase.from("sites_concorrentes").insert({
      nome: novoNome.trim(),
      host,
      plataforma: novaPlataforma,
      sc: Number(novoSc) || 1,
      praca_esperada: novaPraca.trim() || null,
      cep_referencia: cep,
      region_id: regiao?.regionId ?? null,
      loja_externa_id: regiao?.sellers[0]?.id || null,
      ativo: true,
    }).select("id").maybeSingle();
    if (error) return toast.error(error.message);
    toast.success("Site cadastrado no catálogo");
    setNovoNome(""); setNovoHost(""); setNovaPraca(""); setNovoCep(""); setRegiao(null);
    await carregar();
    if (data?.id) setSelected(data.id);
  };

  const alternarAtivo = async (s: SiteConcorrente) => {
    const { error } = await supabase.from("sites_concorrentes").update({ ativo: !s.ativo }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(s.ativo ? "Site desativado" : "Site liberado para coleta");
    carregar();
  };

  const siteSel = sites.find((s) => s.id === selected);
  const semColetor = !!siteSel && !COLETOR_DISPONIVEL.has(siteSel.plataforma);

  const iniciar = async () => {
    if (!siteSel) return toast.error("Selecione um site do catálogo");
    if (semColetor) return;
    if (!siteSel.cep_referencia) return toast.error("Cadastre o CEP de referência deste site antes de coletar");
    setStarting(true);
    const { data, error } = await supabase.functions.invoke("vtex-catalog-collector", {
      body: { action: "start", site_id: siteSel.id, host: siteSel.host, sc: siteSel.sc ?? 1, cep: siteSel.cep_referencia },
    });
    setStarting(false);
    if (error || !data?.success) return toast.error(error?.message || data?.error || "Falha ao iniciar a coleta");
    toast.success("Coleta iniciada em segundo plano");
    const { data: j } = await supabase.from("scrape_jobs").select("*").eq("id", data.jobId).maybeSingle();
    if (j) setJob(j as unknown as Job);
  };

  const cancelar = async () => {
    if (!job) return;
    await supabase.functions.invoke("vtex-catalog-collector", { body: { action: "cancel", jobId: job.id } });
    const { data: j } = await supabase.from("scrape_jobs").select("*").eq("id", job.id).maybeSingle();
    if (j) setJob(j as unknown as Job);
    toast.success("Coleta cancelada");
  };

  const retomar = async () => {
    if (!job) return;
    setResuming(true);
    const { data, error } = await supabase.functions.invoke("vtex-catalog-collector", {
      body: { action: "resume", jobId: job.id },
    });
    setResuming(false);
    if (error || !data?.success) return toast.error(error?.message || data?.error || "Falha ao retomar");
    toast.success("Coleta retomada");
    const { data: j } = await supabase.from("scrape_jobs").select("*").eq("id", job.id).maybeSingle();
    if (j) setJob(j as unknown as Job);
  };

  const rodando = job && !job.finished_at && (job.status === "pending" || job.status === "crawling");
  const siteJob = sites.find((s) => s.id === job?.site_concorrente_id);
  const pracaDivergente =
    job?.lojista_detectado && siteJob?.praca_esperada &&
    !job.lojista_detectado.toUpperCase().replace(/[^A-Z0-9]/g, "")
      .includes(siteJob.praca_esperada.toUpperCase().replace(/[^A-Z0-9]/g, ""));

  const ultimoSinal = job?.ultima_atividade || job?.updated_at || job?.created_at || null;
  const minutosParado = ultimoSinal ? Math.floor((agora - new Date(ultimoSinal).getTime()) / 60000) : null;
  const travado = !!rodando && minutosParado !== null && minutosParado >= 3;

  const fila = job?.fila || [];
  const feitas = fila.filter((f) => f.status === "feita").length;
  const comErro = fila.filter((f) => f.status === "erro").length;
  const pendentes = fila.length - feitas - comErro;

  const statusLabel = (s: string) =>
    s === "pending" ? "aguardando" : s === "crawling" ? "coletando" : s === "done" ? "concluída" : "erro";

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> Cadastrar site</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4 items-end">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Savegnago" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Endereço do site</Label>
              <Input value={novoHost} onChange={(e) => setNovoHost(e.target.value)} placeholder="www.savegnago.com.br" />
            </div>
            <div>
              <Label className="text-xs">Plataforma</Label>
              <Select value={novaPlataforma} onValueChange={setNovaPlataforma}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {PLATAFORMAS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Canal de venda</Label>
              <Input value={novoSc} onChange={(e) => setNovoSc(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">CEP de referência</Label>
              <Input value={novoCep} onChange={(e) => { setNovoCep(e.target.value); setRegiao(null); }} placeholder="15910000" />
            </div>
            <div>
              <Label className="text-xs">Loja/praça esperada</Label>
              <Input value={novaPraca} onChange={(e) => setNovaPraca(e.target.value)} placeholder="montealto" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={verificarCep} disabled={verificando || novaPlataforma !== "vtex"} className="gap-2">
                {verificando ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                Verificar CEP
              </Button>
              <Button onClick={criarSite} className="gap-2"><Plus className="w-4 h-4" /> Cadastrar</Button>
            </div>
          </div>

          {novaPlataforma !== "vtex" && (
            <p className="text-xs text-amber-600">
              Coletor ainda não disponível para esta plataforma — o site fica no catálogo, mas sem coleta automática.
            </p>
          )}

          {regiao && (
            <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-medium text-foreground">Loja encontrada para este CEP — confirme antes de cadastrar:</p>
              {regiao.sellers.length ? regiao.sellers.map((s) => (
                <p key={s.id} className="text-muted-foreground">• {s.nome} <span className="opacity-60">({s.id})</span></p>
              )) : <p className="text-muted-foreground">Nenhuma loja retornada para este CEP.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4" /> Catálogo de sites</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Nome</TableHead>
                <TableHead>Site</TableHead>
                <TableHead className="w-[120px]">Plataforma</TableHead>
                <TableHead className="w-[100px]">CEP</TableHead>
                <TableHead className="w-[180px]">Praça</TableHead>
                <TableHead className="w-[90px] text-center">Clientes</TableHead>
                <TableHead className="w-[170px]">Última coleta</TableHead>
                <TableHead className="w-[90px] text-center">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((s) => (
                <TableRow key={s.id} className={s.ativo ? "" : "opacity-60"}>
                  <TableCell className="font-medium text-sm">
                    {s.nome}
                    {!s.ativo && <Badge variant="outline" className="ml-2 text-[10px]">inativo</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.host}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant={COLETOR_DISPONIVEL.has(s.plataforma) ? "secondary" : "outline"} className="text-[10px]">
                      {PLATAFORMAS.find((p) => p.value === s.plataforma)?.label || s.plataforma}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.cep_referencia || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.praca_esperada || "—"}</TableCell>
                  <TableCell className="text-center text-xs">{vinculos[s.id] || 0}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {dataHora(s.ultima_coleta)}
                    {s.status_ultima_coleta && <span className="ml-1 opacity-70">({s.status_ultima_coleta})</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title={s.ativo ? "Desativar" : "Liberar"} onClick={() => alternarAtivo(s)}>
                      <Power className={`w-3.5 h-3.5 ${s.ativo ? "text-destructive" : "text-green-600"}`} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && sites.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhum site no catálogo — use o formulário acima.
                </TableCell></TableRow>
              )}
              {loading && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coleta de preços por site</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Select value={selected} onValueChange={setSelected} disabled={sites.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={sites.length === 0 ? "Cadastre um site primeiro" : "Selecione o site"} />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {sites.filter((s) => s.ativo).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome} — {s.host}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button onClick={iniciar} disabled={starting || semColetor || (!!rodando && !travado) || !selected} className="gap-2">
                {starting || (rodando && !travado) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {rodando && !travado ? "Coletando..." : "Iniciar coleta"}
              </Button>
              {rodando && (
                <Button variant="outline" onClick={cancelar} className="gap-2"><XCircle className="w-4 h-4" /> Parar</Button>
              )}
            </div>
          </div>

          {semColetor && (
            <p className="text-xs text-amber-600">Coletor ainda não disponível para esta plataforma.</p>
          )}

          {job && (
            <div className="space-y-3 rounded-lg border border-border/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  {rodando && !travado ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> :
                    job.status === "done" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> :
                    <XCircle className="w-4 h-4 text-destructive" />}
                  {siteJob?.nome || "Coleta"} — {travado ? "interrompida" : statusLabel(job.status)}
                </span>
                <Badge variant="outline">{job.progress_pct || 0}%</Badge>
              </div>
              <Progress value={job.progress_pct || 0} className="h-2" />

              {travado && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Sem resposta há {minutosParado} minuto(s) — provavelmente interrompida.
                  </span>
                  <Button size="sm" variant="outline" onClick={retomar} disabled={resuming} className="gap-1 h-7">
                    {resuming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Retomar
                  </Button>
                </div>
              )}

              {!travado && (job.status === "error" || comErro > 0) && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={retomar} disabled={resuming} className="gap-1 h-7">
                    {resuming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Retomar pendentes
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
                <span>Categorias: <strong className="text-foreground">{feitas} / {fila.length}</strong></span>
                <span>Pendentes: <strong className="text-foreground">{pendentes < 0 ? 0 : pendentes}</strong></span>
                <span>Com erro: <strong className="text-foreground">{comErro}</strong></span>
                <span>Produtos gravados: <strong className="text-foreground">{job.products_found || 0}</strong></span>
                <span>Com preço válido: <strong className="text-foreground">{job.skus_validos || 0}</strong></span>
                <span>Indisponíveis: <strong className="text-foreground">{job.skus_indisponiveis || 0}</strong></span>
                <span>Sem código de barras: <strong className="text-foreground">{job.skus_sem_ean || 0}</strong></span>
                <span>Tentativas bloqueadas: <strong className="text-foreground">{job.rate_limit_hits || 0}</strong></span>
                <span>CEP: <strong className="text-foreground">{job.cep_referencia || "—"}</strong></span>
              </div>

              <div className={`rounded-md border p-2 text-xs ${pracaDivergente ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border/60 text-muted-foreground"}`}>
                <span className="flex items-center gap-2 flex-wrap">
                  {pracaDivergente && <AlertTriangle className="w-3.5 h-3.5" />}
                  Loja/praça identificada: <strong className="text-foreground">{job.lojista_detectado || "—"}</strong>
                  {siteJob?.praca_esperada && <> (esperado: {siteJob.praca_esperada})</>}
                </span>
                {pracaDivergente && <p className="mt-1">A praça identificada não é a esperada — os preços podem não corresponder à loja concorrente.</p>}
              </div>

              {!!job.categorias_erro?.length && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive space-y-0.5">
                  <p className="font-medium">{job.categorias_erro.length} categoria(s) falharam:</p>
                  {job.categorias_erro.slice(0, 6).map((c, i) => <p key={i}>• {c.nome} — {c.erro}</p>)}
                </div>
              )}

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

export default SitesCatalogoPanel;
