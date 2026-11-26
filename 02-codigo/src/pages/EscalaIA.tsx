import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, Loader2, LockKeyhole, Printer, RefreshCw, ShieldCheck, Sparkles, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { saveSelectedStore } from "@/lib/selectedStore";
import AbaEquipe from "@/components/escala-v2/AbaEquipe";
import AbaRegras from "@/components/escala-v2/AbaRegras";
import GradeEscala from "@/components/escala-v2/GradeEscala";
import { irParaCelula } from "@/components/escala-v2/celula";
import PainelConformidade from "@/components/escala-v2/PainelConformidade";
import {
  BancoNaoPreparado, atualizarContagem, carregarEscalaV2, publicarEscala, reabrirEscala, salvarDia, salvarEscalaGerada, salvarRegras,
  type DadosEscalaV2,
} from "@/lib/escala-v2/dados";
import { montarContexto } from "@/lib/escala-v2/contexto";
import { NOME_TIPO, exportarExcelV2, imprimirMuralV2 } from "@/lib/escala-v2/exportar";
import { gerarComIA, type EtapaIA, type ResultadoIA } from "@/lib/escala-v2/ia";
import { faseEm } from "@/lib/escala-v2/leis";
import { diagnosticar, diasDoMes, fmtDataBr, numData, validar, type DiaEscala, type TipoDia } from "@/lib/escala-v2/motor";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const ETAPAS: { id: EtapaIA; texto: string }[] = [
  { id: "pedidos", texto: "Lendo os seus pedidos" },
  { id: "montando", texto: "Montando a escala e conferindo cada regra da lei" },
  { id: "parecer", texto: "Escrevendo o parecer" },
];
const TIPOS: TipoDia[] = ["T", "F", "FR", "FER", "AT", "AF"];

export default function EscalaIA() {
  const { user, isGlobalAdmin } = useAuth();
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [loja, setLoja] = useState(sessionStorage.getItem("selectedStoreId") || "");
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [dados, setDados] = useState<DadosEscalaV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [semBanco, setSemBanco] = useState(false);
  const [aba, setAba] = useState("escala");
  const [instrucoes, setInstrucoes] = useState("");
  const [etapa, setEtapa] = useState<EtapaIA | null>(null);
  const [ultimo, setUltimo] = useState<ResultadoIA | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [edit, setEdit] = useState<DiaEscala | null>(null);
  const [publicar, setPublicar] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [busy, setBusy] = useState(false);
  const serial = useRef(0);

  useEffect(() => {
    if (!user) return;
    let ativo = true;
    (async () => {
      let consulta = supabase.from("stores").select("id,name").order("name");
      if (!isGlobalAdmin) {
        const acc = await supabase.from("user_store_access").select("store_id").eq("user_id", user.id).eq("approved", true);
        if (acc.error) throw acc.error;
        consulta = consulta.in("id", (acc.data || []).map(a => a.store_id));
      }
      const r = await consulta;
      if (r.error) throw r.error;
      if (!ativo) return;
      const lista = r.data || [];
      setLojas(lista);
      setLoja(atual => (lista.some(s => s.id === atual) ? atual : lista[0]?.id || ""));
      if (!lista.length) { setLoading(false); setErro("Nenhuma loja liberada para o seu usuário."); }
    })().catch(() => { if (ativo) { setLoading(false); setErro("Não foi possível carregar as lojas."); } });
    return () => { ativo = false; };
  }, [user, isGlobalAdmin]);

  const carregar = useCallback(async (silencioso = false): Promise<DadosEscalaV2 | null> => {
    if (!loja || !lojas.some(s => s.id === loja)) return null;
    const pedido = ++serial.current;
    if (!silencioso) { setLoading(true); setDados(null); }
    setErro("");
    try {
      const r = await carregarEscalaV2(loja, ano, mes);
      if (pedido !== serial.current) return null;
      setDados(r);
      setInstrucoes(r.instrucoes);
      setSemBanco(false);
      return r;
    } catch (e) {
      if (pedido !== serial.current) return null;
      if (e instanceof BancoNaoPreparado) setSemBanco(true);
      else setErro("Não foi possível carregar a escala. Tente atualizar.");
      return null;
    } finally {
      if (pedido === serial.current) setLoading(false);
    }
  }, [loja, lojas, ano, mes]);
  useEffect(() => { setUltimo(null); void carregar(); return () => { serial.current++; }; }, [carregar]);

  const nomeLoja = lojas.find(s => s.id === loja)?.name || "";
  const ctx = useMemo(() => (dados ? montarContexto(dados) : null), [dados]);
  const validacao = useMemo(() => (ctx ? validar(ctx) : null), [ctx]);
  const diagnostico = useMemo(() => (ctx ? diagnosticar(ctx) : []), [ctx]);
  const fases = useMemo(() => {
    if (!dados) return [];
    const dias = diasDoMes(ano, mes);
    const a = faseEm(numData(dias[0]), dados.regras.antecipar_desde);
    const b = faseEm(numData(dias[dias.length - 1]), dados.regras.antecipar_desde);
    return a.rotulo === b.rotulo ? [a] : [a, b];
  }, [dados, ano, mes]);

  const temEscala = !!dados?.dias.length;
  const publicada = dados?.mesRow?.status === "publicada";
  const editavel = !!dados?.podeGerir && !publicada;
  const ocupado = busy || !!etapa;
  const faltas = diagnostico.filter(d => d.faltam > 0);

  function navegar(delta: number) {
    let m = mes + delta, a = ano;
    if (m < 1) { m = 12; a--; }
    if (m > 12) { m = 1; a++; }
    setAno(a); setMes(m);
  }
  function mudarLoja(id: string) { saveSelectedStore(id); setLoja(id); }

  async function gerarAgora() {
    if (!dados) return;
    setConfirmar(false);
    try {
      setEtapa(instrucoes.trim() ? "pedidos" : "montando");
      if (instrucoes.trim() !== dados.instrucoes.trim()) await salvarRegras(dados.storeId, dados.regras, instrucoes);
      const r = await gerarComIA(dados, instrucoes, setEtapa);
      await salvarEscalaGerada(dados.storeId, ano, mes, r.dias, r.geracao.validacao.erros, r.geracao.validacao.alertas, r.parecer);
      setUltimo(r);
      await carregar(true);
      const v = r.geracao.validacao;
      if (v.erros) toast.warning(`Escala gerada com ${v.erros} pendência(s) legal(is). Veja a conferência.`);
      else toast.success(v.alertas ? `Escala gerada sem pendência legal, com ${v.alertas} alerta(s) de cobertura.` : "Escala gerada sem nenhuma pendência.");
      if (!r.iaRespondeu) toast.info("A IA de texto não respondeu agora. A escala foi montada e conferida normalmente, sem a leitura dos pedidos ou sem o parecer.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a escala.");
    } finally {
      setEtapa(null);
    }
  }

  async function executar(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente."); } finally { setBusy(false); }
  }

  const salvarEdicao = () => executar(async () => {
    if (!dados || !edit) return;
    if (edit.tipo === "T" && (!edit.inicio || !edit.fim)) throw new Error("Informe a entrada e a saída.");
    await salvarDia(dados, edit);
    setEdit(null);
    const novo = await carregar(true);
    if (novo?.mesRow) {
      const v = validar(montarContexto(novo));
      if (v.erros !== novo.mesRow.erros || v.alertas !== novo.mesRow.alertas) await atualizarContagem(novo.mesRow.id, v.erros, v.alertas);
    }
    toast.success("Dia salvo.");
  });

  const confirmarPublicacao = () => executar(async () => {
    if (!dados?.mesRow || !validacao) return;
    await publicarEscala(dados.mesRow.id, validacao.erros, validacao.alertas, justificativa);
    setPublicar(false); setJustificativa("");
    await carregar(true);
    toast.success("Escala publicada. A equipe com acesso à loja já pode ver.");
  });

  const horas = validacao?.resumo.reduce((s, r) => s + r.minutos, 0) || 0;
  const alertasCobertura = validacao?.violacoes.filter(v => v.regra === "cobertura").length || 0;

  return (
    <ClientLayout storeName={nomeLoja}>
      <div className="escala-area w-full p-4 md:p-6">
        <header className="border-b pb-5 mb-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground text-sm"><Sparkles size={16} /> Escala IA <Badge variant="secondary">Versão 2</Badge></div>
              <h1 className="text-2xl mt-1">Escala de {MESES[mes - 1]} de {ano}</h1>
            </div>
            <Button variant="outline" onClick={() => void carregar()} disabled={loading || ocupado}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Atualizar</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-72">
              <Select value={loja} onValueChange={mudarLoja} disabled={ocupado}><SelectTrigger aria-label="Loja"><SelectValue placeholder="Loja" /></SelectTrigger><SelectContent>{lojas.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Mês anterior" disabled={ocupado} onClick={() => navegar(-1)}><ChevronLeft size={18} /></Button>
              <span className="w-40 text-center font-medium">{MESES[mes - 1]} {ano}</span>
              <Button variant="ghost" size="icon" aria-label="Próximo mês" disabled={ocupado} onClick={() => navegar(1)}><ChevronRight size={18} /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {fases.map(f => <Badge key={f.rotulo} variant="outline" title={f.base_legal}>{f.rotulo}</Badge>)}
              {dados?.mesRow && <Badge variant={publicada ? "default" : "secondary"}>{publicada ? `Publicada em ${fmtDataBr((dados.mesRow.publicada_em || "").slice(0, 10))}` : "Rascunho"}</Badge>}
            </div>
          </div>
          {erro && <p role="alert" className="text-destructive text-sm">{erro}</p>}
        </header>

        {semBanco ? (
          <div className="border rounded-md p-8 max-w-2xl">
            <h2 className="text-lg font-medium mb-2">Falta um passo da instalação</h2>
            <p className="text-sm text-muted-foreground">A tela da Escala IA já está no ar, mas as tabelas dela ainda não foram criadas no banco do Hub. Aplique a migration <span className="font-mono">escala_v2.sql</span> pelo chat do Lovable e clique em Atualizar. A Escala atual continua funcionando normalmente.</p>
          </div>
        ) : loading ? (
          <p className="text-muted-foreground py-12">Carregando…</p>
        ) : dados && ctx && validacao && (
          <Tabs value={aba} onValueChange={setAba}>
            <TabsList className="mb-5">
              <TabsTrigger value="escala"><CalendarDays size={15} className="mr-1.5" />Escala</TabsTrigger>
              <TabsTrigger value="equipe"><Users size={15} className="mr-1.5" />Equipe ({ctx.pessoas.length})</TabsTrigger>
              <TabsTrigger value="regras"><ShieldCheck size={15} className="mr-1.5" />Loja e regras</TabsTrigger>
            </TabsList>

            <TabsContent value="escala" className="space-y-6">
              {!dados.podeGerir && !temEscala ? (
                <div className="text-center py-20"><CalendarDays className="mx-auto text-muted-foreground mb-3" size={40} /><h2 className="text-lg">A escala deste mês ainda não foi publicada</h2></div>
              ) : !ctx.pessoas.length ? (
                <div className="border rounded-md p-8 max-w-2xl">
                  <h2 className="text-lg font-medium mb-2">Comece pela equipe</h2>
                  <p className="text-sm text-muted-foreground mb-4">Cadastre quem trabalha na loja (nome e setor bastam) e confira o horário de funcionamento. Depois é um botão.</p>
                  <Button onClick={() => setAba("equipe")}><Users size={16} />Cadastrar a equipe</Button>
                </div>
              ) : (
                <>
                  {editavel && (
                    <section className="border rounded-md p-5 bg-card">
                      <div className="grid lg:grid-cols-[1fr_auto] gap-5 items-end">
                        <div className="space-y-1.5">
                          <Label htmlFor="e2-pedidos">Pedidos para este mês (opcional)</Label>
                          <Textarea id="e2-pedidos" rows={2} maxLength={4000} disabled={ocupado} value={instrucoes} onChange={e => setInstrucoes(e.target.value)} placeholder="Escreva do seu jeito. Ex.: a Maria folga toda terça; o João não pode trabalhar dia 15; o Pedro fica na abertura." />
                          <p className="text-xs text-muted-foreground">A IA lê os pedidos, monta a escala e confere regra por regra. Dias que você travou à mão são mantidos.</p>
                        </div>
                        <Button size="lg" className="h-12 px-6 text-base" disabled={ocupado} onClick={() => (dados.dias.some(d => !d.travado) ? setConfirmar(true) : void gerarAgora())}>
                          {etapa ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                          {temEscala ? "Gerar de novo com IA" : "Gerar escala com IA"}
                        </Button>
                      </div>
                      {etapa && (
                        <ol className="mt-4 space-y-1.5 text-sm" aria-live="polite">
                          {ETAPAS.filter(e => e.id !== "pedidos" || instrucoes.trim()).map(e => {
                            const ordem = ETAPAS.findIndex(x => x.id === e.id), atual = ETAPAS.findIndex(x => x.id === etapa);
                            return <li key={e.id} className={`flex items-center gap-2 ${ordem > atual ? "text-muted-foreground" : ""}`}>{ordem < atual ? <Check size={15} className="text-success" /> : ordem === atual ? <Loader2 size={15} className="animate-spin" /> : <span className="w-[15px]" />}{e.texto}</li>;
                          })}
                        </ol>
                      )}
                    </section>
                  )}

                  {temEscala && (
                    <>
                      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                        <div className={`border rounded-md p-4 bg-card ${validacao.erros ? "border-destructive/60" : "border-success/60"}`}>
                          <div className="text-xs text-muted-foreground">Conferência legal</div>
                          <div className={`text-xl font-semibold mt-2 ${validacao.erros ? "text-destructive" : "text-success"}`}>{validacao.erros ? `${validacao.erros} ${validacao.erros === 1 ? "pendência" : "pendências"}` : "Sem pendência"}</div>
                          <div className="text-xs text-muted-foreground mt-1">{validacao.checklist.filter(c => c.legal).length} regras conferidas</div>
                        </div>
                        <div className="border rounded-md p-4 bg-card">
                          <div className="text-xs text-muted-foreground">Alertas de cobertura</div>
                          <div className={`text-xl font-semibold tabular-nums mt-2 ${alertasCobertura ? "text-warning" : ""}`}>{alertasCobertura}</div>
                          <div className="text-xs text-muted-foreground mt-1">setor abaixo do mínimo em algum horário</div>
                        </div>
                        <div className="border rounded-md p-4 bg-card">
                          <div className="text-xs text-muted-foreground">Funcionários na escala</div>
                          <div className="text-xl font-semibold tabular-nums mt-2">{validacao.resumo.length}</div>
                          <div className="text-xs text-muted-foreground mt-1">{faltas.length ? `${faltas.reduce((s, f) => s + f.faltam, 0)} a contratar, veja abaixo` : "quadro suficiente em todos os setores"}</div>
                        </div>
                        <div className="border rounded-md p-4 bg-card">
                          <div className="text-xs text-muted-foreground">Horas previstas no mês</div>
                          <div className="text-xl font-semibold tabular-nums mt-2">{Math.round(horas / 60).toLocaleString("pt-BR")} h</div>
                          <div className="text-xs text-muted-foreground mt-1">soma das jornadas, sem os intervalos</div>
                        </div>
                      </div>

                      {(dados.mesRow?.parecer_ia || faltas.length > 0 || ultimo) && dados.podeGerir && (
                        <section className="grid lg:grid-cols-2 gap-4">
                          {dados.mesRow?.parecer_ia && (
                            <div className="border rounded-md p-4">
                              <h2 className="font-medium mb-2 flex items-center gap-2"><Sparkles size={16} />Parecer da IA</h2>
                              <p className="text-sm whitespace-pre-line leading-relaxed">{dados.mesRow.parecer_ia}</p>
                              <p className="text-xs text-muted-foreground mt-3">Texto escrito por IA a partir da conferência automática. Vale o que está na lista de conferência abaixo.</p>
                            </div>
                          )}
                          <div className="space-y-4">
                            {faltas.length > 0 && (
                              <div className="border border-warning/60 rounded-md p-4">
                                <h2 className="font-medium mb-2 flex items-center gap-2"><TriangleAlert size={16} className="text-warning" />Precisa contratar</h2>
                                <ul className="text-sm space-y-1.5">{faltas.map(f => <li key={f.setor}><span className="font-medium">{f.setor}:</span> {f.motivo}</li>)}</ul>
                              </div>
                            )}
                            {ultimo && (ultimo.pedidos.aplicados.length > 0 || ultimo.pedidos.ignorados.length > 0 || ultimo.geracao.avisos.some(a => !faltas.some(f => a.startsWith(f.setor)))) && (
                              <div className="border rounded-md p-4 text-sm space-y-3">
                                <h2 className="font-medium">O que foi feito com os seus pedidos</h2>
                                {ultimo.pedidos.aplicados.length > 0 && <ul className="space-y-1">{ultimo.pedidos.aplicados.map((t, i) => <li key={i} className="flex gap-2"><Check size={15} className="text-success shrink-0 mt-0.5" />{t}</li>)}</ul>}
                                {ultimo.pedidos.ignorados.length > 0 && <ul className="space-y-1">{ultimo.pedidos.ignorados.map((t, i) => <li key={i} className="flex gap-2"><TriangleAlert size={15} className="text-warning shrink-0 mt-0.5" />Não aplicado: {t}</li>)}</ul>}
                                {ultimo.geracao.avisos.filter(a => !faltas.some(f => a.startsWith(f.setor))).map((t, i) => <p key={i} className="text-muted-foreground">{t}</p>)}
                              </div>
                            )}
                          </div>
                        </section>
                      )}

                      <section>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                          <div>
                            <h2 className="text-lg font-medium">Escala do mês</h2>
                            <p className="text-sm text-muted-foreground">{editavel ? "Clique em um dia para ajustar. Cada ajuste é conferido na hora." : publicada ? "Escala publicada. Para alterar, reabra." : "Somente leitura."}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => exportarExcelV2(ctx, validacao, nomeLoja)}><Download size={16} />Excel</Button>
                            <Button variant="outline" onClick={() => imprimirMuralV2(ctx, validacao, nomeLoja, MESES[mes - 1], !!publicada)}><Printer size={16} />PDF para o mural</Button>
                            {dados.podeGerir && dados.mesRow && (publicada
                              ? <Button variant="outline" disabled={ocupado} onClick={() => void executar(async () => { await reabrirEscala(dados.mesRow!.id); await carregar(true); toast.success("Escala reaberta para ajustes."); })}>Reabrir</Button>
                              : <Button disabled={ocupado} onClick={() => setPublicar(true)}><ShieldCheck size={16} />Publicar</Button>)}
                          </div>
                        </div>
                        <GradeEscala ctx={ctx} validacao={validacao} aoEditar={editavel ? (pessoa_id, data, atual) => setEdit(atual ? { ...atual } : { pessoa_id, data, tipo: "F" }) : undefined} />
                        <p className="text-xs text-muted-foreground mt-2">F folga · FE feriado · FÉR férias · AT atestado · AF afastado · contorno vermelho: pendência legal · contorno laranja: alerta · cadeado: dia travado</p>
                      </section>

                      <section>
                        <h2 className="text-lg font-medium mb-1">Conferência regra por regra</h2>
                        <p className="text-sm text-muted-foreground mb-3">Toda a escala, inclusive os ajustes feitos à mão, é conferida contra cada regra abaixo.</p>
                        <PainelConformidade validacao={validacao} aoAbrir={v => v.pessoa_id && v.data && irParaCelula(v.pessoa_id, v.data)} />
                      </section>
                    </>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="equipe"><AbaEquipe dados={dados} recarregar={async () => { await carregar(true); }} /></TabsContent>
            <TabsContent value="regras"><AbaRegras dados={dados} recarregar={async () => { await carregar(true); }} /></TabsContent>
          </Tabs>
        )}

        <Dialog open={confirmar} onOpenChange={setConfirmar}>
          <DialogContent>
            <DialogHeader><DialogTitle>Gerar a escala de novo?</DialogTitle><DialogDescription>A escala de {MESES[mes - 1]} será refeita. Os dias que você travou continuam como estão; todo o resto é substituído.</DialogDescription></DialogHeader>
            <DialogFooter><Button variant="outline" onClick={() => setConfirmar(false)}>Cancelar</Button><Button onClick={() => void gerarAgora()}><Sparkles size={16} />Gerar de novo</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{ctx?.pessoas.find(p => p.id === edit?.pessoa_id)?.nome}</DialogTitle><DialogDescription>{edit && `${fmtDataBr(edit.data)}/${edit.data.slice(0, 4)}`}</DialogDescription></DialogHeader>
            {edit && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>O que acontece neste dia</Label>
                  <Select value={edit.tipo} onValueChange={v => setEdit({ ...edit, tipo: v as TipoDia, inicio: v === "T" ? edit.inicio || "08:00" : null, fim: v === "T" ? edit.fim || "16:24" : null, intervalo_min: v === "T" ? edit.intervalo_min ?? 60 : null })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{NOME_TIPO[t]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {edit.tipo === "T" && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5"><Label>Entrada</Label><Input type="time" value={edit.inicio || ""} onChange={e => setEdit({ ...edit, inicio: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Saída</Label><Input type="time" value={edit.fim || ""} onChange={e => setEdit({ ...edit, fim: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Intervalo (min)</Label><Input type="number" min={0} max={240} value={edit.intervalo_min ?? 0} onChange={e => setEdit({ ...edit, intervalo_min: Number(e.target.value) })} /></div>
                  </div>
                )}
                <label className="flex items-start justify-between gap-4">
                  <span className="text-sm"><span className="font-medium flex items-center gap-1.5"><LockKeyhole size={14} />Travar este dia</span><span className="text-muted-foreground">A IA mantém o dia assim quando a escala for gerada de novo.</span></span>
                  <Switch checked={!!edit.travado} onCheckedChange={v => setEdit({ ...edit, travado: v })} />
                </label>
              </div>
            )}
            <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button><Button disabled={busy} onClick={() => void salvarEdicao()}>Salvar e conferir</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={publicar} onOpenChange={setPublicar}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publicar a escala de {MESES[mes - 1]}</DialogTitle>
              <DialogDescription>{validacao?.erros ? `A conferência encontrou ${validacao.erros} pendência(s) legal(is). Para publicar assim mesmo, registre o motivo.` : "A conferência automática não encontrou pendência legal. Depois de publicada, a equipe com acesso à loja passa a ver a escala."}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="e2-just">{validacao?.erros ? "Motivo (obrigatório)" : "Observação (opcional)"}</Label>
              <Textarea id="e2-just" value={justificativa} onChange={e => setJustificativa(e.target.value)} />
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setPublicar(false)}>Cancelar</Button><Button disabled={busy || (!!validacao?.erros && !justificativa.trim())} onClick={() => void confirmarPublicacao()}>Publicar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ClientLayout>
  );
}
